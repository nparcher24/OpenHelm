/**
 * GPS Simulator — drives a simulated boat in a rectangular loop
 * Starts offshore Virginia Beach, goes N → E → S → W, 5 minutes per leg
 * Broadcasts via the same GPS WebSocket channel as real GPS data
 */

// Leg definitions: heading (degrees), duration (ms)
const LEG_DURATION = 5 * 60 * 1000 // 5 minutes per leg
const LEGS = [
  { heading: 0, label: 'North' },     // N
  { heading: 90, label: 'East' },     // E
  { heading: 180, label: 'South' },   // S
  { heading: 270, label: 'West' },    // W
]

// Starting position: just offshore Virginia Beach
const START_LAT = 36.860
const START_LON = -75.965

// Simulated speed: ~15 knots = ~7.72 m/s
const SPEED_MS = 7.72
const UPDATE_INTERVAL = 200 // 5 Hz to match real GPS broadcast rate

// Earth radius in meters for position updates
const EARTH_R = 6378137

let simInterval = null
let simStartTime = null
let simLat = START_LAT
let simLon = START_LON
let simCallback = null

function degreesToRadians(deg) {
  return deg * Math.PI / 180
}

function movePosition(lat, lon, headingDeg, distanceMeters) {
  const latRad = degreesToRadians(lat)
  const headRad = degreesToRadians(headingDeg)
  const dLat = (distanceMeters * Math.cos(headRad)) / EARTH_R
  const dLon = (distanceMeters * Math.sin(headRad)) / (EARTH_R * Math.cos(latRad))
  return {
    lat: lat + dLat * (180 / Math.PI),
    lon: lon + dLon * (180 / Math.PI)
  }
}

function tick() {
  const elapsed = Date.now() - simStartTime
  const totalLoopTime = LEG_DURATION * LEGS.length
  const loopElapsed = elapsed % totalLoopTime
  const legIndex = Math.floor(loopElapsed / LEG_DURATION)
  const leg = LEGS[legIndex]
  const legElapsed = loopElapsed - legIndex * LEG_DURATION

  // Wave simulation — multiple overlapping sine waves for organic motion
  const t = elapsed / 1000 // seconds

  // Heading wander: slow drift ±4° plus small fast jitter ±1.5°
  const headingWander = Math.sin(t / 8.3) * 4 + Math.sin(t / 2.1) * 1.5 + Math.sin(t / 0.7) * 0.5
  let heading = leg.heading + headingWander
  if (heading < 0) heading += 360
  if (heading >= 360) heading -= 360

  // Speed variation: base ± ~15% with wave surges
  const speedVariation = 1.0 + Math.sin(t / 5.7) * 0.08 + Math.sin(t / 1.9) * 0.05 + Math.sin(t / 0.6) * 0.02
  const currentSpeed = SPEED_MS * speedVariation

  // Move using the wandering heading
  const distPerTick = currentSpeed * (UPDATE_INTERVAL / 1000)
  const newPos = movePosition(simLat, simLon, heading, distPerTick)
  simLat = newPos.lat
  simLon = newPos.lon

  // COG: actual direction of travel plus some GPS noise
  const cogNoise = Math.sin(t / 3.3) * 6 + Math.sin(t / 1.1) * 2
  let cog = heading + cogNoise
  if (cog < 0) cog += 360
  if (cog >= 360) cog -= 360

  // Roll: waves rocking the boat side to side
  const roll = Math.sin(t / 3.2) * 5 + Math.sin(t / 1.4) * 3 + Math.sin(t / 0.5) * 1.5

  // Pitch: fore-aft motion from waves
  const pitch = Math.sin(t / 4.1) * 3 + Math.sin(t / 1.7) * 2 + Math.sin(t / 0.6) * 0.8

  const gpsData = {
    latitude: simLat,
    longitude: simLon,
    altitude: 0,
    heading: heading,
    headingRaw: heading - headingWander * 0.3, // raw has less smoothing
    roll: roll,
    pitch: pitch,
    speed: currentSpeed,
    groundSpeed: currentSpeed,
    satellites: 12,
    fix: true,
    pdop: 1.2,
    hdop: 0.9,
    vdop: 0.8,
    timestamp: Date.now(),
    device: 'simulator',
    error: null,
    cog: cog,
    pressure: 1013.25 + Math.sin(t / 60) * 0.3, // slow barometric drift
    ax: Math.sin(t / 0.4) * 0.15, ay: roll * 0.02, az: 9.81 + pitch * 0.01,
    gx: Math.sin(t / 0.8) * 2, gy: Math.cos(t / 0.6) * 1.5, gz: Math.sin(t / 1.2) * 0.5,
    mx: 0, my: 0, mz: 0,
    headingOffset: 0,
    isSimulator: true
  }

  if (simCallback) {
    simCallback(gpsData)
  }
}

export function startSimulator(updateCallback) {
  if (simInterval) {
    console.log('[GPS-SIM] Simulator already running')
    return
  }

  simCallback = updateCallback
  simLat = START_LAT
  simLon = START_LON
  simStartTime = Date.now()

  console.log(`[GPS-SIM] Starting simulator at ${START_LAT}, ${START_LON}`)
  console.log(`[GPS-SIM] Speed: ${(SPEED_MS * 1.94384).toFixed(1)} kts, loop: N→E→S→W, ${LEG_DURATION / 60000}min per leg`)

  simInterval = setInterval(tick, UPDATE_INTERVAL)
  // Fire first tick immediately
  tick()
}

export function stopSimulator() {
  if (simInterval) {
    clearInterval(simInterval)
    simInterval = null
    simCallback = null
    console.log('[GPS-SIM] Simulator stopped')
  }
}

export function isSimulatorRunning() {
  return simInterval !== null
}
