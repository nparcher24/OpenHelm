/**
 * GPS Service - Reads GPS data from USB serial device
 * Supports WitMotion JY-GPSIMU binary protocol
 * Protocol docs: https://wit-motion.gitbook.io/witmotion-sdk
 */

import { SerialPort } from 'serialport'
import fs from 'fs'
import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

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
  error: null
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
 * Find GPS device - checks all ttyUSB* and ttyACM* devices
 */
async function findGpsDevice() {
  try {
    // Use ls to find serial devices
    const { stdout } = await execAsync('ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null || true')
    const devices = stdout.trim().split('\n').filter(d => d.length > 0)

    for (const device of devices) {
      try {
        fs.accessSync(device, fs.constants.R_OK | fs.constants.W_OK)
        console.log(`GPS: Found device ${device}`)
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
    case 'Q': // 0x51 - Accelerations (not status!)
      // ax, ay, az as int16 - we don't need these for navigation
      break

    case 'R': // 0x52 - Angular velocities
      // wx, wy, wz as int16 - we don't need these for navigation
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
      gpsData.heading = smoothHeading(rawHeading)
      break

    case 'T': // 0x54 - Magnetometer
      // hx, hy, hz - we use yaw from Euler angles instead
      break

    case 'V': // 0x56 - Barometry/Altimeter
      // Pressure and altitude data
      const pressure = data.readInt32LE(0) // Pa
      const baroAlt = data.readInt32LE(4) / 100 // cm to meters
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
      const gpsCOG = data.readInt16LE(2) / 10 // 0.1° to degrees
      const gpsSpeedRaw = data.readUInt32LE(4)
      const gpsSpeedKmh = gpsSpeedRaw / 1000 // to km/h
      const gpsSpeedMs = gpsSpeedKmh / 3.6 // to m/s

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
      const satellites = data.readUInt16LE(0)
      const pdop = data.readUInt16LE(2) / 10
      const hdop = data.readUInt16LE(4) / 10
      const vdop = data.readUInt16LE(6) / 10

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
