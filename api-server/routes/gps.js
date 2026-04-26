/**
 * GPS API Routes
 */

import { Router } from 'express'
import { startGpsService, stopGpsService, getGpsData, isGpsRunning, getHeadingOffset, setHeadingOffset } from '../services/gpsService.js'
import { getActiveGps } from '../services/gpsArbiter.js'

const router = Router()

/**
 * GET /api/gps - Arbitrated GPS snapshot (WitMotion primary, N2K fallback).
 * Frontend reads this; it transparently swaps source if WitMotion goes stale.
 */
router.get('/', async (req, res) => {
  try {
    if (!isGpsRunning()) {
      await startGpsService()
    }
    res.json(getActiveGps())
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get GPS data',
      message: error.message
    })
  }
})

/**
 * GET /api/gps/raw - Raw WitMotion-only snapshot (no N2K fallback).
 * Useful for debugging the WitMotion in isolation.
 */
router.get('/raw', async (req, res) => {
  try {
    if (!isGpsRunning()) {
      await startGpsService()
    }
    res.json(getGpsData())
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get GPS data',
      message: error.message
    })
  }
})

/**
 * POST /api/gps/start - Start GPS service
 */
router.post('/start', async (req, res) => {
  try {
    await startGpsService()
    res.json({
      success: true,
      message: 'GPS service started',
      data: getGpsData()
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start GPS service',
      message: error.message
    })
  }
})

/**
 * POST /api/gps/stop - Stop GPS service
 */
router.post('/stop', async (req, res) => {
  try {
    await stopGpsService()
    res.json({
      success: true,
      message: 'GPS service stopped'
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop GPS service',
      message: error.message
    })
  }
})

/**
 * GET /api/gps/status - Get GPS service status
 */
router.get('/status', (req, res) => {
  res.json({
    isRunning: isGpsRunning(),
    data: getGpsData()
  })
})

/**
 * GET /api/gps/heading-offset - Get current heading calibration offset
 */
router.get('/heading-offset', (req, res) => {
  res.json({ offset: getHeadingOffset() })
})

/**
 * POST /api/gps/heading-offset - Set heading calibration offset
 */
router.post('/heading-offset', (req, res) => {
  try {
    const { offset } = req.body
    if (typeof offset !== 'number' || !isFinite(offset)) {
      return res.status(400).json({ error: 'offset must be a finite number' })
    }
    const saved = setHeadingOffset(offset)
    res.json({ success: true, offset: saved })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to set heading offset',
      message: error.message
    })
  }
})

export default router
