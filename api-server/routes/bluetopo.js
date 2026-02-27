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
    const latest = await findLatestValidGpkg();

    if (!latest) {
      return res.json({ exists: false });
    }

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

    // Verify downloaded file is not 0 bytes
    const stats = await fs.stat(outputPath);
    if (stats.size === 0) {
      await fs.unlink(outputPath);
      throw new Error('Downloaded file is 0 bytes - deleted');
    }

    console.log(`Downloaded tile scheme to: ${outputPath} (${formatBytes(stats.size)})`);

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

// Cache for tile-scheme/tiles endpoint (10 minute TTL)
let tileSchemeCache = { data: null, timestamp: 0, gpkgFilename: null };
const TILE_SCHEME_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/bluetopo/tile-scheme/tiles
 * Returns all tiles from the local GeoPackage as JSON.
 * Query params:
 *   refresh=true - check NOAA for a newer GeoPackage first
 */
router.get('/tile-scheme/tiles', async (req, res) => {
  const { refresh } = req.query;
  const projectRoot = path.resolve(__dirname, '../..');

  try {
    // If refresh requested, check NOAA for a newer GeoPackage
    if (refresh === 'true') {
      try {
        const listUrl = `${S3_BUCKET_URL}/?prefix=${TILE_SCHEME_PREFIX}&delimiter=/`;
        const response = await fetch(listUrl);

        if (response.ok) {
          const xmlText = await response.text();
          const parser = new XMLParser();
          const result = parser.parse(xmlText);
          const contents = result.ListBucketResult?.Contents;

          if (contents) {
            const remoteFiles = (Array.isArray(contents) ? contents : [contents])
              .filter(item => item.Key && item.Key.endsWith('.gpkg'))
              .map(item => ({
                filename: item.Key.split('/').pop(),
                lastModified: new Date(item.LastModified),
                url: `${S3_BUCKET_URL}/${item.Key}`
              }))
              .sort((a, b) => b.lastModified - a.lastModified);

            if (remoteFiles.length > 0) {
              const latest = remoteFiles[0];
              const localPath = path.join(projectRoot, latest.filename);

              // Check if we already have this version (and it's valid)
              let alreadyHaveValid = false;
              try {
                const localStats = await fs.stat(localPath);
                alreadyHaveValid = localStats.size > 0;
              } catch { /* doesn't exist */ }

              if (!alreadyHaveValid) {
                // Delete stale 0-byte file if it exists
                try { await fs.unlink(localPath); } catch { /* doesn't exist */ }

                console.log(`[BlueTopo] Downloading newer GeoPackage: ${latest.filename}`);
                const dlResponse = await fetch(latest.url);
                if (dlResponse.ok) {
                  const contentLength = parseInt(dlResponse.headers.get('content-length') || '0', 10);
                  if (contentLength === 0) {
                    console.error('[BlueTopo] GeoPackage has content-length 0, skipping download');
                  } else {
                    const fileStream = fsSync.createWriteStream(localPath);
                    await new Promise((resolve, reject) => {
                      dlResponse.body.pipe(fileStream);
                      dlResponse.body.on('error', reject);
                      fileStream.on('finish', resolve);
                    });
                    const dlStats = await fs.stat(localPath);
                    if (dlStats.size === 0) {
                      await fs.unlink(localPath);
                      console.error('[BlueTopo] Downloaded GeoPackage is 0 bytes - deleted');
                    } else {
                      console.log(`[BlueTopo] Downloaded GeoPackage: ${latest.filename} (${formatBytes(dlStats.size)})`);
                      // Invalidate cache since we have a new file
                      tileSchemeCache = { data: null, timestamp: 0, gpkgFilename: null };
                    }
                  }
                }
              }
            }
          }
        }
      } catch (refreshError) {
        console.error('[BlueTopo] NOAA refresh failed (using local):', refreshError.message);
      }
    }

    // Find latest valid local GeoPackage
    const latestGpkg = await findLatestValidGpkg();
    if (!latestGpkg) {
      return res.status(404).json({ error: 'No valid tile scheme GeoPackage found' });
    }

    // Check cache (valid if same file and within TTL)
    const now = Date.now();
    if (
      tileSchemeCache.data &&
      tileSchemeCache.gpkgFilename === latestGpkg.filename &&
      (now - tileSchemeCache.timestamp) < TILE_SCHEME_CACHE_TTL
    ) {
      return res.json(tileSchemeCache.data);
    }

    // Query GeoPackage via ogr2ogr to produce GeoJSON
    const layerName = latestGpkg.filename.replace('.gpkg', '');
    const cmd = `ogr2ogr -f GeoJSON /dev/stdout "${latestGpkg.path}" "${layerName}" -select "tile,GeoTIFF_Link,Resolution,UTM,Delivered_Date" 2>/dev/null`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 20 * 1024 * 1024 });

    const geojson = JSON.parse(stdout);

    // Transform GeoJSON features into flat tile objects matching CSV schema
    const tiles = geojson.features
      .filter(f => f.properties.tile && f.geometry)
      .map(f => {
        const p = f.properties;
        // Compute bounds from geometry coordinates
        const coords = f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates.flat(2)
          : f.geometry.coordinates.flat(1);
        const lngs = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);

        return {
          tile: p.tile,
          url: p.GeoTIFF_Link,
          resolution: p.Resolution || 'Unknown',
          utm: p.UTM,
          date: p.Delivered_Date,
          minx: Math.min(...lngs),
          miny: Math.min(...lats),
          maxx: Math.max(...lngs),
          maxy: Math.max(...lats),
        };
      });

    const result = {
      tiles,
      count: tiles.length,
      gpkgFilename: latestGpkg.filename,
      gpkgDate: latestGpkg.lastModified.toISOString(),
    };

    // Cache result
    tileSchemeCache = { data: result, timestamp: now, gpkgFilename: latestGpkg.filename };

    res.json(result);

  } catch (error) {
    console.error('[BlueTopo] Error serving tile scheme tiles:', error);
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
  cancelJob,
  checkRawFileExists,
  deleteRawFile,
  deleteRawFilesBatch,
  getRawFiles,
  reprocessAllRawFiles
} from '../services/blueTopoDownloadService.js';

