/**
 * GPS Arbiter — picks between THREE GPS sources:
 *   1. WitMotion primary  — USB-serial IMU/GPS, /dev/witmotion
 *   2. WitMotion secondary — USB-serial IMU/GPS, /dev/witmotion-b (opt-in, see HEADING_FUSION.md)
 *   3. NMEA 2000 GPS       — the boat's Garmin MFD on the N2K bus
 *
 * Policy: pick the source with the tightest horizontal fix (lowest HDOP).
 * Ties — including the "all sources missing HDOP" degenerate case — resolve
 * in preference order: primary > secondary > n2k. The preference order is
 * for IMU co-location, not for accuracy claims; in practice HDOP comparisons
 * decide it.
 *
 * The arbiter does NOT modify any source's state. It synthesizes a unified
 * snapshot from `getGpsData()` (primary), `getSecondaryGpsData()` (secondary,
 * may be null when the feature is off) and `getVesselData()` (N2K). IMU /
 * heading / wave sensors on the primary always pass through unchanged; only
 * position-class fields swap when fallback happens.
 *
 * On top of source selection, this module layers in heading fusion (see
 * HEADING_FUSION.md). The heading fuser runs after buildSnapshot in
 * getActiveGps() and replaces `snapshot.heading` with the fused value.
 *
 * Returned `source` field tells the UI which provider is currently feeding
 * the position fix:
 *   'witmotion'   — primary fresh, tightest HDOP
 *   'witmotion-b' — secondary fresh, tightest HDOP
 *   'n2k'         — N2K bus fresh, tightest HDOP
 *   'none'        — no source has a recent valid position
 */

import { getGpsData, autoCalibrateHeadingToCourse } from './gpsService.js'
import { getSecondaryGpsData } from './gpsServiceSecondary.js'
import { getVesselData } from './nmea2000Service.js'
import { createHeadingFuser } from './headingFusion.js'

// How old (ms) a snapshot can be before we treat it as stale and look elsewhere.
// 5s comfortably covers the WitMotion's 1-5 Hz cadence and N2K's 1-10 Hz
// without flapping during a normal momentary read gap.
export const STALE_MS = 5000

// Above this ground speed, slave the displayed heading to COG and auto-calibrate
// the magnetic offset. Below it the boat could be drifting/stationary and COG is
// unreliable. 1.341 m/s = 3 MPH.
export const HEADING_SLAVE_SPEED_MS = 1.341

// Disagreement threshold (degrees) between any two sources' COG that warrants
// a diagnostic warning. Above 30° one of the sources is almost certainly wrong;
// below it can be turn lag or noise.
const COG_DISAGREEMENT_WARN_DEG = 30
let lastCogWarnAt = 0
const COG_WARN_THROTTLE_MS = 10000

