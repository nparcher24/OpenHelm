/**
 * Weather Grid Service
 * Fetches wind grid from NOAA GFS (primary) and marine data from Open-Meteo.
 * Transforms responses into per-timestamp GeoJSON FeatureCollections.
 */

import fs from 'fs/promises'
import path from 'path'
import {
  findLatestGFSCycle,
  downloadGFSFile,
  parseGrib2ToPoints,
  uvToSpeedDir,
  computeForecastHours,
  forecastHourToTimestamp,
  cleanupTempFiles
} from './gfsService.js'

// Open-Meteo API URLs
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast'
const MARINE_API_URL = 'https://marine-api.open-meteo.com/v1/marine'

// Max points per Open-Meteo request (400 keeps URL under 8KB with all params)
const MAX_POINTS_PER_REQUEST = 400

// Open-Meteo allows ~5 concurrent requests; burst of 5 then brief pause
const MAX_CONCURRENT = 5
const DELAY_BETWEEN_BURSTS_MS = 300
const MAX_RETRIES = 3

/**
 * Generate grid points within bounds at given resolution
 * @param {number[]} bounds - [west, south, east, north]
 * @param {number} resolution - degrees between grid points (default 0.25)
 * @returns {Array<{lat: number, lon: number}>}
 */
export function generateGridPoints(bounds, resolution = 0.05) {
  const [west, south, east, north] = bounds
  const points = []

  for (let lat = south; lat <= north; lat += resolution) {
    for (let lon = west; lon <= east; lon += resolution) {
      points.push({
        lat: parseFloat(lat.toFixed(4)),
        lon: parseFloat(lon.toFixed(4))
      })
    }
  }

  return points
}

/**
 * Batch points into groups for API requests
 */
function batchPoints(points, batchSize) {
  const batches = []
  for (let i = 0; i < points.length; i += batchSize) {
    batches.push(points.slice(i, i + batchSize))
  }
  return batches
}

/**
 * Execute tasks in bursts: fire up to `concurrency` in parallel, wait for all
 * to finish, pause briefly, then fire the next burst. Matches Open-Meteo's
 * rate limit of ~5 concurrent requests.
 */
async function burstParallel(tasks, concurrency, delayMs) {
  const results = []

  for (let i = 0; i < tasks.length; i += concurrency) {
    const burst = tasks.slice(i, i + concurrency)
    const burstResults = await Promise.allSettled(burst.map(t => t()))
    results.push(...burstResults)

    // Pause between bursts (skip after last burst)
    if (i + concurrency < tasks.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  // Re-throw first rejection if any
  for (const r of results) {
    if (r.status === 'rejected') throw r.reason
  }
  return results.map(r => r.value)
}

/**
 * Fetch wind grid forecast from Open-Meteo weather API
 * @param {Array<{lat, lon}>} points
 * @param {number} forecastDays
 * @param {AbortSignal} signal
 * @param {function} onProgress - callback(completedBatches, totalBatches)
 * @returns {{ timestamps: string[], pointData: Map<string, object> }}
 */
export async function fetchWindGrid(points, forecastDays, signal, onProgress) {
  const batches = batchPoints(points, MAX_POINTS_PER_REQUEST)
  let allTimestamps = null
  const pointData = new Map() // 'lat,lon' → { timestamps, windSpeed, windDir, windGust, temp, pressure }
  let completedBatches = 0

  const tasks = batches.map(batch => async () => {
    if (signal?.aborted) throw new Error('Aborted')

    const latitudes = batch.map(p => p.lat).join(',')
    const longitudes = batch.map(p => p.lon).join(',')

    const url = `${WEATHER_API_URL}?latitude=${latitudes}&longitude=${longitudes}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,pressure_msl&wind_speed_unit=kn&temperature_unit=fahrenheit&forecast_days=${forecastDays}`

    let data
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(url, { signal })
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw new Error(`Open-Meteo weather API: HTTP ${resp.status} after ${MAX_RETRIES} retries`)
      }
      if (!resp.ok) throw new Error(`Open-Meteo weather API: HTTP ${resp.status}`)
      data = await resp.json()
      break
    }

    // Open-Meteo returns array when multiple points, single object when one point
    const results = Array.isArray(data) ? data : [data]

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (!result.hourly) continue

      const key = `${batch[i].lat},${batch[i].lon}`
      pointData.set(key, {
        lat: batch[i].lat,
        lon: batch[i].lon,
        timestamps: result.hourly.time,
        windSpeed: result.hourly.wind_speed_10m,
        windDir: result.hourly.wind_direction_10m,
        windGust: result.hourly.wind_gusts_10m,
        temp: result.hourly.temperature_2m,
        pressure: result.hourly.pressure_msl
      })

      if (!allTimestamps && result.hourly.time) {
        allTimestamps = result.hourly.time
      }
    }

    completedBatches++
    if (onProgress) onProgress(completedBatches, batches.length)
  })

  await burstParallel(tasks, MAX_CONCURRENT, DELAY_BETWEEN_BURSTS_MS)

  return { timestamps: allTimestamps || [], pointData }
}

