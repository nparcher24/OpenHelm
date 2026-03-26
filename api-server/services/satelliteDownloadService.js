/**
 * Satellite Imagery Download Service
 * Downloads XYZ tiles from USGS National Map for offline satellite imagery.
 * Tiles are stored at /tiles/satellite/{z}/{x}/{y}.png
 * Region metadata is tracked in /tiles/satellite/regions.json
 */

import checkDiskSpace from 'check-disk-space'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_ROOT = path.resolve(__dirname, '../..')
const TILES_DIR = path.join(PROJECT_ROOT, 'satellite-tiles')
const MANIFEST_PATH = path.join(TILES_DIR, 'regions.json')

// USGS National Map tile URL (note: {z}/{y}/{x} order)
const USGS_TILE_URL = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile'

// Average tile size in KB for estimation
const AVG_TILE_SIZE_KB = 20

// Valid zoom range
const MIN_ZOOM = 0
const MAX_ZOOM = 16

/**
 * Convert lat/lon to slippy map tile coordinates
 */
function lonToTileX(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom))
}

function latToTileY(lat, zoom) {
  const latRad = lat * Math.PI / 180
  return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom))
}

/**
 * Compute tile list for a bounding box and zoom range
 * @param {number[]} bounds - [west, south, east, north]
 * @param {number[]} zoomRange - [minZoom, maxZoom]
 * @returns {{ tiles: Array<{z,x,y}>, tileCount: number }}
 */
function computeTileList(bounds, zoomRange) {
  const [west, south, east, north] = bounds
  const [minZoom, maxZoom] = zoomRange
  const tiles = []

  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lonToTileX(west, z)
    const xMax = lonToTileX(east, z)
    const yMin = latToTileY(north, z) // note: north has smaller y
    const yMax = latToTileY(south, z)

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y })
      }
    }
  }

  return { tiles, tileCount: tiles.length }
}

/**
 * Get storage information
 */
export async function getStorageInfo() {
  try {
    const diskSpace = await checkDiskSpace('/')
    await fs.mkdir(TILES_DIR, { recursive: true })

    // Calculate satellite tile directory size
    let totalSizeMB = 0
    try {
      const { stdout } = await execAsync(`du -sm "${TILES_DIR}"`)
      totalSizeMB = parseInt(stdout.split('\t')[0]) || 0
    } catch {
      // Directory might be empty or not exist
    }

    const regions = await getRegions()

    return {
      success: true,
      freeSpace: diskSpace.free,
      totalSpace: diskSpace.size,
      disk: {
        totalGB: parseFloat((diskSpace.size / 1024 / 1024 / 1024).toFixed(2)),
        usedGB: parseFloat(((diskSpace.size - diskSpace.free) / 1024 / 1024 / 1024).toFixed(2)),
        freeGB: parseFloat((diskSpace.free / 1024 / 1024 / 1024).toFixed(2)),
        usedPercent: parseFloat((((diskSpace.size - diskSpace.free) / diskSpace.size) * 100).toFixed(1))
      },
      satellite: {
        totalSizeMB,
        regionCount: regions.length,
        path: TILES_DIR
      }
    }
  } catch (error) {
    console.error('[Satellite] Error getting storage info:', error)
    throw error
  }
}

/**
 * Read regions from manifest file
 */
export async function getRegions() {
  try {
    await fs.mkdir(TILES_DIR, { recursive: true })
    const data = await fs.readFile(MANIFEST_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    // File doesn't exist or is invalid
    return []
  }
}

/**
 * Save regions to manifest file
 */
async function saveRegions(regions) {
  await fs.mkdir(TILES_DIR, { recursive: true })
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(regions, null, 2))
}

/**
 * Add a region to the manifest
 */
export async function addRegion(region) {
  const regions = await getRegions()
  regions.push(region)
  await saveRegions(regions)
}

/**
 * Delete a region from the manifest by ID
 * @returns {{ success: boolean, error?: string }}
 */
export async function deleteRegion(regionId) {
  const regions = await getRegions()
  const idx = regions.findIndex(r => r.id === regionId)
  if (idx === -1) {
    return { success: false, error: 'Region not found' }
  }
  regions.splice(idx, 1)
  await saveRegions(regions)
  return { success: true }
}

/**
 * Estimate download size for given bounds and zoom range
 */
