/**
 * S-57 Vector ENC Download Service
 * Downloads NOAA S-57 .000 files, converts via ogr2ogr to GeoJSON,
 * then runs tippecanoe to produce MBTiles vector tiles served by Martin.
 */

import checkDiskSpace from 'check-disk-space';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);
const CPU_COUNT = os.cpus().length;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const S57_DIR = path.join(PROJECT_ROOT, 'tiles', 's57');
const S57_RAW_DIR = path.join(PROJECT_ROOT, 'tiles', 's57_raw');
const TEMP_DIR = '/tmp/s57_downloads';

// Target S-57 layers to extract
const TARGET_LAYERS = [
  'DEPARE', 'DEPCNT', 'SOUNDG', 'DRGARE',
  'LNDARE', 'COALNE', 'SLCONS',
  'BOYSPP', 'BCNSPP', 'LIGHTS',
  'OBSTRN', 'WRECKS', 'UWTROC',
  'RESARE', 'ACHARE', 'SEAARE',
  'BRIDGE'
];

const S57_REGIONS = [
  { id: 'VA', name: 'Virginia / Chesapeake Bay', downloadUrl: 'https://charts.noaa.gov/ENCs/VA_ENCs.zip', estimatedSizeMB: 50 },
  { id: 'MD', name: 'Maryland', downloadUrl: 'https://charts.noaa.gov/ENCs/MD_ENCs.zip', estimatedSizeMB: 30 },
  { id: 'NC', name: 'North Carolina', downloadUrl: 'https://charts.noaa.gov/ENCs/NC_ENCs.zip', estimatedSizeMB: 45 },
  { id: 'DE', name: 'Delaware', downloadUrl: 'https://charts.noaa.gov/ENCs/DE_ENCs.zip', estimatedSizeMB: 15 },
  { id: 'NJ', name: 'New Jersey', downloadUrl: 'https://charts.noaa.gov/ENCs/NJ_ENCs.zip', estimatedSizeMB: 30 },
  { id: 'NY', name: 'New York', downloadUrl: 'https://charts.noaa.gov/ENCs/NY_ENCs.zip', estimatedSizeMB: 40 },
  { id: 'CT', name: 'Connecticut', downloadUrl: 'https://charts.noaa.gov/ENCs/CT_ENCs.zip', estimatedSizeMB: 15 },
  { id: 'RI', name: 'Rhode Island', downloadUrl: 'https://charts.noaa.gov/ENCs/RI_ENCs.zip', estimatedSizeMB: 15 },
  { id: 'MA', name: 'Massachusetts', downloadUrl: 'https://charts.noaa.gov/ENCs/MA_ENCs.zip', estimatedSizeMB: 35 },
  { id: 'ME', name: 'Maine', downloadUrl: 'https://charts.noaa.gov/ENCs/ME_ENCs.zip', estimatedSizeMB: 40 },
  { id: 'NH', name: 'New Hampshire', downloadUrl: 'https://charts.noaa.gov/ENCs/NH_ENCs.zip', estimatedSizeMB: 10 },
  { id: 'SC', name: 'South Carolina', downloadUrl: 'https://charts.noaa.gov/ENCs/SC_ENCs.zip', estimatedSizeMB: 35 },
  { id: 'GA', name: 'Georgia', downloadUrl: 'https://charts.noaa.gov/ENCs/GA_ENCs.zip', estimatedSizeMB: 25 },
  { id: 'FL', name: 'Florida', downloadUrl: 'https://charts.noaa.gov/ENCs/FL_ENCs.zip', estimatedSizeMB: 80 },
  { id: 'AL', name: 'Alabama', downloadUrl: 'https://charts.noaa.gov/ENCs/AL_ENCs.zip', estimatedSizeMB: 15 },
  { id: 'MS', name: 'Mississippi', downloadUrl: 'https://charts.noaa.gov/ENCs/MS_ENCs.zip', estimatedSizeMB: 15 },
  { id: 'LA', name: 'Louisiana', downloadUrl: 'https://charts.noaa.gov/ENCs/LA_ENCs.zip', estimatedSizeMB: 40 },
  { id: 'TX', name: 'Texas', downloadUrl: 'https://charts.noaa.gov/ENCs/TX_ENCs.zip', estimatedSizeMB: 45 },
  { id: 'CA', name: 'California', downloadUrl: 'https://charts.noaa.gov/ENCs/CA_ENCs.zip', estimatedSizeMB: 50 },
  { id: 'OR', name: 'Oregon', downloadUrl: 'https://charts.noaa.gov/ENCs/OR_ENCs.zip', estimatedSizeMB: 25 },
  { id: 'WA', name: 'Washington', downloadUrl: 'https://charts.noaa.gov/ENCs/WA_ENCs.zip', estimatedSizeMB: 35 },
  { id: 'HI', name: 'Hawaii', downloadUrl: 'https://charts.noaa.gov/ENCs/HI_ENCs.zip', estimatedSizeMB: 20 },
  { id: 'AK', name: 'Alaska', downloadUrl: 'https://charts.noaa.gov/ENCs/AK_ENCs.zip', estimatedSizeMB: 60 },
  { id: 'PR', name: 'Puerto Rico / USVI', downloadUrl: 'https://charts.noaa.gov/ENCs/PR_ENCs.zip', estimatedSizeMB: 20 }
];

