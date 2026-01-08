/**
 * BlueTopo Download Service
 * Handles downloading GeoTIFF tiles from NOAA S3 and converting to MBTiles
 */

import checkDiskSpace from 'check-disk-space';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TILES_DIR = path.join(PROJECT_ROOT, 'tiles', 'bluetopo');
const RAW_FILES_DIR = path.join(PROJECT_ROOT, 'tiles', 'bluetopo_raw');
const TEMP_DIR = '/tmp/bluetopo_downloads';

/**
 * Get storage information for the system and BlueTopo tiles
 */
export async function getStorageInfo() {
  try {
    // Get disk space information
    const diskSpace = await checkDiskSpace('/');

    // Ensure BlueTopo tiles directory exists
    await fs.mkdir(TILES_DIR, { recursive: true });

    // Get existing BlueTopo tiles
    let existingFiles = [];
    try {
      existingFiles = await fs.readdir(TILES_DIR);
    } catch (error) {
      // Directory doesn't exist yet, that's okay
      existingFiles = [];
    }

    // Calculate total size of existing tiles (directories with tile data)
    let totalSizeMB = 0;
    const existingTiles = [];

    for (const file of existingFiles) {
      const filePath = path.join(TILES_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          // Calculate directory size using du
          try {
            const { stdout } = await execAsync(`du -sm "${filePath}"`);
            const sizeMB = parseInt(stdout.split('\t')[0]);
            totalSizeMB += sizeMB;
            existingTiles.push(file);
          } catch (duError) {
            console.warn(`Could not calculate size for ${file}:`, duError.message);
            existingTiles.push(file);
          }
        }
      } catch (error) {
        console.warn(`Could not stat file ${file}:`, error.message);
      }
    }

    return {
      success: true,
      disk: {
        totalGB: parseFloat((diskSpace.size / 1024 / 1024 / 1024).toFixed(2)),
        usedGB: parseFloat(((diskSpace.size - diskSpace.free) / 1024 / 1024 / 1024).toFixed(2)),
        freeGB: parseFloat((diskSpace.free / 1024 / 1024 / 1024).toFixed(2)),
        usedPercent: parseFloat((((diskSpace.size - diskSpace.free) / diskSpace.size) * 100).toFixed(1))
      },
      tiles: {
        bluetopoPath: TILES_DIR,
        existingTiles: existingTiles.length,
        totalSizeMB: parseFloat(totalSizeMB.toFixed(0)),
        existingTileIds: existingTiles
      }
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    throw error;
  }
}

/**
 * Download a file with progress tracking
 * @param {string} url - URL to download from
 * @param {string} destPath - Destination file path
 * @param {function} progressCallback - Called with (downloadedBytes, totalBytes, speedMBps)
 * @param {AbortSignal} signal - AbortController signal for cancellation
 */
async function downloadFileWithProgress(url, destPath, progressCallback, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  let downloadedBytes = 0;
  const startTime = Date.now();
  let lastProgressUpdate = startTime;

  const fileStream = fsSync.createWriteStream(destPath);

  return new Promise(async (resolve, reject) => {
    try {
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          fileStream.end();
          // Final progress update
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          const speedMBps = (downloadedBytes / 1024 / 1024) / elapsedSeconds;
          progressCallback(downloadedBytes, totalBytes, speedMBps);
          resolve();
          break;
        }

        downloadedBytes += value.length;
        fileStream.write(value);

        // Update progress every 500ms
        const now = Date.now();
        if (now - lastProgressUpdate >= 500) {
          const elapsedSeconds = (now - startTime) / 1000;
          const speedMBps = (downloadedBytes / 1024 / 1024) / elapsedSeconds;
          progressCallback(downloadedBytes, totalBytes, speedMBps);
          lastProgressUpdate = now;
        }
      }
    } catch (error) {
      fileStream.close();
      reject(error);
    }
  });
}

/**
 * Convert GeoTIFF to directory tiles format using GDAL with consistent bathymetric color scheme
 * @param {string} geotiffPath - Path to input GeoTIFF file
 * @param {string} outputDir - Path to output directory (e.g., /tiles/bluetopo/TILE_ID/)
 */