// Threshold for treating a WitMotion (primary or secondary) snapshot as a
// usable position source: non-null lat/lon, fresh timestamp, fix=true.
// Extracted to a helper so primary/secondary share validation.
function witmotionHasFixHelper(gps, now) {
  if (!gps) return false
  if (gps.stale) return false
  if (gps.latitude == null || gps.longitude == null) return false
  if (gps.timestamp == null) return false
  if (now - gps.timestamp > STALE_MS) return false
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

// Preference order when HDOP can't decide. See module header.
const SOURCE_PREFERENCE = ['witmotion', 'witmotion-b', 'n2k']

/**
 * Resolve the active GPS source from up to three candidates.
 *
 * Pure function over inputs — kept separate from `getActiveGps()` so unit
 * tests can drive it with synthetic snapshots without mocking the services.
 *
 * @param {object|null} witmotion    - shape from gpsService.getGpsData()
 * @param {object|null} witmotionB   - shape from gpsServiceSecondary.getSecondaryGpsData(), or null when feature flag off
 * @param {object|null} vessel       - shape from nmea2000Service.getVesselData()
 * @param {number}      now          - current epoch ms (injected for deterministic tests)
 * @returns {{source: 'witmotion'|'witmotion-b'|'n2k'|'none',
 *            witmotionAvailable: boolean, witmotionBAvailable: boolean, n2kAvailable: boolean,
 *            witmotionHdop: number|null, witmotionBHdop: number|null, n2kHdop: number|null}}
 */
export function selectSource(witmotion, witmotionB, vessel, now = Date.now()) {
  const witmotionAvailable = witmotionHasFixHelper(witmotion, now)
  const witmotionBAvailable = witmotionHasFixHelper(witmotionB, now)
  const n2kAvailable = n2kHasFix(vessel, now)

  const witmotionHdop = witmotion?.hdop ?? null
  const witmotionBHdop = witmotionB?.hdop ?? null
  const n2kHdop = vessel?.gps?.hdop ?? null

  const candidates = []
  if (witmotionAvailable)   candidates.push({ source: 'witmotion',   hdop: witmotionHdop  ?? Infinity })
  if (witmotionBAvailable)  candidates.push({ source: 'witmotion-b', hdop: witmotionBHdop ?? Infinity })
  if (n2kAvailable)         candidates.push({ source: 'n2k',         hdop: n2kHdop        ?? Infinity })

  let source = 'none'
  if (candidates.length > 0) {
    // Sort by HDOP ascending, tiebreak by SOURCE_PREFERENCE index ascending.
    candidates.sort((a, b) => {
      if (a.hdop !== b.hdop) return a.hdop - b.hdop
      return SOURCE_PREFERENCE.indexOf(a.source) - SOURCE_PREFERENCE.indexOf(b.source)
    })
    source = candidates[0].source
  }

  return {
    source,
    witmotionAvailable, witmotionBAvailable, n2kAvailable,
    witmotionHdop, witmotionBHdop, n2kHdop,
  }
}

/**
 * Build the unified GPS snapshot.
 *
 * Pure over inputs — same testability story as selectSource.
 *
 * Position fields (latitude/longitude/altitude/cog/groundSpeed/satellites/fix/
 * hdop/pdop/vdop) come from the active source. WitMotion-only sensor fields
 * (IMU, mag heading, wave estimation, headingOffset) always pass through from
 * the PRIMARY unit regardless, because those calibrated stacks only exist on
 * the primary side.
 *
 * COG/SOG: prefer N2K when fresh (PGN 129026 is fast and calibrated). When
 * N2K is stale, use whichever WitMotion is active.
 */
export function buildSnapshot(witmotion, witmotionB, vessel, now = Date.now()) {
  const sel = selectSource(witmotion, witmotionB, vessel, now)
  const { source, witmotionAvailable, witmotionBAvailable, n2kAvailable,
          witmotionHdop, witmotionBHdop, n2kHdop } = sel

  const wm = witmotion || {}
  const wmB = witmotionB || {}
  const ng = (vessel && vessel.gps) || {}

  // Position fields default to primary WitMotion values, override based on
  // active source. Keeps existing UI consumers working when source flips.
  let latitude    = wm.latitude
  let longitude   = wm.longitude
  let altitude    = wm.altitude
  let cog         = wm.cog
  let groundSpeed = wm.groundSpeed
  let satellites  = wm.satellites
  let fix         = wm.fix
  let pdop        = wm.pdop
  let hdop        = wm.hdop
  let vdop        = wm.vdop

  if (source === 'witmotion-b') {
    latitude    = wmB.latitude
    longitude   = wmB.longitude
    altitude    = wmB.altitude ?? wm.altitude
    cog         = wmB.cog ?? wm.cog                  // overridden below by N2K when fresh
    groundSpeed = wmB.groundSpeed ?? wm.groundSpeed
    satellites  = wmB.satellites ?? wm.satellites
    fix         = wmB.fix ?? false
    pdop        = wmB.pdop ?? wm.pdop
    hdop        = wmB.hdop ?? wm.hdop
    vdop        = wmB.vdop ?? wm.vdop
  } else if (source === 'n2k') {
    latitude    = ng.latitude
    longitude   = ng.longitude
    altitude    = ng.altitude ?? wm.altitude
    satellites  = ng.satellites ?? wm.satellites
    fix         = ng.fix ?? false
    pdop        = ng.pdop ?? wm.pdop
    hdop        = ng.hdop ?? wm.hdop
    vdop        = ng.vdop ?? wm.vdop
  }

  // COG / SOG: N2K wins whenever fresh, regardless of who owns position.
  // Diagnostic: if more than one source has a fresh COG and they disagree
  // significantly, log a throttled warning. Compare primary↔N2K for the
  // legacy diagnostic; the panel UI can render the three-way picture itself.
  let cogSource = source === 'witmotion-b' ? 'witmotion-b' : 'witmotion'
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

  const sourceLabel =
      source === 'witmotion'   ? 'WitMotion (USB)'
    : source === 'witmotion-b' ? 'WitMotion B (USB)'
    : source === 'n2k'         ? 'NMEA 2000 (boat MFD)'
                               : 'No fix'

  // Per-source liveness metadata for the GPS page's sources panel.
  const sources = {
    witmotion: {
      available: witmotionAvailable,
      hdop: witmotionHdop,
      satellites: wm.satellites ?? null,
      timestamp: wm.timestamp ?? null,
      cog: isFiniteOrNull(wm.cog),
      device: wm.device ?? null,
    },
    'witmotion-b': {
      available: witmotionBAvailable,
      hdop: witmotionBHdop,
      satellites: wmB.satellites ?? null,
      timestamp: wmB.timestamp ?? null,
      cog: isFiniteOrNull(wmB.cog),
      device: wmB.device ?? null,
      enabled: witmotionB != null,
    },
    n2k: {
      available: n2kAvailable,
      hdop: n2kHdop,
      satellites: ng.satellites ?? null,
      timestamp: ng.timestamp ?? null,
      cog: isFiniteOrNull(ng.cog),
      src: ng.src ?? null,
    },
  }

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
    sourceLabel,
    witmotionAvailable,
    witmotionBAvailable,
    n2kAvailable,
    witmotionHdop,
    witmotionBHdop,
    n2kHdop,
    cogDisagreement,
    n2kSrc: ng.src ?? null,
    sources,
    // WitMotion-only sensors (always pass through from primary, regardless of source)
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
    timestamp: _activeTimestamp(source, wm, wmB, ng),
    age: (() => {
      const ts = _activeTimestamp(source, wm, wmB, ng)
      return ts ? now - ts : null
    })(),
    device: source === 'witmotion-b' ? wmB.device : wm.device,
    error: wm.error,
  }
}

