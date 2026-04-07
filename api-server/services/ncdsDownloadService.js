/**
 * NCDS (NOAA Chart Display Service) Download Service
 * Handles downloading ENC MBTiles from NOAA for offline nautical chart display
 */

import checkDiskSpace from 'check-disk-space';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENC_TILES_DIR = path.join(PROJECT_ROOT, 'tiles', 'enc');

/**
 * NCDS Region metadata
 * NOAA Chart Display Service MBTiles covering US coastal waters
 * Regions without suffix (03-16) cover contiguous US; with suffix (01a-02b, 17+) cover other areas
 */
const NCDS_REGIONS = [
  // === MID-ATLANTIC / CHESAPEAKE (Primary coverage for this app) ===
  {
    id: 'ncds_05',
    name: 'Virginia / Chesapeake Bay',
    description: 'Virginia Beach, Norfolk, Chesapeake Bay, Outer Banks north',
    sizeBytes: 560000000,  // ~534 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_05.mbtiles',
    coverage: '35.5°N to 38.2°N - Virginia coast and Chesapeake Bay',
    bounds: [-77.81, 35.5, -64.95, 38.23]
  },
  {
    id: 'ncds_04',
    name: 'Delaware / Maryland',
    description: 'Delaware Bay, Maryland coast, upper Chesapeake',
    sizeBytes: 600000000,  // ~571 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_04.mbtiles',
    coverage: '38.2°N to 39.7°N - Delaware Bay to Maryland',
    bounds: [-77.81, 38.23, -64.95, 39.73]
  },
  {
    id: 'ncds_06',
    name: 'North Carolina / South Carolina',
    description: 'Cape Hatteras, Outer Banks south, Carolina coast',
    sizeBytes: 392000000,  // ~374 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_06.mbtiles',
    coverage: '32.5°N to 35.5°N - Carolinas coast',
    bounds: [-82.2, 32.54, -64.95, 35.5]
  },
  // === NORTHEAST ===
  {
    id: 'ncds_03',
    name: 'New Jersey / New York',
    description: 'New Jersey coast, New York Harbor, Long Island south',
    sizeBytes: 577000000,  // ~577 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_03.mbtiles',
    coverage: '39.7°N to 41.1°N - New Jersey to New York',
    bounds: [-75.5, 39.73, -64.95, 41.1]
  },
  {
    id: 'ncds_02a',
    name: 'Long Island / Connecticut',
    description: 'Long Island Sound, Connecticut coast',
    sizeBytes: 323000000,  // ~323 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_02a.mbtiles',
    coverage: '41.1°N to 42.8°N - Long Island Sound area',
    bounds: [-76.68, 41.1, -71.08, 42.8]
  },
  {
    id: 'ncds_02b',
    name: 'Massachusetts / Cape Cod',
    description: 'Cape Cod, Massachusetts Bay, Rhode Island',
    sizeBytes: 507000000,  // ~507 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_02b.mbtiles',
    coverage: '41.1°N to 42.8°N - Cape Cod to Boston',
    bounds: [-71.08, 41.1, -64.95, 42.8]
  },
  // === SOUTHEAST / GULF ===
  {
    id: 'ncds_07',
    name: 'Georgia / North Florida',
    description: 'Georgia coast, Jacksonville, St. Augustine',
    sizeBytes: 611000000,  // ~611 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_07.mbtiles',
    coverage: 'Georgia and North Florida coast'
  },
  {
    id: 'ncds_08',
    name: 'Central Florida Atlantic',
    description: 'Daytona, Cape Canaveral, Palm Beach',
    sizeBytes: 355000000,  // ~355 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_08.mbtiles',
    coverage: 'Central Florida Atlantic coast'
  },
  {
    id: 'ncds_09',
    name: 'South Florida / Keys',
    description: 'Miami, Florida Keys, Biscayne Bay',
    sizeBytes: 592000000,  // ~592 MB
    downloadUrl: 'https://distribution.charts.noaa.gov/ncds/mbtiles/ncds_09.mbtiles',
    coverage: 'South Florida and Keys'
  }
];

/**
 * Get available NCDS regions
 */
