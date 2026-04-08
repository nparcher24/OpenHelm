/**
 * Drift Calculation API Routes
 *
 * Stores the results of a "Calculate Drift" session from the GPS page and
 * exposes the most recent value for the chart-page drift-compensation UI.
 */

import { Router } from 'express'
import driftService from '../services/driftService.js'

const router = Router()

/**
 * GET /api/drift/latest
 * Returns the single most recent drift calibration, or `drift: null` if none.
 * This endpoint is hit frequently by the chart view, so it stays trivial.
 */
router.get('/latest', async (req, res) => {
  try {
    const drift = await driftService.getLatestDrift()
    res.json({ success: true, drift: drift || null })
  } catch (error) {
    console.error('[Drift API] Error getting latest drift:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get latest drift',
      message: error.message
    })
  }
})

/**
 * GET /api/drift?limit=N
 * History listing for debugging. Default limit 50, capped at 500.
 */
router.get('/', async (req, res) => {
  try {
    const drifts = await driftService.getAllDrifts(req.query.limit)
    res.json({ success: true, count: drifts.length, drifts })
  } catch (error) {
    console.error('[Drift API] Error getting drift history:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get drift history',
      message: error.message
    })
  }
})

/**
 * POST /api/drift
 * Persist a new drift calibration.
 * Body: { latitude, longitude, driftSpeedMps, driftBearingDeg, durationS, sampleCount }
 */
router.post('/', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      driftSpeedMps,
      driftBearingDeg,
      durationS,
      sampleCount
    } = req.body || {}

    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        error: 'Valid latitude (-90 to 90) is required'
      })
    }
    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Valid longitude (-180 to 180) is required'
      })
    }
    if (
      typeof driftSpeedMps !== 'number' ||
      !isFinite(driftSpeedMps) ||
      driftSpeedMps < 0 ||
      // 5 m/s ≈ 10 knots. No realistic drift situation produces this, so any
      // value above it signals a broken regression fit (e.g., samples packed
      // into a sub-second window) and should be rejected rather than stored.
      driftSpeedMps > 5
    ) {
      return res.status(400).json({
        success: false,
        error: 'driftSpeedMps must be in [0, 5] m/s'
      })
    }
    if (
      typeof driftBearingDeg !== 'number' ||
      !isFinite(driftBearingDeg) ||
      driftBearingDeg < 0 ||
      driftBearingDeg >= 360
    ) {
      return res.status(400).json({
        success: false,
        error: 'driftBearingDeg must be in [0, 360)'
      })
    }
    if (typeof durationS !== 'number' || durationS <= 0) {
      return res.status(400).json({
        success: false,
        error: 'durationS must be a positive number'
      })
    }
    if (
      typeof sampleCount !== 'number' ||
      !Number.isInteger(sampleCount) ||
      sampleCount < 3
    ) {
      return res.status(400).json({
        success: false,
        error: 'sampleCount must be an integer >= 3'
      })
    }

    const drift = await driftService.createDrift({
      latitude,
      longitude,
      driftSpeedMps,
      driftBearingDeg,
      durationS,
      sampleCount
    })

    res.status(201).json({ success: true, drift })
  } catch (error) {
    console.error('[Drift API] Error creating drift:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to save drift calculation',
      message: error.message
    })
  }
})

/**
 * DELETE /api/drift/:id - Primarily for cleanup/debugging.
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid drift ID' })
    }
    const result = await driftService.deleteDrift(id)
    if (!result.deleted) {
      return res
        .status(404)
        .json({ success: false, error: 'Drift not found' })
    }
    res.json({ success: true, id })
  } catch (error) {
    console.error('[Drift API] Error deleting drift:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete drift',
      message: error.message
    })
  }
})

export default router
