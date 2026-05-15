/**
 * GPS Arbiter — picks between WitMotion (USB-serial IMU/GPS) and the boat's
 * N2K GPS (broadcast on the NMEA 2000 bus, decoded by nmea2000Service).
 *
 * Policy: WitMotion is primary. Fall back to N2K GPS only when WitMotion's
 * lat/lon snapshot is older than `STALE_MS` or has no fix.
 *
 * The arbiter does NOT modify either source's state. It only synthesizes a
 * unified snapshot from `getGpsData()` (WitMotion) and `getVesselData()`
 * (N2K). Sensor-unique fields from WitMotion (IMU, wave estimation, heading)
 * always pass through unchanged; only position-class fields swap on fallback.
 *
 * Returned `source` field tells the UI which provider is currently feeding
 * the position fix:
 *   'witmotion' — WitMotion is fresh and has a fix
 *   'n2k'       — WitMotion stale or no fix, N2K bus has a fresh position
 *   'none'      — neither source has a recent valid position
 */

import { getGpsData, autoCalibrateHeadingToCourse } from './gpsService.js'
import { getVesselData } from './nmea2000Service.js'

// How old (ms) a snapshot can be before we treat it as stale and look elsewhere.
// 5s comfortably covers the WitMotion's 1-5 Hz cadence and N2K's 1-10 Hz
// without flapping during a normal momentary read gap.
export const STALE_MS = 5000

// Above this ground speed, slave the displayed heading to COG and auto-calibrate
// the magnetic offset. Below it the boat could be drifting/stationary and COG is
// unreliable. 1.341 m/s = 3 MPH.
export const HEADING_SLAVE_SPEED_MS = 1.341

// Disagreement threshold (degrees) between N2K-reported COG and WitMotion's
// position-derived COG that warrants a diagnostic warning. Above 30° one of
// the sources is almost certainly wrong; below it can be turn lag or noise.
const COG_DISAGREEMENT_WARN_DEG = 30
let lastCogWarnAt = 0
const COG_WARN_THROTTLE_MS = 10000

// Threshold to consider a position "valid" — WitMotion may report (0, 0) or
// near-zero before lock; N2K GPSes can transiently report nulls. We require
// non-null lat/lon and (for WitMotion) fix=true.
function witmotionHasFix(gps, now) {
  if (!gps) return false
  if (gps.latitude == null || gps.longitude == null) return false
  if (gps.timestamp == null) return false
  if (now - gps.timestamp > STALE_MS) return false
  // WitMotion sets fix=false until ≥4 sats; respect it.
  if (gps.fix === false) return false
  return true
}

function n2kHasFix(vessel, now) {
  if (!vessel || !vessel.gps) return false
  const g = vessel.gps
  if (g.latitude == null || g.longitude == null) return false
  if (g.timestamp == null) return false
  if (now - g.timestamp > STALE_MS) return false
  // N2K's `fix` field comes from 129029 satellite count; treat null as
  // "unknown but not failing" since some MFDs don't emit 129029 frequently.
  if (g.fix === false) return false
  return true
}

/**
 * Resolve the active GPS source.
 *
 * When both sources are fresh+fixed, pick the one with the tighter horizontal
 * fix (lower HDOP). The Garmin MFD's marine GPS typically reports HDOP ~0.7
 * while WitMotion's USB module sits around 1.0–12.0 depending on sky view, so
 * in practice this means N2K wins when the helm is on. WitMotion's IMU /
 * heading / wave fields always pass through regardless, so we don't lose any
 * sensor coverage by switching position sources.
 *
 * Pure function over inputs — kept separate from `getActiveGps()` so unit
 * tests can drive it with synthetic snapshots without mocking the services.
 *
 * @param {object} witmotion - shape from gpsService.getGpsData()
 * @param {object} vessel    - shape from nmea2000Service.getVesselData()
 * @param {number} now       - current epoch ms (injected for deterministic tests)
 * @returns {{source: 'witmotion'|'n2k'|'none', witmotionAvailable: boolean, n2kAvailable: boolean, witmotionHdop: number|null, n2kHdop: number|null}}
 */
export function selectSource(witmotion, vessel, now = Date.now()) {
  const witmotionAvailable = witmotionHasFix(witmotion, now)
  const n2kAvailable = n2kHasFix(vessel, now)
  const witmotionHdop = witmotion?.hdop ?? null
  const n2kHdop = vessel?.gps?.hdop ?? null
  let source = 'none'
  if (witmotionAvailable && n2kAvailable) {
    // Tighter horizontal fix wins. Missing HDOP treated as Infinity so a known
    // value beats an unknown. Tie → prefer witmotion (sensor co-location with
    // the IMU pass-through fields).
    const wmH = witmotionHdop ?? Infinity
    const nH = n2kHdop ?? Infinity
    source = nH < wmH ? 'n2k' : 'witmotion'
  } else if (witmotionAvailable) source = 'witmotion'
  else if (n2kAvailable) source = 'n2k'
  return { source, witmotionAvailable, n2kAvailable, witmotionHdop, n2kHdop }
}

/**
 * Build the unified GPS snapshot.
 *
 * Pure over inputs — same testability story as selectSource.
 *
 * Position fields (latitude/longitude/altitude/cog/groundSpeed/satellites/fix/
 * hdop/pdop/vdop) come from the active source. All other fields (IMU, heading,
 * wave estimation, headingOffset) pass through from WitMotion regardless,
 * because those sensors only exist on the WitMotion side.
 */