export function estimateDownload(bounds, zoomRange) {
  const { tileCount } = computeTileList(bounds, zoomRange)
  const estimatedSizeMB = parseFloat((tileCount * AVG_TILE_SIZE_KB / 1024).toFixed(1))
  return {
    tileCount,
    estimatedSizeMB,
    bounds,
    zoomRange
  }
}

/**
 * Validate download parameters
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateParams(name, bounds, zoomRange) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'Name is required' }
  }
  if (!Array.isArray(bounds) || bounds.length !== 4) {
    return { valid: false, error: 'Bounds must be [west, south, east, north]' }
  }
  const [west, south, east, north] = bounds
  if (west >= east) {
    return { valid: false, error: 'West bound must be less than east bound' }
  }
  if (south >= north) {
    return { valid: false, error: 'South bound must be less than north bound' }
  }
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    return { valid: false, error: 'Bounds out of valid range' }
  }
  if (!Array.isArray(zoomRange) || zoomRange.length !== 2) {
    return { valid: false, error: 'Zoom range must be [minZoom, maxZoom]' }
  }
  const [minZoom, maxZoom] = zoomRange
  if (minZoom < MIN_ZOOM || maxZoom > MAX_ZOOM || minZoom > maxZoom) {
    return { valid: false, error: `Zoom range must be between ${MIN_ZOOM} and ${MAX_ZOOM}` }
  }
  if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom)) {
    return { valid: false, error: 'Zoom values must be integers' }
  }
  return { valid: true }
}

/**
 * Download a single tile from USGS with retry
 */
