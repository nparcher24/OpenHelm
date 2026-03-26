/**
 * Satellite Imagery API Routes
 * Handles download management, storage info, and region CRUD for USGS satellite tiles.
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
  cancelJob
} from '../services/satelliteDownloadService.js'

const router = express.Router()

/**
 * GET /api/satellite/storage
 * Returns disk space and satellite tile storage info
 */
router.get('/storage', async (req, res) => {
  try {
    const info = await getStorageInfo()
    res.json(info)
  } catch (error) {
    console.error('[Satellite] Storage error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/satellite/regions
 * Returns list of downloaded regions
 */
router.get('/regions', async (req, res) => {
  try {
    const regions = await getRegions()
    res.json({ success: true, regions })
  } catch (error) {
    console.error('[Satellite] Regions error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/satellite/estimate
 * Estimate tile count and download size for given bounds/zoom
 * Query params: bounds=w,s,e,n&minZoom=8&maxZoom=15
 */
router.get('/estimate', (req, res) => {
  try {
    const { bounds: boundsStr, minZoom, maxZoom } = req.query

    if (!boundsStr || !minZoom || !maxZoom) {
      return res.status(400).json({ error: 'Required: bounds, minZoom, maxZoom' })
    }

    const bounds = boundsStr.split(',').map(Number)
    const zoomRange = [parseInt(minZoom), parseInt(maxZoom)]

    const validation = validateParams('estimate', bounds, zoomRange)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    const estimate = estimateDownload(bounds, zoomRange)
    res.json(estimate)
  } catch (error) {
    console.error('[Satellite] Estimate error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/satellite/download/start
 * Start a satellite tile download job
 * Body: { name, bounds: [w,s,e,n], zoomRange: [min, max], maxParallel? }
 */
router.post('/download/start', async (req, res) => {
  try {
    const { name, bounds, zoomRange, maxParallel } = req.body

    const validation = validateParams(name, bounds, zoomRange)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    const result = await startDownloadJob(name, bounds, zoomRange, maxParallel || 6)
    res.json({
      success: true,
      jobId: result.jobId,
      tileCount: result.tileCount,
      estimatedSizeMB: result.estimatedSizeMB
    })
  } catch (error) {
    console.error('[Satellite] Download start error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/satellite/download/jobs/:jobId/status
 * Get download job status (polling endpoint)
 */
router.get('/download/jobs/:jobId/status', (req, res) => {
  const status = getJobStatus(req.params.jobId)
  if (!status) {
    return res.status(404).json({ error: 'Job not found' })
  }
  res.json({ success: true, ...status })
})

/**
 * DELETE /api/satellite/download/jobs/:jobId
 * Cancel a download job
 */
router.delete('/download/jobs/:jobId', (req, res) => {
  const result = cancelJob(req.params.jobId)
  if (!result.success) {
    return res.status(404).json({ error: result.error })
  }
  res.json(result)
})

/**
 * DELETE /api/satellite/regions/:regionId
 * Delete a region from the manifest
 */
router.delete('/regions/:regionId', async (req, res) => {
  try {
    const result = await deleteRegion(req.params.regionId)
    if (!result.success) {
      return res.status(404).json({ error: result.error })
    }
    res.json(result)
  } catch (error) {
    console.error('[Satellite] Delete region error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