export function getAvailableRegions() {
  return S57_REGIONS.map(region => ({
    ...region,
    sizeMB: region.estimatedSizeMB,
    sizeGB: parseFloat((region.estimatedSizeMB / 1024).toFixed(2))
  }));
}

export async function getStorageInfo() {
  try {
    const diskSpace = await checkDiskSpace('/');
    await fs.mkdir(S57_DIR, { recursive: true });

    let entries = [];
    try { entries = await fs.readdir(S57_DIR); } catch { entries = []; }

    let totalSizeMB = 0;
    let downloadedCount = 0;

    for (const entry of entries) {
      if (entry.endsWith('.mbtiles')) {
        const stats = await fs.stat(path.join(S57_DIR, entry));
        totalSizeMB += stats.size / 1024 / 1024;
        downloadedCount++;
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
      s57: {
        path: S57_DIR,
        downloadedCount,
        totalSizeMB: parseFloat(totalSizeMB.toFixed(1))
      }
    };
  } catch (error) {
    console.error('[S57] Error getting storage info:', error);
    throw error;
  }
}

/**
 * Get downloaded regions - looks for s57_*.mbtiles files with companion metadata
 */
export async function getDownloadedRegions() {
  try {
    await fs.mkdir(S57_DIR, { recursive: true });
    const entries = await fs.readdir(S57_DIR);
    const regions = [];

    for (const entry of entries) {
      // Match s57_{regionId}.mbtiles
      const match = entry.match(/^s57_(.+)\.mbtiles$/);
      if (!match) continue;

      const regionId = match[1];
      const mbtilesPath = path.join(S57_DIR, entry);
      const metaPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);

      try {
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const metadata = JSON.parse(metaContent);
        const regionMeta = S57_REGIONS.find(r => r.id === regionId);
        const stats = await fs.stat(mbtilesPath);

        regions.push({
          regionId,
          name: regionMeta?.name || regionId,
          description: regionMeta ? `S-57 vector charts for ${regionMeta.name}` : '',
          sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(1)),
          downloadedAt: metadata.download_date,
          modifiedAt: metadata.download_date,
          fileCount: metadata.file_count || 0,
          layers: (metadata.layers || []).map(l => l.name)
        });
      } catch {
        // mbtiles without metadata, still list it
        try {
          const stats = await fs.stat(mbtilesPath);
          const regionMeta = S57_REGIONS.find(r => r.id === regionId);
          regions.push({
            regionId,
            name: regionMeta?.name || regionId,
            description: '',
            sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(1)),
            downloadedAt: null,
            modifiedAt: null,
            fileCount: 0,
            layers: TARGET_LAYERS
          });
        } catch { /* skip */ }
      }
    }

    return { success: true, regions };
  } catch (error) {
    console.error('[S57] Error getting downloaded regions:', error);
    return { success: false, error: error.message, regions: [] };
  }
}

