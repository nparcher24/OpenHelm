/**
 * NMEA 2000 Service — reads vessel data from CAN bus via candleLight USB adapter (gs_usb / can0).
 * Uses canboatjs SimpleCan for CAN frame reading and FromPgn for PGN parsing.
 * Falls back to demo mode when can0 is unavailable.
 *
 * Boat-specific PGN inventory is tracked in n2k_adapter/CLAUDE.md.
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

// PGN -> { count, lastSeen, src, description, category }
const pgnInventory = new Map()

// Categorize PGNs so the UI can show which buckets the bus is populating.
// Anything not listed falls under 'other'.
const PGN_CATEGORY = {
  // Engine
  127488: 'engine', 127489: 'engine', 127497: 'engine', 65292: 'engine', 65293: 'engine',
  // Fuel / fluids
  127505: 'fuel',
  // Battery / DC
  127506: 'power', 127508: 'power', 127751: 'power', 127500: 'power',
  // Depth / sounder
  128267: 'env', 128275: 'env',
  // Environment
  130310: 'env', 130311: 'env', 130312: 'env', 130316: 'env',
  // Wind
  130306: 'wind',
  // Heading / attitude
  127245: 'attitude', 127250: 'attitude', 127251: 'attitude', 127257: 'attitude', 127258: 'attitude',
  // GPS / nav
  129025: 'nav', 129026: 'nav', 129029: 'nav', 129283: 'nav', 129284: 'nav', 129539: 'nav', 129540: 'nav',
  // AIS
  129038: 'ais', 129039: 'ais', 129041: 'ais', 129793: 'ais', 129794: 'ais', 129809: 'ais', 129810: 'ais',
  // System / ISO
  60928: 'system', 126208: 'system', 126464: 'system', 126720: 'system', 126983: 'system',
  126984: 'system', 126985: 'system', 126992: 'system', 126993: 'system', 126996: 'system',
  127501: 'system',
  // Audio
  130820: 'audio'
}

// Vessel data snapshot (flat fields preserved for backward compat with the UI;
// nested gps/n2k blocks are new and consumed by gpsArbiter.js).
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
  // Environment (PGN 130310 / 130312)
  waterTemp: null,        // Fahrenheit
  airTemp: null,          // Fahrenheit
  atmosphericPressure: null, // hPa
  // Battery (PGN 127508 / 127751)
  batteryVoltage: null,   // volts
  batteryCurrent: null,   // amps
  batterySource: null,    // 'engine' | '127508' | '127751' (which PGN populated voltage)
  // Wind (PGN 130306) — apparent or true depending on reference field
  windSpeed: null,        // knots
  windAngle: null,        // degrees
  windReference: null,    // 'apparent' | 'true' | 'ground' etc.
  // Heading / attitude
  vesselHeading: null,    // degrees true
  headingReference: null, // 'true' | 'magnetic'
  attitudeRoll: null,     // degrees
  attitudePitch: null,    // degrees
  attitudeYaw: null,      // degrees
  // Rudder
  rudderAngle: null,      // degrees (positive = stbd)
  // GPS — used by gpsArbiter as the N2K fallback source
  gps: {
    latitude: null,       // decimal degrees
    longitude: null,
    altitude: null,       // meters
    cog: null,            // degrees true
    sog: null,            // m/s
    satellites: null,
    fix: null,            // boolean
    hdop: null,
    pdop: null,
    vdop: null,
    timestamp: null,      // ms epoch — last time any GPS PGN updated this block
    src: null             // CAN src address of the GPS device on the bus
  },
  // Metadata
  timestamp: null,
  isConnected: false,
  isDemoMode: false,
  pgnCount: 0,
  error: null
}

export function setVesselUpdateCallback(callback) {
  vesselUpdateCallback = callback
}

// ──────────────────────────────────────────────────────────────────────────
// Unit conversions
// canboatjs returns SI units by convention (K, Pa, m, m/s, rad, V, A, L/h).
// We convert to the units the existing UI expects.
// ──────────────────────────────────────────────────────────────────────────

function kelvinToF(k) {
  if (k == null || k <= 0) return null
  return (k - 273.15) * 9 / 5 + 32
}

function pascalToPsi(pa) {
  if (pa == null) return null
  return pa * 0.000145038
}

function pascalToHpa(pa) {
  if (pa == null) return null
  return pa / 100
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

function msToKnots(ms) {
  if (ms == null) return null
  return ms * 1.94384
}

function radToDeg(r) {
  if (r == null) return null
  let d = r * 180 / Math.PI
  if (d < 0) d += 360
  if (d >= 360) d -= 360
  return d
}

// canboatjs sometimes hands fields back as { value, units } objects, sometimes
// as raw numbers, depending on how the PGN definition was written. Normalize.
function num(field) {
  if (field == null) return null
  if (typeof field === 'number') return field
  if (typeof field === 'object' && typeof field.value === 'number') return field.value
  return null
}

// PGNs whose "reference" / categorical fields can arrive as a string or as an
// integer enum. Both forms are accepted.
function isReference(field, label, enumValue) {
  if (field == null) return false
  if (typeof field === 'string') return field === label
  if (typeof field === 'number') return field === enumValue
  if (typeof field === 'object') {
    if (field.value === enumValue) return true
    if (field.name === label) return true
  }
  return false
}

// Track every PGN we see so /api/vessel can report the live inventory
// (useful diagnostic data once the kiosk is running).
function trackPgn(msg) {
  const key = msg.pgn
  let entry = pgnInventory.get(key)
  if (!entry) {
    entry = {
      pgn: key,
      description: msg.description || null,
      category: PGN_CATEGORY[key] || 'other',
      src: msg.src,
      count: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now()
    }
    pgnInventory.set(key, entry)
    console.log(`NMEA2000: New PGN ${key} (${entry.description || 'unknown'}) from src ${msg.src} [${entry.category}]`)
  }
  entry.count++
  entry.lastSeen = Date.now()
  entry.src = msg.src
}

function handlePgn(msg) {
  const pgn = msg.pgn
  const fields = msg.fields || {}

  trackPgn(msg)
  vesselData.pgnCount++

  switch (pgn) {
    case 127488: { // Engine Parameters, Rapid Update
      const speed = num(fields.speed)
      const trim = num(fields.tiltTrim)
      if (speed != null) vesselData.rpm = Math.round(speed)
      if (trim != null) vesselData.trimPosition = trim
      break
    }

    case 127489: { // Engine Parameters, Dynamic
      const oil = num(fields.oilPressure)
      const temp = num(fields.temperature)
      const alt = num(fields.alternatorPotential)
      const fr = num(fields.fuelRate)
      const hours = num(fields.totalEngineHours)
      if (oil != null) vesselData.oilPressure = Math.round(pascalToPsi(oil) * 10) / 10
      if (temp != null) vesselData.engineTemp = Math.round(kelvinToF(temp))
      if (alt != null) {
        vesselData.batteryVoltage = Math.round(alt * 100) / 100
        vesselData.batterySource = 'engine'
      }
      if (fr != null) vesselData.fuelRate = Math.round(litersPerHourToGph(fr) * 10) / 10
      if (hours != null) vesselData.engineHours = Math.round(hours / 3600 * 10) / 10
      break
    }

    case 127505: { // Fluid Level
      if (isReference(fields.type, 'Fuel', 0)) {
        const level = num(fields.level)
        const cap = num(fields.capacity)
        if (level != null) vesselData.fuelLevel = Math.round(level * 10) / 10
        if (cap != null) vesselData.fuelCapacity = Math.round(litersToGallons(cap))
      }
      break
    }

    case 127508: { // Battery Status (some monitors)
      const v = num(fields.voltage)
      const c = num(fields.current)
      // Don't overwrite a more recent 127751 with a stale 127508 reading.
      if (v != null && vesselData.batterySource !== '127751') {
        vesselData.batteryVoltage = Math.round(v * 100) / 100
        vesselData.batterySource = '127508'
      }
      if (c != null) vesselData.batteryCurrent = Math.round(c * 100) / 100
      break
    }

    case 127751: { // DC Voltage / Current — this boat's battery monitor (src 0x94)
      // canboatjs field names are dcVoltage / dcCurrent (not voltage/current).
      // The monitor publishes one frame per connection slot; on this boat slots
      // 0 and 2 are unused and report 0 V / 0 A. Skip those or the live reading
      // gets zeroed every cycle. Connection 1 carries the actual battery.
      const v = num(fields.dcVoltage)
      const c = num(fields.dcCurrent)
      if (v != null && v > 0.5) {
        vesselData.batteryVoltage = Math.round(v * 100) / 100
        vesselData.batterySource = '127751'
        if (c != null) vesselData.batteryCurrent = Math.round(c * 100) / 100
      }
      break
    }

    case 128267: { // Water Depth
      const d = num(fields.depth)
      if (d != null) vesselData.waterDepth = Math.round(metersToFeet(d) * 10) / 10
      break
    }

    case 130310: { // Outside Environmental Parameters
      const water = num(fields.waterTemperature)
      const air = num(fields.outsideAmbientAirTemperature ?? fields.outsideAirTemperature)
      const baro = num(fields.atmosphericPressure)
      if (water != null) vesselData.waterTemp = Math.round(kelvinToF(water))
      if (air != null) vesselData.airTemp = Math.round(kelvinToF(air))
      if (baro != null) vesselData.atmosphericPressure = Math.round(pascalToHpa(baro) * 10) / 10
      break
    }

    case 130312: { // Temperature
      if (isReference(fields.source, 'Sea Temperature', 0)) {
        const t = num(fields.actualTemperature)
        if (t != null) vesselData.waterTemp = Math.round(kelvinToF(t))
      } else if (isReference(fields.source, 'Outside Temperature', 1)) {
        const t = num(fields.actualTemperature)
        if (t != null) vesselData.airTemp = Math.round(kelvinToF(t))
      }
      break
    }

    case 130306: { // Wind Data
      const speed = num(fields.windSpeed)
      const angle = num(fields.windAngle)
      if (speed != null) vesselData.windSpeed = Math.round(msToKnots(speed) * 10) / 10
      if (angle != null) vesselData.windAngle = Math.round(radToDeg(angle))
      if (fields.reference != null) {
        // canboatjs gives a string like "Apparent" / "True (boat referenced)" / etc.
        vesselData.windReference = typeof fields.reference === 'string'
          ? fields.reference.toLowerCase()
          : fields.reference?.name?.toLowerCase() ?? String(fields.reference)
      }
      break
    }

    case 127250: { // Vessel Heading
      const h = num(fields.heading)
      if (h != null) vesselData.vesselHeading = Math.round(radToDeg(h) * 10) / 10
      if (fields.reference != null) {
        vesselData.headingReference = typeof fields.reference === 'string'
          ? fields.reference.toLowerCase()
          : fields.reference?.name?.toLowerCase() ?? null
      }
      break
    }

    case 127257: { // Attitude
      const roll = num(fields.roll)
      const pitch = num(fields.pitch)
      const yaw = num(fields.yaw)
      if (roll != null) vesselData.attitudeRoll = Math.round(radToDeg(roll) * 10) / 10
      if (pitch != null) vesselData.attitudePitch = Math.round(radToDeg(pitch) * 10) / 10
      if (yaw != null) vesselData.attitudeYaw = Math.round(radToDeg(yaw) * 10) / 10
      break
    }

    case 127245: { // Rudder
      const a = num(fields.position ?? fields.rudderPosition)
      if (a != null) vesselData.rudderAngle = Math.round(radToDeg(a) * 10) / 10
      break
    }

    // ── GPS PGNs feed vesselData.gps for the arbiter ──
    case 129025: { // Position, Rapid Update
      const lat = num(fields.latitude)
      const lon = num(fields.longitude)
      if (lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        vesselData.gps.latitude = lat
        vesselData.gps.longitude = lon
        vesselData.gps.timestamp = Date.now()
        vesselData.gps.src = msg.src
      }
      break
    }

    case 129026: { // COG & SOG, Rapid Update
      const cog = num(fields.cog)
      const sog = num(fields.sog)
      if (cog != null) vesselData.gps.cog = radToDeg(cog)
      if (sog != null && sog >= 0 && sog < 100) vesselData.gps.sog = sog
      vesselData.gps.timestamp = Date.now()
      vesselData.gps.src = msg.src
      break
    }

    case 129029: { // GNSS Position Data
      const lat = num(fields.latitude)
      const lon = num(fields.longitude)
      const alt = num(fields.altitude)
      const sats = num(fields.numberOfSvs)
      const hdop = num(fields.hdop)
      const pdop = num(fields.pdop)
      if (lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        vesselData.gps.latitude = lat
        vesselData.gps.longitude = lon
      }
      if (alt != null) vesselData.gps.altitude = alt
      if (sats != null) {
        vesselData.gps.satellites = sats
        vesselData.gps.fix = sats >= 4
      }
      if (hdop != null) vesselData.gps.hdop = hdop
      if (pdop != null) vesselData.gps.pdop = pdop
      vesselData.gps.timestamp = Date.now()
      vesselData.gps.src = msg.src
      break
    }

    case 129539: { // GNSS DOPs
      const hdop = num(fields.hdop)
      const vdop = num(fields.vdop)
      const pdop = num(fields.tdop ?? fields.pdop)
      if (hdop != null) vesselData.gps.hdop = hdop
      if (vdop != null) vesselData.gps.vdop = vdop
      if (pdop != null) vesselData.gps.pdop = pdop
      break
    }

    // 65292/65293: proprietary engine PGNs (Mercury SmartCraft / Yamaha Command Link).
    // Decoding the byte layout requires live RPM variation, which we can't get with
    // the boat on land. Tracked in n2k_adapter/CLAUDE.md Open Question #1.
    case 65292:
    case 65293:
      break
  }

  vesselData.timestamp = Date.now()
  vesselData.isConnected = true
  vesselData.isDemoMode = false

  if (vesselUpdateCallback) {
    vesselUpdateCallback(vesselData)
  }
}

// Exported for testability — lets unit tests drive PGN messages through
// the same code path the live SimpleCan reader uses.
export function _handlePgnForTest(msg) {
  handlePgn(msg)
}

function startDemoMode() {
  isDemoMode = true
  vesselData.isDemoMode = true
  vesselData.isConnected = false
  vesselData.error = null
  console.log('NMEA2000: Demo mode active (can0 not available)')

  let t = 0
  demoInterval = setInterval(() => {
    t += 0.2

    const rpmBase = 2575
    const rpmRange = 1925
    vesselData.rpm = Math.round(rpmBase + rpmRange * Math.sin(t * 0.3))
    vesselData.engineTemp = Math.round(170 + 10 * Math.sin(t * 0.1))
    const rpmFrac = (vesselData.rpm - 650) / (4500 - 650)
    vesselData.oilPressure = Math.round((40 + 20 * rpmFrac) * 10) / 10
    vesselData.fuelRate = Math.round((0.5 + 14.5 * rpmFrac * rpmFrac) * 10) / 10
    vesselData.trimPosition = Math.round(30 + 20 * Math.sin(t * 0.05))
    vesselData.engineHours = 247.3
    vesselData.batteryVoltage = Math.round((13.2 + 0.8 * Math.sin(t * 0.15)) * 100) / 100
    vesselData.batteryCurrent = Math.round((2.5 + 1.5 * Math.sin(t * 0.2)) * 100) / 100
    vesselData.batterySource = 'demo'
    vesselData.fuelLevel = Math.round((75 - (t * 0.01) % 50) * 10) / 10
    vesselData.fuelCapacity = 100
    vesselData.waterDepth = Math.round((25 + 15 * Math.sin(t * 0.08)) * 10) / 10
    vesselData.waterTemp = Math.round(75 + 3 * Math.sin(t * 0.05))

    vesselData.timestamp = Date.now()
    vesselData.pgnCount++

    if (vesselUpdateCallback) {
      vesselUpdateCallback(vesselData)
    }
  }, 200)
}

export async function startNmea2000Service() {
  if (isRunning) {
    console.log('NMEA2000: Service already running')
    return vesselData
  }

  try {
    fromPgn = new FromPgn()
    fromPgn.on('error', () => {})
    fromPgn.on('pgn', handlePgn)

    simpleCan = new SimpleCan({ canDevice: 'can0' }, (msg) => {
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
    vesselData.error = null
    startDemoMode()
    isRunning = true
  }

  return vesselData
}

export function stopNmea2000Service() {
  if (demoInterval) {
    clearInterval(demoInterval)
    demoInterval = null
  }
  if (simpleCan) {
    try { simpleCan.stop?.() } catch (e) { /* ignore */ }
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

