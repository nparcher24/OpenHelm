/**
 * S-57 Vector ENC API Routes
 * GeoJSON served directly to MapLibre (no Martin/tippecanoe)
 */

import express from 'express';
import {
  getAvailableRegions,
  getStorageInfo,
  getDownloadedRegions,
  getRegionLayers,
  startDownloadJob,
  getJobStatus,
  cancelJob,
  checkForUpdates,
  deleteRegion,
  deleteRawData
} from '../services/s57DownloadService.js';

const router = express.Router();

router.get('/regions', (req, res) => {
  try {
    res.json({ success: true, regions: getAvailableRegions() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get available regions' });
  }
});

router.get('/storage', async (req, res) => {
  try {
    res.json(await getStorageInfo());
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get storage information' });
  }
});

router.get('/downloaded', async (req, res) => {
  try {
    res.json(await getDownloadedRegions());
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get downloaded regions' });
  }
});

/**
 * GET /api/s57/regions/:id/layers
 * Get available GeoJSON layers for a downloaded region
 */
router.get('/regions/:id/layers', async (req, res) => {
  try {
    res.json(await getRegionLayers(req.params.id));
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get region layers' });
  }
});

router.post('/download/start', async (req, res) => {
  try {
    const { regions } = req.body;
    if (!regions || !Array.isArray(regions) || regions.length === 0) {
      return res.status(400).json({ success: false, error: 'Must provide array of region IDs' });
    }
    const jobId = await startDownloadJob(regions);
    res.json({ success: true, jobId, regionCount: regions.length, message: `Started S-57 processing of ${regions.length} region(s)` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to start download' });
  }
});

router.get('/download/jobs/:id/status', (req, res) => {
  try {
    res.json(getJobStatus(req.params.id));
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get job status' });
  }
});

router.delete('/download/jobs/:id', (req, res) => {
  try {
    res.json(cancelJob(req.params.id));
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to cancel job' });
  }
});

router.get('/check-updates', async (req, res) => {
  try {
    res.json(await checkForUpdates());
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check for updates' });
  }
});

router.delete('/regions/:id', async (req, res) => {
  try {
    const result = await deleteRegion(req.params.id);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete region' });
  }
});

router.delete('/regions/:id/raw', async (req, res) => {
  try {
    res.json(await deleteRawData(req.params.id));
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete raw data' });
  }
});

export default router;
