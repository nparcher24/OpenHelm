/**
 * Weather Download Service
 * Orchestrates downloading tide, current, wind, and grid forecast data.
 * Stores data in weather-data/{regionId}/ with a regions.json manifest.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import os from 'os'
import checkDiskSpace from 'check-disk-space'
import { exec } from 'child_process'
import { promisify } from 'util'
import {
  discoverStations,
  countStationsInBounds,
  fetchTidePredictions,
  fetchCurrentPredictions,
  fetchWindObservations,
  discoverNDBCStations,
  fetchNDBCData
} from './weatherStationService.js'
import {
  generateGridPoints,
  fetchWindGrid,
  fetchGFSWindGrid,
  fetchMarineGrid,
  writeGridGeoJSON
} from './weatherGridService.js'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const WEATHER_DIR = path.join(PROJECT_ROOT, 'weather-data')
const MANIFEST_PATH = path.join(WEATHER_DIR, 'regions.json')

/**
 * Get storage info
 */
export async function getStorageInfo() {
  try {
    const diskSpace = await checkDiskSpace('/')
    await fs.mkdir(WEATHER_DIR, { recursive: true })

    let totalSizeMB = 0
    try {
      const { stdout } = await execAsync(`du -sm "${WEATHER_DIR}"`)
      totalSizeMB = parseInt(stdout.split('\t')[0]) || 0
    } catch { /* empty dir */ }

    const regions = await getRegions()

    return {
      success: true,
      disk: {
        totalGB: parseFloat((diskSpace.size / 1024 / 1024 / 1024).toFixed(2)),
        usedGB: parseFloat(((diskSpace.size - diskSpace.free) / 1024 / 1024 / 1024).toFixed(2)),
        freeGB: parseFloat((diskSpace.free / 1024 / 1024 / 1024).toFixed(2)),
        usedPercent: parseFloat((((diskSpace.size - diskSpace.free) / diskSpace.size) * 100).toFixed(1))
      },
      weather: {
        totalSizeMB,
        regionCount: regions.length,
        path: WEATHER_DIR
      }
    }
  } catch (error) {
    console.error('[Weather] Error getting storage info:', error)
    throw error
  }
}

/**
 * Read regions manifest
 */
export async function getRegions() {
  try {
    await fs.mkdir(WEATHER_DIR, { recursive: true })
    const data = await fs.readFile(MANIFEST_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveRegions(regions) {
  await fs.mkdir(WEATHER_DIR, { recursive: true })
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(regions, null, 2))
}

/**
 * Delete a region and its data
 */
export async function deleteRegion(regionId) {
  const regions = await getRegions()
  const idx = regions.findIndex(r => r.id === regionId)
  if (idx === -1) return { success: false, error: 'Region not found' }

  // Delete data directory
  const regionDir = path.join(WEATHER_DIR, regionId)
  try {
    await fs.rm(regionDir, { recursive: true, force: true })
  } catch { /* may not exist */ }

  regions.splice(idx, 1)
  await saveRegions(regions)
  return { success: true }
}

/**
 * Estimate download for given bounds and forecast days
 */
export async function estimateDownload(bounds, forecastDays) {
  const stationCounts = await countStationsInBounds(bounds)
  const gridPoints = generateGridPoints(bounds)

  const totalStations = stationCounts.tideCount + stationCounts.currentCount + stationCounts.metCount
  // Each station = 1-2 API calls, each grid batch = 1 call per 50 points
  const gridBatches = Math.ceil(gridPoints.length / 50)
  const estimatedApiCalls = totalStations * 2 + gridBatches * 2

  return {
    bounds,
    forecastDays,
    stations: stationCounts,
    gridPoints: gridPoints.length,
    estimatedApiCalls,
    stationsCached: stationCounts.cached
  }
}

/**
 * Validate download parameters
 */
export function validateParams(name, bounds, forecastDays) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'Name is required' }
  }
  if (!Array.isArray(bounds) || bounds.length !== 4) {
    return { valid: false, error: 'Bounds must be [west, south, east, north]' }
  }
  const [west, south, east, north] = bounds
  if (west >= east) return { valid: false, error: 'West bound must be less than east bound' }
  if (south >= north) return { valid: false, error: 'South bound must be less than north bound' }
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    return { valid: false, error: 'Bounds out of valid range' }
  }
  if (![3, 7, 14].includes(forecastDays)) {
    return { valid: false, error: 'Forecast days must be 3, 7, or 14' }
  }
  return { valid: true }
}

/**
 * Run tasks in parallel with concurrency limit
 */
