/**
 * CUSP Download Service
 * Handles downloading NOAA CUSP shapefiles and converting to MBTiles vector tiles
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
const TILES_DIR = path.join(PROJECT_ROOT, 'tiles', 'cusp');
const RAW_FILES_DIR = path.join(PROJECT_ROOT, 'tiles', 'cusp_raw');
const TEMP_DIR = '/tmp/cusp_downloads';
const MBTILES_FILENAME = 'gshhs_base.mbtiles';

// Continental US bounds [minX, minY, maxX, maxY]
const CONUS_BOUNDS = [-125, 24, -66, 50];

/**
 * Get storage information for the system and CUSP tiles
 */
export async function getStorageInfo() {
  try {
    // Get disk space information
    const diskSpace = await checkDiskSpace('/');

    // Ensure CUSP tiles directory exists
    await fs.mkdir(TILES_DIR, { recursive: true });

    // Check if MBTiles file exists
    const mbtilesPath = path.join(TILES_DIR, MBTILES_FILENAME);
    let cuspSizeMB = 0;
    let cuspExists = false;
    let cuspModified = null;

    try {
      const stats = await fs.stat(mbtilesPath);
      cuspSizeMB = parseFloat((stats.size / 1024 / 1024).toFixed(2));
      cuspExists = true;
      cuspModified = stats.mtime;
    } catch (error) {
      // File doesn't exist yet, that's okay
      cuspExists = false;
    }

    return {
      success: true,
      disk: {
        totalGB: parseFloat((diskSpace.size / 1024 / 1024 / 1024).toFixed(2)),
        usedGB: parseFloat(((diskSpace.size - diskSpace.free) / 1024 / 1024 / 1024).toFixed(2)),
        freeGB: parseFloat((diskSpace.free / 1024 / 1024 / 1024).toFixed(2)),
        usedPercent: parseFloat((((diskSpace.size - diskSpace.free) / diskSpace.size) * 100).toFixed(1))
      },
      cusp: {
        exists: cuspExists,
        sizeMB: cuspSizeMB,
        lastModified: cuspModified,
        path: mbtilesPath
      }
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    throw error;
  }
}

/**
 * Get CUSP status (whether it exists and metadata)
 */
export async function getCUSPStatus() {
  try {
    const storageInfo = await getStorageInfo();
    return {
      success: true,
      exists: storageInfo.cusp.exists,
      sizeMB: storageInfo.cusp.sizeMB,
      lastModified: storageInfo.cusp.lastModified,
      version: storageInfo.cusp.lastModified ? storageInfo.cusp.lastModified.toISOString().split('T')[0] : null
    };
  } catch (error) {
    console.error('Error getting CUSP status:', error);
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
 * Download CUSP shapefile from NOAA
 * Uses Medium Resolution Shoreline as it's more accessible than CUSP
 * @param {string} outputPath - Where to save the downloaded shapefile (ZIP)
 * @param {function} progressCallback - Progress callback
 * @param {AbortSignal} signal - Cancellation signal
 */
async function downloadCUSPShapefile(outputPath, progressCallback, signal) {
  // NOAA Medium Resolution Shoreline - publicly accessible and suitable for navigation
  // This is a good alternative to CUSP as it covers US coastlines
  const shorelineUrl = 'https://www.weather.gov/source/gis/Shapefiles/County/s_11au16.zip';

  // Alternative: Use GSHHS (Global Self-consistent, Hierarchical, High-resolution Geography Database)
  // which is commonly used for coastline data
  const gshhsUrl = 'https://www.ngdc.noaa.gov/mgg/shorelines/data/gshhg/latest/gshhg-shp-2.3.7.zip';

  try {
    console.log('[CUSP] Downloading GSHHS coastline data (high-resolution)...');
    await downloadFileWithProgress(gshhsUrl, outputPath, progressCallback, signal);
  } catch (error) {
    console.error('[CUSP] Download failed:', error.message);
    throw new Error(`Failed to download coastline data: ${error.message}`);
  }
}

/**
 * Extract ZIP file
 * @param {string} zipPath - Path to ZIP file
 * @param {string} extractDir - Directory to extract to
 */
async function extractZip(zipPath, extractDir) {
  await fs.mkdir(extractDir, { recursive: true });
  const { stdout, stderr } = await execAsync(`unzip -o "${zipPath}" -d "${extractDir}"`);
  console.log('[CUSP] Extracted shapefile:', stdout);
  if (stderr) console.warn('[CUSP] Extract warnings:', stderr);
}

/**
 * Filter shapefile to continental US bounds using ogr2ogr
 * Converts to GeoJSON format which Tippecanoe handles better
 * @param {string} inputShp - Path to input shapefile
 * @param {string} outputGeoJSON - Path to output GeoJSON file
 * @param {AbortSignal} signal - Cancellation signal
 */
async function filterToContinentalUS(inputShp, outputGeoJSON, signal) {
  const [minX, minY, maxX, maxY] = CONUS_BOUNDS;
  const outputDir = path.dirname(outputGeoJSON);
  await fs.mkdir(outputDir, { recursive: true });

  // Convert to GeoJSON with clipping - Tippecanoe prefers GeoJSON
  const cmd = `ogr2ogr -f GeoJSON -t_srs EPSG:4326 -clipdst ${minX} ${minY} ${maxX} ${maxY} "${outputGeoJSON}" "${inputShp}"`;

  console.log('[CUSP] Converting to GeoJSON and filtering to Continental US bounds');
  const { stdout, stderr } = await execAsync(cmd, { signal, maxBuffer: 1024 * 1024 * 10 });

  if (stderr && !stderr.includes('TopologyException')) {
    console.warn('[CUSP] ogr2ogr warnings:', stderr);
  }
  console.log('[CUSP] Filtered GeoJSON created successfully');
}

/**
 * Extract coastline boundaries from land polygons using ogr2ogr
 * @param {string} landGeoJSON - Path to land polygon GeoJSON
 * @param {string} coastlineGeoJSON - Path to output coastline GeoJSON
 * @param {AbortSignal} signal - Cancellation signal
 */
async function extractCoastlineLines(landGeoJSON, coastlineGeoJSON, signal) {
  // First, query the layer name from the GeoJSON file using ogrinfo
  console.log('[CUSP] Querying layer name from GeoJSON...');
  const { stdout: infoOutput } = await execAsync(`ogrinfo -al -so "${landGeoJSON}" | grep "Layer name:"`, { signal });
  const layerMatch = infoOutput.match(/Layer name:\s*(\S+)/);
  const layerName = layerMatch ? layerMatch[1] : 'OGRGeoJSON';

  console.log(`[CUSP] Using layer name: ${layerName}`);

  const cmd = [
    'ogr2ogr',
    '-f GeoJSON',
    '-dialect SQLite',
    `-sql "SELECT ST_Boundary(geometry) as geometry FROM ${layerName}"`,
    `"${coastlineGeoJSON}"`,
    `"${landGeoJSON}"`
  ].join(' ');

  console.log('[CUSP] Extracting coastline boundaries from land polygons...');
  try {
    const { stdout, stderr } = await execAsync(cmd, { signal, maxBuffer: 1024 * 1024 * 100 });
    if (stderr) {
      console.warn('[CUSP] ogr2ogr warnings:', stderr);
    }
    console.log('[CUSP] Coastline boundaries extracted successfully');
  } catch (error) {
    console.error('[CUSP] Failed to extract coastlines:', error.message);
    throw new Error(`Failed to extract coastlines: ${error.message}`);
  }
}

/**
 * Generate land polygon tiles using Tippecanoe
 * @param {string} geojsonPath - Path to land polygon GeoJSON
 * @param {string} mbtilesPath - Path to output MBTiles
 * @param {string} jobId - Job ID for progress updates
 * @param {AbortSignal} signal - Cancellation signal
 */
async function generateLandTiles(geojsonPath, mbtilesPath, jobId, signal) {
  const cmd = [
    'tippecanoe',
    `-o "${mbtilesPath}"`,
    '-z14 -Z0',
    '-l land',
    '--no-feature-limit',
    '--no-tile-size-limit',
    '--simplification=2',
    '--coalesce-densest-as-needed',
    '--force -P',
    `--progress-interval=1`,
    `-n "GSHHS Land Polygons"`,
    `-A "NOAA NGDC - GSHHS"`,
    `"${geojsonPath}"`
  ].join(' ');

  console.log('[CUSP] Generating land polygon tiles...');

  return new Promise((resolve, reject) => {
    const child = exec(cmd, { maxBuffer: 1024 * 1024 * 200 }, (error, stdout, stderr) => {
      if (error && !signal.aborted) {
        reject(error);
      } else {
        console.log('[CUSP] Land tiles created successfully');
        resolve();
      }
    });

    // Parse tippecanoe progress from stderr
    let lastProgress = 50;
    child.stderr?.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/(\d+\.\d+)%/);
      if (match) {
        const tippyProgress = parseFloat(match[1]);
        // Map tippecanoe 0-100% to our 50-70% range
        const overallProgress = 50 + (tippyProgress / 100) * 20;
        if (overallProgress > lastProgress + 1) {
          lastProgress = overallProgress;
          global.broadcastProgress(
            jobId,
            overallProgress,
            'converting',
            `Generating land tiles: ${tippyProgress.toFixed(1)}%`,
            null
          );
        }
      }
    });

    // Handle cancellation
    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill();
        reject(new Error('Land tile generation cancelled'));
      });
    }
  });
}