export function getAvailableRegions() {
  return NCDS_REGIONS.map(region => ({
    ...region,
    sizeMB: Math.round(region.sizeBytes / 1024 / 1024),
    sizeGB: parseFloat((region.sizeBytes / 1024 / 1024 / 1024).toFixed(2))
  }));
}

/**
 * Get storage information for the system and ENC tiles
 */
export async function getStorageInfo() {
  try {
    // Get disk space information
    const diskSpace = await checkDiskSpace('/');

    // Ensure ENC tiles directory exists
    await fs.mkdir(ENC_TILES_DIR, { recursive: true });

    // Get existing ENC MBTiles files
    let existingFiles = [];
    try {
      existingFiles = await fs.readdir(ENC_TILES_DIR);
    } catch (error) {
      existingFiles = [];
    }

    // Calculate total size of existing files
    let totalSizeMB = 0;
    const downloadedRegions = [];

    for (const file of existingFiles) {
      if (file.endsWith('.mbtiles')) {
        const filePath = path.join(ENC_TILES_DIR, file);
        try {
          const stats = await fs.stat(filePath);
          const sizeMB = stats.size / 1024 / 1024;
          totalSizeMB += sizeMB;

          const regionId = file.replace('.mbtiles', '');
          downloadedRegions.push({
            regionId,
            file,
            sizeMB: parseFloat(sizeMB.toFixed(1)),
            downloadedAt: stats.mtime.toISOString()
          });
        } catch (error) {
          console.warn(`Could not stat file ${file}:`, error.message);
        }
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
      enc: {
        path: ENC_TILES_DIR,
        downloadedCount: downloadedRegions.length,
        totalSizeMB: parseFloat(totalSizeMB.toFixed(1)),
        downloadedRegions
      }
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    throw error;
  }
}

/**
 * Get list of downloaded ENC regions with metadata
 */
export async function getDownloadedRegions() {
  try {
    await fs.mkdir(ENC_TILES_DIR, { recursive: true });

    const files = await fs.readdir(ENC_TILES_DIR);
    const regions = [];

    for (const file of files) {
      if (file.endsWith('.mbtiles')) {
        const filePath = path.join(ENC_TILES_DIR, file);
        const regionId = file.replace('.mbtiles', '');

        try {
          const stats = await fs.stat(filePath);

          // Find matching region metadata
          const regionMeta = NCDS_REGIONS.find(r => r.id === regionId);

          regions.push({
            regionId,
            name: regionMeta?.name || regionId,
            description: regionMeta?.description || '',
            coverage: regionMeta?.coverage || '',
            file,
            path: filePath,
            sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(1)),
            sizeGB: parseFloat((stats.size / 1024 / 1024 / 1024).toFixed(2)),
            downloadedAt: stats.mtime.toISOString(),
            modifiedAt: stats.mtime.toISOString()
          });
        } catch (error) {
          console.warn(`Could not get details for ${file}:`, error.message);
        }
      }
    }

    return { success: true, regions };
  } catch (error) {
    console.error('Error getting downloaded regions:', error);
    return { success: false, error: error.message, regions: [] };
  }
}

/**
 * Download a file with progress tracking
 */
async function downloadFileWithProgress(url, destPath, progressCallback, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
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
          const speedMBps = elapsedSeconds > 0 ? (downloadedBytes / 1024 / 1024) / elapsedSeconds : 0;
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
          const speedMBps = elapsedSeconds > 0 ? (downloadedBytes / 1024 / 1024) / elapsedSeconds : 0;
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
 * Start a download job for NCDS regions
 * @param {Array<string>} regionIds - Array of region IDs to download (e.g., ['ncds_02a', 'ncds_02b'])
 * @returns {string} jobId
 */
export async function startDownloadJob(regionIds) {
  // Validate region IDs
  const validRegions = regionIds.filter(id =>
    NCDS_REGIONS.some(r => r.id === id)
  );

  if (validRegions.length === 0) {
    throw new Error('No valid region IDs provided');
  }

  // Generate unique job ID
  const jobId = crypto.randomBytes(8).toString('hex');

  console.log(`[NCDS] Starting download job ${jobId} with regions: ${validRegions.join(', ')}`);

  // Initialize global.activeJobs if needed
  if (!global.activeJobs) {
    global.activeJobs = new Map();
  }

  // Initialize progress tracker
  if (!global.progressTrackers) {
    global.progressTrackers = new Map();
  }

  // Create job record
  const controller = new AbortController();
  const regions = validRegions.map(id => NCDS_REGIONS.find(r => r.id === id));

  global.activeJobs.set(jobId, {
    controller,
    startTime: Date.now(),
    status: 'starting',
    type: 'ncds',
    regions: regions.map(r => ({
      regionId: r.id,
      name: r.name,
      status: 'waiting',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: r.sizeBytes,
      speedMBps: 0
    })),
    summary: {
      totalRegions: regions.length,
      completedRegions: 0,
      failedRegions: 0,
      downloadingRegions: 0
    }
  });

  global.progressTrackers.set(jobId, {
    progress: 0,
    status: 'starting',
    clients: new Set()
  });

  // Ensure ENC tiles directory exists
  await fs.mkdir(ENC_TILES_DIR, { recursive: true });

  // Start download asynchronously
  setImmediate(async () => {
    const job = global.activeJobs.get(jobId);

    try {
      for (let i = 0; i < regions.length; i++) {
        // Check for cancellation
        if (job.controller.signal.aborted) {
          console.log(`[NCDS Job ${jobId}] Cancelled`);
          job.status = 'cancelled';
          if (global.broadcastProgress) {
            global.broadcastProgress(jobId, 0, 'cancelled', 'Download cancelled');
          }
          return;
        }

        const region = regions[i];
        const regionState = job.regions[i];
        const destPath = path.join(ENC_TILES_DIR, `${region.id}.mbtiles`);
        const tempPath = destPath + '.tmp';

        try {
          // Update state: downloading
          regionState.status = 'downloading';
          job.summary.downloadingRegions++;
          job.status = 'downloading';

          console.log(`[NCDS Job ${jobId}] Downloading ${region.id} from ${region.downloadUrl}`);

          // Download with progress tracking
          await downloadFileWithProgress(
            region.downloadUrl,
            tempPath,
            (downloadedBytes, totalBytes, speedMBps) => {
              regionState.downloadedBytes = downloadedBytes;
              regionState.totalBytes = totalBytes || region.sizeBytes;
              regionState.speedMBps = parseFloat(speedMBps.toFixed(2));
              regionState.progress = totalBytes > 0
                ? Math.round((downloadedBytes / totalBytes) * 100)
                : 0;

              // Calculate overall progress
              const totalProgress = job.regions.reduce((sum, r) => sum + r.progress, 0);
              const overallProgress = Math.round(totalProgress / job.regions.length);

              // Calculate ETA
              let eta = '';
              if (speedMBps > 0) {
                const remainingMB = (totalBytes - downloadedBytes) / 1024 / 1024;
                const etaSeconds = Math.round(remainingMB / speedMBps);
                if (etaSeconds > 60) {
                  eta = `${Math.round(etaSeconds / 60)} min`;
                } else {
                  eta = `${etaSeconds} sec`;
                }
              }

              if (global.broadcastProgress) {
                global.broadcastProgress(
                  jobId,
                  overallProgress,
                  'downloading',
                  `Downloading ${region.name}: ${regionState.progress}%`,
                  eta
                );
              }
            },
            job.controller.signal
          );

          // Move temp file to final destination
          await fs.rename(tempPath, destPath);

          // Update state: completed
          regionState.status = 'completed';
          regionState.progress = 100;
          job.summary.completedRegions++;
          job.summary.downloadingRegions--;

          console.log(`[NCDS Job ${jobId}] Completed ${region.id}`);

        } catch (error) {
          // Cleanup temp file on error
          try {
            await fs.unlink(tempPath);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }

          regionState.status = 'failed';
          regionState.error = error.message;
          job.summary.failedRegions++;
          job.summary.downloadingRegions--;

          console.error(`[NCDS Job ${jobId}] Failed to download ${region.id}:`, error.message);
        }
      }

      // All downloads complete
      const finalStatus = job.summary.failedRegions > 0 ? 'completed_with_errors' : 'completed';
      const failedDetails = job.regions
        .filter(r => r.status === 'failed')
        .map(r => `${r.name}: ${r.error}`)
        .join('; ');
      const message = job.summary.failedRegions > 0
        ? `Failed: ${failedDetails}`
        : `Successfully downloaded ${job.summary.completedRegions} region(s)`;

      job.status = finalStatus;

      if (global.broadcastProgress) {
        global.broadcastProgress(jobId, 100, finalStatus, message);
      }

      console.log(`[NCDS Job ${jobId}] ${message}`);

      // Auto-restart Martin if downloads succeeded
      if (job.summary.completedRegions > 0) {
        console.log(`[NCDS Job ${jobId}] Triggering Martin restart...`);
        try {
          await restartMartin();
          console.log(`[NCDS Job ${jobId}] Martin restarted successfully`);
        } catch (martinError) {
          console.error(`[NCDS Job ${jobId}] Failed to restart Martin:`, martinError.message);
        }
      }

    } catch (error) {
      console.error(`[NCDS Job ${jobId}] Error:`, error);
      job.status = 'failed';
      job.error = error.message;

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

  // Calculate overall progress
  const totalProgress = job.regions
    ? job.regions.reduce((sum, r) => sum + (r.progress || 0), 0) / job.regions.length
    : 0;

  return {
    success: true,
    jobId,
    status: job.status,
    progress: Math.round(totalProgress),
    regions: job.regions || [],
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

  console.log(`[NCDS] Cancelling job ${jobId}`);
  job.controller.abort();
  job.status = 'cancelled';

  return { success: true, message: 'Job cancelled' };
}

/**
 * Check for updates on downloaded regions
 * Compares local file modification times with NOAA's Last-Modified headers
 */
export async function checkForUpdates() {
  const downloadedResult = await getDownloadedRegions();
  if (!downloadedResult.success || downloadedResult.regions.length === 0) {
    return {
      success: true,
      regions: [],
      summary: { checked: 0, updatesAvailable: 0 }
    };
  }

  const results = [];

  for (const localRegion of downloadedResult.regions) {
    const regionMeta = NCDS_REGIONS.find(r => r.id === localRegion.regionId);
    if (!regionMeta) continue;

    try {
      // Make HEAD request to check Last-Modified
      const response = await fetch(regionMeta.downloadUrl, { method: 'HEAD' });

      if (!response.ok) {
        results.push({
          ...localRegion,
          updateStatus: 'error',
          error: `HTTP ${response.status}`
        });
        continue;
      }

      const lastModified = response.headers.get('last-modified');
      const remoteDate = lastModified ? new Date(lastModified) : null;
      const localDate = new Date(localRegion.modifiedAt);

      const hasUpdate = remoteDate && remoteDate > localDate;

      results.push({
        ...localRegion,
        updateStatus: hasUpdate ? 'update_available' : 'up_to_date',
        localDate: localDate.toISOString(),
        remoteDate: remoteDate?.toISOString() || null,
        hasUpdate
      });

    } catch (error) {
      console.error(`[NCDS] Error checking updates for ${localRegion.regionId}:`, error.message);
      results.push({
        ...localRegion,
        updateStatus: 'error',
        error: error.message
      });
    }
  }

  const updatesAvailable = results.filter(r => r.hasUpdate).length;

  return {
    success: true,
    regions: results,
    summary: {
      checked: results.length,
      updatesAvailable,
      upToDate: results.filter(r => r.updateStatus === 'up_to_date').length,
      errors: results.filter(r => r.updateStatus === 'error').length
    },
    checkedAt: new Date().toISOString()
  };
}

/**
 * Delete a downloaded region
 */
export async function deleteRegion(regionId) {
  try {
    const filePath = path.join(ENC_TILES_DIR, `${regionId}.mbtiles`);

    // Check if file exists
    await fs.access(filePath);

    // Delete the file
    await fs.unlink(filePath);

    console.log(`[NCDS] Deleted region: ${regionId}`);

    // Restart Martin to update available sources
    try {
      await restartMartin();
      console.log(`[NCDS] Martin restarted after deletion`);
    } catch (martinError) {
      console.warn(`[NCDS] Failed to restart Martin:`, martinError.message);
    }

    return { success: true, message: `Deleted ${regionId}` };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: false, error: 'Region file not found' };
    }
    console.error(`[NCDS] Error deleting region ${regionId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Restart Martin tileserver to pick up new MBTiles
 */
export async function restartMartin() {
  try {
    console.log('[NCDS] Restarting Martin tileserver...');

    const martinConfig = path.join(PROJECT_ROOT, 'martin-config.yaml');
    const martinLog = path.join(PROJECT_ROOT, 'martin.log');

    // Kill existing martin process by finding the PID listening on port 3001
    // Using lsof instead of pkill to avoid killing unrelated processes and
    // triggering cascading shutdowns from parent monitoring scripts
    try {
      const { stdout: pidOut } = await execAsync('lsof -ti :3001 || true');
      const pids = pidOut.trim().split('\n').filter(Boolean);
      if (pids.length > 0) {
        for (const pid of pids) {
          try { process.kill(parseInt(pid), 'SIGTERM'); } catch {}
        }
        console.log(`[NCDS] Killed existing Martin process(es): ${pids.join(', ')}`);
      } else {
        console.log('[NCDS] No existing Martin process found on port 3001');
      }
    } catch (killError) {
      console.log('[NCDS] No existing Martin process to kill');
    }

    // Wait a moment for process to die and port to free up
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Find martin binary dynamically (supports /usr/local/bin, /opt/homebrew/bin, etc.)
    let martinBin = 'martin';
    try {
      const { stdout: whichOut } = await execAsync('which martin');
      martinBin = whichOut.trim();
    } catch {
      // Fall back to common paths
      for (const p of ['/opt/homebrew/bin/martin', '/usr/local/bin/martin']) {
        try { await execAsync(`test -x "${p}"`); martinBin = p; break; } catch {}
      }
    }
    console.log(`[NCDS] Using martin binary: ${martinBin}`);

    // Start martin in background from project directory
    try {
      const martinProcess = spawn(martinBin, ['--config', martinConfig], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Handle spawn errors to prevent crashing the API server
      martinProcess.on('error', (err) => {
        console.error('[NCDS] Martin spawn error:', err.message);
      });

      // Write output to log file
      const logStream = fsSync.createWriteStream(martinLog, { flags: 'a' });
      martinProcess.stdout.pipe(logStream);
      martinProcess.stderr.pipe(logStream);

      // Unref to allow parent process to exit independently
      martinProcess.unref();

      console.log(`[NCDS] Martin started with PID: ${martinProcess.pid}`);

      // Wait for Martin to start and verify it's running
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if Martin is responding
      const status = await getMartinStatus();
      if (status.running) {
        console.log('[NCDS] Martin restarted successfully');
        return { success: true, method: 'spawn', pid: martinProcess.pid };
      } else {
        console.warn('[NCDS] Martin started but not responding yet');
        return { success: true, method: 'spawn', pid: martinProcess.pid, note: 'Started but may need more time to initialize' };
      }

    } catch (spawnError) {
      console.error('[NCDS] Failed to spawn Martin:', spawnError.message);

      // Try alternative: use shell command
      try {
        await execAsync(`cd "${PROJECT_ROOT}" && "${martinBin}" --config "${martinConfig}" >> "${martinLog}" 2>&1 &`);
        console.log('[NCDS] Martin restarted via shell command');
        return { success: true, method: 'shell' };
      } catch (shellError) {
        console.error('[NCDS] Shell fallback also failed:', shellError.message);
        throw shellError;
      }
    }

  } catch (error) {
    console.error('[NCDS] Error restarting Martin:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get Martin tileserver status
 */
export async function getMartinStatus() {
  try {
    const response = await fetch('http://localhost:3001/health', {
      signal: AbortSignal.timeout(2000)
    });

    if (response.ok) {
      return { running: true, status: 'healthy' };
    }
    return { running: false, status: 'unhealthy' };
  } catch (error) {
    return { running: false, status: 'unreachable', error: error.message };
  }
}
