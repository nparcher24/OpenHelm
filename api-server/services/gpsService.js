/**
 * GPS Service - Reads GPS/IMU data from USB serial device
 * Supports WitMotion binary protocol (JY-GPSIMU, WTGAHRS2-TTL, etc.)
 * Protocol docs: https://wit-motion.gitbook.io/witmotion-sdk
 */

import { SerialPort } from 'serialport'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

// Heading calibration offset (persisted to file)
const CALIBRATION_FILE = path.join(process.cwd(), 'heading-calibration.json')
let headingOffset = 0

function loadHeadingOffset() {
  try {
    if (fs.existsSync(CALIBRATION_FILE)) {
      const data = JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf8'))
      if (typeof data.headingOffset === 'number' && isFinite(data.headingOffset)) {
        headingOffset = data.headingOffset
        console.log(`[GPS] Loaded heading offset: ${headingOffset}°`)
      }
    }
  } catch (err) {
    console.error('[GPS] Failed to load heading calibration:', err.message)
  }
}

function saveHeadingOffset() {
  try {
    fs.writeFileSync(CALIBRATION_FILE, JSON.stringify({ headingOffset }, null, 2))
  } catch (err) {
    console.error('[GPS] Failed to save heading calibration:', err.message)
  }
}

// Load calibration on module init
loadHeadingOffset()

export function getHeadingOffset() {
  return headingOffset
}

export function setHeadingOffset(offset) {
  if (typeof offset !== 'number' || !isFinite(offset)) {
    throw new Error('Offset must be a finite number')
  }
  headingOffset = offset
  gpsData.headingOffset = offset
  saveHeadingOffset()
  return offset
}

// GPS data cache
let gpsData = {
  latitude: null,
  longitude: null,
  altitude: null,
  heading: null,
  headingRaw: null,  // Unsmoothed heading for debugging
  roll: null,
  pitch: null,
  speed: null,
  groundSpeed: null,
  satellites: 0,
  fix: false,
  pdop: null,
  hdop: null,
  vdop: null,
  timestamp: null,
  device: null,
  error: null,
  // Additional sensor data
  cog: null,           // Course Over Ground (degrees)
  pressure: null,      // Barometric pressure (hPa)
  ax: null,            // Acceleration X (g)
  ay: null,            // Acceleration Y (g)
  az: null,            // Acceleration Z (g)
  wx: null,            // Angular velocity X (°/sec)
  wy: null,            // Angular velocity Y (°/sec)
  wz: null,            // Angular velocity Z / Rate of Turn (°/sec)
  hx: null,            // Magnetometer X
  hy: null,            // Magnetometer Y
  hz: null,            // Magnetometer Z
  // Wave estimation data
  waveHeight: null,    // Significant wave height (meters)
  wavePeriod: null,    // Estimated dominant wave period (seconds)
  seaState: null,      // Douglas Sea Scale (0-9)
  seaStateDesc: null,  // Text descriptor
  headingOffset: headingOffset  // Calibration offset (degrees)
}

// Heading smoothing state (EMA with circular handling)
let headingSin = null  // Running average of sin(heading)
let headingCos = null  // Running average of cos(heading)
const HEADING_SMOOTHING = 0.7  // 0-1: lower = smoother, higher = more responsive

/**
 * Smooth heading using exponential moving average with circular wrap-around handling
 * Uses sin/cos decomposition to properly handle 0°/360° boundary
 */
function smoothHeading(rawHeading) {
  const radians = rawHeading * Math.PI / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)

  if (headingSin === null || headingCos === null) {
    // Initialize
    headingSin = sin
    headingCos = cos
  } else {
    // Exponential moving average
    headingSin = HEADING_SMOOTHING * sin + (1 - HEADING_SMOOTHING) * headingSin
    headingCos = HEADING_SMOOTHING * cos + (1 - HEADING_SMOOTHING) * headingCos
  }

  // Convert back to degrees
  let smoothed = Math.atan2(headingSin, headingCos) * 180 / Math.PI
  if (smoothed < 0) smoothed += 360

  return smoothed
}

// ============================================================
// Wave Height Estimation
// ============================================================

