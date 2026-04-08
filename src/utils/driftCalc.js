/**
 * Drift calculation utilities
 *
 * Pure math helpers for:
 *   - Fitting a least-squares linear drift from a 20-second GPS sample window
 *   - Computing a "drift-corrected" hold position for a fishing waypoint, so
 *     that a line dropped from the hold position drifts onto the target as it
 *     sinks.
 *
 * All functions are synchronous and side-effect free so they can be called
 * from components and from tests without any I/O.
 */

/**
 * Assumed terminal sink rate of a mid-weight lure/sinker, m/s.
 * 0.5 m/s ≈ 1.6 ft/s — a middle-ground value between light jigs (~0.3 m/s)
 * and heavy ones (~1.0 m/s). Exposed as a constant so it can become a user
 * setting later without digging through the math.
 */
export const LURE_SINK_RATE_MPS = 0.5

/**
 * Fallback depth used when BlueTopo bathymetry is not available at the target
 * location. Results computed with this fallback are flagged as `approximate`.
 */
export const DEFAULT_DEPTH_M = 10

/**
 * Distance from the trolling motor (bow) to the fishing position (stern),
 * in meters. 20 ft = 6.096 m.
 *
 * When the trolling motor holds a GPS point, the boat weather-vanes bow-first
 * into the current, so the stern — where the line is dropped — sits this far
 * downstream of the hold point. The drift-compensated hold position must push
 * an additional BOAT_LENGTH_M upstream so the stern lands where the old hold
 * point used to be.
 */
export const BOAT_LENGTH_M = 6.096

/** Earth radius in meters, mean spherical. */
const EARTH_RADIUS_M = 6371000

/** Approximate meters per degree of latitude. */
const METERS_PER_DEG_LAT = 111320

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/**
 * Fit a constant-velocity drift from a set of timestamped GPS samples using
 * ordinary least squares. Converts lat/lng into local equirectangular meters
 * around the sample centroid, fits x(t) and y(t) independently, then combines
 * the resulting velocity components into a speed and true-north bearing.
 *
 * @param {Array<{t: number, lat: number, lng: number}>} samples
 *   Sample array. `t` is milliseconds since epoch (Date.now()). Order doesn't
 *   matter. Duplicate timestamps are tolerated but add no information.
 * @returns {{
 *   latitude: number,
 *   longitude: number,
 *   driftSpeedMps: number,
 *   driftBearingDeg: number,
 *   durationS: number,
 *   sampleCount: number
 * } | null}
 *   Returns `null` if fewer than 3 distinct samples, or if the time span is
 *   zero (would produce a divide-by-zero), or if any sample has an invalid
 *   coordinate.
 */
export function fitDriftLinearRegression(samples) {
  if (!Array.isArray(samples) || samples.length < 3) return null

  // Defensive copy + validate
  const valid = samples.filter(
    s =>
      s != null &&
      typeof s.t === 'number' &&
      typeof s.lat === 'number' &&
      typeof s.lng === 'number' &&
      s.lat >= -90 && s.lat <= 90 &&
      s.lng >= -180 && s.lng <= 180
  )
  if (valid.length < 3) return null

  const n = valid.length

  // Centroid — also used as the "location" of the calibration reading.
  let sumLat = 0
  let sumLng = 0
  for (const s of valid) {
    sumLat += s.lat
    sumLng += s.lng
  }
  const centroidLat = sumLat / n
  const centroidLng = sumLng / n
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(centroidLat * DEG_TO_RAD)

  // Shift time origin to the earliest sample and convert to seconds.
  let minT = Infinity
  for (const s of valid) {
    if (s.t < minT) minT = s.t
  }

  // Accumulators for least-squares fits of x(t) and y(t)
  let sumT = 0
  let sumT2 = 0
  let sumX = 0
  let sumY = 0
  let sumXT = 0
  let sumYT = 0
  let maxT = 0

  for (const s of valid) {
    const t = (s.t - minT) / 1000 // seconds since first sample
    const x = (s.lng - centroidLng) * metersPerDegLng
    const y = (s.lat - centroidLat) * METERS_PER_DEG_LAT
    sumT += t
    sumT2 += t * t
    sumX += x
    sumY += y
    sumXT += x * t
    sumYT += y * t
    if (t > maxT) maxT = t
  }

  const denom = n * sumT2 - sumT * sumT
  if (denom === 0) return null // all samples at the same time

  // Require at least a 5-second span between the first and last sample.
  // Shorter windows produce numerically unstable fits: GPS jitter dominates
  // and the inferred velocity can blow up into unphysical values.
  if (maxT < 5) return null

  const vx = (n * sumXT - sumT * sumX) / denom // east m/s
  const vy = (n * sumYT - sumT * sumY) / denom // north m/s

  const driftSpeedMps = Math.sqrt(vx * vx + vy * vy)

  // Bearing from true north, rotating clockwise (standard compass convention).
  // atan2(east, north) gives the angle from north toward east.
  let driftBearingDeg = Math.atan2(vx, vy) * RAD_TO_DEG
  if (driftBearingDeg < 0) driftBearingDeg += 360

  return {
    latitude: centroidLat,
    longitude: centroidLng,
    driftSpeedMps,
    driftBearingDeg,
    durationS: maxT,
    sampleCount: n
  }
}

