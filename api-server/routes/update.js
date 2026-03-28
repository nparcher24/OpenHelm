/**
 * Software Update API Routes
 * Check for updates, get status, and trigger self-update.
 */

import express from 'express'
import {
  checkForUpdate,
  getUpdateStatus,
  startUpdate,
  getUpdateJobStatus
} from '../services/updateService.js'

const router = express.Router()

/**
 * GET /api/update/check
 * Check GitHub for the latest release and compare to current version.
 */
router.get('/check', async (req, res) => {
  try {
    const force = req.query.force === 'true'
    const result = await checkForUpdate(force)
    res.json(result)
  } catch (error) {
    console.error('[Update] Check error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/update/status
 * Get current version and last check info.
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getUpdateStatus()
    res.json(status)
  } catch (error) {
    console.error('[Update] Status error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/update/apply
 * Trigger the self-update process. Returns a jobId for progress tracking.
 * Body: { tag: "v0.2.0" }
 */
router.post('/apply', (req, res) => {
  try {
    const { tag } = req.body
    if (!tag) {
      return res.status(400).json({ error: 'Missing required field: tag' })
    }
    const result = startUpdate(tag)
    res.json(result)
  } catch (error) {
    console.error('[Update] Apply error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/update/job/:jobId
 * Get status of an update job (polling fallback for WebSocket).
 */
router.get('/job/:jobId', (req, res) => {
  try {
    const status = getUpdateJobStatus(req.params.jobId)
    res.json(status)
  } catch (error) {
    console.error('[Update] Job status error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