// Douglas Sea Scale mapping: [maxHs, number, description]
const DOUGLAS_SEA_SCALE = [
  [0,     0, 'Calm (glassy)'],
  [0.1,   1, 'Calm (rippled)'],
  [0.5,   2, 'Smooth'],
  [1.25,  3, 'Slight'],
  [2.5,   4, 'Moderate'],
  [4.0,   5, 'Rough'],
  [6.0,   6, 'Very rough'],
  [9.0,   7, 'High'],
  [14.0,  8, 'Very high'],
  [Infinity, 9, 'Phenomenal']
]

function getSeaState(hs) {
  for (const [maxHs, num, desc] of DOUGLAS_SEA_SCALE) {
    if (hs <= maxHs) return { seaState: num, seaStateDesc: desc }
  }
  return { seaState: 9, seaStateDesc: 'Phenomenal' }
}

// Circular buffer for vertical acceleration samples (60 seconds)
const WAVE_BUFFER_SECONDS = 60
const waveBuffer = [] // Array of { vertAccel, timestamp }

// High-pass IIR filter state (removes DC bias/drift from vertical acceleration)
let hpFilterState = null // { prevInput, prevOutput }
const HP_CUTOFF_HZ = 0.05 // 0.05 Hz cutoff - passes wave frequencies, blocks drift

// Throttle wave computation output to ~1Hz
let lastWaveCompute = 0
const WAVE_COMPUTE_INTERVAL = 1000 // ms

/**
 * Rotate body-frame acceleration to earth frame and remove gravity.
 * Returns vertical (Z-axis) earth-frame acceleration in g-units.
 */
function getVerticalAccel(ax, ay, az, rollDeg, pitchDeg) {
  const rollRad = (rollDeg || 0) * Math.PI / 180
  const pitchRad = (pitchDeg || 0) * Math.PI / 180

  // Rotation from body to earth frame (simplified - no yaw needed for vertical)
  // Earth Z = -sin(pitch)*ax + sin(roll)*cos(pitch)*ay + cos(roll)*cos(pitch)*az
  const earthZ = -Math.sin(pitchRad) * ax +
                  Math.sin(rollRad) * Math.cos(pitchRad) * ay +
                  Math.cos(rollRad) * Math.cos(pitchRad) * az

  // Subtract gravity (1g on Z axis when stationary)
  return earthZ - 1.0
}

/**
 * Apply first-order high-pass IIR filter to remove drift/bias.
 * y[n] = alpha * (y[n-1] + x[n] - x[n-1])
 */
function highPassFilter(input, dt) {
  // Compute alpha from cutoff frequency and sample interval
  const rc = 1.0 / (2.0 * Math.PI * HP_CUTOFF_HZ)
  const alpha = rc / (rc + dt)

  if (hpFilterState === null) {
    hpFilterState = { prevInput: input, prevOutput: 0 }
    return 0
  }

  const output = alpha * (hpFilterState.prevOutput + input - hpFilterState.prevInput)
  hpFilterState.prevInput = input
  hpFilterState.prevOutput = output
  return output
}

/**
 * Compute wave height estimation from the circular buffer.
 * Uses zero-crossing method for period and std dev for Hs.
 */