/**
 * Compute the destination point reached by travelling `distanceM` meters on
 * a great-circle from `(lat, lng)` in the given compass `bearingDeg`.
 *
 * Standard Haversine "destination point" formula.
 *
 * @param {number} lat - Starting latitude in degrees.
 * @param {number} lng - Starting longitude in degrees.
 * @param {number} bearingDeg - Compass bearing from true north, degrees.
 * @param {number} distanceM - Distance in meters.
 * @returns {{ lat: number, lng: number }}
 */
export function destinationPoint(lat, lng, bearingDeg, distanceM) {
  const angular = distanceM / EARTH_RADIUS_M
  const bearingRad = bearingDeg * DEG_TO_RAD
  const lat1 = lat * DEG_TO_RAD
  const lng1 = lng * DEG_TO_RAD

  const sinLat1 = Math.sin(lat1)
  const cosLat1 = Math.cos(lat1)
  const sinAng = Math.sin(angular)
  const cosAng = Math.cos(angular)

  const sinLat2 = sinLat1 * cosAng + cosLat1 * sinAng * Math.cos(bearingRad)
  const lat2 = Math.asin(sinLat2)
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * sinAng * cosLat1,
      cosAng - sinLat1 * sinLat2
    )

  return {
    lat: lat2 * RAD_TO_DEG,
    // Normalize longitude to [-180, 180]
    lng: ((lng2 * RAD_TO_DEG + 540) % 360) - 180
  }
}

/**
 * Minimum drift speed, in m/s, below which we consider the boat stationary
 * and skip the correction entirely (GPS jitter dominates at lower speeds).
 */
const MIN_DRIFT_SPEED_MPS = 0.05

/**
 * Compute a drift-corrected "hold position" for a target fishing waypoint.
 *
 * Physical model:
 *   1. The trolling motor is on the bow and holds a fixed GPS point, so the
 *      boat weather-vanes bow-first into the current. The stern — where the
 *      line is actually fished — sits `BOAT_LENGTH_M` downstream of the bow
 *      (in the drift direction).
 *   2. The line drops straight down from the stern and sinks at a constant
 *      vertical rate `LURE_SINK_RATE_MPS`. During the `depth / sink_rate`
 *      seconds it takes to reach the bottom, the line drifts horizontally
 *      at `drift.driftSpeedMps` in `drift.driftBearingDeg`.
 *
 * For the line to land on the target, the stern must start at
 *   target − (drift_speed × sink_time) in the drift direction
 * and therefore the bow (the GPS-hold point) must start another boat-length
 * further upstream:
 *   hold = target − (drift_speed × sink_time + BOAT_LENGTH_M) in drift dir
 *        = target + (drift_speed × sink_time + BOAT_LENGTH_M) upstream
 *
 * @param {number} targetLat
 * @param {number} targetLng
 * @param {number | null | undefined} depthM
 *   Water depth at the target in meters. If nullish or non-positive, falls
 *   back to `DEFAULT_DEPTH_M` and the result is flagged `approximate: true`.
 * @param {{ driftSpeedMps: number, driftBearingDeg: number } | null | undefined} drift
 *   The latest drift calibration. If absent or below `MIN_DRIFT_SPEED_MPS`,
 *   returns `null` (no correction meaningful).
 * @returns {{
 *   lat: number,
 *   lng: number,
 *   offsetM: number,
 *   driftOffsetM: number,
 *   boatLengthM: number,
 *   sinkTimeS: number,
 *   upstreamBearingDeg: number,
 *   approximate: boolean
 * } | null}
 */
export function computeDriftCorrected(targetLat, targetLng, depthM, drift) {
  if (
    !drift ||
    typeof drift.driftSpeedMps !== 'number' ||
    typeof drift.driftBearingDeg !== 'number' ||
    drift.driftSpeedMps < MIN_DRIFT_SPEED_MPS
  ) {
    return null
  }

  let effectiveDepth = depthM
  let approximate = false
  if (
    effectiveDepth == null ||
    typeof effectiveDepth !== 'number' ||
    !isFinite(effectiveDepth) ||
    effectiveDepth <= 0
  ) {
    effectiveDepth = DEFAULT_DEPTH_M
    approximate = true
  }

  const sinkTimeS = effectiveDepth / LURE_SINK_RATE_MPS
  const driftOffsetM = drift.driftSpeedMps * sinkTimeS
  const offsetM = driftOffsetM + BOAT_LENGTH_M
  const upstreamBearingDeg = (drift.driftBearingDeg + 180) % 360

  const { lat, lng } = destinationPoint(
    targetLat,
    targetLng,
    upstreamBearingDeg,
    offsetM
  )

  return {
    lat,
    lng,
    offsetM,
    driftOffsetM,
    boatLengthM: BOAT_LENGTH_M,
    sinkTimeS,
    upstreamBearingDeg,
    approximate
  }
}
