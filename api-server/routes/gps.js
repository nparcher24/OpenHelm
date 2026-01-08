/**
 * GPS API Routes
 */

import { Router } from 'express'
import { startGpsService, stopGpsService, getGpsData, isGpsRunning } from '../services/gpsService.js'

const router = Router()

/**
 * GET /api/gps - Get current GPS data
 */
router.get('/', async (req, res) => {
  try {
    // Auto-start service if not running
    if (!isGpsRunning()) {
      await startGpsService()
    }

    const data = getGpsData()
    res.json(data)
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

export default router