function computeWaveEstimate() {
  if (waveBuffer.length < 10) {
    gpsData.waveHeight = null
    gpsData.wavePeriod = null
    gpsData.seaState = null
    gpsData.seaStateDesc = null
    return
  }

  const span = (waveBuffer[waveBuffer.length - 1].timestamp - waveBuffer[0].timestamp) / 1000
  if (span < 10) {
    // Need at least 10 seconds of data
    gpsData.waveHeight = null
    gpsData.wavePeriod = null
    gpsData.seaState = null
    gpsData.seaStateDesc = 'Collecting data...'
    return
  }

  // Count upward zero-crossings for wave period estimation
  let zeroCrossings = 0
  for (let i = 1; i < waveBuffer.length; i++) {
    if (waveBuffer[i - 1].vertAccel <= 0 && waveBuffer[i].vertAccel > 0) {
      zeroCrossings++
    }
  }

  // Compute standard deviation of filtered vertical acceleration
  let sum = 0
  let sumSq = 0
  for (const sample of waveBuffer) {
    sum += sample.vertAccel
    sumSq += sample.vertAccel * sample.vertAccel
  }
  const mean = sum / waveBuffer.length
  const variance = (sumSq / waveBuffer.length) - (mean * mean)
  const stdDev = Math.sqrt(Math.max(0, variance)) // in g-units

  // Wave period from zero-crossings
  const wavePeriod = zeroCrossings > 0 ? span / zeroCrossings : null

  // Significant wave height: Hs = sigma_a * T^2 / pi^2
  // sigma_a in m/s^2 (convert from g), T in seconds
  let waveHeight = null
  if (wavePeriod !== null && wavePeriod > 0.5) {
    const stdDevMs2 = stdDev * 9.81 // g to m/s^2
    waveHeight = (stdDevMs2 * wavePeriod * wavePeriod) / (Math.PI * Math.PI)
    // Clamp to reasonable range
    waveHeight = Math.max(0, Math.min(waveHeight, 30))
  }

  gpsData.waveHeight = waveHeight !== null ? Math.round(waveHeight * 100) / 100 : null
  gpsData.wavePeriod = wavePeriod !== null ? Math.round(wavePeriod * 10) / 10 : null

  if (waveHeight !== null) {
    const { seaState, seaStateDesc } = getSeaState(waveHeight)
    gpsData.seaState = seaState
    gpsData.seaStateDesc = seaStateDesc
  } else {
    gpsData.seaState = null
    gpsData.seaStateDesc = null
  }
}

/**
 * Process an accelerometer sample for wave estimation.
 * Called on each 0x51 (acceleration) message.
 */
function processWaveSample(ax, ay, az) {
  const roll = gpsData.roll
  const pitch = gpsData.pitch
  if (roll === null || pitch === null) return

  const now = Date.now()

  // Get earth-frame vertical acceleration (gravity removed)
  const rawVertAccel = getVerticalAccel(ax, ay, az, roll, pitch)

  // Compute dt from previous sample for filter
  const dt = waveBuffer.length > 0
    ? (now - waveBuffer[waveBuffer.length - 1].timestamp) / 1000
    : 0.2 // default ~5Hz

  // High-pass filter to remove drift
  const filteredAccel = highPassFilter(rawVertAccel, dt)

  // Add to circular buffer
  waveBuffer.push({ vertAccel: filteredAccel, timestamp: now })

  // Trim entries older than the buffer window
  const cutoff = now - (WAVE_BUFFER_SECONDS * 1000)
  while (waveBuffer.length > 0 && waveBuffer[0].timestamp < cutoff) {
    waveBuffer.shift()
  }

  // Throttle computation to ~1Hz
  if (now - lastWaveCompute >= WAVE_COMPUTE_INTERVAL) {
    lastWaveCompute = now
    computeWaveEstimate()
  }
}

// ============================================================

let serialPort = null
let messageBuffer = Buffer.alloc(0)
let isRunning = false
let gpsUpdateCallback = null // Callback for real-time GPS updates

/**
 * Set callback for GPS data updates (used for WebSocket streaming)
 */
export function setGpsUpdateCallback(callback) {
  gpsUpdateCallback = callback
}

/**
 * Find GPS device.
 *
 * Lookup order:
 *  1. /dev/witmotion (stable symlink installed by setup/udev/99-witmotion.rules)
 *  2. $OPENHELM_GPS_DEVICE override
 *  3. Glob scan of /dev/ttyUSB*, /dev/ttyACM*, and macOS /dev/cu.usb*
 *
 * The symlink path makes the service port-agnostic: plug the WitMotion
 * into any USB port and udev re-points /dev/witmotion → the new ttyUSB*.
 */