/**
 * Fetch marine grid forecast from Open-Meteo marine API
 * @param {Array<{lat, lon}>} points
 * @param {number} forecastDays
 * @param {AbortSignal} signal
 * @param {function} onProgress
 * @returns {{ timestamps: string[], pointData: Map<string, object> }}
 */
export async function fetchMarineGrid(points, forecastDays, signal, onProgress) {
  const batches = batchPoints(points, MAX_POINTS_PER_REQUEST)
  let allTimestamps = null
  const pointData = new Map()
  let completedBatches = 0

  const tasks = batches.map(batch => async () => {
    if (signal?.aborted) throw new Error('Aborted')

    const latitudes = batch.map(p => p.lat).join(',')
    const longitudes = batch.map(p => p.lon).join(',')

    const url = `${MARINE_API_URL}?latitude=${latitudes}&longitude=${longitudes}&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,ocean_current_velocity,ocean_current_direction&length_unit=imperial&forecast_days=${forecastDays}`

    let data
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(url, { signal })
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw new Error(`Open-Meteo marine API: HTTP ${resp.status} after ${MAX_RETRIES} retries`)
      }
      if (!resp.ok) throw new Error(`Open-Meteo marine API: HTTP ${resp.status}`)
      data = await resp.json()
      break
    }

    const results = Array.isArray(data) ? data : [data]

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (!result.hourly) continue

      const key = `${batch[i].lat},${batch[i].lon}`
      pointData.set(key, {
        lat: batch[i].lat,
        lon: batch[i].lon,
        timestamps: result.hourly.time,
        waveHeight: result.hourly.wave_height,
        waveDir: result.hourly.wave_direction,
        wavePeriod: result.hourly.wave_period,
        swellHeight: result.hourly.swell_wave_height,
        swellDir: result.hourly.swell_wave_direction,
        currentSpeed: result.hourly.ocean_current_velocity,
        currentDir: result.hourly.ocean_current_direction
      })

      if (!allTimestamps && result.hourly.time) {
        allTimestamps = result.hourly.time
      }
    }

    completedBatches++
    if (onProgress) onProgress(completedBatches, batches.length)
  })

  await burstParallel(tasks, MAX_CONCURRENT, DELAY_BETWEEN_BURSTS_MS)

  return { timestamps: allTimestamps || [], pointData }
}

/**
 * Transform grid point data into per-timestamp GeoJSON files
 * @param {string[]} timestamps
 * @param {Map<string, object>} pointData
 * @param {string} dataType - 'wind' or 'marine'
 * @param {string} outputDir - directory to write GeoJSON files
 * @returns {string[]} - list of timestamps with data
 */
export async function writeGridGeoJSON(timestamps, pointData, dataType, outputDir) {
  await fs.mkdir(outputDir, { recursive: true })

  const validTimestamps = []

  for (let ti = 0; ti < timestamps.length; ti++) {
    const timestamp = timestamps[ti]
    const features = []

    for (const [key, data] of pointData) {
      const props = {}

      if (dataType === 'wind') {
        props.speed = data.windSpeed?.[ti] ?? null
        props.direction = data.windDir?.[ti] ?? null
        props.gust = data.windGust?.[ti] ?? null
        props.temp = data.temp?.[ti] ?? null
        props.pressure = data.pressure?.[ti] ?? null
        // Skip points with no wind data
        if (props.speed == null) continue
      } else if (dataType === 'marine') {
        props.waveHeight = data.waveHeight?.[ti] ?? null
        props.waveDir = data.waveDir?.[ti] ?? null
        props.wavePeriod = data.wavePeriod?.[ti] ?? null
        props.swellHeight = data.swellHeight?.[ti] ?? null
        props.swellDir = data.swellDir?.[ti] ?? null
        // Skip points with no marine data
        if (props.waveHeight == null) continue
      } else if (dataType === 'current') {
        props.speed = data.currentSpeed?.[ti] ?? null
        props.direction = data.currentDir?.[ti] ?? null
        // Skip points with no current data
        if (props.speed == null) continue
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [data.lon, data.lat]
        },
        properties: props
      })
    }

    if (features.length > 0) {
      const geojson = {
        type: 'FeatureCollection',
        features
      }

      const safeTimestamp = timestamp.replace(/:/g, '-')
      const filename = `${dataType}-${safeTimestamp}.geojson`
      await fs.writeFile(path.join(outputDir, filename), JSON.stringify(geojson))
      validTimestamps.push(timestamp)
    }
  }

  // Write timestamps index
  await fs.writeFile(
    path.join(outputDir, `${dataType}-timestamps.json`),
    JSON.stringify(validTimestamps)
  )

  return validTimestamps
}

