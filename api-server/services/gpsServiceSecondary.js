/**
 * Secondary GPS Service — reader for the SECOND WitMotion unit.
 *
 * Two responsibilities:
 *   1. Feed the heading fuser (gyro Z, mag vector, raw yaw) — see HEADING_FUSION.md.
 *   2. Act as a third independent GPS source the arbiter can pick from when its
 *      horizontal fix is better than the primary WitMotion or the boat's N2K GPS.
 *
 * Why a separate file instead of refactoring gpsService.js into a class:
 *   The primary gpsService is heavily singleton-coded and currently working in
 *   the field. The risk of breaking it for the sake of code reuse outweighs
 *   the cost of a small duplication here. This service parses the same
 *   WitMotion frames the primary does, but without the wave-estimation,
 *   mag-cal, calibration-offset, or auto-cal stacks — those exist once on the
 *   primary and don't need a clone here.
 *
 * Activation: this service is OPT-IN. Without one of the env vars below,
 * `start()` is a no-op and `getSecondaryGpsData()` always returns `null`. That
 * keeps today's single-unit boat working unchanged and lets the boat-side
 * session enable the secondary by setting an env var and restarting.
 *
 *   OPENHELM_GPS_SECONDARY=1         → auto-discover /dev/witmotion-b
 *   OPENHELM_GPS_SECONDARY_DEVICE=…  → explicit path override
 */

import { SerialPort } from 'serialport'
import fs from 'fs'

let serialPort = null
let messageBuffer = Buffer.alloc(0)
let isRunning = false

// Full data cache — both heading-fusion inputs and position-source fields so
// the arbiter can pick this unit when its HDOP beats the others.
let data = null

function _resetData() {
  data = {
    // Heading-fusion inputs
    wz: null,             // gyro Z, deg/s  — rate of turn
    headingRaw: null,     // raw yaw from 0x53, [0,360) — diagnostic only
    hx: null,             // mag X — raw int16, scale matches primary
    hy: null,
    hz: null,
    // Position-source fields (mirror gpsService output)
    latitude: null,
    longitude: null,
    altitude: null,
    cog: null,            // position-derived, see _updateCogFromPosition
    groundSpeed: null,    // m/s
    satellites: 0,
    fix: false,
    pdop: null,
    hdop: null,
    vdop: null,
    // Liveness / source identity
    timestamp: null,
    device: null,
    error: null,
  }
}

_resetData()

// Position-derived COG state — same approach as gpsService.js. The on-device
// GPSYaw field (0x58 bytes 2-3) is unreliable in field testing, so we derive
// COG from successive lat/lon pairs instead. See gpsService for the
// rationale; we duplicate the constants here so the secondary's behavior
// stays self-contained and independently tunable.
const COG_HISTORY_MAX = 16
const COG_BASELINE_MS = 1500
const COG_MIN_DIST_M = 3
const cogHistory = []

function _haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function _bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  let θ = Math.atan2(y, x) * 180 / Math.PI
  if (θ < 0) θ += 360
  return θ
}

function _updateCogFromPosition(lat, lon, now = Date.now()) {
  cogHistory.push({ ts: now, lat, lon })
  while (cogHistory.length > COG_HISTORY_MAX) cogHistory.shift()
  let baseline = null
  for (let i = 0; i < cogHistory.length - 1; i++) {
    if (now - cogHistory[i].ts >= COG_BASELINE_MS) baseline = cogHistory[i]
  }
  if (!baseline) return
  const dist = _haversineMeters(baseline.lat, baseline.lon, lat, lon)
  if (dist < COG_MIN_DIST_M) {
    data.cog = null
    return
  }
  data.cog = _bearingDeg(baseline.lat, baseline.lon, lat, lon)
}

function _enabled() {
  return process.env.OPENHELM_GPS_SECONDARY === '1'
      || process.env.OPENHELM_GPS_SECONDARY === 'true'
      || !!process.env.OPENHELM_GPS_SECONDARY_DEVICE
}