async function findGpsDevice() {
  // 1. Stable udev symlink (preferred)
  try {
    const link = '/dev/witmotion'
    fs.accessSync(link, fs.constants.R_OK | fs.constants.W_OK)
    console.log(`GPS: Found device via udev symlink: ${link}`)
    return link
  } catch (e) {
    // Symlink missing → fall through
  }

  // 2. Explicit override
  if (process.env.OPENHELM_GPS_DEVICE) {
    const dev = process.env.OPENHELM_GPS_DEVICE
    try {
      fs.accessSync(dev, fs.constants.R_OK | fs.constants.W_OK)
      console.log(`GPS: Using OPENHELM_GPS_DEVICE override: ${dev}`)
      return dev
    } catch (e) {
      console.log(`GPS: OPENHELM_GPS_DEVICE=${dev} not accessible: ${e.message}`)
    }
  }

  // 3. Glob fallback
  try {
    const { stdout } = await execAsync('ls /dev/ttyUSB* /dev/ttyACM* /dev/cu.usbserial-* /dev/cu.usbmodem* 2>/dev/null || true')
    const devices = stdout.trim().split('\n').filter(d => d.length > 0)

    for (const device of devices) {
      try {
        fs.accessSync(device, fs.constants.R_OK | fs.constants.W_OK)
        console.log(`GPS: Found device via glob scan: ${device}`)
        return device
      } catch (e) {
        console.log(`GPS: Device ${device} not accessible`)
      }
    }
  } catch (e) {
    console.log('GPS: Error finding devices:', e.message)
  }

  return null
}

/**
 * Validate WitMotion checksum
 * Checksum is sum of bytes 0-9, mod 256
 */
function validateChecksum(msg) {
  if (msg.length < 11) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    sum += msg[i]
  }
  return (sum & 0xFF) === msg[10]
}

/**
 * Parse WitMotion binary protocol messages
 * Message format: 0x55 TYPE [8 data bytes] [checksum] = 11 bytes total
 *
 * Message types (TYPE byte):
 * - 0x50 (P): Real Time Clock
 * - 0x51 (Q): Accelerations (ax, ay, az)
 * - 0x52 (R): Angular velocities (wx, wy, wz)
 * - 0x53 (S): Euler angles (roll, pitch, yaw)
 * - 0x54 (T): Magnetometer (hx, hy, hz)
 * - 0x55 (U): Data ports status
 * - 0x56 (V): Barometry/Altimeter
 * - 0x57 (W): GPS Latitude/Longitude
 * - 0x58 (X): GPS Ground Speed
 * - 0x59 (Y): Quaternion
 * - 0x5A (Z): GPS Accuracy (satellites, PDOP, HDOP, VDOP)
 */