/**
 * Get the list of available layers for a downloaded region
 */
export async function getRegionLayers(regionId) {
  const metaPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);
  try {
    const metaContent = await fs.readFile(metaPath, 'utf8');
    const metadata = JSON.parse(metaContent);
    const layers = (metadata.layers || []).map(l => ({
      name: l.name,
      featureCount: l.features
    }));
    return { success: true, regionId, layers };
  } catch (error) {
    return { success: false, error: error.message, layers: [] };
  }
}

async function downloadFileWithProgress(url, destPath, progressCallback, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

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
          const elapsed = (Date.now() - startTime) / 1000;
          progressCallback(downloadedBytes, totalBytes, elapsed > 0 ? (downloadedBytes / 1024 / 1024) / elapsed : 0);
          resolve();
          break;
        }
        downloadedBytes += value.length;
        fileStream.write(value);
        const now = Date.now();
        if (now - lastProgressUpdate >= 500) {
          const elapsed = (now - startTime) / 1000;
          progressCallback(downloadedBytes, totalBytes, elapsed > 0 ? (downloadedBytes / 1024 / 1024) / elapsed : 0);
          lastProgressUpdate = now;
        }
      }
    } catch (error) {
      fileStream.close();
      reject(error);
    }
  });
}

async function findS57Files(directory) {
  const results = [];
  async function search(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await search(fullPath);
      else if (entry.name.endsWith('.000')) results.push(fullPath);
    }
  }
  await search(directory);
  return results;
}

/**
 * Run async tasks with a concurrency limit
 */
async function parallelMap(items, concurrency, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function extractS57Layers(s57File, outputDir, signal) {
  const basename = path.basename(s57File, '.000');
  const env = {
    ...process.env,
    OGR_S57_OPTIONS: 'SPLIT_MULTIPOINT=ON,RETURN_PRIMITIVES=ON,RETURN_LINKAGES=ON,ADD_SOUNDG_DEPTH=ON'
  };

  // Run all layers in parallel (bounded by CPU count)
  const results = await parallelMap(TARGET_LAYERS, CPU_COUNT, async (layer) => {
    if (signal?.aborted) throw new Error('Cancelled');

    const outputFile = path.join(outputDir, `${basename}_${layer}.geojson`);
    const cmd = `ogr2ogr -f GeoJSON -t_srs EPSG:4326 "${outputFile}" "${s57File}" ${layer} 2>/dev/null`;

    try {
      await execAsync(cmd, { env, signal, timeout: 60000 });
      const stats = await fs.stat(outputFile);
      if (stats.size > 50) {
        return { layer, file: outputFile };
      } else {
        await fs.unlink(outputFile).catch(() => {});
        return null;
      }
    } catch {
      await fs.unlink(outputFile).catch(() => {});
      return null;
    }
  });

  return results.filter(Boolean);
}

async function mergeGeoJSONByLayer(extractedFiles, outputDir) {
  const byLayer = {};
  for (const { layer, file } of extractedFiles) {
    if (!byLayer[layer]) byLayer[layer] = [];
    byLayer[layer].push(file);
  }

  const mergedFiles = [];

  for (const [layer, files] of Object.entries(byLayer)) {
    if (files.length === 0) continue;

    const mergedPath = path.join(outputDir, `${layer}.geojson`);
    const allFeatures = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const geojson = JSON.parse(content);
        if (geojson.features?.length > 0) {
          allFeatures.push(...geojson.features);
        }
      } catch {
        // skip corrupt files
      }
    }

    if (allFeatures.length > 0) {
      const merged = { type: 'FeatureCollection', features: allFeatures };
      await fs.writeFile(mergedPath, JSON.stringify(merged));
      mergedFiles.push({ layer, file: mergedPath, featureCount: allFeatures.length });
      console.log(`[S57] Merged ${layer}: ${allFeatures.length} features from ${files.length} files`);
    }
  }

  return mergedFiles;
}

