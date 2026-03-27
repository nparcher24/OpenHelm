/**
 * Weather Data API Routes
 * Handles weather download management, storage info, and region CRUD.
 */

import express from 'express'
import {
  getStorageInfo,
  getRegions,
  deleteRegion,
  estimateDownload,
  validateParams,
  startDownloadJob,
  getJobStatus,
  cancelJob,
  getRegionData,
  getGridAtTime,
  getTimestamps,
  getStationData
} from '../services/weatherDownloadService.js'

const router = express.Router()

// Sanitize path parameters to prevent path traversal
function sanitizeId(id) {
  if (!id || !/^[a-zA-Z0-9_.-]+$/.test(id)) {
    return null
  }
  return id
}

// Sanitize timestamp parameter (allows T and : for ISO format)
function sanitizeTimestamp(ts) {
  if (!ts || !/^[a-zA-Z0-9T:._-]+$/.test(ts)) {
    return null
  }
  return ts
}

const VALID_GRID_TYPES = new Set(['wind', 'marine', 'current'])

/**
 * GET /api/weather/storage
 */
router.get('/storage', async (req, res) => {
  try {
    const info = await getStorageInfo()
    res.json(info)
  } catch (error) {
    console.error('[Weather] Storage error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/weather/regions
 */
router.get('/regions', async (req, res) => {
  try {
    const regions = await getRegions()
    res.json({ success: true, regions })
  } catch (error) {
    console.error('[Weather] Regions error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/weather/estimate
 * Query: bounds=w,s,e,n&forecastDays=7
 */
router.get('/estimate', async (req, res) => {
  try {
    const { bounds: boundsStr, forecastDays } = req.query
    if (!boundsStr || !forecastDays) {
      return res.status(400).json({ error: 'Required: bounds, forecastDays' })
    }

    const bounds = boundsStr.split(',').map(Number)
    const days = parseInt(forecastDays)

    const validation = validateParams('estimate', bounds, days)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    const estimate = await estimateDownload(bounds, days)
    res.json(estimate)
  } catch (error) {
    console.error('[Weather] Estimate error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/weather/download/start
 * Body: { name, bounds, forecastDays, dataTypes, maxParallel? }
 */
router.post('/download/start', async (req, res) => {
  try {
    const { name, bounds, forecastDays, dataTypes, maxParallel } = req.body

    const validation = validateParams(name, bounds, forecastDays)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
      return res.status(400).json({ error: 'At least one data type is required' })
    }

    const result = await startDownloadJob(name, bounds, forecastDays, dataTypes, maxParallel)
    res.json({ success: true, ...result })
  } catch (error) {
    console.error('[Weather] Download start error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/weather/download/jobs/:jobId/status
 */
router.get('/download/jobs/:jobId/status', (req, res) => {
  const status = getJobStatus(req.params.jobId)
  if (!status) {
    return res.status(404).json({ error: 'Job not found' })
  }
  res.json({ success: true, ...status })
})

/**
 * DELETE /api/weather/download/jobs/:jobId
 */
router.delete('/download/jobs/:jobId', (req, res) => {
  const result = cancelJob(req.params.jobId)
  if (!result.success) {
    return res.status(404).json({ error: result.error })
  }
  res.json(result)
})

/**
 * DELETE /api/weather/regions/:regionId
 */
router.delete('/regions/:regionId', async (req, res) => {
  try {
    const regionId = sanitizeId(req.params.regionId)
    if (!regionId) return res.status(400).json({ error: 'Invalid region ID' })
    const result = await deleteRegion(regionId)
    if (!result.success) {
      return res.status(404).json({ error: result.error })
    }
    res.json(result)
  } catch (error) {
    console.error('[Weather] Delete region error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/weather/regions/:regionId/data
 * Get all station/metadata for a region
 */
router.get('/regions/:regionId/data', async (req, res) => {
  try {
    const regionId = sanitizeId(req.params.regionId)
    if (!regionId) return res.status(400).json({ error: 'Invalid region ID' })
    const data = await getRegionData(regionId)
    if (!data) {
      return res.status(404).json({ error: 'Region not found' })
    }
    res.json({ success: true, ...data })
  } catch (error) {
    console.error('[Weather] Region data error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/weather/regions/:regionId/grid/:type/timestamps
 * Get available timestamps for a grid data type
 */
router.get('/regions/:regionId/grid/:type/timestamps', async (req, res) => {
  try {
    const regionId = sanitizeId(req.params.regionId)
    if (!regionId) return res.status(400).json({ error: 'Invalid region ID' })
    if (!VALID_GRID_TYPES.has(req.params.type)) return res.status(400).json({ error: 'Type must be wind or marine' })
    const timestamps = await getTimestamps(regionId, req.params.type)
    res.json({ success: true, timestamps })
  } catch (error) {
    console.error('[Weather] Timestamps error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/weather/regions/:regionId/grid/:type/:timestamp
 * Get GeoJSON for a specific timestamp
 */
router.get('/regions/:regionId/grid/:type/:timestamp', async (req, res) => {
  try {
    const regionId = sanitizeId(req.params.regionId)
    if (!regionId) return res.status(400).json({ error: 'Invalid region ID' })
    if (!VALID_GRID_TYPES.has(req.params.type)) return res.status(400).json({ error: 'Type must be wind or marine' })
    const timestamp = sanitizeTimestamp(req.params.timestamp)
    if (!timestamp) return res.status(400).json({ error: 'Invalid timestamp' })
    const geojson = await getGridAtTime(regionId, req.params.type, timestamp)
    if (!geojson) {
      return res.status(404).json({ error: 'Data not found for this timestamp' })
    }
    res.json(geojson)
  } catch (error) {
    console.error('[Weather] Grid data error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/weather/regions/:regionId/station/:stationId
 * Get detailed data for a specific station
 */
router.get('/regions/:regionId/station/:stationId', async (req, res) => {
  try {
    const regionId = sanitizeId(req.params.regionId)
    const stationId = sanitizeId(req.params.stationId)
    if (!regionId || !stationId) return res.status(400).json({ error: 'Invalid ID' })
    const data = await getStationData(regionId, stationId)
    if (!data) {
      return res.status(404).json({ error: 'Station data not found' })
    }
    res.json({ success: true, ...data })
  } catch (error) {
    console.error('[Weather] Station data error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