async function convertToTiles(geotiffPath, outputDir) {
  try {
    console.log(`[BlueTopo] Converting ${geotiffPath} to directory tiles...`);

    // DELETE the old tile directory completely to ensure fresh tiles
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
      console.log(`[BlueTopo] Deleted old tiles at ${outputDir}`);
    } catch (deleteError) {
      // Directory might not exist, that's fine
    }

    // Ensure output and temp directories exist
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(TEMP_DIR, { recursive: true });

    const timestamp = Date.now();
    const tempFiles = [];

    // Step 1: Generate very strong hillshade (z=20 for maximum feature visibility)
    const hillshadeTiff = path.join(TEMP_DIR, `hillshade_${timestamp}.tiff`);
    tempFiles.push(hillshadeTiff);
    console.log(`[BlueTopo] Generating strong hillshade relief (z=20)...`);
    await execAsync(`gdaldem hillshade "${geotiffPath}" "${hillshadeTiff}" -z 20 -az 315 -alt 35 -compute_edges`);

    // Step 2: Create water mask (1 for water deeper than 1m, 0 for land/shallow/nodata)
    const maskTiff = path.join(TEMP_DIR, `mask_${timestamp}.tiff`);
    tempFiles.push(maskTiff);
    console.log(`[BlueTopo] Creating water mask...`);
    await execAsync(`gdal_calc.py \
      -D "${geotiffPath}" \
      --outfile="${maskTiff}" \
      --calc="numpy.where((D < -1) & (D > -12000), 1, 0)" \
      --type=Byte \
      --NoDataValue=0 \
      --overwrite`);

    // Step 3: Create RGBA composite
    // Blue-dominant with subtle red hillshade for features
    // RGB set to 0 where mask is 0 (land/shallow) for true transparency
    const rgbaTiff = path.join(TEMP_DIR, `rgba_${timestamp}.tiff`);
    tempFiles.push(rgbaTiff);
    console.log(`[BlueTopo] Creating RGBA composite with transparency...`);
    await execAsync(`gdal_calc.py \
      -H "${hillshadeTiff}" \
      -M "${maskTiff}" \
      --outfile="${rgbaTiff}" \
      --calc="numpy.where(M==1, numpy.clip(40 + ((255-H)/255.0)*50, 0, 255), 0)" \
      --calc="numpy.where(M==1, numpy.clip(60 + ((H/255.0)*40), 0, 255), 0)" \
      --calc="numpy.where(M==1, numpy.clip(140 + ((H/255.0)*60), 0, 255), 0)" \
      --calc="M * 255" \
      --type=Byte \
      --overwrite`);

    // Step 4: Warp to Web Mercator
    const warpedTiff = path.join(TEMP_DIR, `warped_${timestamp}.tiff`);
    tempFiles.push(warpedTiff);
    console.log(`[BlueTopo] Warping to Web Mercator...`);
    await execAsync(`gdalwarp \
      -t_srs EPSG:3857 \
      -r bilinear \
      "${rgbaTiff}" "${warpedTiff}"`);

    // Step 5: Generate tiles
    console.log(`[BlueTopo] Generating tiles (zoom 8-14)...`);
    await execAsync(`gdal2tiles.py \
      --zoom=8-14 \
      --processes=2 \
      --resampling=average \
      --webviewer=none \
      "${warpedTiff}" "${outputDir}"`);

    // Step 6: Cleanup temp files
    console.log(`[BlueTopo] Cleaning up temp files...`);
    for (const tempFile of tempFiles) {
      try {
        await fs.unlink(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    console.log(`[BlueTopo] Conversion complete: ${outputDir}`);
    return { success: true, outputPath: outputDir };

  } catch (error) {
    throw new Error(`Conversion failed: ${error.message}`);
  }
}

/**
 * Download Queue - Manages parallel tile downloads
 */
export class DownloadQueue {
  constructor(jobId, tiles, maxParallel = 3) {
    this.jobId = jobId;
    this.tiles = tiles;
    this.maxParallel = maxParallel;
    this.queue = [...tiles];
    this.active = new Map(); // tileId → Promise
    this.completed = [];
    this.failed = [];

    // Initialize temp directory
    this.initTempDir();
  }

  async initTempDir() {
    try {
      await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Start processing the download queue
   */
  async start() {
    console.log(`[BlueTopo Job ${this.jobId}] Starting download of ${this.tiles.length} tiles`);

    // Initialize job in global.activeJobs
    if (!global.activeJobs) {
      global.activeJobs = new Map();
    }

    const job = global.activeJobs.get(this.jobId);
    if (!job) {
      throw new Error(`Job ${this.jobId} not found in activeJobs`);
    }

    // Initialize tile states
    job.tiles = this.tiles.map(tile => ({
      tileId: tile.tile,
      status: 'waiting',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speedMBps: 0,
      estimatedSecondsLeft: 0
    }));

    job.summary = {
      totalTiles: this.tiles.length,
      completedTiles: 0,
      failedTiles: 0,
      downloadingTiles: 0,
      queuedTiles: this.tiles.length
    };

    // Process queue
    while (this.queue.length > 0 || this.active.size > 0) {
      // Check for cancellation
      if (job.controller.signal.aborted) {
        console.log(`[BlueTopo Job ${this.jobId}] Cancelled`);
        await this.cancelAll();
        break;
      }

      // Fill up to maxParallel active downloads
      while (this.active.size < this.maxParallel && this.queue.length > 0) {
        const tile = this.queue.shift();
        this.startTileDownload(tile);

        // Update summary
        job.summary.queuedTiles = this.queue.length;
        job.summary.downloadingTiles = this.active.size;
      }

      // Wait for any active download to complete
      if (this.active.size > 0) {
        await Promise.race([...this.active.values()]);
      }

      // Broadcast overall progress
      this.broadcastProgress();
    }

    // All done
    const finalStatus = this.failed.length > 0 ? 'completed_with_errors' : 'completed';
    const message = this.failed.length > 0
      ? `Completed with ${this.failed.length} failed tiles`
      : `Successfully downloaded ${this.completed.length} tiles`;

    console.log(`[BlueTopo Job ${this.jobId}] ${message}`);

    if (global.broadcastProgress) {
      global.broadcastProgress(this.jobId, 100, finalStatus, message);
    }

    job.status = finalStatus;
    job.result = {
      completed: this.completed,
      failed: this.failed,
      summary: job.summary
    };
  }

  /**
   * Start downloading a single tile
   */
  startTileDownload(tile) {
    const promise = this.processTile(tile)
      .then(() => {
        this.active.delete(tile.tile);
        this.completed.push(tile.tile);

        const job = global.activeJobs.get(this.jobId);
        if (job) {
          job.summary.completedTiles++;
          job.summary.downloadingTiles = this.active.size;
        }
      })
      .catch(error => {
        this.active.delete(tile.tile);
        this.failed.push({ tile: tile.tile, error: error.message });

        const job = global.activeJobs.get(this.jobId);
        if (job) {
          job.summary.failedTiles++;
          job.summary.downloadingTiles = this.active.size;

          // Mark tile as failed
          const tileState = job.tiles.find(t => t.tileId === tile.tile);
          if (tileState) {
            tileState.status = 'failed';
            tileState.error = error.message;
          }
        }

        console.error(`[BlueTopo Job ${this.jobId}] Tile ${tile.tile} failed:`, error.message);
      });

    this.active.set(tile.tile, promise);
  }

  /**
   * Process a single tile: download + convert
   */
  async processTile(tile) {
    const timestamp = Date.now();
    const tempPath = path.join(TEMP_DIR, `${tile.tile}_${timestamp}.tiff`);
    const outputDir = path.join(TILES_DIR, tile.tile);
    const rawFilePath = path.join(RAW_FILES_DIR, `${tile.tile}.tiff`);

    const job = global.activeJobs.get(this.jobId);
    const tileState = job?.tiles.find(t => t.tileId === tile.tile);

    try {
      // Update state: downloading
      if (tileState) {
        tileState.status = 'downloading';
        tileState.startTime = Date.now();
      }

      // Download GeoTIFF with progress tracking
      await downloadFileWithProgress(
        tile.url,
        tempPath,
        (downloadedBytes, totalBytes, speedMBps) => {
          if (tileState) {
            tileState.downloadedBytes = downloadedBytes;
            tileState.totalBytes = totalBytes;
            tileState.speedMBps = parseFloat(speedMBps.toFixed(2));

            // Calculate progress (0-90% for download)
            const downloadProgress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 90 : 0;
            tileState.progress = Math.round(downloadProgress);

            // Estimate time left
            if (speedMBps > 0) {
              const remainingMB = (totalBytes - downloadedBytes) / 1024 / 1024;
              tileState.estimatedSecondsLeft = Math.round(remainingMB / speedMBps);
            }

            // Broadcast progress update (throttled by downloadFileWithProgress to every 500ms)
            this.broadcastProgress();
          }
        },
        job?.controller.signal
      );

      console.log(`[BlueTopo Job ${this.jobId}] Downloaded ${tile.tile} to ${tempPath}`);

      // Update state: converting
      if (tileState) {
        tileState.status = 'converting';
        tileState.progress = 90;
        this.broadcastProgress();
      }

      // Convert to directory tiles
      await convertToTiles(tempPath, outputDir);

      // Copy temp file to raw files directory for retention (development mode)
      try {
        await fs.mkdir(RAW_FILES_DIR, { recursive: true });
        await fs.copyFile(tempPath, rawFilePath);
        console.log(`[BlueTopo Job ${this.jobId}] Retained raw file at ${rawFilePath}`);

        // Delete temp file after successful copy
        await fs.unlink(tempPath);
      } catch (rawFileError) {
        console.error(`[BlueTopo Job ${this.jobId}] Failed to retain raw file:`, rawFileError);
        // Don't fail the job, just clean up temp file
        try {
          await fs.unlink(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }

      // Update state: completed
      if (tileState) {
        tileState.status = 'completed';
        tileState.progress = 100;
        tileState.convertedPath = outputDir;
        tileState.rawFilePath = rawFilePath;
        tileState.endTime = Date.now();
      }

      console.log(`[BlueTopo Job ${this.jobId}] Completed ${tile.tile}`);

    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Broadcast overall progress via WebSocket
   */
  broadcastProgress() {
    const job = global.activeJobs.get(this.jobId);
    if (!job || !global.broadcastProgress) return;

    const summary = job.summary;
    const totalTiles = summary.totalTiles;
    const completedTiles = summary.completedTiles;

    // Calculate overall progress
    let totalProgress = 0;
    job.tiles.forEach(tile => {
      totalProgress += tile.progress;
    });
    const overallProgress = Math.round(totalProgress / totalTiles);

    // Calculate total downloaded size
    const totalDownloadedMB = job.tiles.reduce((sum, tile) =>
      sum + (tile.downloadedBytes / 1024 / 1024), 0
    );
    const totalSizeMB = job.tiles.reduce((sum, tile) =>
      sum + (tile.totalBytes / 1024 / 1024), 0
    );

    // Calculate combined speed
    const combinedSpeedMBps = job.tiles
      .filter(t => t.status === 'downloading')
      .reduce((sum, tile) => sum + tile.speedMBps, 0);

    // Calculate ETA
    let eta = '';
    if (combinedSpeedMBps > 0) {
      const remainingMB = totalSizeMB - totalDownloadedMB;
      const etaSeconds = Math.round(remainingMB / combinedSpeedMBps);
      if (etaSeconds > 60) {
        eta = `${Math.round(etaSeconds / 60)} min`;
      } else {
        eta = `${etaSeconds} sec`;
      }
    }

    const message = `Downloaded ${completedTiles}/${totalTiles} tiles (${totalDownloadedMB.toFixed(1)} / ${totalSizeMB.toFixed(1)} GB)`;

    global.broadcastProgress(this.jobId, overallProgress, 'downloading', message, eta);
  }

  /**
   * Cancel all active downloads
   */
  async cancelAll() {
    console.log(`[BlueTopo Job ${this.jobId}] Cancelling all downloads`);

    // Wait for active downloads to abort
    await Promise.allSettled([...this.active.values()]);

    // Clear queue
    this.queue = [];
    this.active.clear();
  }
}

/**
 * Start a BlueTopo tile download job
 * @param {Array} tiles - Array of tile objects with {tile, url, resolution, minx, miny, maxx, maxy}
 * @param {number} maxParallel - Maximum number of parallel downloads (default 3)
 * @returns {string} jobId
 */
export async function startDownloadJob(tiles, maxParallel = 3) {
  // Generate unique job ID
  const jobId = crypto.randomBytes(8).toString('hex');

  console.log(`[BlueTopo] Starting download job ${jobId} with ${tiles.length} tiles`);

  // Initialize global.activeJobs if needed
  if (!global.activeJobs) {
    global.activeJobs = new Map();
  }

  // Create job record
  const controller = new AbortController();
  global.activeJobs.set(jobId, {
    controller,
    startTime: Date.now(),
    status: 'starting',
    tiles: [],
    summary: {}
  });

  // Initialize progress tracker
  if (!global.progressTrackers) {
    global.progressTrackers = new Map();
  }

  global.progressTrackers.set(jobId, {
    progress: 0,
    status: 'starting',
    clients: new Set()
  });

  // Start download queue asynchronously
  setImmediate(async () => {
    const queue = new DownloadQueue(jobId, tiles, maxParallel);
    try {
      await queue.start();
    } catch (error) {
      console.error(`[BlueTopo Job ${jobId}] Error:`, error);
      const job = global.activeJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
      }
      if (global.broadcastProgress) {
        global.broadcastProgress(jobId, 0, 'failed', error.message);
      }
    }
  });

  return jobId;
}

/**
 * Get status of a download job
 */
export function getJobStatus(jobId) {
  const job = global.activeJobs?.get(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  return {
    success: true,
    jobId,
    status: job.status,
    progress: job.tiles ? Math.round(
      job.tiles.reduce((sum, t) => sum + t.progress, 0) / job.tiles.length
    ) : 0,
    tiles: job.tiles || [],
    summary: job.summary || {},
    error: job.error
  };
}

/**
 * Cancel a download job
 */
export function cancelJob(jobId) {
  const job = global.activeJobs?.get(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  console.log(`[BlueTopo] Cancelling job ${jobId}`);
  job.controller.abort();
  job.status = 'cancelled';

  return { success: true, message: 'Job cancelled' };
}

/**
 * Check if a raw file exists for a tile
 */
export async function checkRawFileExists(tileId) {
  try {
    const rawFilePath = path.join(RAW_FILES_DIR, `${tileId}.tiff`);
    await fs.access(rawFilePath);
    const stats = await fs.stat(rawFilePath);
    return {
      exists: true,
      path: rawFilePath,
      sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(2))
    };
  } catch (error) {
    return { exists: false };
  }
}

/**
 * Delete a raw file for a tile
 */
export async function deleteRawFile(tileId) {
  try {
    const rawFilePath = path.join(RAW_FILES_DIR, `${tileId}.tiff`);
    await fs.unlink(rawFilePath);
    console.log(`[BlueTopo] Deleted raw file: ${rawFilePath}`);
    return { success: true };
  } catch (error) {
    console.error(`[BlueTopo] Failed to delete raw file for ${tileId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete multiple raw files in batch
 */
export async function deleteRawFilesBatch(tileIds) {
  const results = {
    deleted: [],
    failed: []
  };

  for (const tileId of tileIds) {
    const result = await deleteRawFile(tileId);
    if (result.success) {
      results.deleted.push(tileId);
    } else {
      results.failed.push({ tileId, error: result.error });
    }
  }

  return {
    success: true,
    results
  };
}

/**
 * Get all raw files that exist
 */
export async function getRawFiles() {
  try {
    await fs.mkdir(RAW_FILES_DIR, { recursive: true });
    const files = await fs.readdir(RAW_FILES_DIR);

    const rawFiles = [];
    for (const file of files) {
      if (file.endsWith('.tiff')) {
        const tileId = file.replace('.tiff', '');
        const filePath = path.join(RAW_FILES_DIR, file);
        const stats = await fs.stat(filePath);

        rawFiles.push({
          tileId,
          path: filePath,
          sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(2)),
          modifiedDate: stats.mtime
        });
      }
    }

    return { success: true, files: rawFiles };
  } catch (error) {
    console.error('[BlueTopo] Failed to get raw files:', error);
    return { success: false, error: error.message, files: [] };
  }
}

/**
 * Reprocess a single raw file (convert to tiles without re-downloading)
 */
async function reprocessRawFile(tileId) {
  const rawFilePath = path.join(RAW_FILES_DIR, `${tileId}.tiff`);
  const outputDir = path.join(TILES_DIR, tileId);

  try {
    // Check if raw file exists
    await fs.access(rawFilePath);

    console.log(`[BlueTopo] Reprocessing ${tileId} from ${rawFilePath}`);

    // Convert to tiles
    await convertToTiles(rawFilePath, outputDir);

    console.log(`[BlueTopo] Reprocessing complete: ${tileId}`);
    return { success: true, tileId, outputPath: outputDir };

  } catch (error) {
    console.error(`[BlueTopo] Failed to reprocess ${tileId}:`, error);
    return { success: false, tileId, error: error.message };
  }
}

/**
 * Reprocess all available raw files
 */
export async function reprocessAllRawFiles() {
  const jobId = crypto.randomBytes(8).toString('hex');
  console.log(`[BlueTopo] Starting reprocess job ${jobId}`);

  // Get all raw files
  const rawFilesResult = await getRawFiles();
  if (!rawFilesResult.success || rawFilesResult.files.length === 0) {
    return {
      success: false,
      error: 'No raw files available to reprocess',
      jobId
    };
  }

  const rawFiles = rawFilesResult.files;
  console.log(`[BlueTopo] Found ${rawFiles.length} raw files to reprocess`);

  // Initialize job
  if (!global.activeJobs) {
    global.activeJobs = new Map();
  }

  const controller = new AbortController();
  global.activeJobs.set(jobId, {
    controller,
    startTime: Date.now(),
    status: 'processing',
    tiles: rawFiles.map(file => ({
      tileId: file.tileId,
      status: 'waiting',
      progress: 0
    })),
    summary: {
      totalTiles: rawFiles.length,
      completedTiles: 0,
      failedTiles: 0
    }
  });

  // Initialize progress tracker
  if (!global.progressTrackers) {
    global.progressTrackers = new Map();
  }

  global.progressTrackers.set(jobId, {
    progress: 0,
    status: 'processing',
    clients: new Set()
  });

  // Process files asynchronously with parallel processing
  setImmediate(async () => {
    const job = global.activeJobs.get(jobId);
    const results = {
      completed: [],
      failed: []
    };

    const MAX_PARALLEL = 3; // Process 3 tiles concurrently
    let completedCount = 0;

    // Process in parallel batches
    for (let i = 0; i < rawFiles.length; i += MAX_PARALLEL) {
      if (controller.signal.aborted) {
        console.log(`[BlueTopo Job ${jobId}] Cancelled`);
        break;
      }

      const batch = rawFiles.slice(i, i + MAX_PARALLEL);
      const batchPromises = batch.map(async (file) => {
        const tileState = job.tiles.find(t => t.tileId === file.tileId);

        if (tileState) {
          tileState.status = 'converting';
          tileState.progress = 50;
        }

        const result = await reprocessRawFile(file.tileId);

        if (result.success) {
          results.completed.push(file.tileId);
          job.summary.completedTiles++;
          if (tileState) {
            tileState.status = 'completed';
            tileState.progress = 100;
          }
        } else {
          results.failed.push({ tileId: file.tileId, error: result.error });
          job.summary.failedTiles++;
          if (tileState) {
            tileState.status = 'failed';
            tileState.error = result.error;
          }
        }

        return result;
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      completedCount += batch.length;

      // Broadcast progress after each batch
      const progress = Math.round((completedCount / rawFiles.length) * 100);
      if (global.broadcastProgress) {
        global.broadcastProgress(
          jobId,
          progress,
          'processing',
          `Reprocessed ${completedCount}/${rawFiles.length} tiles`
        );
      }
    }

    // Mark job as complete
    const finalStatus = results.failed.length > 0 ? 'completed_with_errors' : 'completed';
    job.status = finalStatus;
    job.result = results;

    if (global.broadcastProgress) {
      global.broadcastProgress(
        jobId,
        100,
        finalStatus,
        `Reprocessed ${results.completed.length} tiles` +
          (results.failed.length > 0 ? `, ${results.failed.length} failed` : '')
      );
    }

    console.log(`[BlueTopo Job ${jobId}] Reprocess complete:`, results);
  });

  return {
    success: true,
    jobId,
    message: `Started reprocessing ${rawFiles.length} raw files`
  };
}