async function downloadTile(z, x, y, signal, maxRetries = 3) {
  // USGS uses {z}/{y}/{x} order
  const url = `${USGS_TILE_URL}/${z}/${y}/${x}`
  const destDir = path.join(TILES_DIR, String(z), String(x))
  const destPath = path.join(destDir, `${y}.png`)

  // Skip if already exists
  try {
    await fs.access(destPath)
    return { skipped: true }
  } catch {
    // File doesn't exist, proceed with download
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { signal })

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500 // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw new Error(`HTTP ${response.status} after ${maxRetries} retries`)
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())

      // Create directory and write file
      await fs.mkdir(destDir, { recursive: true })
      await fs.writeFile(destPath, buffer)

      return { skipped: false, bytes: buffer.length }
    } catch (error) {
      if (error.name === 'AbortError') throw error
      if (attempt === maxRetries) throw error
      const delay = Math.pow(2, attempt) * 500
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

/**
 * Start a satellite tile download job
 */
export async function startDownloadJob(name, bounds, zoomRange, maxParallel = 50) {
  const jobId = crypto.randomBytes(8).toString('hex')
  const { tiles, tileCount } = computeTileList(bounds, zoomRange)
  const estimatedSizeMB = parseFloat((tileCount * AVG_TILE_SIZE_KB / 1024).toFixed(1))

  console.log(`[Satellite] Starting job ${jobId}: ${tileCount} tiles, ${maxParallel} concurrent for "${name}"`)

  // Initialize global.activeJobs if needed
  if (!global.activeJobs) {
    global.activeJobs = new Map()
  }

  const controller = new AbortController()
  global.activeJobs.set(jobId, {
    controller,
    startTime: Date.now(),
    status: 'downloading',
    type: 'satellite',
    name,
    bounds,
    zoomRange,
    tileCount,
    estimatedSizeMB,
    completedTiles: 0,
    skippedTiles: 0,
    failedTiles: 0,
    downloadedBytes: 0
  })

  // Initialize progress tracker
  if (!global.progressTrackers) {
    global.progressTrackers = new Map()
  }
  global.progressTrackers.set(jobId, {
    progress: 0,
    status: 'downloading',
    clients: new Set()
  })

  // Start async download
  setImmediate(async () => {
    const job = global.activeJobs.get(jobId)
    const queue = [...tiles]
    const active = new Set()
    let completedCount = 0
    let skippedCount = 0
    let failedCount = 0
    let downloadedBytes = 0
    const startTime = Date.now()
    let lastBroadcast = 0

    try {
      while (queue.length > 0 || active.size > 0) {
        // Check cancellation
        if (controller.signal.aborted) {
          console.log(`[Satellite Job ${jobId}] Cancelled`)
          job.status = 'cancelled'
          if (global.broadcastProgress) {
            global.broadcastProgress(jobId, 0, 'cancelled', 'Download cancelled')
          }
          break
        }

        // Fill up parallel slots
        while (active.size < maxParallel && queue.length > 0) {
          const tile = queue.shift()
          const promise = downloadTile(tile.z, tile.x, tile.y, controller.signal)
            .then(result => {
              active.delete(promise)
              completedCount++
              if (result.skipped) {
                skippedCount++
              } else {
                downloadedBytes += result.bytes || 0
              }
            })
            .catch(error => {
              active.delete(promise)
              if (error.name !== 'AbortError') {
                failedCount++
                completedCount++
              }
            })
          active.add(promise)
        }

        // Wait for any to finish
        if (active.size > 0) {
          await Promise.race([...active])
        }

        // Update job state
        job.completedTiles = completedCount
        job.skippedTiles = skippedCount
        job.failedTiles = failedCount
        job.downloadedBytes = downloadedBytes

        // Throttle broadcasts to every 500ms to avoid overhead
        const now = Date.now()
        if (now - lastBroadcast < 500) continue
        lastBroadcast = now

        const progress = Math.round((completedCount / tileCount) * 100)
        const elapsedSec = (now - startTime) / 1000
        const speedMBps = elapsedSec > 0 ? (downloadedBytes / 1024 / 1024) / elapsedSec : 0
        const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1)
        const tilesPerSec = elapsedSec > 0 ? Math.round(completedCount / elapsedSec) : 0

        let eta = ''
        if (completedCount > 0 && completedCount < tileCount) {
          const remainingTiles = tileCount - completedCount
          const avgTimePerTile = elapsedSec / completedCount
          const etaSeconds = Math.round(remainingTiles * avgTimePerTile)
          eta = etaSeconds > 3600 ? `${(etaSeconds / 3600).toFixed(1)} hr` : etaSeconds > 60 ? `${Math.round(etaSeconds / 60)} min` : `${etaSeconds} sec`
        }

        const message = `${completedCount}/${tileCount} tiles (${downloadedMB} MB, ${tilesPerSec} tiles/s${skippedCount > 0 ? `, ${skippedCount} cached` : ''})`

        if (global.broadcastProgress) {
          global.broadcastProgress(jobId, progress, 'downloading', message, eta)
        }
      }

      // Finalize
      if (job.status !== 'cancelled') {
        const finalStatus = failedCount > 0 ? 'completed_with_errors' : 'completed'
        job.status = finalStatus

        // Save region to manifest
        const region = {
          id: crypto.randomBytes(4).toString('hex'),
          name: name.trim(),
          bounds,
          zoomRange,
          tileCount: completedCount - skippedCount - failedCount + skippedCount, // new + cached
          newTilesDownloaded: completedCount - skippedCount - failedCount,
          skippedTiles: skippedCount,
          failedTiles: failedCount,
          sizeMB: parseFloat((downloadedBytes / 1024 / 1024).toFixed(1)),
          downloadedAt: new Date().toISOString()
        }
        await addRegion(region)

        const message = `Completed: ${completedCount} tiles (${skippedCount} cached, ${failedCount} failed)`
        console.log(`[Satellite Job ${jobId}] ${message}`)

        if (global.broadcastProgress) {
          global.broadcastProgress(jobId, 100, finalStatus, message)
        }
      }
    } catch (error) {
      console.error(`[Satellite Job ${jobId}] Error:`, error)
      job.status = 'failed'
      job.error = error.message
      if (global.broadcastProgress) {
        global.broadcastProgress(jobId, 0, 'failed', error.message)
      }
    }
  })

  return {
    jobId,
    tileCount,
    estimatedSizeMB
  }
}

/**
 * Get status of a download job
 */
export function getJobStatus(jobId) {
  const job = global.activeJobs?.get(jobId)
  if (!job) {
    return null
  }

  return {
    jobId,
    status: job.status,
    name: job.name,
    tileCount: job.tileCount,
    completedTiles: job.completedTiles || 0,
    skippedTiles: job.skippedTiles || 0,
    failedTiles: job.failedTiles || 0,
    downloadedBytes: job.downloadedBytes || 0,
    progress: job.tileCount > 0 ? Math.round(((job.completedTiles || 0) / job.tileCount) * 100) : 0,
    error: job.error
  }
}

/**
 * Cancel a download job
 */
export function cancelJob(jobId) {
  const job = global.activeJobs?.get(jobId)
  if (!job) {
    return { success: false, error: 'Job not found' }
  }

  console.log(`[Satellite] Cancelling job ${jobId}`)
  job.controller.abort()
  job.status = 'cancelled'

  return { success: true }
}