async function runParallel(items, fn, concurrency, signal) {
  const results = []
  const executing = new Set()

  for (const item of items) {
    if (signal?.aborted) break

    const promise = fn(item).then(result => {
      executing.delete(promise)
      return result
    }).catch(error => {
      executing.delete(promise)
      return { error: error.message }
    })

    executing.add(promise)
    results.push(promise)

    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  return Promise.all(results)
}

/**
 * Start a weather data download job
 */
export async function startDownloadJob(name, bounds, forecastDays, dataTypes, maxParallel) {
  const jobId = crypto.randomBytes(8).toString('hex')
  const regionId = crypto.randomBytes(6).toString('hex')
  const regionDir = path.join(WEATHER_DIR, regionId)
  const cpuCount = os.cpus().length
  const concurrency = maxParallel || Math.max(cpuCount * 2, 8) // I/O bound, so 2x CPU

  console.log(`[Weather] Starting job ${jobId}: region "${name}", ${forecastDays} days, ${concurrency} concurrent`)

  if (!global.activeJobs) global.activeJobs = new Map()
  if (!global.progressTrackers) global.progressTrackers = new Map()

  const controller = new AbortController()
  global.activeJobs.set(jobId, {
    controller,
    startTime: Date.now(),
    status: 'downloading',
    type: 'weather',
    name,
    phase: 'starting'
  })

  global.progressTrackers.set(jobId, {
    progress: 0,
    status: 'downloading',
    clients: new Set()
  })

  const broadcast = (progress, status, message) => {
    const job = global.activeJobs.get(jobId)
    if (job) job.phase = message
    if (global.broadcastProgress) {
      global.broadcastProgress(jobId, progress, status, message)
    }
  }

  // Run download asynchronously
  setImmediate(async () => {
    const job = global.activeJobs.get(jobId)
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + forecastDays)

    let stationCount = 0
    let gridPointCount = 0
    let totalApiCalls = 0
    let failedCalls = 0

    try {
      await fs.mkdir(regionDir, { recursive: true })

      // Phase 1: Station Discovery (0-5%)
      broadcast(1, 'downloading', 'Discovering NOAA stations...')
      const stations = await discoverStations(bounds, controller.signal)
      const ndbcStations = await discoverNDBCStations(bounds, controller.signal)
      stationCount = stations.tideStations.length + stations.currentStations.length + stations.metStations.length + ndbcStations.length

      // Save station metadata
      const metadata = {
        name: name.trim(),
        bounds,
        forecastDays,
        dataTypes,
        downloadedAt: new Date().toISOString(),
        forecastStart: startDate.toISOString(),
        forecastEnd: endDate.toISOString(),
        stations: {
          tide: stations.tideStations,
          current: stations.currentStations,
          met: stations.metStations,
          ndbc: ndbcStations
        }
      }
      await fs.writeFile(path.join(regionDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
      broadcast(5, 'downloading', `Found ${stationCount} stations`)

      if (controller.signal.aborted) throw new Error('Cancelled')

      // Phase 2: Tide Predictions (5-30%)
      if (dataTypes.includes('tides') && stations.tideStations.length > 0) {
        broadcast(6, 'downloading', `Downloading tide predictions (${stations.tideStations.length} stations)...`)
        const tidesDir = path.join(regionDir, 'tides')
        await fs.mkdir(tidesDir, { recursive: true })

        let completed = 0
        await runParallel(stations.tideStations, async (station) => {
          const data = await fetchTidePredictions(station.id, startDate, endDate, controller.signal)
          await fs.writeFile(
            path.join(tidesDir, `${station.id}.json`),
            JSON.stringify({ station, ...data })
          )
          completed++
          totalApiCalls += 2 // hi-lo + detail
          const pct = 5 + Math.round((completed / stations.tideStations.length) * 25)
          broadcast(pct, 'downloading', `Tides: ${completed}/${stations.tideStations.length} stations`)
        }, concurrency, controller.signal)
      }
      broadcast(30, 'downloading', 'Tide predictions complete')

      if (controller.signal.aborted) throw new Error('Cancelled')

      // Phase 3: Current Predictions (30-50%)
      if (dataTypes.includes('currents') && stations.currentStations.length > 0) {
        broadcast(31, 'downloading', `Downloading current predictions (${stations.currentStations.length} stations)...`)
        const currentsDir = path.join(regionDir, 'currents')
        await fs.mkdir(currentsDir, { recursive: true })

        let completed = 0
        await runParallel(stations.currentStations, async (station) => {
          const data = await fetchCurrentPredictions(station.id, startDate, endDate, controller.signal)
          await fs.writeFile(
            path.join(currentsDir, `${station.id}.json`),
            JSON.stringify({ station, ...data })
          )
          completed++
          totalApiCalls++
          const pct = 30 + Math.round((completed / stations.currentStations.length) * 20)
          broadcast(pct, 'downloading', `Currents: ${completed}/${stations.currentStations.length} stations`)
        }, concurrency, controller.signal)
      }
      broadcast(50, 'downloading', 'Current predictions complete')

      if (controller.signal.aborted) throw new Error('Cancelled')

      // Phase 4: Wind/Met Observations (50-65%)
      if (dataTypes.includes('wind')) {
        const windDir = path.join(regionDir, 'wind')
        const ndbcDir = path.join(regionDir, 'ndbc')
        await fs.mkdir(windDir, { recursive: true })
        await fs.mkdir(ndbcDir, { recursive: true })

        // CO-OPS wind data
        if (stations.metStations.length > 0) {
          broadcast(51, 'downloading', `Downloading wind observations (${stations.metStations.length} met stations)...`)
          let completed = 0
          await runParallel(stations.metStations, async (station) => {
            const data = await fetchWindObservations(station.id, controller.signal)
            if (data.observations.length > 0) {
              await fs.writeFile(
                path.join(windDir, `${station.id}.json`),
                JSON.stringify({ station, ...data })
              )
            }
            completed++
            totalApiCalls++
            const pct = 50 + Math.round((completed / stations.metStations.length) * 8)
            broadcast(pct, 'downloading', `Wind obs: ${completed}/${stations.metStations.length} stations`)
          }, concurrency, controller.signal)
        }

        // NDBC buoy data
        if (ndbcStations.length > 0) {
          broadcast(59, 'downloading', `Downloading NDBC buoy data (${ndbcStations.length} buoys)...`)
          let completed = 0
          await runParallel(ndbcStations, async (station) => {
            const data = await fetchNDBCData(station.id, controller.signal)
            if (data.observations.length > 0) {
              await fs.writeFile(
                path.join(ndbcDir, `${station.id}.json`),
                JSON.stringify({ station, ...data })
              )
            }
            completed++
            totalApiCalls++
          }, concurrency, controller.signal)
        }
      }
      broadcast(65, 'downloading', 'Wind/met observations complete')

      if (controller.signal.aborted) throw new Error('Cancelled')

      // Phase 5: Grid Wind Forecasts (65-82%)
      const gridDir = path.join(regionDir, 'grid')
      let windTimestamps = []
      let marineTimestamps = []

      if (dataTypes.includes('wind_grid')) {
        broadcast(66, 'downloading', `Downloading GFS wind grid (${forecastDays} days)...`)

        try {
          // Primary: NOAA GFS via NOMADS (free, no rate limits)
          const windResult = await fetchGFSWindGrid(bounds, forecastDays, controller.signal, (done, total, phase) => {
            if (phase === 'parsing') {
              broadcast(78, 'downloading', `GFS wind: parsing ${total} files...`)
            } else {
              const pct = 65 + Math.round((done / total) * 13)
              broadcast(pct, 'downloading', `GFS wind: downloading ${done}/${total}`)
            }
          })
          gridPointCount = windResult.pointData.size

          broadcast(82, 'downloading', 'Writing wind grid GeoJSON...')
          windTimestamps = await writeGridGeoJSON(windResult.timestamps, windResult.pointData, 'wind', gridDir)
          totalApiCalls += windResult.timestamps.length
        } catch (gfsError) {
          // Fallback: Open-Meteo (may hit rate limits for large regions)
          console.warn(`[Weather] GFS failed (${gfsError.message}), falling back to Open-Meteo`)
          broadcast(68, 'downloading', 'GFS unavailable, using Open-Meteo fallback...')
          const gridPoints = generateGridPoints(bounds)
          gridPointCount = gridPoints.length

          const windResult = await fetchWindGrid(gridPoints, forecastDays, controller.signal, (done, total) => {
            const pct = 68 + Math.round((done / total) * 14)
            broadcast(pct, 'downloading', `Wind grid fallback: batch ${done}/${total}`)
          })

          broadcast(82, 'downloading', 'Writing wind grid GeoJSON...')
          windTimestamps = await writeGridGeoJSON(windResult.timestamps, windResult.pointData, 'wind', gridDir)
          totalApiCalls += Math.ceil(gridPoints.length / 400)
        }
      }
      broadcast(82, 'downloading', 'Wind grid complete')

      if (controller.signal.aborted) throw new Error('Cancelled')

      // Phase 6: Grid Marine Forecasts (82-95%)
      // Use coarser resolution (0.25°) for marine data to stay within Open-Meteo rate limits
      if (dataTypes.includes('marine_grid')) {
        const gridPoints = generateGridPoints(bounds, 0.25)
        broadcast(83, 'downloading', `Downloading marine grid (${gridPoints.length} points at 0.25°)...`)

        const marineResult = await fetchMarineGrid(gridPoints, forecastDays, controller.signal, (done, total) => {
          const pct = 82 + Math.round((done / total) * 13)
          broadcast(pct, 'downloading', `Marine grid: batch ${done}/${total}`)
        })

        broadcast(93, 'downloading', 'Writing marine grid GeoJSON...')
        marineTimestamps = await writeGridGeoJSON(marineResult.timestamps, marineResult.pointData, 'marine', gridDir)
        broadcast(94, 'downloading', 'Writing current grid GeoJSON...')
        await writeGridGeoJSON(marineResult.timestamps, marineResult.pointData, 'current', gridDir)
        totalApiCalls += Math.ceil(generateGridPoints(bounds).length / 50)
      }

      // Finalize (95-100%)
      broadcast(97, 'downloading', 'Saving region manifest...')

      const region = {
        id: regionId,
        name: name.trim(),
        bounds,
        forecastDays,
        dataTypes,
        stationCount,
        gridPoints: gridPointCount,
        totalApiCalls,
        failedCalls,
        windTimestampCount: windTimestamps.length,
        marineTimestampCount: marineTimestamps.length,
        forecastStart: startDate.toISOString(),
        forecastEnd: endDate.toISOString(),
        downloadedAt: new Date().toISOString()
      }

      const regions = await getRegions()
      regions.push(region)
      await saveRegions(regions)

      job.status = failedCalls > 0 ? 'completed_with_errors' : 'completed'
      const msg = `Complete: ${stationCount} stations, ${gridPointCount} grid points, ${totalApiCalls} API calls`
      console.log(`[Weather Job ${jobId}] ${msg}`)
      broadcast(100, job.status, msg)

    } catch (error) {
      if (error.message === 'Cancelled' || controller.signal.aborted) {
        job.status = 'cancelled'
        broadcast(0, 'cancelled', 'Download cancelled')
        console.log(`[Weather Job ${jobId}] Cancelled`)
      } else {
        console.error(`[Weather Job ${jobId}] Error:`, error)
        job.status = 'failed'
        job.error = error.message
        broadcast(0, 'failed', error.message)
      }
    }
  })

  return { jobId, regionId }
}

/**
 * Get job status (polling fallback)
 */
export function getJobStatus(jobId) {
  const job = global.activeJobs?.get(jobId)
  if (!job) return null

  return {
    jobId,
    status: job.status,
    name: job.name,
    phase: job.phase,
    error: job.error
  }
}

/**
 * Cancel a download job
 */
export function cancelJob(jobId) {
  const job = global.activeJobs?.get(jobId)
  if (!job) return { success: false, error: 'Job not found' }

  console.log(`[Weather] Cancelling job ${jobId}`)
  job.controller.abort()
  job.status = 'cancelled'
  return { success: true }
}

/**
 * Get weather data for a region (stations + metadata)
 */
export async function getRegionData(regionId) {
  const metadataPath = path.join(WEATHER_DIR, regionId, 'metadata.json')
  try {
    const data = await fs.readFile(metadataPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

/**
 * Get grid GeoJSON for a specific timestamp
 */
export async function getGridAtTime(regionId, dataType, timestamp) {
  const safeTimestamp = timestamp.replace(/:/g, '-')
  const filePath = path.join(WEATHER_DIR, regionId, 'grid', `${dataType}-${safeTimestamp}.geojson`)
  try {
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

/**
 * Get available timestamps for a region
 */
export async function getTimestamps(regionId, dataType) {
  const filePath = path.join(WEATHER_DIR, regionId, 'grid', `${dataType}-timestamps.json`)
  try {
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

/**
 * Get station detail data
 */
export async function getStationData(regionId, stationId) {
  const regionDir = path.join(WEATHER_DIR, regionId)

  // Try each data type
  const result = {}
  for (const subdir of ['tides', 'currents', 'wind', 'ndbc']) {
    try {
      const data = await fs.readFile(path.join(regionDir, subdir, `${stationId}.json`), 'utf-8')
      result[subdir] = JSON.parse(data)
    } catch { /* not found in this category */ }
  }

  return Object.keys(result).length > 0 ? result : null
}