/**
 * Generate coastline line tiles using Tippecanoe
 * @param {string} geojsonPath - Path to coastline line GeoJSON
 * @param {string} mbtilesPath - Path to output MBTiles
 * @param {string} jobId - Job ID for progress updates
 * @param {AbortSignal} signal - Cancellation signal
 */
async function generateCoastlineTiles(geojsonPath, mbtilesPath, jobId, signal) {
  const cmd = [
    'tippecanoe',
    `-o "${mbtilesPath}"`,
    '-z14 -Z0',
    '-l coastline',
    '--no-feature-limit',
    '--no-tile-size-limit',
    '--simplification=1',
    '--minimum-zoom-by-size=8:500:10:100:12:50',
    '--force -P',
    `--progress-interval=1`,
    `-n "GSHHS Coastline"`,
    `-A "NOAA NGDC - GSHHS"`,
    `"${geojsonPath}"`
  ].join(' ');

  console.log('[CUSP] Generating coastline tiles...');

  return new Promise((resolve, reject) => {
    const child = exec(cmd, { maxBuffer: 1024 * 1024 * 200 }, (error, stdout, stderr) => {
      if (error && !signal.aborted) {
        reject(error);
      } else {
        console.log('[CUSP] Coastline tiles created successfully');
        resolve();
      }
    });

    // Parse tippecanoe progress from stderr
    let lastProgress = 70;
    child.stderr?.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/(\d+\.\d+)%/);
      if (match) {
        const tippyProgress = parseFloat(match[1]);
        // Map tippecanoe 0-100% to our 70-90% range
        const overallProgress = 70 + (tippyProgress / 100) * 20;
        if (overallProgress > lastProgress + 1) {
          lastProgress = overallProgress;
          global.broadcastProgress(
            jobId,
            overallProgress,
            'converting',
            `Generating coastline tiles: ${tippyProgress.toFixed(1)}%`,
            null
          );
        }
      }
    });

    // Handle cancellation
    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill();
        reject(new Error('Coastline tile generation cancelled'));
      });
    }
  });
}