// Import for GeoPackage querying
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Per-resolution average tile size estimates (MB) for disk space calculations
const TILE_SIZE_ESTIMATES_MB = { '2m': 500, '4m': 250, '8m': 170, '16m': 100 };
const DEFAULT_TILE_SIZE_MB = 170;

/**
 * Estimate total download size for a set of tiles using per-resolution averages
 * @param {Array} tiles - Array of tile objects with resolution field
 * @returns {number} Estimated total size in MB
 */
function quickEstimateMB(tiles) {
  return tiles.reduce((total, tile) => {
    const res = tile.resolution || tile.res;
    return total + (TILE_SIZE_ESTIMATES_MB[res] || DEFAULT_TILE_SIZE_MB);
  }, 0);
}

/**
 * Find the latest valid (non-zero size) GeoPackage file in the project root.
 * @returns {Promise<{path: string, filename: string, size: number, lastModified: Date}|null>}
 */
async function findLatestValidGpkg() {
  const projectRoot = path.resolve(__dirname, '../..');
  const allFiles = await fs.readdir(projectRoot);
  const gpkgFiles = allFiles.filter(file =>
    file.startsWith('BlueTopo_Tile_Scheme_') && file.endsWith('.gpkg')
  );

  if (gpkgFiles.length === 0) return null;

  const fileStats = await Promise.all(
    gpkgFiles.map(async (filename) => {
      const filePath = path.join(projectRoot, filename);
      const stats = await fs.stat(filePath);
      return { path: filePath, filename, lastModified: stats.mtime, size: stats.size };
    })
  );

  // Filter out 0-byte files and sort by modification time (newest first)
  const valid = fileStats.filter(f => f.size > 0).sort((a, b) => b.lastModified - a.lastModified);
  return valid.length > 0 ? valid[0] : null;
}