/**
 * Main processing job - download, extract, convert to GeoJSON, then tippecanoe to MBTiles
 */
async function processS57Job(jobId, regionId, signal) {
  const regionMeta = S57_REGIONS.find(r => r.id === regionId);
  if (!regionMeta) throw new Error(`Unknown region: ${regionId}`);

  // Pre-flight: check required tools are installed
  for (const [tool, installHint] of [
    ['ogr2ogr', 'sudo apt install gdal-bin'],
    ['unzip', 'sudo apt install unzip'],
    ['tippecanoe', 'sudo apt install tippecanoe']
  ]) {
    try { await execAsync(`which ${tool}`); } catch {
      throw new Error(`${tool} not found. Install it: ${installHint}`);
    }
  }

  const tempDir = path.join(TEMP_DIR, regionId);
  const rawDir = path.join(S57_RAW_DIR, regionId);
  const tempGeojsonDir = path.join(tempDir, 'geojson');
  const finalDir = path.join(S57_DIR, regionId);
  const zipPath = path.join(tempDir, `${regionId}.zip`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(tempGeojsonDir, { recursive: true });
    await fs.mkdir(finalDir, { recursive: true });

    // Check if raw S-57 data already exists (from previous download)
    let s57Files = [];
    try {
      s57Files = await findS57Files(rawDir);
    } catch { /* no raw dir */ }

    if (s57Files.length === 0) {
      // Phase 1: Download (0-30%)
      console.log(`[S57] Phase 1: Downloading ${regionMeta.name}...`);
      global.broadcastProgress(jobId, 0, 'downloading', `Downloading ${regionMeta.name} S-57 data...`, null);

      await fs.mkdir(rawDir, { recursive: true });

      await downloadFileWithProgress(
        regionMeta.downloadUrl,
        zipPath,
        (downloaded, total, speed) => {
          const progress = Math.min(30, total > 0 ? (downloaded / total) * 30 : 0);
          const message = `Downloading: ${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB (${speed.toFixed(1)} MB/s)`;
          global.broadcastProgress(jobId, progress, 'downloading', message, null);
        },
        signal
      );

      // Phase 2: Extract zip (30-35%)
      console.log(`[S57] Phase 2: Extracting ${regionId}...`);
      global.broadcastProgress(jobId, 30, 'extracting', 'Extracting S-57 files...', null);
      await execAsync(`unzip -o "${zipPath}" -d "${rawDir}"`, { maxBuffer: 1024 * 1024 * 50 });
      await fs.unlink(zipPath).catch(() => {});

      s57Files = await findS57Files(rawDir);
    } else {
      console.log(`[S57] Raw S-57 data already exists for ${regionId}, skipping download`);
      global.broadcastProgress(jobId, 35, 'converting', 'Using existing S-57 data...', null);
    }

    console.log(`[S57] Found ${s57Files.length} .000 files`);
    if (s57Files.length === 0) throw new Error('No S-57 (.000) files found');

    // Phase 3: Extract layers to GeoJSON (35-70%)
    // Process multiple .000 files in parallel batches
    console.log(`[S57] Phase 3: Converting ${s57Files.length} S-57 files to GeoJSON (${CPU_COUNT} parallel workers)...`);
    global.broadcastProgress(jobId, 35, 'converting', 'Extracting chart layers...', null);

    const allExtracted = [];
    let filesProcessed = 0;

    // Process files in parallel batches (up to CPU_COUNT at a time)
    await parallelMap(s57Files, CPU_COUNT, async (s57File) => {
      if (signal?.aborted) throw new Error('Cancelled');

      const extracted = await extractS57Layers(s57File, tempGeojsonDir, signal);
      allExtracted.push(...extracted);

      filesProcessed++;
      const progress = 35 + ((filesProcessed / s57Files.length) * 35);
      global.broadcastProgress(
        jobId, progress, 'converting',
        `Extracted ${filesProcessed}/${s57Files.length} charts (${allExtracted.length} layers)`,
        null
      );
    });

    console.log(`[S57] Extracted ${allExtracted.length} layer files`);
    if (allExtracted.length === 0) throw new Error('No valid layers extracted from S-57 files');

    // Phase 4: Merge GeoJSON by layer (70-75%)
    global.broadcastProgress(jobId, 70, 'converting', 'Merging layers...', null);
    const mergedFiles = await mergeGeoJSONByLayer(allExtracted, finalDir);

    if (mergedFiles.length === 0) throw new Error('No features found in S-57 files');

    // Phase 5: Generate vector tiles with tippecanoe (75-93%)
    const mbtilesPath = path.join(S57_DIR, `s57_${regionId}.mbtiles`);
    console.log(`[S57] Phase 5: Running tippecanoe (${CPU_COUNT} threads)...`);
    global.broadcastProgress(jobId, 75, 'converting', 'Generating vector tiles...', null);

    // Build -L flags: one named layer per merged GeoJSON file
    const layerFlags = mergedFiles.map(f => `-L ${f.layer}:${f.file}`).join(' ');

    const tippecanoeCmdParts = [
      'tippecanoe',
      `-o "${mbtilesPath}"`,
      '-z14 -Z0',                        // All zoom levels 0-14
      '--force',                          // Overwrite existing
      '-P',                               // Parallel input reading
      '--drop-densest-as-needed',         // Keep tiles under size limit
      '--extend-zooms-if-still-dropping', // Add zoom levels if needed
      '--no-tile-size-limit',             // Don't reject large tiles
      '--no-feature-limit',               // Don't limit features per tile
      `--progress-interval=1`,            // Report progress every second
      `-n "S-57 ENC ${regionMeta.name}"`,
      `-A "NOAA ENC"`,
      layerFlags
    ];
    const tippecanoeCmd = tippecanoeCmdParts.join(' ');

    await new Promise((resolve, reject) => {
      const child = exec(tippecanoeCmd, { maxBuffer: 1024 * 1024 * 200 }, (error) => {
        if (error && !signal?.aborted) {
          reject(new Error(`tippecanoe failed: ${error.message}`));
        } else {
          resolve();
        }
      });

      // Parse tippecanoe progress from stderr
      child.stderr?.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/(\d+\.?\d*)%/);
        if (match) {
          const tippyProgress = parseFloat(match[1]);
          // Map tippecanoe 0-100% to our 75-93% range
          const overallProgress = 75 + (tippyProgress / 100) * 18;
          global.broadcastProgress(
            jobId, overallProgress, 'converting',
            `Generating vector tiles: ${tippyProgress.toFixed(1)}%`,
            null
          );
        }
      });

      // Handle cancellation
      if (signal) {
        signal.addEventListener('abort', () => { child.kill(); }, { once: true });
      }
    });

    console.log(`[S57] tippecanoe complete: ${mbtilesPath}`);

    // Phase 6: Save metadata & clean up (93-97%)
    global.broadcastProgress(jobId, 93, 'finalizing', 'Saving metadata...', null);

    const mbtilesStats = await fs.stat(mbtilesPath);
    const metadata = {
      region_id: regionId,
      download_date: new Date().toISOString(),
      source_url: regionMeta.downloadUrl,
      file_count: s57Files.length,
      mbtiles_size_mb: parseFloat((mbtilesStats.size / 1024 / 1024).toFixed(1)),
      layers: mergedFiles.map(f => ({ name: f.layer, features: f.featureCount }))
    };
    const metadataPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Clean up GeoJSON intermediates and temp dir
    await fs.rm(finalDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true });

    // Phase 7: Restart Martin to discover new mbtiles (97-100%)
    global.broadcastProgress(jobId, 97, 'finalizing', 'Restarting tile server...', null);
    try {
      const { restartMartin } = await import('./ncdsDownloadService.js');
      await restartMartin();
      console.log('[S57] Martin restarted successfully');
    } catch (martinErr) {
      console.warn('[S57] Martin restart failed (tiles will be available after manual restart):', martinErr.message);
    }

    global.broadcastProgress(jobId, 100, 'completed', `${regionMeta.name} vector charts ready`, null);

    return {
      success: true,
      message: `${regionMeta.name} S-57 vector charts processed successfully`
    };

  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    console.error(`[S57] Job failed for ${regionId}:`, error.message);
    throw error;
  }
}