/**
 * Merge multiple MBTiles files into one using tile-join
 * @param {string[]} inputTiles - Array of input MBTiles paths
 * @param {string} outputPath - Path to output merged MBTiles
 * @param {AbortSignal} signal - Cancellation signal
 */
async function mergeMBTiles(inputTiles, outputPath, signal) {
  const cmd = [
    'tile-join',
    `-o "${outputPath}"`,
    '--force',
    ...inputTiles.map(t => `"${t}"`)
  ].join(' ');

  console.log('[CUSP] Merging MBTiles files...');
  try {
    const { stdout, stderr } = await execAsync(cmd, { signal, maxBuffer: 1024 * 1024 * 100 });
    if (stderr) {
      console.warn('[CUSP] tile-join warnings:', stderr);
    }
    console.log('[CUSP] MBTiles merged successfully');
  } catch (error) {
    console.error('[CUSP] Failed to merge tiles:', error.message);
    throw new Error(`Failed to merge tiles: ${error.message}`);
  }
}

/**
 * Convert GeoJSON to unified MBTiles with land and coastline layers
 * @param {string} geojsonPath - Path to input GeoJSON file (land polygons)
 * @param {string} mbtilesPath - Path to output MBTiles file
 * @param {string} jobId - Job ID for progress updates
 * @param {AbortSignal} signal - Cancellation signal
 */