/**
 * Clean up 0-byte GeoPackage files at startup
 */
async function cleanupZeroByteGpkg() {
  const projectRoot = path.resolve(__dirname, '../..');
  try {
    const allFiles = await fs.readdir(projectRoot);
    const gpkgFiles = allFiles.filter(file =>
      file.startsWith('BlueTopo_Tile_Scheme_') && file.endsWith('.gpkg')
    );
    for (const filename of gpkgFiles) {
      const filePath = path.join(projectRoot, filename);
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        await fs.unlink(filePath);
        console.log(`[BlueTopo] Cleaned up 0-byte GeoPackage: ${filename}`);
      }
    }
  } catch (error) {
    console.error('[BlueTopo] Error cleaning up 0-byte GeoPackages:', error.message);
  }
}

// Run cleanup on module load
cleanupZeroByteGpkg();

/**
 * GET /api/bluetopo/tiles/downloaded
 * Check which tiles are downloaded - FAST version
 * Just reads directory listing, no expensive GeoPackage queries
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
      return res.json({ success: true, tiles: [], count: 0 });
    }

    // Just return tile IDs - fast!
    // Only get basic stats if there are few tiles
    let tiles;
    if (tileDirectories.length <= 50) {
      // Get basic stats for small number of tiles
      tiles = await Promise.all(
        tileDirectories.map(async (tileId) => {
          const tilePath = path.join(tilesDir, tileId);
          try {
            const stats = await fs.stat(tilePath);
            return {
              tileId,
              downloadedDate: stats.mtime.toISOString()
            };
          } catch {
            return { tileId };
          }
        })
      );
    } else {
      // For many tiles, just return IDs
      tiles = tileDirectories.map(tileId => ({ tileId }));
    }

    res.json({
      success: true,
      tiles,
      count: tiles.length
    });

  } catch (error) {
    console.error('Error checking downloaded tiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bluetopo/tiles/downloaded/:tileId
 * Get detailed metadata for a single tile (with GeoPackage query)
 */