export function buildSnapshot(witmotion, vessel, now = Date.now()) {
  const { source, witmotionAvailable, n2kAvailable, witmotionHdop, n2kHdop } = selectSource(witmotion, vessel, now)
  const wm = witmotion || {}
  const ng = (vessel && vessel.gps) || {}

  // Position fields default to WitMotion values, override with N2K when
  // active. Keeps existing UI consumers working even when source === 'n2k'.
  let latitude = wm.latitude
  let longitude = wm.longitude
  let altitude = wm.altitude
  let cog = wm.cog
  let groundSpeed = wm.groundSpeed
  let satellites = wm.satellites
  let fix = wm.fix
  let pdop = wm.pdop
  let hdop = wm.hdop
  let vdop = wm.vdop

  if (source === 'n2k') {
    latitude = ng.latitude
    longitude = ng.longitude
    altitude = ng.altitude ?? wm.altitude
    satellites = ng.satellites ?? wm.satellites
    fix = ng.fix ?? false
    pdop = ng.pdop ?? wm.pdop
    hdop = ng.hdop ?? wm.hdop
    vdop = ng.vdop ?? wm.vdop
  }

  // COG / SOG: prefer N2K when fresh — Garmin's marine GPS ships PGN 129026 at
  // ~10 Hz, calibrated, faster + more reliable than WitMotion's 1 Hz position-
  // derived COG. Independent of which source owns position. Warn when both are
  // fresh and disagree by enough to indicate one is wrong.
  let cogSource = 'witmotion'
  let cogDisagreement = null
  if (witmotionAvailable && n2kAvailable
      && wm.cog != null && isFinite(wm.cog)
      && ng.cog != null && isFinite(ng.cog)) {
    let diff = Math.abs(ng.cog - wm.cog) % 360
    if (diff > 180) diff = 360 - diff
    cogDisagreement = {
      deg: diff,
      witmotionCog: wm.cog,
      n2kCog: ng.cog,
      major: diff > COG_DISAGREEMENT_WARN_DEG,
    }
    if (cogDisagreement.major && now - lastCogWarnAt > COG_WARN_THROTTLE_MS) {
      console.warn(`[gpsArbiter] COG disagreement ${diff.toFixed(1)}°: n2k=${ng.cog.toFixed(1)}° witmotion=${wm.cog.toFixed(1)}°`)
      lastCogWarnAt = now
    }
  }
  if (n2kAvailable && ng.cog != null && isFinite(ng.cog)) {
    cog = ng.cog
    cogSource = 'n2k'
  }
  if (n2kAvailable && ng.sog != null && isFinite(ng.sog)) {
    groundSpeed = ng.sog
  }

  // While underway above the slave threshold, lock displayed heading to COG —
  // the IMU magnetometer drifts and bridge-area magnetic anomalies routinely
  // skew it, but ground track from GPS is dependable when you're moving.
  let displayHeading = wm.heading
  const headingSlaved = groundSpeed != null && groundSpeed > HEADING_SLAVE_SPEED_MS && cog != null && isFinite(cog)
  if (headingSlaved) displayHeading = cog

  return {
    // Position (arbitrated)
    latitude,
    longitude,
    altitude,
    cog,
    cogSource,
    groundSpeed,
    speed: wm.speed,
    satellites,
    fix,
    pdop, hdop, vdop,
    // Source metadata — for the UI to surface which provider is active
    source,
    sourceLabel: source === 'witmotion' ? 'WitMotion (USB)'
               : source === 'n2k' ? 'NMEA 2000 (boat MFD)'
               : 'No fix',
    witmotionAvailable,
    n2kAvailable,
    witmotionHdop,
    n2kHdop,
    cogDisagreement,
    n2kSrc: ng.src ?? null,
    // WitMotion-only sensors (always pass through, regardless of source)
    heading: displayHeading,
    headingSlavedToCog: headingSlaved,
    headingRaw: wm.headingRaw,
    headingOffset: wm.headingOffset,
    roll: wm.roll,
    pitch: wm.pitch,
    pressure: wm.pressure,
    ax: wm.ax, ay: wm.ay, az: wm.az,
    wx: wm.wx, wy: wm.wy, wz: wm.wz,
    hx: wm.hx, hy: wm.hy, hz: wm.hz,
    waveHeight: wm.waveHeight,
    wavePeriod: wm.wavePeriod,
    seaState: wm.seaState,
    seaStateDesc: wm.seaStateDesc,
    // Liveness for clients
    timestamp: source === 'n2k' ? ng.timestamp : wm.timestamp,
    age: (() => {
      const ts = source === 'n2k' ? ng.timestamp : wm.timestamp
      return ts ? now - ts : null
    })(),
    device: wm.device,
    error: wm.error
  }
}

/**
 * Production entry point — pulls live state from both services and returns
 * the arbitrated snapshot.
 */
export function getActiveGps() {
  const wm = getGpsData()
  const vessel = getVesselData()
  const snapshot = buildSnapshot(wm, vessel, Date.now())
  // Side effect: while underway, nudge the persisted magnetic offset toward
  // (cog - raw heading). Kept out of buildSnapshot so that helper stays pure
  // and unit-testable.
  if (snapshot.headingSlavedToCog) {
    autoCalibrateHeadingToCourse(snapshot.cog)
  }
  return snapshot
}