async function convertToMBTiles(geojsonPath, mbtilesPath, jobId, signal) {
  const outputDir = path.dirname(mbtilesPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Extract coastline boundaries from land polygons
  const coastlineGeoJSON = path.join(outputDir, `coastline_lines_${jobId}.geojson`);
  global.broadcastProgress(jobId, 45, 'converting', 'Extracting coastline boundaries...', null);
  await extractCoastlineLines(geojsonPath, coastlineGeoJSON, signal);

  // Generate land tiles
  const landMBTiles = path.join('/tmp', `land_${jobId}.mbtiles`);
  global.broadcastProgress(jobId, 50, 'converting', 'Generating land tiles...', null);
  await generateLandTiles(geojsonPath, landMBTiles, jobId, signal);

  // Generate coastline tiles
  const coastlineMBTiles = path.join('/tmp', `coastline_${jobId}.mbtiles`);
  global.broadcastProgress(jobId, 70, 'converting', 'Generating coastline tiles...', null);
  await generateCoastlineTiles(coastlineGeoJSON, coastlineMBTiles, jobId, signal);

  // Merge both MBTiles into single file
  global.broadcastProgress(jobId, 90, 'converting', 'Merging tiles...', null);
  await mergeMBTiles([landMBTiles, coastlineMBTiles], mbtilesPath, signal);

  // Cleanup temp files
  await fs.unlink(coastlineGeoJSON).catch(() => {});
  await fs.unlink(landMBTiles).catch(() => {});
  await fs.unlink(coastlineMBTiles).catch(() => {});

  console.log('[CUSP] MBTiles created successfully with land and coastline layers');
}

/**
 * Find shapefile in directory (handles various naming patterns)
 * Recursively searches subdirectories for coastline shapefiles
 * @param {string} directory - Directory to search
 * @returns {string} Path to .shp file
 */
async function findShapefile(directory) {
  // GSHHS has subdirectories for each resolution: f/, h/, i/, l/, c/
  // Priority: full > high > intermediate > low > crude
  const resolutionDirs = ['f', 'h', 'i', 'l', 'c'];

  // First, try to find GSHHS_shp directory with resolution subdirs
  for (const resDir of resolutionDirs) {
    const gshhsPath = path.join(directory, 'GSHHS_shp', resDir, 'GSHHS_' + resDir + '_L1.shp');
    try {
      await fs.access(gshhsPath);
      console.log(`[CUSP] Found GSHHS ${resDir} resolution shapefile:`, path.basename(gshhsPath));
      return gshhsPath;
    } catch {
      // File doesn't exist, try next resolution
    }
  }

  // Fallback: recursive search with resolution priority
  async function searchDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    // Priority list for GSHHS resolutions in filenames
    const resolutionPriority = ['_f_', '_h_', '_i_', '_l_', '_c_'];

    // Look for .shp files with specific resolution priority
    for (const resolution of resolutionPriority) {
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.shp')) {
          const name = entry.name.toLowerCase();
          // Check for GSHHS files with this resolution
          if (name.includes('gshhs') && name.includes(resolution) && name.includes('l1')) {
            console.log(`[CUSP] Found GSHHS ${resolution.replace(/_/g, '')} resolution shapefile:`, entry.name);
            return fullPath;
          }
        }
      }
    }

    // Fallback: Look for any coastline-related files
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.shp')) {
        const name = entry.name.toLowerCase();
        if (name.includes('coast') || name.includes('shore') || name.includes('line') ||
            name.includes('cusp') || name.includes('gshhs') || name.includes('border')) {
          console.log('[CUSP] Found coastline shapefile:', entry.name);
          return fullPath;
        }
      }
    }

    // If no coastline file found, search subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const result = await searchDirectory(path.join(dir, entry.name));
        if (result) return result;
      }
    }

    // Fallback: return first .shp file found
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.shp')) {
        console.log('[CUSP] Using shapefile:', entry.name);
        return path.join(dir, entry.name);
      }
    }

    return null;
  }

  const shpFile = await searchDirectory(directory);
  if (!shpFile) {
    throw new Error('No .shp files found in extracted archive');
  }

  return shpFile;
}

/**
 * Main job processor for CUSP download and conversion
 * @param {string} jobId - Job ID for tracking
 * @param {AbortSignal} signal - Cancellation signal
 */
