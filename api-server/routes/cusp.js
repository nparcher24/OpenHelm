/**
 * CUSP API Routes
 * REST endpoints for NOAA CUSP coastline data management
 */

import express from 'express';
import {
  getStorageInfo,
  getCUSPStatus,
  startCUSPJob,
  getJobStatus,
  cancelJob,
  deleteCUSPData
} from '../services/cuspDownloadService.js';

const router = express.Router();

/**
 * GET /api/cusp/status
 * Check if CUSP data exists and get metadata
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getCUSPStatus();
    res.json(status);
  } catch (error) {
    console.error('[CUSP API] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cusp/storage
 * Get storage information including disk space
 */
router.get('/storage', async (req, res) => {
  try {
    const storage = await getStorageInfo();
    res.json(storage);
  } catch (error) {
    console.error('[CUSP API] Error getting storage info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cusp/download
 * Start CUSP download and processing job
 */
router.post('/download', async (req, res) => {
  try {
    const jobId = await startCUSPJob();
    res.json({
      success: true,
      jobId,
      message: 'CUSP download job started'
    });
  } catch (error) {
    console.error('[CUSP API] Error starting download:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cusp/jobs/:jobId/status
 * Get status of a specific job
 */
router.get('/jobs/:jobId/status', (req, res) => {
  try {
    const { jobId } = req.params;
    const status = getJobStatus(jobId);
    res.json(status);
  } catch (error) {
    console.error('[CUSP API] Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/cusp/jobs/:jobId
 * Cancel a running job
 */
router.delete('/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    cancelJob(jobId);
    res.json({
      success: true,
      message: 'Job cancelled'
    });
  } catch (error) {
    console.error('[CUSP API] Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/cusp/data
 * Delete CUSP MBTiles file
 */
router.delete('/data', async (req, res) => {
  try {
    const result = await deleteCUSPData();
    res.json(result);
  } catch (error) {
    console.error('[CUSP API] Error deleting data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
