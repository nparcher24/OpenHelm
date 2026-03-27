/**
 * Weather Station Service
 * Discovers NOAA CO-OPS stations and fetches tide/current/wind data.
 * Also fetches NDBC buoy observations.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const WEATHER_DIR = path.join(PROJECT_ROOT, 'weather-data')
const STATIONS_CACHE_PATH = path.join(WEATHER_DIR, 'stations-cache.json')

// CO-OPS API base URLs
const COOPS_METADATA_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
const COOPS_DATA_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

// NDBC base URL
const NDBC_REALTIME_URL = 'https://www.ndbc.noaa.gov/data/realtime2'

// Station cache max age (30 days)
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Fetch with retry and abort support
 */
async function fetchWithRetry(url, signal, maxRetries = 3, headers = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { signal, headers })

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw new Error(`HTTP ${response.status} after ${maxRetries} retries for ${url}`)
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`)
      }

      return response
    } catch (error) {
      if (error.name === 'AbortError') throw error
      if (attempt === maxRetries) throw error
      const delay = Math.pow(2, attempt) * 500
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

/**
 * Format date as YYYYMMDD for CO-OPS API
 */
function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Check if a station is within a bounding box
 */
function isInBounds(station, bounds) {
  const [west, south, east, north] = bounds
  const lat = parseFloat(station.lat)
  const lng = parseFloat(station.lng)
  return lat >= south && lat <= north && lng >= west && lng <= east
}

/**
 * Load station cache from disk
 */
async function loadStationCache() {
  try {
    const data = await fs.readFile(STATIONS_CACHE_PATH, 'utf-8')
    const cache = JSON.parse(data)
    if (Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_MAX_AGE_MS) {
      return cache
    }
  } catch {
    // Cache doesn't exist or is invalid
  }
  return null
}

/**
 * Save station cache to disk
 */
async function saveStationCache(cache) {
  await fs.mkdir(WEATHER_DIR, { recursive: true })
  await fs.writeFile(STATIONS_CACHE_PATH, JSON.stringify(cache, null, 2))
}

/**
 * Fetch master station list from CO-OPS, with disk caching
 */
async function fetchMasterStationList(signal) {
  // Check disk cache first
  const cached = await loadStationCache()
  if (cached) {
    console.log(`[Weather] Using cached station list (${cached.tideStations.length} tide, ${cached.currentStations.length} current, ${cached.metStations.length} met)`)
    return cached
  }

  console.log('[Weather] Fetching master station list from CO-OPS...')

  // Fetch tide prediction stations
  const tideResp = await fetchWithRetry(
    `${COOPS_METADATA_URL}/stations.json?type=tidepredictions&units=english`,
    signal
  )
  const tideData = await tideResp.json()
  const tideStations = (tideData.stations || []).map(s => ({
    id: s.id,
    name: s.name,
    lat: parseFloat(s.lat),
    lng: parseFloat(s.lng),
    state: s.state || '',
    type: 'tide'
  }))

  // Fetch current prediction stations
  const currentResp = await fetchWithRetry(
    `${COOPS_METADATA_URL}/stations.json?type=currentpredictions&units=english`,
    signal
  )
  const currentData = await currentResp.json()
  const currentStations = (currentData.stations || []).map(s => ({
    id: s.id,
    name: s.name,
    lat: parseFloat(s.lat),
    lng: parseFloat(s.lng),
    state: s.state || '',
    type: 'current'
  }))

  // Fetch water level stations (which also have met data like wind)
  const metResp = await fetchWithRetry(
    `${COOPS_METADATA_URL}/stations.json?type=waterlevels&units=english`,
    signal
  )
  const metData = await metResp.json()
  const metStations = (metData.stations || []).map(s => ({
    id: s.id,
    name: s.name,
    lat: parseFloat(s.lat),
    lng: parseFloat(s.lng),
    state: s.state || '',
    type: 'met'
  }))

  const cache = {
    fetchedAt: new Date().toISOString(),
    tideStations,
    currentStations,
    metStations
  }

  await saveStationCache(cache)
  console.log(`[Weather] Cached ${tideStations.length} tide, ${currentStations.length} current, ${metStations.length} met stations`)

  return cache
}

/**
 * Discover stations within a bounding box
 * @param {number[]} bounds - [west, south, east, north]
 * @param {AbortSignal} signal
 * @returns {{ tideStations, currentStations, metStations }}
 */
export async function discoverStations(bounds, signal) {
  const master = await fetchMasterStationList(signal)

  const tideStations = master.tideStations.filter(s => isInBounds(s, bounds))
  const currentStations = master.currentStations.filter(s => isInBounds(s, bounds))
  const metStations = master.metStations.filter(s => isInBounds(s, bounds))

  console.log(`[Weather] Found in bounds: ${tideStations.length} tide, ${currentStations.length} current, ${metStations.length} met`)

  return { tideStations, currentStations, metStations }
}

/**
 * Count stations within a bounding box (for estimates, no signal needed)
 */
export async function countStationsInBounds(bounds) {
  const master = await loadStationCache()
  if (!master) {
    // No cache available, return estimates
    return { tideCount: 0, currentCount: 0, metCount: 0, cached: false }
  }

  return {
    tideCount: master.tideStations.filter(s => isInBounds(s, bounds)).length,
    currentCount: master.currentStations.filter(s => isInBounds(s, bounds)).length,
    metCount: master.metStations.filter(s => isInBounds(s, bounds)).length,
    cached: true
  }
}

/**
 * Fetch tide predictions for a station
 * @param {string} stationId
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {AbortSignal} signal
 * @returns {{ hiLo: Array, predictions: Array }}
 */
export async function fetchTidePredictions(stationId, startDate, endDate, signal) {
  const begin = formatDate(startDate)
  const end = formatDate(endDate)

  // Fetch high/low predictions
  const hiLoUrl = `${COOPS_DATA_URL}?begin_date=${begin}&end_date=${end}&station=${stationId}&product=predictions&datum=MLLW&units=english&time_zone=lst_ldt&format=json&interval=hilo`
  const hiLoResp = await fetchWithRetry(hiLoUrl, signal)
  const hiLoData = await hiLoResp.json()

  // Fetch 6-minute interval predictions for smooth curve
  // Some stations don't support interval=6 with MLLW datum, so fall back gracefully
  let detailData = { predictions: [] }
  try {
    const detailUrl = `${COOPS_DATA_URL}?begin_date=${begin}&end_date=${end}&station=${stationId}&product=predictions&datum=MLLW&units=english&time_zone=lst_ldt&format=json&interval=6`
    const detailResp = await fetchWithRetry(detailUrl, signal)
    detailData = await detailResp.json()
    // If API returned an error object instead of predictions, treat as empty
    if (detailData.error) detailData = { predictions: [] }
  } catch {
    // Silently fall back to hi-lo only
  }

  return {
    hiLo: (hiLoData.predictions || []).map(p => ({
      t: p.t,
      v: parseFloat(p.v),
      type: p.type // 'H' or 'L'
    })),
    predictions: (detailData.predictions || []).map(p => ({
      t: p.t,
      v: parseFloat(p.v)
    }))
  }
}

/**
 * Fetch current predictions for a station
 * @param {string} stationId
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {AbortSignal} signal
 * @returns {{ predictions: Array }}
 */
export async function fetchCurrentPredictions(stationId, startDate, endDate, signal) {
  const begin = formatDate(startDate)
  const end = formatDate(endDate)

  const url = `${COOPS_DATA_URL}?begin_date=${begin}&end_date=${end}&station=${stationId}&product=currents_predictions&units=english&time_zone=lst_ldt&format=json`
  const resp = await fetchWithRetry(url, signal)
  const data = await resp.json()

  return {
    predictions: (data.current_predictions?.cp || []).map(p => ({
      t: p.Time,
      speed: parseFloat(p.Velocity_Major),
      dir: parseFloat(p.meanFloodDir || 0),
      type: p.Type // 'flood', 'ebb', 'slack'
    }))
  }
}

/**
 * Fetch wind observations from CO-OPS for a station
 * @param {string} stationId
 * @param {AbortSignal} signal
 * @returns {{ observations: Array }}
 */
export async function fetchWindObservations(stationId, signal) {
  // Fetch latest 72 hours of wind data
  const url = `${COOPS_DATA_URL}?date=recent&station=${stationId}&product=wind&units=english&time_zone=lst_ldt&format=json`

  try {
    const resp = await fetchWithRetry(url, signal)
    const data = await resp.json()

    return {
      observations: (data.data || []).map(d => ({
        t: d.t,
        speed: parseFloat(d.s) || 0,
        dir: parseFloat(d.d) || 0,
        gust: parseFloat(d.g) || 0
      }))
    }
  } catch (error) {
    // Not all stations have wind data
    console.log(`[Weather] No wind data for station ${stationId}: ${error.message}`)
    return { observations: [] }
  }
}

/**
 * Fetch NDBC buoy stations list and filter by bounds
 */
export async function discoverNDBCStations(bounds, signal) {
  try {
    const resp = await fetchWithRetry(
      'https://www.ndbc.noaa.gov/activestations.xml',
      signal,
      3,
      { 'User-Agent': 'OpenHelm/1.0' }
    )
    const xml = await resp.text()

    // Simple XML parsing for station elements
    const stations = []
    const stationRegex = /<station\s+([^>]+)\/>/g
    let match
    while ((match = stationRegex.exec(xml)) !== null) {
      const attrs = match[1]
      const id = attrs.match(/id="([^"]+)"/)?.[1]
      const lat = parseFloat(attrs.match(/lat="([^"]+)"/)?.[1])
      const lng = parseFloat(attrs.match(/lon="([^"]+)"/)?.[1])
      const name = attrs.match(/name="([^"]+)"/)?.[1] || id

      if (id && !isNaN(lat) && !isNaN(lng) && isInBounds({ lat, lng }, bounds)) {
        stations.push({ id, name, lat, lng, type: 'ndbc' })
      }
    }

    console.log(`[Weather] Found ${stations.length} NDBC buoys in bounds`)
    return stations
  } catch (error) {
    console.log(`[Weather] NDBC station discovery failed: ${error.message}`)
    return []
  }
}

/**
 * Fetch NDBC station realtime data
 * @param {string} stationId
 * @param {AbortSignal} signal
 * @returns {{ observations: Array }}
 */
export async function fetchNDBCData(stationId, signal) {
  try {
    const url = `${NDBC_REALTIME_URL}/${stationId}.txt`
    const resp = await fetchWithRetry(url, signal, 3, { 'User-Agent': 'OpenHelm/1.0' })
    const text = await resp.text()
    const lines = text.split('\n').filter(l => l.trim())

    if (lines.length < 3) return { observations: [] }

    // First two lines are headers
    const headers = lines[0].replace(/^#/, '').trim().split(/\s+/)
    const observations = []

    for (let i = 2; i < Math.min(lines.length, 50); i++) { // Last 48 hours approx
      const cols = lines[i].trim().split(/\s+/)
      if (cols.length < 7) continue

      const yr = cols[0]
      const mo = cols[1]
      const dy = cols[2]
      const hr = cols[3]
      const mn = cols[4]

      // Find column indices
      const wdirIdx = headers.indexOf('WDIR')
      const wspdIdx = headers.indexOf('WSPD')
      const gstIdx = headers.indexOf('GST')
      const wvhtIdx = headers.indexOf('WVHT')
      const dpdIdx = headers.indexOf('DPD')
      const aprsIdx = headers.indexOf('PRES')
      const atmpIdx = headers.indexOf('ATMP')
      const wtmpIdx = headers.indexOf('WTMP')

      const parseVal = (idx) => {
        if (idx < 0 || idx >= cols.length) return null
        const v = parseFloat(cols[idx])
        return (isNaN(v) || v === 999 || v === 99 || v === 9999) ? null : v
      }

      observations.push({
        t: `${yr}-${mo}-${dy} ${hr}:${mn}`,
        windDir: parseVal(wdirIdx),
        windSpeed: parseVal(wspdIdx) != null ? parseVal(wspdIdx) * 1.94384 : null, // m/s → knots
        windGust: parseVal(gstIdx) != null ? parseVal(gstIdx) * 1.94384 : null,
        waveHeight: parseVal(wvhtIdx) != null ? parseVal(wvhtIdx) * 3.28084 : null, // m → ft
        wavePeriod: parseVal(dpdIdx),
        pressure: parseVal(aprsIdx),
        airTemp: parseVal(atmpIdx) != null ? parseVal(atmpIdx) * 9/5 + 32 : null, // C → F
        waterTemp: parseVal(wtmpIdx) != null ? parseVal(wtmpIdx) * 9/5 + 32 : null
      })
    }

    return { observations }
  } catch (error) {
    console.log(`[Weather] NDBC data fetch failed for ${stationId}: ${error.message}`)
    return { observations: [] }
  }
}
