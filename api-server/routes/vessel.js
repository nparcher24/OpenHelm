/**
 * Vessel API Routes
 */

import { Router } from 'express'
import { startNmea2000Service, getVesselData, isVesselRunning } from '../services/nmea2000Service.js'

const router = Router()

/**
 * GET /api/vessel - Get current vessel data
 */
router.get('/', async (req, res) => {
  try {
    if (!isVesselRunning()) {
      await startNmea2000Service()
    }
    res.json(getVesselData())
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get vessel data',
      message: error.message
    })
  }
})

/**
 * GET /api/vessel/status - Get service status
 */
router.get('/status', (req, res) => {
  res.json({
    isRunning: isVesselRunning(),
    isDemoMode: getVesselData().isDemoMode
  })
})

export default router