function _activeTimestamp(source, wm, wmB, ng) {
  if (source === 'witmotion-b') return wmB.timestamp ?? null
  if (source === 'n2k') return ng.timestamp ?? null
  return wm.timestamp ?? null
}

function isFiniteOrNull(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null
}

// Module-scoped fuser — owns filter state across calls. Lives here so every
// caller of getActiveGps() shares a single integrator; buildSnapshot stays
// pure and tests of it don't accidentally accumulate fusion state.
const _fuser = createHeadingFuser()

/**
 * Production entry point — pulls live state from all three services and
 * returns the arbitrated + fused snapshot.
 */
export function getActiveGps() {
  const wm = getGpsData()
  const wmB = getSecondaryGpsData()  // null when feature flag unset
  const vessel = getVesselData()
  const now = Date.now()
  const snapshot = buildSnapshot(wm, wmB, vessel, now)

  const fusion = _fuser.update({
    now,
    primary: wm,
    // Treat stale secondary the same as absent — fuser falls back to
    // pass-through rather than coasting on a frozen frame.
    secondary: wmB && !wmB.stale ? wmB : null,
    vessel,
    fallbackHeading: snapshot.heading,
    fallbackCog: snapshot.cog,
    fallbackGroundSpeed: snapshot.groundSpeed,
  })

  if (fusion.heading != null && isFinite(fusion.heading)) {
    snapshot.heading = fusion.heading
  }
  snapshot.headingFusion = {
    source: fusion.source,
    confidence: fusion.confidence,
    primaryHealth: fusion.primaryHealth,
    secondaryHealth: fusion.secondaryHealth,
    magInterferenceDetected: fusion.magInterferenceDetected,
    magGradient: fusion.magGradient,
    gyroAgreement: fusion.gyroAgreement,
    biasA: fusion.biasA,
    biasB: fusion.biasB,
  }

  if (snapshot.headingSlavedToCog) {
    autoCalibrateHeadingToCourse(snapshot.cog)
  }
  return snapshot
}

/**
 * Diagnostic accessor for the debug endpoint. Returns the live fuser state
 * (defensive copy) plus the most recent fusion output.
 */
export function getHeadingFusionState() {
  return {
    state: _fuser.getState(),
    secondaryEnabled: getSecondaryGpsData() != null,
  }
}
