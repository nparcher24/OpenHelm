import express from 'express';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NOAA BlueTopo tile scheme S3 bucket info
const S3_BUCKET_URL = 'https://noaa-ocs-nationalbathymetry-pds.s3.amazonaws.com';
const TILE_SCHEME_PREFIX = 'BlueTopo/_BlueTopo_Tile_Scheme/';
const INDEX_URL = `${S3_BUCKET_URL}/index.html#${TILE_SCHEME_PREFIX}`;

/**
 * GET /api/bluetopo/tile-scheme/latest
 * Fetches the S3 bucket index and returns the latest tile scheme file info
 */
router.get('/tile-scheme/latest', async (req, res) => {
  try {

    // Fetch the S3 bucket listing XML
    const listUrl = `${S3_BUCKET_URL}/?prefix=${TILE_SCHEME_PREFIX}&delimiter=/`;
    const response = await fetch(listUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch S3 listing: ${response.statusText}`);
    }

    const xmlText = await response.text();

    // Parse XML to find .gpkg files
    const parser = new XMLParser();
    const result = parser.parse(xmlText);

    // Extract contents
    const contents = result.ListBucketResult?.Contents;
    if (!contents) {
      return res.status(404).json({ error: 'No files found in bucket' });
    }

    // Filter for .gpkg files and find the most recent
    const gpkgFiles = (Array.isArray(contents) ? contents : [contents])
      .filter(item => item.Key && item.Key.endsWith('.gpkg'))
      .map(item => ({
        key: item.Key,
        filename: item.Key.split('/').pop(),
        lastModified: new Date(item.LastModified),
        size: parseInt(item.Size),
        url: `${S3_BUCKET_URL}/${item.Key}`
      }))
      .sort((a, b) => b.lastModified - a.lastModified);

    if (gpkgFiles.length === 0) {
      return res.status(404).json({ error: 'No .gpkg files found' });
    }

    const latest = gpkgFiles[0];

    res.json({
      filename: latest.filename,
      url: latest.url,
      lastModified: latest.lastModified.toISOString(),
      size: latest.size,
      sizeFormatted: formatBytes(latest.size),
      indexUrl: INDEX_URL
    });

  } catch (error) {
    console.error('Error fetching tile scheme info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bluetopo/tile-scheme/local
 * Returns info about the local tile scheme file
 */
router.get('/tile-scheme/local', async (req, res) => {
  try {
    // Find local .gpkg files
    const projectRoot = path.resolve(__dirname, '../..');

    // Read all files in the project root
    const allFiles = await fs.readdir(projectRoot);

    // Filter for BlueTopo tile scheme files
    const gpkgFiles = allFiles.filter(file =>
      file.startsWith('BlueTopo_Tile_Scheme_') && file.endsWith('.gpkg')
    );

    if (gpkgFiles.length === 0) {
      return res.json({ exists: false });
    }

    // Get the most recent file
    const fileStats = await Promise.all(
      gpkgFiles.map(async (filename) => {
        const filePath = path.join(projectRoot, filename);
        const stats = await fs.stat(filePath);
        return {
          path: filePath,
          filename: filename,
          lastModified: stats.mtime,
          size: stats.size
        };
      })
    );

    const latest = fileStats.sort((a, b) => b.lastModified - a.lastModified)[0];

    res.json({
      exists: true,
      filename: latest.filename,
      lastModified: latest.lastModified.toISOString(),
      size: latest.size,
      sizeFormatted: formatBytes(latest.size),
      path: latest.path
    });

  } catch (error) {
    console.error('Error checking local tile scheme:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bluetopo/tile-scheme/download
 * Downloads the latest tile scheme file from S3
 */
router.post('/tile-scheme/download', async (req, res) => {
  const { url, filename } = req.body;

  if (!url || !filename) {
    return res.status(400).json({ error: 'Missing url or filename' });
  }

  try {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputPath = path.join(projectRoot, filename);

    console.log(`Downloading tile scheme from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    const fileStream = fsSync.createWriteStream(outputPath);

    // Pipe the response to file
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    console.log(`Downloaded tile scheme to: ${outputPath}`);

    res.json({
      success: true,
      filename: filename,
      path: outputPath
    });

  } catch (error) {
    console.error('Error downloading tile scheme:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Import download service
import {
  getStorageInfo,
  startDownloadJob,
  getJobStatus,
  cancelJob
} from '../services/blueTopoDownloadService.js';

// Import for GeoPackage querying
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * GET /api/bluetopo/tiles/downloaded
 * Check which tiles are downloaded and get their metadata
 */
router.get('/tiles/downloaded', async (req, res) => {
  try {
    const projectRoot = path.resolve(__dirname, '../..');
    const tilesDir = path.join(projectRoot, 'tiles', 'bluetopo');

    // Check if tiles directory exists
    let tileDirectories = [];
    try {
      const entries = await fs.readdir(tilesDir, { withFileTypes: true });
      tileDirectories = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      // Directory doesn't exist, return empty array
      return res.json({ success: true, tiles: [] });
    }

    // Find the tile scheme GeoPackage
    const allFiles = await fs.readdir(projectRoot);
    const gpkgFiles = allFiles.filter(file =>
      file.startsWith('BlueTopo_Tile_Scheme_') && file.endsWith('.gpkg')
    );

    if (gpkgFiles.length === 0) {
      return res.json({
        success: true,
        tiles: tileDirectories.map(tileId => ({
          tileId,
          downloadedDate: null,
          publishedDate: null,
          version: null,
          error: 'Tile scheme not found'
        }))
      });
    }

    // Get the most recent tile scheme
    const tileScheme = gpkgFiles.sort().reverse()[0];
    const tileSchemeVersion = tileScheme.match(/\d{8}_\d{6}/)?.[0] || 'unknown';
    const tileSchemePath = path.join(projectRoot, tileScheme);

    // Query metadata for each downloaded tile
    const tilesWithMetadata = await Promise.all(
      tileDirectories.map(async (tileId) => {
        const tilePath = path.join(tilesDir, tileId);

        // Get download date from directory modification time
        const stats = await fs.stat(tilePath);
        const downloadedDate = stats.mtime.toISOString();

        // Query GeoPackage for tile metadata
        try {
          const query = `ogrinfo -al -where "tile='${tileId}'" "${tileSchemePath}" 2>/dev/null | grep -E "(Delivered_Date|GeoTIFF_Link)"`;
          const { stdout } = await execAsync(query);

          // Extract delivered date and version from output
          const deliveredMatch = stdout.match(/Delivered_Date \(String\) = (.+)/);
          const linkMatch = stdout.match(/GeoTIFF_Link \(String\) = .+_(\d{8})\.tiff/);

          const publishedDate = deliveredMatch ? deliveredMatch[1].trim() : null;
          const version = linkMatch ? linkMatch[1] : null;

          return {
            tileId,
            downloadedDate,
            publishedDate,
            version,
            tileSchemeVersion
          };
        } catch (error) {
          // If query fails, return partial info
          return {
            tileId,
            downloadedDate,
            publishedDate: null,
            version: null,
            tileSchemeVersion,
            error: 'Metadata not found'
          };
        }
      })
    );

    res.json({
      success: true,
      tiles: tilesWithMetadata,
      tileSchemeVersion
    });

  } catch (error) {
    console.error('Error checking downloaded tiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/bluetopo/tiles/:tileId
 * Delete a downloaded tile from the device
 */
router.delete('/tiles/:tileId', async (req, res) => {
  try {
    const { tileId } = req.params;
    const projectRoot = path.resolve(__dirname, '../..');
    const tilePath = path.join(projectRoot, 'tiles', 'bluetopo', tileId);

    // Check if tile directory exists
    try {
      await fs.access(tilePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Tile not found'
      });
    }

    // Delete the entire tile directory
    await fs.rm(tilePath, { recursive: true, force: true });

    console.log(`[BlueTopo] Deleted tile: ${tileId}`);

    res.json({
      success: true,
      message: `Tile ${tileId} deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting tile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bluetopo/tiles/delete-batch
 * Delete multiple tiles at once
 */
router.post('/tiles/delete-batch', async (req, res) => {
  try {
    const { tileIds } = req.body;

    if (!tileIds || !Array.isArray(tileIds) || tileIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid tileIds array'
      });
    }

    const projectRoot = path.resolve(__dirname, '../..');
    const results = {
      deleted: [],
      failed: []
    };

    // Delete each tile
    for (const tileId of tileIds) {
      const tilePath = path.join(projectRoot, 'tiles', 'bluetopo', tileId);

      try {
        await fs.access(tilePath);
        await fs.rm(tilePath, { recursive: true, force: true });
        results.deleted.push(tileId);
        console.log(`[BlueTopo] Deleted tile: ${tileId}`);
      } catch (error) {
        results.failed.push({ tileId, error: error.message });
        console.error(`[BlueTopo] Failed to delete tile ${tileId}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `Deleted ${results.deleted.length} of ${tileIds.length} tiles`,
      results
    });

  } catch (error) {
    console.error('Error in batch delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bluetopo/storage
 * Get disk space and BlueTopo tiles storage information
 */
router.get('/storage', async (req, res) => {
  try {
    const storageInfo = await getStorageInfo();
    res.json(storageInfo);
  } catch (error) {
    console.error('Error getting storage info:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bluetopo/download/start
 * Start downloading selected BlueTopo tiles
 */
router.post('/download/start', async (req, res) => {
  const { tiles, maxParallel } = req.body;

  if (!tiles || !Array.isArray(tiles) || tiles.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid tiles array'
    });
  }

  try {
    // Check disk space before starting
    const storageInfo = await getStorageInfo();
    const neededGB = (tiles.length * 170 * 1.5) / 1024; // 170 MB per tile × 1.5 for temp space
    const freeGB = storageInfo.disk.freeGB;

    if (freeGB < neededGB) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient disk space',
        message: `Need ${neededGB.toFixed(2)} GB, only ${freeGB} GB free`
      });
    }

    // Start download job
    const jobId = await startDownloadJob(tiles, maxParallel || 3);

    res.json({
      success: true,
      jobId,
      message: 'BlueTopo download started',
      tileCount: tiles.length,
      estimatedSizeMB: tiles.length * 170,
      websocketUrl: 'ws://localhost:3002'
    });

  } catch (error) {
    console.error('Error starting BlueTopo download:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bluetopo/download/jobs/:jobId/status
 * Get status of a download job (polling fallback)
 */
router.get('/download/jobs/:jobId/status', (req, res) => {
  const { jobId } = req.params;

  try {
    const status = getJobStatus(jobId);
    res.json(status);
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/bluetopo/download/jobs/:jobId
 * Cancel a download job
 */
router.delete('/download/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;

  try {
    const result = cancelJob(jobId);
    res.json(result);
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
