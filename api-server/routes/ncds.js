/**
 * NCDS (NOAA Chart Display Service) API Routes
 * Handles ENC MBTiles download and management endpoints
 */

import express from 'express';
import {
  getAvailableRegions,
  getStorageInfo,
  getDownloadedRegions,
  startDownloadJob,
  getJobStatus,
  cancelJob,
  checkForUpdates,
  deleteRegion,
  restartMartin,
  getMartinStatus
} from '../services/ncdsDownloadService.js';

const router = express.Router();

/**
 * GET /api/ncds/regions
 * Get list of available NCDS regions for download
 */
router.get('/regions', (req, res) => {
  try {
    const regions = getAvailableRegions();
    res.json({
      success: true,
      regions
    });
  } catch (error) {
    console.error('[NCDS] Error getting regions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available regions'
    });
  }
});

/**
 * GET /api/ncds/storage
 * Get storage information including disk space and downloaded ENC tiles
 */
router.get('/storage', async (req, res) => {
  try {
    const info = await getStorageInfo();
    res.json(info);
  } catch (error) {
    console.error('[NCDS] Error getting storage info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get storage information'
    });
  }
});

/**
 * GET /api/ncds/downloaded
 * Get list of downloaded ENC regions with metadata
 */
router.get('/downloaded', async (req, res) => {
  try {
    const result = await getDownloadedRegions();
    res.json(result);
  } catch (error) {
    console.error('[NCDS] Error getting downloaded regions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get downloaded regions'
    });
  }
});

/**
 * POST /api/ncds/download/start
 * Start downloading specified NCDS regions
 * Body: { regions: ['ncds_02a', 'ncds_02b'] }
 */
router.post('/download/start', async (req, res) => {
  try {
    const { regions } = req.body;

    if (!regions || !Array.isArray(regions) || regions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Must provide array of region IDs to download'
      });
    }

    const jobId = await startDownloadJob(regions);

    res.json({
      success: true,
      jobId,
      regionCount: regions.length,
      message: `Started download of ${regions.length} region(s)`
    });
  } catch (error) {
    console.error('[NCDS] Error starting download:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start download'
    });
  }
});

/**
 * GET /api/ncds/download/jobs/:id/status
 * Get status of a download job
 */
router.get('/download/jobs/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const status = getJobStatus(id);
    res.json(status);
  } catch (error) {
    console.error('[NCDS] Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

/**
 * DELETE /api/ncds/download/jobs/:id
 * Cancel a running download job
 */
router.delete('/download/jobs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = cancelJob(id);
    res.json(result);
  } catch (error) {
    console.error('[NCDS] Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job'
    });
  }
});

/**
 * GET /api/ncds/check-updates
 * Check if downloaded regions have updates available from NOAA
 */
router.get('/check-updates', async (req, res) => {
  try {
    const result = await checkForUpdates();
    res.json(result);
  } catch (error) {
    console.error('[NCDS] Error checking for updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for updates'
    });
  }
});

/**
 * DELETE /api/ncds/regions/:id
 * Delete a downloaded region
 */
router.delete('/regions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteRegion(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[NCDS] Error deleting region:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete region'
    });
  }
});

/**
 * POST /api/ncds/restart-martin
 * Manually restart Martin tileserver to reload ENC tiles
 */
router.post('/restart-martin', async (req, res) => {
  try {
    const result = await restartMartin();
    res.json(result);
  } catch (error) {
    console.error('[NCDS] Error restarting Martin:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restart Martin tileserver'
    });
  }
});

/**
 * GET /api/ncds/martin-status
 * Check if Martin tileserver is running
 */
router.get('/martin-status', async (req, res) => {
  try {
    const status = await getMartinStatus();
    res.json(status);
  } catch (error) {
    console.error('[NCDS] Error checking Martin status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check Martin status'
    });
  }
});

export default router;