function parseWitMotionMessage(msg) {
  if (msg.length < 11 || msg[0] !== 0x55) return null

  // Validate checksum to prevent parsing corrupt/misaligned data
  if (!validateChecksum(msg)) return null

  const msgType = String.fromCharCode(msg[1])
  const data = msg.slice(2, 10)

  switch (msgType) {
    case 'Q': // 0x51 - Accelerations
      // ax, ay, az as int16, scale: /32768 * 16g
      const axRaw = data.readInt16LE(0)
      const ayRaw = data.readInt16LE(2)
      const azRaw = data.readInt16LE(4)
      gpsData.ax = (axRaw / 32768.0) * 16.0
      gpsData.ay = (ayRaw / 32768.0) * 16.0
      gpsData.az = (azRaw / 32768.0) * 16.0
      // Feed accelerometer data into wave height estimator
      processWaveSample(gpsData.ax, gpsData.ay, gpsData.az)
      break

    case 'R': // 0x52 - Angular velocities
      // wx, wy, wz as int16, scale: /32768 * 2000°/sec
      const wxRaw = data.readInt16LE(0)
      const wyRaw = data.readInt16LE(2)
      const wzRaw = data.readInt16LE(4)
      gpsData.wx = (wxRaw / 32768.0) * 2000.0
      gpsData.wy = (wyRaw / 32768.0) * 2000.0
      gpsData.wz = (wzRaw / 32768.0) * 2000.0  // Rate of Turn
      break

    case 'S': // 0x53 - Euler angles (roll, pitch, yaw)
      // Roll: bytes 0-1, Pitch: bytes 2-3, Yaw: bytes 4-5 as int16
      // Scale: value / 32768 * 180 = degrees
      const roll = data.readInt16LE(0)
      const pitch = data.readInt16LE(2)
      const yaw = data.readInt16LE(4)

      gpsData.roll = (roll / 32768.0) * 180.0
      gpsData.pitch = (pitch / 32768.0) * 180.0

      let rawHeading = (-yaw / 32768.0) * 180.0
      if (rawHeading < 0) rawHeading += 360
      gpsData.headingRaw = rawHeading
      let smoothed = smoothHeading(rawHeading)
      // Apply calibration offset
      let calibrated = smoothed + headingOffset
      if (calibrated < 0) calibrated += 360
      if (calibrated >= 360) calibrated -= 360
      gpsData.heading = calibrated
      break

    case 'T': // 0x54 - Magnetometer
      // hx, hy, hz as int16
      gpsData.hx = data.readInt16LE(0)
      gpsData.hy = data.readInt16LE(2)
      gpsData.hz = data.readInt16LE(4)
      break

    case 'V': // 0x56 - Barometry/Altimeter
      // Pressure and altitude data
      const pressureRaw = data.readInt32LE(0) // Pa
      const baroAlt = data.readInt32LE(4) / 100 // cm to meters
      // Store pressure in hPa (more common unit)
      gpsData.pressure = pressureRaw / 100.0
      // We'll prefer GPS altitude if available
      if (gpsData.altitude === null) {
        gpsData.altitude = baroAlt
      }
      break

    case 'W': // 0x57 - GPS Latitude/Longitude
      // WitMotion sends coordinates where raw/1e7 gives DD.MMMMMMM format
      // Need to multiply by 100 to get DDMM.MMMMM, then convert to decimal degrees
      const lonRaw = data.readInt32LE(0)
      const latRaw = data.readInt32LE(4)

      // Convert from DD.MMMMMMM to decimal degrees
      // Multiply by 100 to get DDMM.MMMMM format
      const latDDMM = (latRaw / 1e7) * 100  // e.g., 36.5305908 * 100 = 3653.05908
      const latDeg = Math.trunc(latDDMM / 100)  // e.g., 36
      const latMin = latDDMM - (latDeg * 100)   // e.g., 53.05908
      const parsedLat = latDeg + (latMin / 60) // e.g., 36 + 0.8843 = 36.8843

      const lonDDMM = (lonRaw / 1e7) * 100
      const lonSign = lonDDMM < 0 ? -1 : 1
      const lonDDMMAbs = Math.abs(lonDDMM)
      const lonDeg = Math.trunc(lonDDMMAbs / 100)
      const lonMin = lonDDMMAbs - (lonDeg * 100)
      const parsedLon = lonSign * (lonDeg + (lonMin / 60))

      // Validate lat/lon are within valid ranges before updating
      if (parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180) {
        gpsData.latitude = parsedLat
        gpsData.longitude = parsedLon
      }
      break

    case 'X': // 0x58 - GPS Ground Speed
      // Correct WitMotion 0x58 format:
      // Bytes 0-1: GPSHeight (int16, 0.1m units)
      // Bytes 2-3: GPSYaw (int16, 0.1° units) - Course Over Ground
      // Bytes 4-7: GPSVelocity (uint32, 1/1000 km/h units)
      const gpsHeight = data.readInt16LE(0) / 10 // 0.1m to meters
      let gpsCOG = data.readInt16LE(2) / 10 // 0.1° to degrees
      const gpsSpeedRaw = data.readUInt32LE(4)
      const gpsSpeedKmh = gpsSpeedRaw / 1000 // to km/h
      const gpsSpeedMs = gpsSpeedKmh / 3.6 // to m/s

      // Normalize COG to 0-360 range
      if (gpsCOG < 0) gpsCOG += 360
      gpsData.cog = gpsCOG

      // Validate speed is reasonable (< 200 knots / ~100 m/s for any boat)
      if (gpsSpeedMs >= 0 && gpsSpeedMs < 100) {
        gpsData.groundSpeed = gpsSpeedMs
      }
      gpsData.altitude = gpsHeight
      break

    case 'Y': // 0x59 - Quaternion
      // q0, q1, q2, q3 - we use Euler angles instead
      break

    case 'Z': // 0x5A - GPS Accuracy
      // Satellites: bytes 0-1, PDOP: bytes 2-3, HDOP: bytes 4-5, VDOP: bytes 6-7
      // DOP scale varies by device: JY-GPSIMU sends /10, WTGAHRS2 sends /100
      // Auto-detect: raw values >500 indicate /100 scale (max valid DOP ~50)
      const satellites = data.readUInt16LE(0)
      const pdopRaw = data.readUInt16LE(2)
      const hdopRaw = data.readUInt16LE(4)
      const vdopRaw = data.readUInt16LE(6)
      const dopScale = (pdopRaw > 500 || hdopRaw > 500 || vdopRaw > 500) ? 100 : 10
      const pdop = pdopRaw / dopScale
      const hdop = hdopRaw / dopScale
      const vdop = vdopRaw / dopScale

      gpsData.satellites = satellites
      gpsData.pdop = pdop
      gpsData.hdop = hdop
      gpsData.vdop = vdop

      // Fix is determined by having >= 4 satellites
      gpsData.fix = satellites >= 4
      break
  }

  gpsData.timestamp = Date.now()

  // Notify WebSocket subscribers of update
  if (gpsUpdateCallback) {
    gpsUpdateCallback(gpsData)
  }

  return msgType
}