export function getVesselData() {
  return {
    ...vesselData,
    gps: { ...vesselData.gps },
    isRunning,
    isDemoMode,
    age: vesselData.timestamp ? Date.now() - vesselData.timestamp : null,
    pgnInventory: getPgnInventory()
  }
}

export function getPgnInventory() {
  return [...pgnInventory.values()]
    .sort((a, b) => a.pgn - b.pgn)
    .map(e => ({ ...e }))
}

export function isVesselRunning() {
  return isRunning
}

// Test-only helper: reset the vessel snapshot back to defaults so each test
// starts from a clean slate. Not used in production.
export function _resetVesselDataForTest() {
  vesselData.rpm = null
  vesselData.engineTemp = null
  vesselData.oilPressure = null
  vesselData.fuelRate = null
  vesselData.trimPosition = null
  vesselData.engineHours = null
  vesselData.fuelLevel = null
  vesselData.fuelCapacity = null
  vesselData.waterDepth = null
  vesselData.waterTemp = null
  vesselData.airTemp = null
  vesselData.atmosphericPressure = null
  vesselData.batteryVoltage = null
  vesselData.batteryCurrent = null
  vesselData.batterySource = null
  vesselData.windSpeed = null
  vesselData.windAngle = null
  vesselData.windReference = null
  vesselData.vesselHeading = null
  vesselData.headingReference = null
  vesselData.attitudeRoll = null
  vesselData.attitudePitch = null
  vesselData.attitudeYaw = null
  vesselData.rudderAngle = null
  vesselData.gps = {
    latitude: null, longitude: null, altitude: null, cog: null, sog: null,
    satellites: null, fix: null, hdop: null, pdop: null, vdop: null,
    timestamp: null, src: null
  }
  vesselData.timestamp = null
  vesselData.isConnected = false
  vesselData.isDemoMode = false
  vesselData.pgnCount = 0
  vesselData.error = null
  pgnInventory.clear()
}
