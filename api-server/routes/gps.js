/**
 * GPS API Routes
 */

import { Router } from 'express'
import {
  startGpsService, stopGpsService, getGpsData, isGpsRunning,
  getHeadingOffset, setHeadingOffset,
  startMagCalibration, stopMagCalibration, cancelMagCalibration, getMagCalStatus,
  getLastMagCalibration,
} from '../services/gpsService.js'
import { getActiveGps, getHeadingFusionState } from '../services/gpsArbiter.js'
import { getSecondaryGpsData, isSecondaryGpsRunning } from '../services/gpsServiceSecondary.js'

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

/**
 * Magnetometer calibration — drives the WitMotion's onboard spherical-fit
 * mag calibration. The wizard UI calls these endpoints; the device does the
 * actual fit and persists hard-iron offsets to its flash on stop().
 */
router.post('/mag-cal/start', async (req, res) => {
  try {
    const result = await startMagCalibration()
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/mag-cal/stop', async (req, res) => {
  try {
    const result = await stopMagCalibration()
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/mag-cal/cancel', async (req, res) => {
  try {
    const result = await cancelMagCalibration()
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/mag-cal/status', (req, res) => {
  res.json(getMagCalStatus())
})

router.get('/mag-cal/last', (req, res) => {
  res.json({ lastMagCalibration: getLastMagCalibration() })
})

/**
 * GET /api/gps/heading-fusion — Diagnostics for the dual-unit heading fuser.
 * Use during sea trial to verify the second unit is reporting, biases are
 * staying bounded, and the mag-gradient interference detector behaves.
 * See HEADING_FUSION.md §5 (sea trial checklist).
 */
router.get('/heading-fusion', (req, res) => {
  const arbitrated = getActiveGps()
  res.json({
    headingFusion: arbitrated.headingFusion,
    heading: arbitrated.heading,
    cog: arbitrated.cog,
    groundSpeed: arbitrated.groundSpeed,
    headingSlavedToCog: arbitrated.headingSlavedToCog,
    secondary: {
      running: isSecondaryGpsRunning(),
      data: getSecondaryGpsData(),
    },
    fuserState: getHeadingFusionState(),
    timestamp: Date.now(),
  })
})

/**
 * GET /api/gps/secondary — Raw secondary-unit snapshot (or null when feature
 * flag is unset). Mostly for verifying the udev rule and serial wiring.
 */
router.get('/secondary', (req, res) => {
  res.json({
    enabled: getSecondaryGpsData() != null,
    running: isSecondaryGpsRunning(),
    data: getSecondaryGpsData(),
  })
})

/**
 * GET /api/gps/sources — Side-by-side health summary of all three GPS sources
 * (primary WitMotion, secondary WitMotion, Garmin N2K). The boat-side session
 * uses this during signal verification before going underway.
 */
router.get('/sources', (req, res) => {
  const arbitrated = getActiveGps()
  res.json({
    active: arbitrated.source,
    activeLabel: arbitrated.sourceLabel,
    sources: arbitrated.sources,
    timestamp: Date.now(),
  })
})

export default router