function _resolveDevice() {
  // Explicit path wins.
  if (process.env.OPENHELM_GPS_SECONDARY_DEVICE) {
    const p = process.env.OPENHELM_GPS_SECONDARY_DEVICE
    try {
      fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK)
      return p
    } catch (err) {
      console.log(`[GPS-B] OPENHELM_GPS_SECONDARY_DEVICE=${p} not accessible: ${err.message}`)
      return null
    }
  }
  // Default symlink — boat-side udev rule sets this up (see HEADING_FUSION.md §2).
  const link = '/dev/witmotion-b'
  try {
    fs.accessSync(link, fs.constants.R_OK | fs.constants.W_OK)
    return link
  } catch {
    return null
  }
}

function _validateChecksum(msg) {
  if (msg.length < 11) return false
  let sum = 0
  for (let i = 0; i < 10; i++) sum += msg[i]
  return (sum & 0xFF) === msg[10]
}

/**
 * Parse a single 11-byte WitMotion frame. We decode every type the arbiter or
 * fuser needs; other types are valid frames that we silently skip past.
 */
function _parseFrame(msg) {
  if (msg.length < 11 || msg[0] !== 0x55) return null
  if (!_validateChecksum(msg)) return null
  const type = String.fromCharCode(msg[1])
  const body = msg.slice(2, 10)

  switch (type) {
    case 'R': { // 0x52 — angular velocities (heading fusion input)
      const wzRaw = body.readInt16LE(4)
      data.wz = (wzRaw / 32768) * 2000
      break
    }
    case 'S': { // 0x53 — Euler angles (we keep yaw as diagnostic only)
      const yaw = body.readInt16LE(4)
      let h = (-yaw / 32768) * 180
      if (h < 0) h += 360
      data.headingRaw = h
      break
    }
    case 'T': { // 0x54 — magnetometer (heading fusion input)
      data.hx = body.readInt16LE(0)
      data.hy = body.readInt16LE(2)
      data.hz = body.readInt16LE(4)
      break
    }
    case 'W': { // 0x57 — GPS Latitude/Longitude
      // WitMotion encoding matches primary: raw/1e7 gives DD.MMMMMMM, then
      // multiply by 100 to land at DDMM.MMMMM, then convert to decimal degrees.
      const lonRaw = body.readInt32LE(0)
      const latRaw = body.readInt32LE(4)
      const latDDMM = (latRaw / 1e7) * 100
      const latDeg = Math.trunc(latDDMM / 100)
      const latMin = latDDMM - (latDeg * 100)
      const parsedLat = latDeg + (latMin / 60)
      const lonDDMM = (lonRaw / 1e7) * 100
      const lonSign = lonDDMM < 0 ? -1 : 1
      const lonDDMMAbs = Math.abs(lonDDMM)
      const lonDeg = Math.trunc(lonDDMMAbs / 100)
      const lonMin = lonDDMMAbs - (lonDeg * 100)
      const parsedLon = lonSign * (lonDeg + (lonMin / 60))
      if (parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180) {
        data.latitude = parsedLat
        data.longitude = parsedLon
        _updateCogFromPosition(parsedLat, parsedLon)
      }
      break
    }
    case 'X': { // 0x58 — GPS ground speed (and altitude); GPSYaw is ignored, same reason as primary
      const gpsHeight = body.readInt16LE(0) / 10
      const gpsSpeedRaw = body.readUInt32LE(4)
      const gpsSpeedKmh = gpsSpeedRaw / 1000
      const gpsSpeedMs = gpsSpeedKmh / 3.6
      if (gpsSpeedMs >= 0 && gpsSpeedMs < 100) {
        data.groundSpeed = gpsSpeedMs
      }
      data.altitude = gpsHeight
      break
    }
    case 'Z': { // 0x5A — GPS accuracy (sats + DOPs)
      const satellites = body.readUInt16LE(0)
      const pdopRaw = body.readUInt16LE(2)
      const hdopRaw = body.readUInt16LE(4)
      const vdopRaw = body.readUInt16LE(6)
      // Same /10 vs /100 scale auto-detect as primary.
      const dopScale = (pdopRaw > 500 || hdopRaw > 500 || vdopRaw > 500) ? 100 : 10
      data.pdop = pdopRaw / dopScale
      data.hdop = hdopRaw / dopScale
      data.vdop = vdopRaw / dopScale
      data.satellites = satellites
      data.fix = satellites >= 4
      break
    }
    default:
      // Valid frame, type we don't care about — fall through.
      break
  }

  data.timestamp = Date.now()
  return type
}