export async function startDownloadJob(regionIds) {
  const validRegions = regionIds.filter(id => S57_REGIONS.some(r => r.id === id));
  if (validRegions.length === 0) throw new Error('No valid region IDs provided');

  const jobId = crypto.randomBytes(8).toString('hex');
  console.log(`[S57] Starting job ${jobId} for regions: ${validRegions.join(', ')}`);

  if (!global.activeJobs) global.activeJobs = new Map();
  if (!global.progressTrackers) global.progressTrackers = new Map();

  const controller = new AbortController();

  global.activeJobs.set(jobId, {
    controller,
    startTime: Date.now(),
    status: 'starting',
    type: 's57',
    regions: validRegions.map(id => ({
      regionId: id,
      name: S57_REGIONS.find(r => r.id === id)?.name || id,
      status: 'waiting',
      progress: 0
    })),
    summary: { totalRegions: validRegions.length, completedRegions: 0, failedRegions: 0 }
  });

  global.progressTrackers.set(jobId, { progress: 0, status: 'starting', clients: new Set() });

  setImmediate(async () => {
    const job = global.activeJobs.get(jobId);
    const totalRegions = validRegions.length;
    try {
      for (let i = 0; i < totalRegions; i++) {
        if (job.controller.signal.aborted) {
          job.status = 'cancelled';
          global.broadcastProgress(jobId, 0, 'cancelled', 'Cancelled');
          return;
        }

        const regionId = validRegions[i];
        const regionState = job.regions[i];
        const regionMeta = S57_REGIONS.find(r => r.id === regionId);
        const regionName = regionMeta?.name || regionId;

        try {
          regionState.status = 'processing';
          job.status = 'processing';

          // Scale progress for this region within the overall job
          // Region i maps to progress range [i/total*100, (i+1)/total*100]
          const regionProgressBase = (i / totalRegions) * 100;
          const regionProgressRange = (1 / totalRegions) * 100;

          // Wrap broadcastProgress to scale per-region 0-100% into overall range
          const originalBroadcast = global.broadcastProgress;
          global.broadcastProgress = (jId, progress, status, msg, extra) => {
            if (jId === jobId) {
              // Don't let per-region 'completed' status leak as job-level completion
              const scaledProgress = regionProgressBase + (progress / 100) * regionProgressRange;
              const jobMsg = totalRegions > 1
                ? `[${i + 1}/${totalRegions}] ${regionName}: ${msg}`
                : msg;
              const jobStatus = (status === 'completed' || status === 'completed_with_errors')
                ? 'processing' // Keep job as 'processing' until all regions done
                : status;
              originalBroadcast(jId, Math.min(scaledProgress, 99), jobStatus, jobMsg, extra);
            } else {
              originalBroadcast(jId, progress, status, msg, extra);
            }
          };

          await processS57Job(jobId, regionId, job.controller.signal);

          // Restore original broadcast
          global.broadcastProgress = originalBroadcast;

          regionState.status = 'completed';
          regionState.progress = 100;
          job.summary.completedRegions++;
        } catch (error) {
          regionState.status = 'failed';
          regionState.error = error.message;
          job.summary.failedRegions++;
          console.error(`[S57] Region ${regionId} failed:`, error.message);
        }
      }

      const finalStatus = job.summary.failedRegions > 0 ? 'completed_with_errors' : 'completed';
      const failedDetails = job.regions
        .filter(r => r.status === 'failed')
        .map(r => `${r.name}: ${r.error}`)
        .join('; ');
      const message = job.summary.failedRegions > 0
        ? `Failed: ${failedDetails}`
        : `Successfully processed ${job.summary.completedRegions} region(s)`;
      job.status = finalStatus;
      global.broadcastProgress(jobId, 100, finalStatus, message);
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      global.broadcastProgress(jobId, 0, 'failed', error.message);
    }
  });

  return jobId;
}