/**
 * Fetch wind grid from NOAA GFS via NOMADS.
 * Downloads GRIB2 files in parallel, parses with eccodes, outputs same format as Open-Meteo.
 * @param {number[]} bounds - [west, south, east, north]
 * @param {number} forecastDays
 * @param {AbortSignal} signal
 * @param {function} onProgress - callback(completedFiles, totalFiles)
 * @returns {{ timestamps: string[], pointData: Map<string, object> }}
 */
export async function fetchGFSWindGrid(bounds, forecastDays, signal, onProgress) {
  // Find latest available GFS cycle
  const { date: dateStr, cycle } = await findLatestGFSCycle(signal)
  const forecastHours = computeForecastHours(forecastDays)
  const totalFiles = forecastHours.length
  let completedFiles = 0

  console.log(`[GFS] Downloading ${totalFiles} forecast hours from ${dateStr}/${cycle}z`)

  // Download all GRIB2 files in bursts of 5
  const downloadedFiles = [] // { forecastHour, filePath }
  for (let i = 0; i < forecastHours.length; i += 5) {
    if (signal?.aborted) throw new Error('Aborted')

    const burst = forecastHours.slice(i, i + 5)
    const results = await Promise.allSettled(
      burst.map(async (fh) => {
        const filePath = await downloadGFSFile(dateStr, cycle, fh, bounds, signal)
        return { forecastHour: fh, filePath }
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        downloadedFiles.push(r.value)
        completedFiles++
      } else {
        console.warn(`[GFS] Failed to download f${String(r.reason).substring(0, 80)}`)
        completedFiles++
      }
    }

    if (onProgress) onProgress(completedFiles, totalFiles)
  }

  console.log(`[GFS] Downloaded ${downloadedFiles.length}/${totalFiles} files, parsing...`)
  if (onProgress) onProgress(totalFiles, totalFiles, 'parsing')

  // Parse all GRIB2 files and build pointData in the same format as Open-Meteo
  // We need: { timestamps[], pointData: Map<'lat,lon', { lat, lon, timestamps[], windSpeed[], windDir[], windGust[] }> }
  const pointData = new Map()
  const timestamps = []

  // Sort by forecast hour
  downloadedFiles.sort((a, b) => a.forecastHour - b.forecastHour)

  for (const { forecastHour, filePath } of downloadedFiles) {
    if (signal?.aborted) throw new Error('Aborted')

    const timestamp = forecastHourToTimestamp(dateStr, cycle, forecastHour)
    const timeIndex = timestamps.length
    timestamps.push(timestamp)

    try {
      const parsed = await parseGrib2ToPoints(filePath, bounds)
      const uPoints = parsed['10u'] || []
      const vPoints = parsed['10v'] || []

      // Match U and V by lat/lon
      const vMap = new Map()
      for (const p of vPoints) {
        vMap.set(`${p.lat},${p.lon}`, p.value)
      }

      for (const uPoint of uPoints) {
        const key = `${uPoint.lat},${uPoint.lon}`
        const vValue = vMap.get(key)
        if (vValue == null) continue

        const { speed, direction } = uvToSpeedDir(uPoint.value, vValue)

        if (!pointData.has(key)) {
          pointData.set(key, {
            lat: uPoint.lat,
            lon: uPoint.lon,
            timestamps: [],
            windSpeed: [],
            windDir: [],
            windGust: [] // GFS doesn't give gust per-level, fill null
          })
        }

        const pd = pointData.get(key)
        // Pad arrays if we skipped timestamps (shouldn't happen but be safe)
        while (pd.windSpeed.length < timeIndex) {
          pd.windSpeed.push(null)
          pd.windDir.push(null)
          pd.windGust.push(null)
        }
        pd.windSpeed.push(speed)
        pd.windDir.push(direction)
        pd.windGust.push(null) // Could add surface gust var later
      }
    } catch (err) {
      console.warn(`[GFS] Failed to parse f${forecastHour}: ${err.message}`)
    }
  }

  // Cleanup temp files
  await cleanupTempFiles()

  console.log(`[GFS] Parsed ${timestamps.length} timestamps, ${pointData.size} grid points`)
  return { timestamps, pointData }
}
