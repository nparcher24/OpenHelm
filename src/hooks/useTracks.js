/**
 * useTracks — central hook for the breadcrumb display layer.
 *
 * Responsibilities:
 *   - Fetch trips list (with date filter), keep it fresh.
 *   - Fetch points for the visible set as GeoJSON ready for MapLibre.
 *   - Manage the current-trip WebSocket tail when mode === 'current'.
 *   - Be a no-op when `visible === false` so an off layer doesn't hammer
 *     the API or the WS.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { API_BASE, WS_BASE } from '../utils/apiConfig.js'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }
const EMPTY_FEATURE = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [] },
}

// Fetch concurrency cap when downloading multiple trips' points.
const MAX_PARALLEL = 4

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function mapWithConcurrency(items, fn, limit) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try { results[i] = await fn(items[i], i) }
      catch (err) { results[i] = { error: err } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export default function useTracks({
  visible,
  mode,            // 'current' | 'date' | 'trip'
  dateFrom,        // epoch ms, day boundary
  dateTo,          // epoch ms, day boundary
  selectedTripIds, // array<int>
} = {}) {
  const [trips, setTrips] = useState([])
  const [historyGeoJSON, setHistoryGeoJSON] = useState(EMPTY_FC)
  const [currentGeoJSON, setCurrentGeoJSON] = useState(EMPTY_FEATURE)
  const [currentTrip, setCurrentTrip] = useState(null)
  const [recording, setRecording] = useState(false)

  // Track the live coords of the current trip so WS frames can append cheaply.
  const currentCoordsRef = useRef([])
  const currentTripIdRef = useRef(null)
  const wsRef = useRef(null)

  // ─── Trips list ─────────────────────────────────────────────────────
  const refreshTrips = useCallback(async () => {
    if (!visible) return
    const params = new URLSearchParams()
    // Generous window for the panel's selector even in date mode — the
    // selector itself does its own filtering.
    if (dateFrom != null && mode === 'date') params.set('from', String(dateFrom))
    if (dateTo   != null && mode === 'date') params.set('to',   String(dateTo))
    params.set('limit', '500')
    try {
      const json = await fetchJSON(`${API_BASE}/api/tracks/trips?${params}`)
      setTrips(json.trips || [])
    } catch (err) {
      console.warn('[useTracks] refreshTrips failed:', err.message)
    }
  }, [visible, mode, dateFrom, dateTo])

  useEffect(() => { refreshTrips() }, [refreshTrips])

  // Periodic refresh so a freshly-closed trip shows up in the panel without
  // the user having to toggle anything.
  useEffect(() => {
    if (!visible) return
    const id = setInterval(refreshTrips, 30000)
    return () => clearInterval(id)
  }, [visible, refreshTrips])

  // ─── History (date | trip mode) ─────────────────────────────────────
  useEffect(() => {
    if (!visible || mode === 'current') {
      setHistoryGeoJSON(EMPTY_FC)
      return
    }
    let cancelled = false

    async function load() {
      // Pick which trip IDs to fetch based on mode.
      let ids = []
      if (mode === 'date') {
        // The trip list was already fetched with the date window applied.
        // Filter again here to be defensive against stale state.
        ids = trips
          .filter((t) => {
            if (dateTo != null && t.started_at > dateTo) return false
            if (dateFrom != null && (t.ended_at ?? Date.now()) < dateFrom) return false
            return true
          })
          .map((t) => t.id)
      } else if (mode === 'trip') {
        ids = selectedTripIds || []
      }
      if (ids.length === 0) {
        if (!cancelled) setHistoryGeoJSON(EMPTY_FC)
        return
      }

      const features = []
      const results = await mapWithConcurrency(
        ids,
        (id) => fetchJSON(`${API_BASE}/api/tracks/trips/${id}/points`),
        MAX_PARALLEL,
      )
      for (const r of results) {
        if (!r || r.error) continue
        if (r.type === 'Feature' && r.geometry?.coordinates?.length) {
          features.push(r)
        } else if (r.type === 'FeatureCollection' && r.features?.length) {
          features.push(...r.features)
        }
      }
      if (!cancelled) {
        setHistoryGeoJSON({ type: 'FeatureCollection', features })
      }
    }

    load()
    return () => { cancelled = true }
  }, [visible, mode, dateFrom, dateTo, selectedTripIds, trips])

  // ─── Current trip + WebSocket tail ──────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setCurrentGeoJSON(EMPTY_FEATURE)
      setCurrentTrip(null)
      currentCoordsRef.current = []
      currentTripIdRef.current = null
      return
    }

    let mounted = true
    let reconnectTimeout = null

    async function loadCurrent() {
      try {
        const meta = await fetchJSON(`${API_BASE}/api/tracks/current`)
        if (!mounted) return
        setRecording(!!meta.recording)
        setCurrentTrip(meta.trip || null)
        if (meta.trip?.id) {
          const fc = await fetchJSON(`${API_BASE}/api/tracks/current/points`)
          if (!mounted) return
          const coords = fc?.geometry?.coordinates || []
          currentCoordsRef.current = coords.slice()
          currentTripIdRef.current = meta.trip.id
          setCurrentGeoJSON({
            type: 'Feature',
            properties: { tripId: meta.trip.id, distanceM: meta.trip.distance_m },
            geometry: { type: 'LineString', coordinates: currentCoordsRef.current },
          })
        } else {
          currentCoordsRef.current = []
          currentTripIdRef.current = null
          setCurrentGeoJSON(EMPTY_FEATURE)
        }
      } catch (err) {
        if (mounted) console.warn('[useTracks] loadCurrent failed:', err.message)
      }
    }

    function connect() {
      if (!mounted) return
      try {
        const ws = new WebSocket(WS_BASE)
        wsRef.current = ws
        ws.onopen = () => {
          if (!mounted) return
          ws.send(JSON.stringify({ type: 'subscribe-track' }))
        }
        ws.onmessage = (event) => {
          if (!mounted) return
          try {
            const msg = JSON.parse(event.data)
            if (msg.type !== 'track-point' || !msg.data) return
            const p = msg.data
            // If a new trip started while we were subscribed, reload the
            // baseline once so the displayed line resets.
            if (currentTripIdRef.current !== p.tripId) {
              loadCurrent()
              return
            }
            currentCoordsRef.current.push([p.lon, p.lat])
            // Allocate a fresh array so React/MapLibre detect the change.
            setCurrentGeoJSON({
              type: 'Feature',
              properties: { tripId: p.tripId },
              geometry: { type: 'LineString', coordinates: currentCoordsRef.current.slice() },
            })
          } catch { /* ignore */ }
        }
        ws.onclose = () => {
          if (!mounted) return
          // Reconnect + re-baseline (we likely missed points while disconnected).
          reconnectTimeout = setTimeout(() => {
            loadCurrent().then(connect)
          }, 1500)
        }
        ws.onerror = () => { /* close handler will reconnect */ }
      } catch (err) {
        console.warn('[useTracks] WS connect failed:', err.message)
      }
    }

    loadCurrent().then(connect)

    // Refresh "recording" / current-trip metadata periodically so the panel
    // stats stay live even when no new points arrive.
    const metaPoll = setInterval(loadCurrent, 5000)

    return () => {
      mounted = false
      clearInterval(metaPoll)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) {
        try { wsRef.current.close() } catch { /* ignore */ }
        wsRef.current = null
      }
    }
  }, [visible])

  // ─── Composite GeoJSON for MapLibre ─────────────────────────────────
  const visibleHistoryGeoJSON = useMemo(() => {
    if (!visible) return EMPTY_FC
    if (mode === 'current') return EMPTY_FC
    return historyGeoJSON
  }, [visible, mode, historyGeoJSON])

  const visibleCurrentGeoJSON = useMemo(() => {
    if (!visible) return EMPTY_FEATURE
    return currentGeoJSON
  }, [visible, currentGeoJSON])

  const endCurrentTrip = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/tracks/trips/end`, { method: 'POST' })
      // Reset display immediately; the WS will pick up the next trip when one opens.
      currentCoordsRef.current = []
      currentTripIdRef.current = null
      setCurrentGeoJSON(EMPTY_FEATURE)
      setCurrentTrip(null)
      refreshTrips()
    } catch (err) {
      console.warn('[useTracks] endCurrentTrip failed:', err.message)
    }
  }, [refreshTrips])

  return {
    trips,
    historyGeoJSON: visibleHistoryGeoJSON,
    currentGeoJSON: visibleCurrentGeoJSON,
    currentTrip,
    recording,
    endCurrentTrip,
    refreshTrips,
  }
}
