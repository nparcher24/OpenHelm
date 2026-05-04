/**
 * Track Recorder — always-on background service that polls the GPS arbiter
 * at 1 Hz and persists vessel positions into `data/tracks.db`.
 *
 * Recording is decoupled from any UI state. The frontend visibility toggle
 * controls only display; this service runs whenever the API server is up.
 *
 * Sample-acceptance gate (per tick):
 *   - Validity: lat/lon non-null, |lat|≤90, |lon|≤180, drop (0,0).
 *   - Time-travel guard: skip samples whose ts is older than the last accepted.
 *   - Distance gate: insert when ≥ MIN_DISTANCE_M from prev OR ≥ MAX_TIME_M
 *     since prev. Dual gate keeps both motion and stationary anchor sit-ins.
 *   - Speed sanity: drop > 60 kn jumps as GPS glitches.
 *
 * Trip lifecycle: open on first valid sample; close after TRIP_END_GAP_MS of
 * no fix or no movement, or when API server is shut down. Crashed-open trips
 * are closed on boot by `trackDatabaseService.closeOrphanTrips()`.
 */

import db from './trackDatabaseService.js'
import { getActiveGps } from './gpsArbiter.js'

// Sample cadence — once per second. WitMotion's 5 Hz native cadence plus the
// distance gate means we still get a smooth trace at speed.
const SAMPLE_INTERVAL_MS = 1000

// Distance/time gate.
const MIN_DISTANCE_M = 5      // Don't insert closer than 5 m apart…
const MAX_TIME_M     = 30000  // …unless 30 s have passed (anchor sit-in / slow drift).

// End an active trip after this much time with no accepted points.
const TRIP_END_GAP_MS = 60000 // 60 s

// Speed sanity — anything implying > 60 kn is almost certainly a GPS jump.
const MAX_SANE_SPEED_MS = 60 * 0.514444 // ~30.87 m/s

let timer = null
let started = false
let pointListeners = new Set()

const state = {
  currentTripId: null,
  lastPoint: null,        // { id, ts, lat, lon }
  lastAcceptedTs: 0,      // for time-travel guard
}

/**
 * Haversine distance in meters. Source-agnostic, deliberately not factored
 * out — there's no other consumer in this service and inlining keeps the
 * module standalone.
 */
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  const dφ = toRad(lat2 - lat1)
  const dλ = toRad(lon2 - lon1)
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function isValidFix(snap) {
  if (!snap || snap.source === 'none') return false
  const { latitude, longitude } = snap
  if (latitude == null || longitude == null) return false
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false
  if (latitude === 0 && longitude === 0) return false
  return true
}

async function endActiveTrip(reason = 'gap') {
  if (state.currentTripId == null) return
  const id = state.currentTripId
  const endedAt = state.lastPoint?.ts ?? Date.now()
  try {
    const dominant = await db.computeDominantSource(id)
    if (dominant) await db.setTripSource(id, dominant)
    await db.closeTrip(id, endedAt)
    console.log(`[TrackRecorder] Closed trip #${id} (${reason}); ended_at=${endedAt}`)
  } catch (err) {
    console.error('[TrackRecorder] Failed to close trip:', err.message)
  }
  state.currentTripId = null
  state.lastPoint = null
}