router.get('/tiles/downloaded/:tileId', async (req, res) => {
  try {
    const { tileId } = req.params;
    const projectRoot = path.resolve(__dirname, '../..');
    const tilesDir = path.join(projectRoot, 'tiles', 'bluetopo');
    const tilePath = path.join(tilesDir, tileId);

    // Check if tile exists
    try {
      await fs.access(tilePath);
    } catch {
      return res.status(404).json({ success: false, error: 'Tile not found' });
    }

    // Get basic stats
    const stats = await fs.stat(tilePath);
    const downloadedDate = stats.mtime.toISOString();

    // Check raw file
    const rawFileInfo = await checkRawFileExists(tileId);

    // Find tile scheme for metadata
    let publishedDate = null;
    let version = null;
    let tileSchemeVersion = 'unknown';

    const latestGpkg = await findLatestValidGpkg();
    if (latestGpkg) {
      const tileScheme = latestGpkg.filename;
      tileSchemeVersion = tileScheme.match(/\d{8}_\d{6}/)?.[0] || 'unknown';
      const tileSchemePath = latestGpkg.path;

      try {
        const query = `ogrinfo -al -where "tile='${tileId}'" "${tileSchemePath}" 2>/dev/null | grep -E "(Delivered_Date|GeoTIFF_Link)"`;
        const { stdout } = await execAsync(query);
        const deliveredMatch = stdout.match(/Delivered_Date \(String\) = (.+)/);
        const linkMatch = stdout.match(/GeoTIFF_Link \(String\) = .+_(\d{8})\.tiff/);
        publishedDate = deliveredMatch ? deliveredMatch[1].trim() : null;
        version = linkMatch ? linkMatch[1] : null;
      } catch {
        // Ignore errors
      }
    }

    res.json({
      success: true,
      tile: {
        tileId,
        downloadedDate,
        publishedDate,
        version,
        tileSchemeVersion,
        rawFile: rawFileInfo
      }
    });

  } catch (error) {
    console.error('Error getting tile details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bluetopo/tiles/metadata
 * Get tile metadata (bounds, zoom levels) for map display
 * Parses tilemapresource.xml from each downloaded tile
 */
router.get('/tiles/metadata', async (req, res) => {
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
      return res.json({ success: true, tiles: [] });
    }

    // Parse tilemapresource.xml for each tile
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ''
    });

    const tilesMetadata = await Promise.all(
      tileDirectories.map(async (tileId) => {
        const xmlPath = path.join(tilesDir, tileId, 'tilemapresource.xml');

        try {
          const xmlContent = await fs.readFile(xmlPath, 'utf8');
          const parsed = parser.parse(xmlContent);
          const tileMap = parsed.TileMap;
          const boundingBox = tileMap.BoundingBox;
          const tileSets = tileMap.TileSets?.TileSet;

          // Get zoom levels from TileSets
          const zoomLevels = Array.isArray(tileSets)
            ? tileSets.map(ts => parseInt(ts.order))
            : [parseInt(tileSets?.order || 8)];

          const minZoom = Math.min(...zoomLevels);
          const maxZoom = Math.max(...zoomLevels);

          return {
            tileId,
            bounds: [
              parseFloat(boundingBox.minx),
              parseFloat(boundingBox.miny),
              parseFloat(boundingBox.maxx),
              parseFloat(boundingBox.maxy)
            ],
            minZoom,
            maxZoom,
            srs: tileMap.SRS || 'EPSG:3857'
          };
        } catch (error) {
          // If XML parsing fails, return null (will be filtered out)
          console.error(`Failed to parse metadata for tile ${tileId}:`, error.message);
          return null;
        }
      })
    );

    // Filter out any tiles that failed to parse
    const validTiles = tilesMetadata.filter(t => t !== null);

    res.json({
      success: true,
      tiles: validTiles,
      count: validTiles.length
    });

  } catch (error) {
    console.error('Error getting tile metadata:', error);
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
    // Check disk space before starting (use resolution-aware estimates)
    const storageInfo = await getStorageInfo();
    const estimatedMB = quickEstimateMB(tiles);
    const neededGB = (estimatedMB * 1.5) / 1024; // × 1.5 for temp space
    const freeGB = storageInfo.disk.freeGB;

    if (freeGB < neededGB) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient disk space',
        message: `Need ~${neededGB.toFixed(1)} GB, only ${freeGB} GB free`
      });
    }

    // Start download job
    const jobId = await startDownloadJob(tiles, maxParallel || 3);

    res.json({
      success: true,
      jobId,
      message: 'BlueTopo download started',
      tileCount: tiles.length,
      estimatedSizeMB: estimatedMB,
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

/**
 * GET /api/bluetopo/raw-files
 * Get list of all raw GeoTIFF files
 */
router.get('/raw-files', async (req, res) => {
  try {
    const result = await getRawFiles();
    res.json(result);
  } catch (error) {
    console.error('Error getting raw files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/bluetopo/raw-files/:tileId
 * Delete a raw GeoTIFF file
 */
router.delete('/raw-files/:tileId', async (req, res) => {
  try {
    const { tileId } = req.params;
    const result = await deleteRawFile(tileId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting raw file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bluetopo/raw-files/delete-batch
 * Delete multiple raw files at once
 */
router.post('/raw-files/delete-batch', async (req, res) => {
  try {
    const { tileIds } = req.body;

    if (!tileIds || !Array.isArray(tileIds) || tileIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid tileIds array'
      });
    }

    const result = await deleteRawFilesBatch(tileIds);
    res.json(result);
  } catch (error) {
    console.error('Error in batch delete raw files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bluetopo/raw-files/reprocess-all
 * Reprocess all available raw GeoTIFF files
 */
router.post('/raw-files/reprocess-all', async (req, res) => {
  try {
    const result = await reprocessAllRawFiles();
    res.json(result);
  } catch (error) {
    console.error('Error reprocessing raw files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bluetopo/tiles/check-updates
 * Check if downloaded tiles have newer versions available
 * Query params: online=true (optional - fetch latest GeoPackage from S3 first)
 */
router.get('/tiles/check-updates', async (req, res) => {
  try {
    const { online } = req.query;
    const projectRoot = path.resolve(__dirname, '../..');
    const tilesDir = path.join(projectRoot, 'tiles', 'bluetopo');

    // Get list of downloaded tile directories
    let tileDirectories = [];
    try {
      const entries = await fs.readdir(tilesDir, { withFileTypes: true });
      tileDirectories = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      return res.json({
        success: true,
        tiles: [],
        summary: { upToDate: 0, outdated: 0, unknown: 0, totalChecked: 0 }
      });
    }

    if (tileDirectories.length === 0) {
      return res.json({
        success: true,
        tiles: [],
        summary: { upToDate: 0, outdated: 0, unknown: 0, totalChecked: 0 }
      });
    }

    // If online mode requested, download latest GeoPackage first
    if (online === 'true') {
      try {
        console.log('[BlueTopo] Online mode: Fetching latest GeoPackage info...');
        const listUrl = `${S3_BUCKET_URL}/?prefix=${TILE_SCHEME_PREFIX}&delimiter=/`;
        const response = await fetch(listUrl);

        if (response.ok) {
          const xmlText = await response.text();
          const parser = new XMLParser();
          const result = parser.parse(xmlText);
          const contents = result.ListBucketResult?.Contents;

          if (contents) {
            const gpkgFiles = (Array.isArray(contents) ? contents : [contents])
              .filter(item => item.Key && item.Key.endsWith('.gpkg'))
              .map(item => ({
                key: item.Key,
                filename: item.Key.split('/').pop(),
                lastModified: new Date(item.LastModified),
                url: `${S3_BUCKET_URL}/${item.Key}`
              }))
              .sort((a, b) => b.lastModified - a.lastModified);

            if (gpkgFiles.length > 0) {
              const latest = gpkgFiles[0];
              const localPath = path.join(projectRoot, latest.filename);

              // Check if we already have this version (and it's valid)
              let alreadyHaveValid = false;
              try {
                const localStats = await fs.stat(localPath);
                alreadyHaveValid = localStats.size > 0;
              } catch {
                // File doesn't exist
              }

              if (alreadyHaveValid) {
                console.log('[BlueTopo] Latest GeoPackage already exists locally');
              } else {
                // Download the latest GeoPackage
                console.log(`[BlueTopo] Downloading latest GeoPackage: ${latest.filename}`);
                const downloadResponse = await fetch(latest.url);
                if (downloadResponse.ok) {
                  const fileStream = fsSync.createWriteStream(localPath);
                  await new Promise((resolve, reject) => {
                    downloadResponse.body.pipe(fileStream);
                    downloadResponse.body.on('error', reject);
                    fileStream.on('finish', resolve);
                  });
                  // Verify downloaded file
                  const dlStats = await fs.stat(localPath);
                  if (dlStats.size === 0) {
                    await fs.unlink(localPath);
                    console.error('[BlueTopo] Downloaded GeoPackage is 0 bytes - deleted');
                  } else {
                    console.log(`[BlueTopo] Downloaded latest GeoPackage (${formatBytes(dlStats.size)})`);
                  }
                }
              }
            }
          }
        }
      } catch (onlineError) {
        console.error('[BlueTopo] Failed to fetch online GeoPackage:', onlineError.message);
        // Continue with local GeoPackage
      }
    }

    // Find local tile scheme GeoPackage (valid, non-zero)
    const latestGpkg = await findLatestValidGpkg();

    if (!latestGpkg) {
      return res.status(400).json({
        success: false,
        error: 'No tile scheme GeoPackage found. Please download it first.'
      });
    }

    const tileScheme = latestGpkg.filename;
    const tileSchemePath = latestGpkg.path;
    console.log(`[BlueTopo] Using tile scheme: ${tileScheme}`);

    // Get the layer name from the GeoPackage (it includes the date suffix)
    const layerName = tileScheme.replace('.gpkg', '');
    console.log(`[BlueTopo] Layer name: ${layerName}`);

    // Read local version info for each tile
    const tileVersions = new Map();
    for (const tileId of tileDirectories) {
      const versionPath = path.join(tilesDir, tileId, '.version.json');
      try {
        const versionData = await fs.readFile(versionPath, 'utf8');
        tileVersions.set(tileId, JSON.parse(versionData));
      } catch {
        // No version file - treat as unknown version
        tileVersions.set(tileId, { tileId, version: null });
      }
    }

    // Batch query GeoPackage for remote versions (50 tiles per query)
    const BATCH_SIZE = 50;
    const remoteVersions = new Map();

    for (let i = 0; i < tileDirectories.length; i += BATCH_SIZE) {
      const batch = tileDirectories.slice(i, i + BATCH_SIZE);
      const tileList = batch.map(t => `'${t}'`).join(',');

      try {
        const query = `ogrinfo -al -q "${tileSchemePath}" -sql "SELECT tile, GeoTIFF_Link FROM \\"${layerName}\\" WHERE tile IN (${tileList})" 2>/dev/null`;
        const { stdout } = await execAsync(query, { maxBuffer: 10 * 1024 * 1024 });

        // Parse ogrinfo output
        // Format: tile (String) = BC26926V \n GeoTIFF_Link (String) = https://...BC26926V_20221111.tiff
        const lines = stdout.split('\n');
        let currentTile = null;

        for (const line of lines) {
          const tileMatch = line.match(/tile \(String\) = (\w+)/);
          if (tileMatch) {
            currentTile = tileMatch[1];
          }

          const linkMatch = line.match(/GeoTIFF_Link \(String\) = (.+)/);
          if (linkMatch && currentTile) {
            const url = linkMatch[1].trim();
            const versionMatch = url.match(/_(\d{8})\.tiff$/i);
            remoteVersions.set(currentTile, {
              version: versionMatch ? versionMatch[1] : null,
              downloadUrl: url
            });
            currentTile = null;
          }
        }
      } catch (queryError) {
        console.error(`[BlueTopo] Batch query failed:`, queryError.message);
      }
    }

    // Compare versions and build result
    const tiles = [];
    let upToDate = 0;
    let outdated = 0;
    let unknown = 0;

    for (const tileId of tileDirectories) {
      const localInfo = tileVersions.get(tileId);
      const remoteInfo = remoteVersions.get(tileId);

      const localVersion = localInfo?.version || null;
      const remoteVersion = remoteInfo?.version || null;
      const downloadUrl = remoteInfo?.downloadUrl || null;

      let hasUpdate = false;

      if (!localVersion || !remoteVersion) {
        unknown++;
      } else if (remoteVersion > localVersion) {
        hasUpdate = true;
        outdated++;
      } else {
        upToDate++;
      }

      tiles.push({
        tileId,
        localVersion,
        remoteVersion,
        hasUpdate,
        downloadUrl,
        downloadedAt: localInfo?.downloadedAt || null
      });
    }

    // Sort: outdated first, then by tile ID
    tiles.sort((a, b) => {
      if (a.hasUpdate !== b.hasUpdate) return b.hasUpdate - a.hasUpdate;
      return a.tileId.localeCompare(b.tileId);
    });

    res.json({
      success: true,
      tiles,
      summary: {
        upToDate,
        outdated,
        unknown,
        totalChecked: tileDirectories.length
      },
      tileScheme: tileScheme,
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[BlueTopo] Error checking for updates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bluetopo/depth
 * Query depth at a specific location
 * Query params: lat, lon
 */
import { getDepthAtLocation } from '../services/depthQueryService.js';

router.get('/depth', async (req, res) => {
  try {
    const { lat, lon } = req.query;

    // Validate parameters
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lat/lon parameters'
      });
    }

    // Validate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Lat/lon out of valid range'
      });
    }

    // Query depth
    const result = await getDepthAtLocation(longitude, latitude);

    res.json(result);

  } catch (error) {
    console.error('[BlueTopo] Error querying depth:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
