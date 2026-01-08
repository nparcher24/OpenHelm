/**
 * GPS Service - Reads GPS data from USB serial device
 * Supports CASIC binary protocol used by Chinese GPS/BDS modules
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
  speed: null,
  satellites: 0,
  fix: false,
  timestamp: null,
  device: null,
  error: null
}

let serialPort = null
let messageBuffer = Buffer.alloc(0)
let isRunning = false

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
 * Parse CASIC binary protocol messages
 * Message format: 55 XX [8 data bytes] [checksum] = 11 bytes total
 *
 * Message types:
 * - US: Position (lat in bytes 0-3 as special format, lon in bytes 4-7 as int32/1e7)
 * - UT: Altitude (bytes 4-7 as int32 millimeters)
 * - UW: Heading/velocity (bytes 0-1 as uint16 centidegrees)
 * - UZ: Satellite info
 * - UQ: Fix status
 */
function parseCasicMessage(msg) {
  if (msg.length < 11 || msg[0] !== 0x55) return null

  const msgType = String.fromCharCode(msg[1])
  const data = msg.slice(2, 10)

  switch (msgType) {
    case 'Q': // Status
      const status = data[0]
      gpsData.fix = (status & 0x01) === 1
      break

    case 'R': // Satellite info (appears to be mostly zeros when no fix)
      break

    case 'W': // Position (lat/lon)
      // Both values as int32 / 1e7: bytes 0-3 = lon, bytes 4-7 = lat
      const lonRaw = data.readInt32LE(0)
      const latRaw = data.readInt32LE(4)

      // Longitude: int32 / 1e7 (negative for western hemisphere)
      gpsData.longitude = lonRaw / 1e7

      // Latitude: int32 / 1e7
      gpsData.latitude = latRaw / 1e7
      break

    case 'T': // Altitude
      // Bytes 4-7: altitude in millimeters
      const altRaw = data.readInt32LE(4)
      gpsData.altitude = altRaw / 1000 // Convert to meters
      break

    case 'S': // Heading/velocity (IMU data)
      // Raw yaw from IMU - int16 where 32768 = 180°
      const yaw = data.readInt16LE(4)
      // Scale to degrees, negate to fix E/W, normalize to 0-360
      let heading = (-yaw / 32768.0) * 180.0
      if (heading < 0) heading += 360
      gpsData.heading = heading
      break

    case 'Z': // Satellite info
      // First uint16 appears to be satellite count or related metric
      const satVal = data.readUInt16LE(0)
      gpsData.satellites = Math.min(satVal, 20) // Cap at reasonable value
      break
  }

  gpsData.timestamp = Date.now()
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
      parseCasicMessage(msg)
      messageBuffer = messageBuffer.slice(11)
    } else {
      // Not a valid message, skip this byte and try again
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
