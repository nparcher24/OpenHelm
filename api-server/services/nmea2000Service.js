/**
 * NMEA 2000 Service - Reads vessel data from CAN bus via PiCAN-M HAT
 * Uses canboatjs SimpleCan for CAN frame reading and FromPgn for PGN parsing
 * Falls back to demo mode when can0 is unavailable
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { SimpleCan, FromPgn } = require('@canboat/canboatjs')

let isRunning = false
let isDemoMode = false
let simpleCan = null
let fromPgn = null
let demoInterval = null
let vesselUpdateCallback = null
let seenPgns = new Set()

// Vessel data snapshot
let vesselData = {
  // Engine (PGN 127488 / 127489)
  rpm: null,
  engineTemp: null,       // Fahrenheit
  oilPressure: null,      // PSI
  fuelRate: null,         // GPH
  trimPosition: null,     // percent
  engineHours: null,      // hours
  // Fuel (PGN 127505)
  fuelLevel: null,        // percent
  fuelCapacity: null,     // gallons
  // Depth (PGN 128267)
  waterDepth: null,       // feet
  // Water temp (PGN 130312)
  waterTemp: null,        // Fahrenheit
  // Battery (PGN 127508)
  batteryVoltage: null,   // volts
  batteryCurrent: null,   // amps
  // Metadata
  timestamp: null,
  isConnected: false,
  isDemoMode: false,
  pgnCount: 0,
  error: null
}

/**
 * Set callback for vessel data updates (used for WebSocket streaming)
 */
export function setVesselUpdateCallback(callback) {
  vesselUpdateCallback = callback
}

/**
 * Convert Kelvin to Fahrenheit
 */
function kelvinToF(k) {
  if (k == null || k <= 0) return null
  return (k - 273.15) * 9/5 + 32
}

/**
 * Convert Kelvin to Fahrenheit, Pascals to PSI, liters/hour to GPH, meters to feet
 */
function pascalToPsi(pa) {
  if (pa == null) return null
  return pa * 0.000145038
}

function litersPerHourToGph(lph) {
  if (lph == null) return null
  return lph * 0.264172
}

function metersToFeet(m) {
  if (m == null || m <= 0) return null
  return m * 3.28084
}

function litersToGallons(l) {
  if (l == null) return null
  return l * 0.264172
}

/**
 * Handle a parsed PGN message from canboatjs
 */
function handlePgn(msg) {
  const pgn = msg.pgn
  const fields = msg.fields || {}

  // Log first occurrence of each PGN
  if (!seenPgns.has(pgn)) {
    seenPgns.add(pgn)
    console.log(`NMEA2000: New PGN ${pgn} (${msg.description || 'unknown'}) from src ${msg.src}`)
    console.log(`  Fields: ${JSON.stringify(fields)}`)
  }

  vesselData.pgnCount++

  switch (pgn) {
    case 127488: // Engine Parameters, Rapid Update
      if (fields.speed != null) vesselData.rpm = Math.round(fields.speed)
      if (fields.tiltTrim != null) vesselData.trimPosition = fields.tiltTrim
      break

    case 127489: // Engine Parameters, Dynamic
      if (fields.oilPressure != null) vesselData.oilPressure = Math.round(pascalToPsi(fields.oilPressure) * 10) / 10
      if (fields.temperature != null) vesselData.engineTemp = Math.round(kelvinToF(fields.temperature))
      if (fields.alternatorPotential != null) vesselData.batteryVoltage = Math.round(fields.alternatorPotential * 100) / 100
      if (fields.fuelRate != null) vesselData.fuelRate = Math.round(litersPerHourToGph(fields.fuelRate) * 10) / 10
      if (fields.totalEngineHours != null) vesselData.engineHours = Math.round(fields.totalEngineHours / 3600 * 10) / 10
      break

    case 127505: // Fluid Level
      if (fields.type === 'Fuel' || fields.type === 0) {
        if (fields.level != null) vesselData.fuelLevel = Math.round(fields.level * 10) / 10
        if (fields.capacity != null) vesselData.fuelCapacity = Math.round(litersToGallons(fields.capacity))
      }
      break

    case 127508: // Battery Status
      if (fields.voltage != null) vesselData.batteryVoltage = Math.round(fields.voltage * 100) / 100
      if (fields.current != null) vesselData.batteryCurrent = Math.round(fields.current * 100) / 100
      break

    case 128267: // Water Depth
      if (fields.depth != null) vesselData.waterDepth = Math.round(metersToFeet(fields.depth) * 10) / 10
      break

    case 130312: // Temperature
      if (fields.source === 'Sea Temperature' || fields.source === 0) {
        if (fields.actualTemperature != null) vesselData.waterTemp = Math.round(kelvinToF(fields.actualTemperature))
      }
      break
  }

  vesselData.timestamp = Date.now()
  vesselData.isConnected = true
  vesselData.isDemoMode = false

  if (vesselUpdateCallback) {
    vesselUpdateCallback(vesselData)
  }
}