/**
 * Process incoming serial data
 */
function processData(data) {
  // Append to buffer
  messageBuffer = Buffer.concat([messageBuffer, data])

  // Parse complete messages (11 bytes each starting with 0x55)
  while (messageBuffer.length >= 11) {
    // Find message start
    const startIdx = messageBuffer.indexOf(0x55)

    if (startIdx === -1) {
      // No message start found, clear buffer
      messageBuffer = Buffer.alloc(0)
      break
    }

    if (startIdx > 0) {
      // Skip bytes before message start
      messageBuffer = messageBuffer.slice(startIdx)
    }

    if (messageBuffer.length < 11) break

    // Check if this looks like a valid message (second byte should be 0x50-0x5F)
    if (messageBuffer[1] >= 0x50 && messageBuffer[1] <= 0x5F) {
      const msg = messageBuffer.slice(0, 11)
      const result = parseWitMotionMessage(msg)
      if (result !== null) {
        // Valid message parsed, advance by 11 bytes
        messageBuffer = messageBuffer.slice(11)
      } else {
        // Checksum failed - this was a false sync, skip 1 byte and resync
        messageBuffer = messageBuffer.slice(1)
      }
    } else {
      // Not a valid message type, skip this byte and try again
      messageBuffer = messageBuffer.slice(1)
    }
  }

  // Prevent buffer from growing too large
  if (messageBuffer.length > 1000) {
    messageBuffer = messageBuffer.slice(-100)
  }
}

/**
 * Start GPS service
 */
export async function startGpsService() {
  if (isRunning) {
    console.log('GPS: Service already running')
    return gpsData
  }

  const device = await findGpsDevice()

  if (!device) {
    gpsData.error = 'No GPS device found'
    console.log('GPS: No device found')
    return gpsData
  }

  gpsData.device = device
  gpsData.error = null

  try {
    serialPort = new SerialPort({
      path: device,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false
    })

    serialPort.on('data', processData)

    serialPort.on('error', (err) => {
      console.error('GPS: Serial port error:', err.message)
      gpsData.error = err.message
      isRunning = false
    })

    serialPort.on('close', () => {
      console.log('GPS: Serial port closed')
      isRunning = false
    })

    await new Promise((resolve, reject) => {
      serialPort.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    isRunning = true
    console.log(`GPS: Service started on ${device}`)

  } catch (err) {
    console.error('GPS: Failed to start:', err.message)
    gpsData.error = err.message
    isRunning = false
  }

  return gpsData
}

/**
 * Stop GPS service
 */
export async function stopGpsService() {
  if (serialPort && serialPort.isOpen) {
    await new Promise((resolve) => {
      serialPort.close(resolve)
    })
  }
  isRunning = false
  serialPort = null
  console.log('GPS: Service stopped')
}

/**
 * Get current GPS data
 */
export function getGpsData() {
  return {
    ...gpsData,
    isRunning,
    age: gpsData.timestamp ? Date.now() - gpsData.timestamp : null
  }
}

/**
 * Check if GPS service is running
 */
export function isGpsRunning() {
  return isRunning
}
