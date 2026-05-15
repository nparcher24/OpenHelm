/**
 * Tracks API routes — read/manage recorded vessel trips.
 *
 * The recorder runs unconditionally elsewhere; these routes only read and
 * (rarely) terminate trips. Points are returned as GeoJSON for direct
 * consumption by MapLibre.
 */

import { Router } from 'express'
import db from '../services/trackDatabaseService.js'
import {
  endCurrentTrip,
  getCurrentTripId,
  isRecording,
} from '../services/trackRecorderService.js'

const router = Router()

/**
 * Douglas–Peucker line simplification with metric tolerance.
 *
 * Approximates planar distance via equirectangular projection scaled by
 * latitude. Plenty accurate for chart-display decimation at the spans we deal
 * with (a few hundred miles); not for geodesy.
 */
function simplifyLineString(points, toleranceM) {
  if (!toleranceM || points.length < 3) return points
  const tol = toleranceM
  const cosLat = Math.cos((points[0].lat * Math.PI) / 180)
  const M_PER_DEG = 111320

  function project(p) {
    return [p.lon * cosLat * M_PER_DEG, p.lat * M_PER_DEG]
  }

  function perpDist(p, a, b) {
    const [px, py] = project(p)
    const [ax, ay] = project(a)
    const [bx, by] = project(b)
    const dx = bx - ax
    const dy = by - ay
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    const tt = Math.max(0, Math.min(1, t))
    const cx = ax + tt * dx
    const cy = ay + tt * dy
    return Math.hypot(px - cx, py - cy)
  }

  // Iterative Douglas-Peucker to avoid stack blow-ups on long traces.
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let maxD = -1
    let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > tol && idx !== -1) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  const out = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}

function pointsToGeoJSON(trip, pts, opts = {}) {
  const { color = 'solid' } = opts
  if (color === 'speed') {
    // One Feature per segment so MapLibre can paint by data-driven `sog`.
    const features = []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      features.push({
        type: 'Feature',
        properties: {
          tripId: trip?.id ?? null,
          sog: b.sog ?? a.sog ?? 0,
        },
        geometry: {
          type: 'LineString',
          coordinates: [[a.lon, a.lat], [b.lon, b.lat]],
        },
      })
    }
    return {
      type: 'FeatureCollection',
      properties: tripProps(trip, pts.length),
      features,
    }
  }
  return {
    type: 'Feature',
    properties: tripProps(trip, pts.length),
    geometry: {
      type: 'LineString',
      coordinates: pts.map((p) => [p.lon, p.lat]),
    },
  }
}

function tripProps(trip, returnedPointCount) {
  if (!trip) return { pointCount: returnedPointCount }
  return {
    tripId: trip.id,
    startedAt: trip.started_at,
    endedAt: trip.ended_at,
    distanceM: trip.distance_m,
    pointCount: trip.point_count,
    returnedPointCount,
    source: trip.source,
    label: trip.label,
  }
}

function parseIntParam(v) {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function parseFloatParam(v) {
  if (v == null) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

// ─── Routes ─────────────────────────────────────────────────────────────

router.get('/trips', async (req, res) => {
  try {
    const from = parseIntParam(req.query.from)
    const to = parseIntParam(req.query.to)
    const limit = parseIntParam(req.query.limit) ?? 100
    const trips = await db.listTrips({ from, to, limit })
    res.json({ success: true, count: trips.length, trips })
  } catch (err) {
    console.error('[Tracks API] listTrips failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/current', async (req, res) => {
  try {
    const tripId = getCurrentTripId()
    if (tripId == null) {
      return res.json({ success: true, recording: isRecording(), trip: null, lastPointId: null })
    }
    const trip = await db.getTrip(tripId)
    const last = await db.getLastPoint(tripId)
    res.json({
      success: true,
      recording: isRecording(),
      trip,
      lastPointId: last?.id ?? null,
    })
  } catch (err) {
    console.error('[Tracks API] getCurrent failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/current/points', async (req, res) => {
  try {
    const tripId = getCurrentTripId()
    if (tripId == null) {
      return res.json({
        type: 'Feature',
        properties: { pointCount: 0 },
        geometry: { type: 'LineString', coordinates: [] },
      })
    }
    const trip = await db.getTrip(tripId)
    const sinceId = parseIntParam(req.query.since)
    const pts = await db.getPoints(tripId, { sinceId })
    res.json(pointsToGeoJSON(trip, pts, { color: 'solid' }))
  } catch (err) {
    console.error('[Tracks API] currentPoints failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/trips/end', async (req, res) => {
  try {
    const id = await endCurrentTrip()
    res.json({ success: true, endedTripId: id })
  } catch (err) {
    console.error('[Tracks API] endCurrent failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/trips/:id', async (req, res) => {
  try {
    const id = parseIntParam(req.params.id)
    if (id == null) return res.status(400).json({ success: false, error: 'invalid id' })
    const trip = await db.getTrip(id)
    if (!trip) return res.status(404).json({ success: false, error: 'not found' })
    res.json({ success: true, trip })
  } catch (err) {
    console.error('[Tracks API] getTrip failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/trips/:id/points', async (req, res) => {
  try {
    const id = parseIntParam(req.params.id)
    if (id == null) return res.status(400).json({ success: false, error: 'invalid id' })
    const trip = await db.getTrip(id)
    if (!trip) return res.status(404).json({ success: false, error: 'not found' })

    const tolerance = parseFloatParam(req.query.simplify) ?? 0
    const color = req.query.color === 'speed' ? 'speed' : 'solid'

    const raw = await db.getPoints(id)
    const pts = tolerance > 0 ? simplifyLineString(raw, tolerance) : raw
    res.json(pointsToGeoJSON(trip, pts, { color }))
  } catch (err) {
    console.error('[Tracks API] getTripPoints failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/trips/:id', async (req, res) => {
  try {
    const id = parseIntParam(req.params.id)
    if (id == null) return res.status(400).json({ success: false, error: 'invalid id' })
    const ok = await db.deleteTrip(id)
    if (!ok) return res.status(404).json({ success: false, error: 'not found' })
    res.json({ success: true, deleted: id })
  } catch (err) {
    console.error('[Tracks API] deleteTrip failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