/**
 * Start demo mode with simulated vessel data
 */
function startDemoMode() {
  isDemoMode = true
  vesselData.isDemoMode = true
  vesselData.isConnected = false
  vesselData.error = null
  console.log('NMEA2000: Demo mode active (can0 not available)')

  let t = 0
  demoInterval = setInterval(() => {
    t += 0.2 // 5Hz

    // RPM: sine wave idle to cruise (650-4500)
    const rpmBase = 2575
    const rpmRange = 1925
    vesselData.rpm = Math.round(rpmBase + rpmRange * Math.sin(t * 0.3))

    // Engine temp: 160-180F with slight variation
    vesselData.engineTemp = Math.round(170 + 10 * Math.sin(t * 0.1))

    // Oil pressure: 40-60 psi, correlates with RPM
    const rpmFrac = (vesselData.rpm - 650) / (4500 - 650)
    vesselData.oilPressure = Math.round((40 + 20 * rpmFrac) * 10) / 10

    // Fuel rate: 0.5-15 GPH, correlates with RPM
    vesselData.fuelRate = Math.round((0.5 + 14.5 * rpmFrac * rpmFrac) * 10) / 10

    // Trim: 0-100%
    vesselData.trimPosition = Math.round(30 + 20 * Math.sin(t * 0.05))

    // Engine hours
    vesselData.engineHours = 247.3

    // Battery: 12.4-14.2V
    vesselData.batteryVoltage = Math.round((13.2 + 0.8 * Math.sin(t * 0.15)) * 100) / 100
    vesselData.batteryCurrent = Math.round((2.5 + 1.5 * Math.sin(t * 0.2)) * 100) / 100

    // Fuel level: slowly decreasing
    vesselData.fuelLevel = Math.round((75 - (t * 0.01) % 50) * 10) / 10
    vesselData.fuelCapacity = 100

    // Water depth: 8-45 ft with variation
    vesselData.waterDepth = Math.round((25 + 15 * Math.sin(t * 0.08)) * 10) / 10

    // Water temp: 72-78F
    vesselData.waterTemp = Math.round(75 + 3 * Math.sin(t * 0.05))

    vesselData.timestamp = Date.now()
    vesselData.pgnCount++

    if (vesselUpdateCallback) {
      vesselUpdateCallback(vesselData)
    }
  }, 200) // 5Hz
}

/**
 * Start NMEA 2000 service
 */
export async function startNmea2000Service() {
  if (isRunning) {
    console.log('NMEA2000: Service already running')
    return vesselData
  }

  try {
    fromPgn = new FromPgn()
    fromPgn.on('error', () => {}) // Suppress incomplete packet errors
    fromPgn.on('pgn', handlePgn)

    simpleCan = new SimpleCan({ canDevice: 'can0' }, (msg) => {
      // msg is { pgn: { pgn, src, dst, prio }, length, data }
      try {
        fromPgn.parsePgnData(msg.pgn, msg.length, msg.data)
      } catch (e) {
        // Ignore parse errors for unknown/malformed PGNs
      }
    })

    simpleCan.start()
    isRunning = true
    isDemoMode = false
    vesselData.isConnected = true
    vesselData.isDemoMode = false
    vesselData.error = null
    console.log('NMEA2000: Service started on can0')
  } catch (err) {
    console.log(`NMEA2000: can0 not available (${err.message}), starting demo mode`)
    vesselData.error = null // Don't show error in demo mode
    startDemoMode()
    isRunning = true
  }

  return vesselData
}

/**
 * Stop NMEA 2000 service
 */
export function stopNmea2000Service() {
  if (demoInterval) {
    clearInterval(demoInterval)
    demoInterval = null
  }
  if (simpleCan) {
    try {
      simpleCan.stop?.()
    } catch (e) {
      // Ignore stop errors
    }
    simpleCan = null
  }
  if (fromPgn) {
    fromPgn.removeAllListeners()
    fromPgn = null
  }
  isRunning = false
  isDemoMode = false
  vesselData.isConnected = false
  console.log('NMEA2000: Service stopped')
}

/**
 * Get current vessel data snapshot
 */
export function getVesselData() {
  return {
    ...vesselData,
    isRunning,
    isDemoMode,
    age: vesselData.timestamp ? Date.now() - vesselData.timestamp : null
  }
}

/**
 * Check if service is running
 */
export function isVesselRunning() {
  return isRunning
}