async function tick() {
  let snap
  try {
    snap = getActiveGps()
  } catch (err) {
    console.warn('[TrackRecorder] getActiveGps threw:', err.message)
    return
  }

  const now = Date.now()

  if (!isValidFix(snap)) {
    // No fix — close the trip after the gap window.
    if (state.currentTripId != null && state.lastPoint &&
        now - state.lastPoint.ts > TRIP_END_GAP_MS) {
      await endActiveTrip('no-fix-gap')
    }
    return
  }

  // Use the snapshot's own timestamp when present so time-travel guards work
  // off the GPS clock, not the wall clock.
  const ts = snap.timestamp ?? now
  if (ts < state.lastAcceptedTs) {
    // RTC drift / NTP correction — skip rather than fail.
    return
  }

  // Open a new trip if needed.
  if (state.currentTripId == null) {
    try {
      state.currentTripId = await db.createTrip({
        startedAt: ts,
        lat: snap.latitude,
        lon: snap.longitude,
        source: snap.source,
      })
      console.log(`[TrackRecorder] Opened trip #${state.currentTripId}`)
    } catch (err) {
      console.error('[TrackRecorder] Failed to open trip:', err.message)
      return
    }
  }

  // Distance + time gate.
  let distance = 0
  if (state.lastPoint) {
    distance = haversineM(
      state.lastPoint.lat, state.lastPoint.lon,
      snap.latitude,        snap.longitude,
    )
    const dt = ts - state.lastPoint.ts

    // Speed sanity — a > 60 kn implied speed is almost always a glitch.
    if (dt > 0 && (distance / (dt / 1000)) > MAX_SANE_SPEED_MS) {
      console.warn(`[TrackRecorder] Dropping sample: implied speed ${(distance / (dt / 1000)).toFixed(1)} m/s`)
      return
    }

    // Close the trip if we've been silent long enough.
    if (dt > TRIP_END_GAP_MS) {
      await endActiveTrip('movement-gap')
      // Re-open immediately with this sample as the start.
      try {
        state.currentTripId = await db.createTrip({
          startedAt: ts,
          lat: snap.latitude,
          lon: snap.longitude,
          source: snap.source,
        })
        console.log(`[TrackRecorder] Opened trip #${state.currentTripId} after gap`)
      } catch (err) {
        console.error('[TrackRecorder] Failed to open trip post-gap:', err.message)
        return
      }
    } else if (distance < MIN_DISTANCE_M && dt < MAX_TIME_M) {
      // Below both thresholds — not worth recording.
      return
    }
  }

  // Persist and update trip stats.
  try {
    const pointId = await db.insertPoint(state.currentTripId, {
      ts,
      lat: snap.latitude,
      lon: snap.longitude,
      cog: snap.cog,
      sog: snap.groundSpeed,
      heading: snap.heading,
      source: snap.source,
    })
    await db.updateTripStats(state.currentTripId, {
      addedDistance: distance,
      lat: snap.latitude,
      lon: snap.longitude,
      source: snap.source,
    })
    state.lastPoint = { id: pointId, ts, lat: snap.latitude, lon: snap.longitude }
    state.lastAcceptedTs = ts

    // Notify listeners (WebSocket broadcaster) outside the DB critical path.
    const event = {
      tripId: state.currentTripId,
      pointId,
      ts,
      lat: snap.latitude,
      lon: snap.longitude,
      cog: snap.cog,
      sog: snap.groundSpeed,
      heading: snap.heading,
      source: snap.source,
    }
    for (const fn of pointListeners) {
      try { fn(event) } catch (err) { console.warn('[TrackRecorder] listener threw:', err.message) }
    }
  } catch (err) {
    console.error('[TrackRecorder] Insert failed:', err.message)
  }
}

export async function start() {
  if (started) return
  started = true
  await db.initialize()
  // Don't resume a previously open trip — closeOrphanTrips already finalized it.
  state.currentTripId = null
  state.lastPoint = null
  state.lastAcceptedTs = 0
  // Run one tick immediately so the very first fix is captured promptly.
  tick().catch((err) => console.error('[TrackRecorder] initial tick failed:', err.message))
  timer = setInterval(() => {
    tick().catch((err) => console.error('[TrackRecorder] tick failed:', err.message))
  }, SAMPLE_INTERVAL_MS)
  timer.unref?.()
  console.log(`[TrackRecorder] Started (sample=${SAMPLE_INTERVAL_MS}ms, gate=${MIN_DISTANCE_M}m/${MAX_TIME_M}ms, gap=${TRIP_END_GAP_MS}ms)`)
}

export async function stop() {
  if (!started) return
  started = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  await endActiveTrip('shutdown')
}

export function onPoint(listener) {
  pointListeners.add(listener)
  return () => pointListeners.delete(listener)
}

export function getCurrentTripId() {
  return state.currentTripId
}

export function isRecording() {
  return started
}

/**
 * Force-close the current trip (called by POST /api/tracks/trips/end).
 */
export async function endCurrentTrip() {
  if (state.currentTripId == null) return null
  const id = state.currentTripId
  await endActiveTrip('manual')
  return id
}