export function getJobStatus(jobId) {
  const job = global.activeJobs?.get(jobId);
  if (!job) return { success: false, error: 'Job not found' };
  return {
    success: true, jobId, status: job.status,
    progress: job.regions ? Math.round(job.regions.reduce((sum, r) => sum + (r.progress || 0), 0) / job.regions.length) : 0,
    regions: job.regions || [], summary: job.summary || {}, error: job.error
  };
}

export function cancelJob(jobId) {
  const job = global.activeJobs?.get(jobId);
  if (!job) return { success: false, error: 'Job not found' };
  job.controller.abort();
  job.status = 'cancelled';
  return { success: true, message: 'Job cancelled' };
}

export async function checkForUpdates() {
  const downloadedResult = await getDownloadedRegions();
  if (!downloadedResult.success || downloadedResult.regions.length === 0) {
    return { success: true, regions: [], summary: { checked: 0, updatesAvailable: 0, upToDate: 0, errors: 0 } };
  }

  const results = [];
  for (const localRegion of downloadedResult.regions) {
    const regionMeta = S57_REGIONS.find(r => r.id === localRegion.regionId);
    if (!regionMeta) continue;
    try {
      const response = await fetch(regionMeta.downloadUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (!response.ok) { results.push({ ...localRegion, updateStatus: 'error', error: `HTTP ${response.status}` }); continue; }
      const lastModified = response.headers.get('last-modified');
      const remoteDate = lastModified ? new Date(lastModified) : null;
      const localDate = new Date(localRegion.modifiedAt);
      const hasUpdate = remoteDate && remoteDate > localDate;
      results.push({ ...localRegion, updateStatus: hasUpdate ? 'update_available' : 'up_to_date', hasUpdate });
    } catch (error) {
      results.push({ ...localRegion, updateStatus: 'error', error: error.message });
    }
  }

  return {
    success: true, regions: results,
    summary: {
      checked: results.length,
      updatesAvailable: results.filter(r => r.hasUpdate).length,
      upToDate: results.filter(r => r.updateStatus === 'up_to_date').length,
      errors: results.filter(r => r.updateStatus === 'error').length
    }
  };
}

export async function deleteRegion(regionId) {
  try {
    const mbtilesPath = path.join(S57_DIR, `s57_${regionId}.mbtiles`);
    const metaPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);
    await fs.access(mbtilesPath);
    await fs.unlink(mbtilesPath);
    await fs.unlink(metaPath).catch(() => {});
    // Also clean up any leftover GeoJSON directory from old format
    await fs.rm(path.join(S57_DIR, regionId), { recursive: true, force: true }).catch(() => {});
    console.log(`[S57] Deleted region: ${regionId}`);

    // Restart Martin so it stops serving deleted tiles
    try {
      const { restartMartin } = await import('./ncdsDownloadService.js');
      await restartMartin();
    } catch (e) {
      console.warn('[S57] Martin restart after delete failed:', e.message);
    }

    return { success: true, message: `Deleted ${regionId}` };
  } catch (error) {
    if (error.code === 'ENOENT') return { success: false, error: 'Region not found' };
    return { success: false, error: error.message };
  }
}

export async function deleteRawData(regionId) {
  try {
    await fs.rm(path.join(S57_RAW_DIR, regionId), { recursive: true, force: true });
    return { success: true, message: `Deleted raw S-57 data for ${regionId}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getMartinStatus() {
  try {
    const response = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) });
    return response.ok ? { running: true, status: 'healthy' } : { running: false, status: 'unhealthy' };
  } catch (error) {
    return { running: false, status: 'unreachable', error: error.message };
  }
}