export async function processCUSPJob(jobId, signal) {
  // Ensure global.activeJobs exists
  if (!global.activeJobs) {
    global.activeJobs = new Map();
  }

  const job = global.activeJobs.get(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  try {
    // Ensure directories exist
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(RAW_FILES_DIR, { recursive: true });
    await fs.mkdir(TILES_DIR, { recursive: true });

    const zipPath = path.join(TEMP_DIR, 'cusp.zip');
    const extractDir = path.join(TEMP_DIR, 'cusp_extracted');
    const filteredDir = path.join(RAW_FILES_DIR, 'filtered');
    const filteredGeoJSON = path.join(filteredDir, 'cusp_conus.geojson');
    const mbtilesPath = path.join(TILES_DIR, MBTILES_FILENAME);

    // Phase 1: Download (0-30%)
    console.log('[CUSP] Phase 1: Downloading CUSP shapefile...');
    global.broadcastProgress(jobId, 0, 'downloading', 'Downloading GSHHS shapefile...', null);

    await downloadCUSPShapefile(
      zipPath,
      (downloaded, total, speed) => {
        const progress = Math.min(30, (downloaded / total) * 30);
        const message = `Downloading: ${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB (${speed.toFixed(1)} MB/s)`;
        global.broadcastProgress(jobId, progress, 'downloading', message, null);
      },
      signal
    );

    // Phase 2: Extract and filter (30-45%)
    console.log('[CUSP] Phase 2: Extracting and filtering to Continental US...');
    global.broadcastProgress(jobId, 30, 'processing', 'Extracting shapefile...', null);

    await extractZip(zipPath, extractDir);
    const originalShp = await findShapefile(extractDir);

    global.broadcastProgress(jobId, 37, 'processing', 'Filtering to Continental US bounds...', null);
    await filterToContinentalUS(originalShp, filteredGeoJSON, signal);

    // Phase 3: Convert to vector tiles (45-95%)
    // convertToMBTiles now handles: 45-50% (extract boundaries), 50-70% (land), 70-90% (coastline), 90-95% (merge)
    console.log('[CUSP] Phase 3: Converting to MBTiles vector tiles...');

    await convertToMBTiles(filteredGeoJSON, mbtilesPath, jobId, signal);

    // Phase 4: Cleanup (95-100%)
    console.log('[CUSP] Phase 4: Cleaning up temporary files...');
    global.broadcastProgress(jobId, 95, 'finalizing', 'Cleaning up...', null);

    // Remove temp files
    await fs.rm(zipPath, { force: true });
    await fs.rm(extractDir, { recursive: true, force: true });

    // Complete
    global.broadcastProgress(jobId, 100, 'completed', 'CUSP coastline data ready', null);

    return {
      success: true,
      mbtilesPath,
      message: 'CUSP coastline data processed successfully'
    };

  } catch (error) {
    console.error('[CUSP] Job failed:', error);
    global.broadcastProgress(jobId, 0, 'failed', error.message, null);
    throw error;
  }
}

/**
 * Start a new CUSP download and processing job
 * @returns {string} Job ID
 */
export async function startCUSPJob() {
  // Check disk space first
  const storageInfo = await getStorageInfo();
  const neededMB = 150; // Estimate for download + processing
  const availableMB = storageInfo.disk.freeGB * 1024;

  if (availableMB < neededMB) {
    throw new Error(`Insufficient disk space. Need ${neededMB}MB, have ${availableMB.toFixed(0)}MB free`);
  }

  // Create job ID
  const jobId = crypto.randomBytes(8).toString('hex');

  // Create abort controller
  const controller = new AbortController();

  // Initialize global.activeJobs if needed
  if (!global.activeJobs) {
    global.activeJobs = new Map();
  }

  // Store job info
  global.activeJobs.set(jobId, {
    jobId,
    controller,
    status: 'pending',
    progress: 0,
    message: 'Job queued',
    startTime: Date.now()
  });

  // Start processing (don't await - let it run in background)
  processCUSPJob(jobId, controller.signal)
    .then(result => {
      const job = global.activeJobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.result = result;
      }
    })
    .catch(error => {
      const job = global.activeJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
      }
    });

  return jobId;
}

/**
 * Get job status
 * @param {string} jobId - Job ID
 * @returns {object} Job status
 */
export function getJobStatus(jobId) {
  const job = global.activeJobs?.get(jobId);
  if (!job) {
    return {
      success: false,
      error: 'Job not found'
    };
  }

  return {
    success: true,
    jobId: job.jobId,
    status: job.status,
    progress: job.progress || 0,
    message: job.message || '',
    result: job.result,
    error: job.error
  };
}

/**
 * Cancel a job
 * @param {string} jobId - Job ID to cancel
 */
export function cancelJob(jobId) {
  const job = global.activeJobs?.get(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.controller) {
    job.controller.abort();
  }

  job.status = 'cancelled';
  job.message = 'Job cancelled by user';
}

/**
 * Delete CUSP MBTiles file
 */
export async function deleteCUSPData() {
  try {
    const mbtilesPath = path.join(TILES_DIR, MBTILES_FILENAME);
    await fs.rm(mbtilesPath, { force: true });
    console.log('[CUSP] Deleted MBTiles file');
    return { success: true, message: 'CUSP coastline data deleted' };
  } catch (error) {
    console.error('[CUSP] Error deleting data:', error);
    throw error;
  }
}