function _processBytes(chunk) {
  messageBuffer = Buffer.concat([messageBuffer, chunk])
  while (messageBuffer.length >= 11) {
    const start = messageBuffer.indexOf(0x55)
    if (start === -1) {
      messageBuffer = Buffer.alloc(0)
      break
    }
    if (start > 0) messageBuffer = messageBuffer.slice(start)
    if (messageBuffer.length < 11) break
    if (messageBuffer[1] >= 0x50 && messageBuffer[1] <= 0x5F) {
      const frame = messageBuffer.slice(0, 11)
      const result = _parseFrame(frame)
      if (result !== null) {
        messageBuffer = messageBuffer.slice(11)
      } else {
        // Bad checksum — was a false sync. Skip one byte and resync.
        messageBuffer = messageBuffer.slice(1)
      }
    } else {
      messageBuffer = messageBuffer.slice(1)
    }
  }
  if (messageBuffer.length > 1000) {
    messageBuffer = messageBuffer.slice(-100)
  }
}

/**
 * Start the secondary GPS service. No-op when the feature flag is unset or
 * the device isn't present — safe to call unconditionally from server.js.
 */
export async function startSecondaryGpsService() {
  if (!_enabled()) {
    // Quiet no-op — don't spam logs every boot.
    return null
  }
  if (isRunning) return data

  const device = _resolveDevice()
  if (!device) {
    console.log('[GPS-B] Enabled but no device found. Expected /dev/witmotion-b or set OPENHELM_GPS_SECONDARY_DEVICE.')
    data.error = 'No secondary GPS device found'
    return null
  }

  data.device = device
  data.error = null

  try {
    serialPort = new SerialPort({
      path: device,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false,
    })

    serialPort.on('data', _processBytes)
    serialPort.on('error', (err) => {
      console.error('[GPS-B] Serial port error:', err.message)
      data.error = err.message
      isRunning = false
    })
    serialPort.on('close', () => {
      console.log('[GPS-B] Serial port closed')
      isRunning = false
    })

    await new Promise((resolve, reject) => {
      serialPort.open((err) => err ? reject(err) : resolve())
    })

    isRunning = true
    console.log(`[GPS-B] Service started on ${device}`)
  } catch (err) {
    console.error('[GPS-B] Failed to start:', err.message)
    data.error = err.message
    isRunning = false
  }

  return data
}

export async function stopSecondaryGpsService() {
  if (serialPort && serialPort.isOpen) {
    await new Promise((resolve) => serialPort.close(resolve))
  }
  isRunning = false
  serialPort = null
  console.log('[GPS-B] Service stopped')
}

/**
 * Get the secondary unit snapshot. Returns `null` when the feature is not
 * enabled — the fuser and arbiter use this as their signal to fall back to
 * single-unit behavior.
 */
export function getSecondaryGpsData() {
  if (!_enabled()) return null
  // Mark stale data so the arbiter / fuser can treat it as absent rather than
  // coasting on a frozen frame when the cable is unplugged mid-run.
  if (data.timestamp == null || Date.now() - data.timestamp > 5000) {
    return { ...data, stale: true }
  }
  return { ...data, stale: false }
}

export function isSecondaryGpsRunning() {
  return isRunning
}

/** Exported for unit tests. */
export const _internals = {
  _enabled, _resolveDevice, _validateChecksum, _parseFrame, _resetData,
  _haversineMeters, _bearingDeg, _updateCogFromPosition,
}
