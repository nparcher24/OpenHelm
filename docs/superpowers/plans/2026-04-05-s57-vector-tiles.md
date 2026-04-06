# S-57 Vector Tiles Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace S-57 GeoJSON-direct serving with MBTiles vector tiles served by Martin, for dramatically faster map loading and lower memory usage.

**Architecture:** Keep ogr2ogr for S-57 parsing, add tippecanoe to produce one MBTiles file per region with all 17 layers. Martin auto-discovers and serves the MBTiles. MapLibre switches from GeoJSON sources to vector tile sources. Existing S-52 styling rules preserved.

**Tech Stack:** tippecanoe (already installed v2.79.0), Martin tileserver (already running), MapLibre GL JS, Express.js API server

**Key URLs/Patterns:**
- `TILE_BASE` = `http://${host}:3001` (from `src/utils/apiConfig.js`)
- Martin serves mbtiles by filename stem: `s57_NH.mbtiles` → `/s57_NH/{z}/{x}/{y}`
- API server: `http://${host}:3002`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `api-server/services/s57DownloadService.js` | Modify | Add tippecanoe phase, change region detection to scan for .mbtiles, change deletion |
| `src/styles/nauticalChartStyle.js` | Rewrite | Switch from GeoJSON sources to vector tile source with source-layer |
| `src/components/ChartView.jsx` | Modify | Simplify loadS57Layers to use vector tile sources (one source per region) |
| `src/components/S57Downloader.jsx` | Minor modify | Update storage display to show mbtiles size instead of GeoJSON count |

---

## Task 1: Backend — Add tippecanoe to pipeline

**Files:**
- Modify: `api-server/services/s57DownloadService.js`

- [ ] **Step 1: Add tippecanoe pre-flight check**

In `processS57Job()`, after the existing `which ogr2ogr` and `which unzip` checks (around line 336), add:

```javascript
  try {
    await execAsync('which tippecanoe');
  } catch {
    throw new Error('tippecanoe not found. Install it: brew install tippecanoe (macOS) or see https://github.com/felt/tippecanoe');
  }
```

- [ ] **Step 2: Add tippecanoe conversion phase after GeoJSON merge**

In `processS57Job()`, after the `mergeGeoJSONByLayer` call (currently around line 416) and before the metadata save phase, add Phase 4.5:

```javascript
    // Phase 4.5: Convert merged GeoJSON to MBTiles vector tiles (88-93%)
    console.log(`[S57] Phase 4.5: Building vector tiles with tippecanoe...`);
    global.broadcastProgress(jobId, 88, 'tiling', 'Building vector tiles...', null);

    const mbtilesPath = path.join(S57_DIR, `s57_${regionId}.mbtiles`);

    // Build -L flags for each merged GeoJSON layer file
    const layerFlags = mergedFiles
      .map(f => `-L ${f.layer}:${f.file}`)
      .join(' ');

    const tippecanoeCmd = `tippecanoe -zg -o "${mbtilesPath}" --force --drop-densest-as-needed --extend-zooms-if-still-dropping ${layerFlags}`;
    console.log(`[S57] Running: ${tippecanoeCmd}`);

    await execAsync(tippecanoeCmd, { timeout: 300000, maxBuffer: 1024 * 1024 * 10 });
    console.log(`[S57] MBTiles created: ${mbtilesPath}`);
```

- [ ] **Step 3: Save metadata as companion JSON file and clean up GeoJSON**

After the tippecanoe step, replace the existing metadata save section. The metadata should be saved alongside the mbtiles file (not inside a region directory), and the GeoJSON directory should be cleaned up:

```javascript
    // Phase 5: Save metadata and clean up (93-100%)
    global.broadcastProgress(jobId, 93, 'finalizing', 'Saving metadata...', null);

    const mbtilesStats = await fs.stat(mbtilesPath);
    const metadata = {
      region_id: regionId,
      download_date: new Date().toISOString(),
      source_url: regionMeta.downloadUrl,
      file_count: s57Files.length,
      sizeMB: parseFloat((mbtilesStats.size / 1024 / 1024).toFixed(1)),
      layers: mergedFiles.map(f => ({ name: f.layer, features: f.featureCount }))
    };
    const metadataPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Clean up intermediate GeoJSON directory
    await fs.rm(finalDir, { recursive: true, force: true });

    // Clean up temp dir
    await fs.rm(tempDir, { recursive: true, force: true });

    global.broadcastProgress(jobId, 100, 'completed', `${regionMeta.name} vector charts ready`, null);
```

Remove the old Phase 5 metadata save block and the old temp cleanup that this replaces.

- [ ] **Step 4: Rewrite `getDownloadedRegions()` to scan for mbtiles files**

Replace the existing `getDownloadedRegions()` function (lines ~127-177) with:

```javascript
export async function getDownloadedRegions() {
  try {
    await fs.mkdir(S57_DIR, { recursive: true });
    const entries = await fs.readdir(S57_DIR);
    const regions = [];

    for (const entry of entries) {
      // Look for s57_{regionId}.mbtiles files
      const match = entry.match(/^s57_(\w+)\.mbtiles$/);
      if (!match) continue;

      const regionId = match[1];
      const mbtilesPath = path.join(S57_DIR, entry);
      const metadataPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);

      try {
        const mbtilesStats = await fs.stat(mbtilesPath);
        let metadata = {};
        try {
          const metaContent = await fs.readFile(metadataPath, 'utf8');
          metadata = JSON.parse(metaContent);
        } catch { /* metadata file may not exist */ }

        const regionMeta = S57_REGIONS.find(r => r.id === regionId);
        const layers = (metadata.layers || []).map(l => l.name);

        regions.push({
          regionId,
          name: regionMeta?.name || regionId,
          description: regionMeta ? `S-57 vector charts for ${regionMeta.name}` : '',
          sizeMB: parseFloat((mbtilesStats.size / 1024 / 1024).toFixed(1)),
          downloadedAt: metadata.download_date,
          modifiedAt: metadata.download_date,
          fileCount: metadata.file_count || 0,
          layers
        });
      } catch {
        // Skip invalid files
      }
    }

    return { success: true, regions };
  } catch (error) {
    console.error('[S57] Error getting downloaded regions:', error);
    return { success: false, error: error.message, regions: [] };
  }
}
```

- [ ] **Step 5: Rewrite `deleteRegion()` to delete mbtiles + metadata**

Replace the existing `deleteRegion()` function (lines ~577-588) with:

```javascript
export async function deleteRegion(regionId) {
  try {
    const mbtilesPath = path.join(S57_DIR, `s57_${regionId}.mbtiles`);
    const metadataPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);

    await fs.access(mbtilesPath);
    await fs.unlink(mbtilesPath);
    await fs.unlink(metadataPath).catch(() => {});
    console.log(`[S57] Deleted region: ${regionId}`);
    return { success: true, message: `Deleted ${regionId}` };
  } catch (error) {
    if (error.code === 'ENOENT') return { success: false, error: 'Region not found' };
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 6: Update `getStorageInfo()` to count mbtiles instead of GeoJSON**

In the `getStorageInfo()` function, change the scan logic from looking for directories with `.geojson` files to scanning for `.mbtiles` files:

Replace the section that iterates `entries` (around lines 82-98) with:

```javascript
    for (const entry of entries) {
      if (entry.isFile && entry.name.match(/^s57_\w+\.mbtiles$/)) {
        const filePath = path.join(S57_DIR, entry.name);
        try {
          const stats = await fs.stat(filePath);
          totalSizeMB += stats.size / 1024 / 1024;
          downloadedCount++;
        } catch { /* skip */ }
      }
    }
```

Note: `entries` needs to be read with `{ withFileTypes: true }`. The existing code already does this for some paths but the logic needs adjustment.

- [ ] **Step 7: Update `getRegionLayers()` to read from metadata JSON**

Replace the existing function (lines ~179-199) with:

```javascript
export async function getRegionLayers(regionId) {
  const metadataPath = path.join(S57_DIR, `s57_${regionId}.metadata.json`);
  try {
    const metaContent = await fs.readFile(metadataPath, 'utf8');
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
```

- [ ] **Step 8: Restart API server and verify it starts**

```bash
pkill -f "node api-server/server.js"; sleep 1; node api-server/server.js > api.log 2>&1 &
sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/
```

Expected: `200`

- [ ] **Step 9: Commit backend changes**

```bash
git add api-server/services/s57DownloadService.js
git commit -m "feat: add tippecanoe vector tile generation to S57 pipeline"
```

---

## Task 2: Frontend — Switch nauticalChartStyle to vector tile sources

**Files:**
- Rewrite: `src/styles/nauticalChartStyle.js`

- [ ] **Step 1: Rewrite `createNauticalStyle()` for vector tile sources**

Replace the entire file with:

```javascript
/**
 * Nautical Chart Style - S-52 Inspired MapLibre GL Layers
 * IHO S-52 ECDIS color scheme for S-57 vector ENC data
 *
 * Vector tile approach: one source per region, layers via source-layer.
 * Martin serves mbtiles at /s57_{regionId}/{z}/{x}/{y}
 */

import { TILE_BASE } from '../utils/apiConfig.js'

export const S57_LAYER_PREFIX = 's57-'

/**
 * Create all nautical chart layers for a given region.
 * Single vector tile source per region, all S-57 layers inside via source-layer.
 * Returns { sources: {id: sourceConfig}, layers: [layerConfig] }
 */
export function createNauticalStyle(regionId) {
  const sources = {}
  const layers = []
  const sourceId = `${S57_LAYER_PREFIX}${regionId}`
  const prefix = `${S57_LAYER_PREFIX}${regionId}-`

  // One vector tile source for the entire region
  sources[sourceId] = {
    type: 'vector',
    tiles: [`${TILE_BASE}/s57_${regionId}/{z}/{x}/{y}`],
    minzoom: 0,
    maxzoom: 14
  }

  // Helper: add layer with source-layer
  const addLayer = (config) => {
    layers.push({ ...config, source: sourceId })
  }

  // === A. Depth Areas (DEPARE) - graduated fill by depth ===
  addLayer({
    id: `${prefix}depare-fill`,
    type: 'fill',
    'source-layer': 'DEPARE',
    paint: {
      'fill-color': [
        'case',
        ['<', ['to-number', ['get', 'DRVAL2'], 1000], 0], '#98c964',
        ['<', ['to-number', ['get', 'DRVAL2'], 1000], 2], '#f5e6b8',
        ['<', ['to-number', ['get', 'DRVAL2'], 1000], 5], '#d4eef7',
        ['<', ['to-number', ['get', 'DRVAL2'], 1000], 10], '#b8dced',
        ['<', ['to-number', ['get', 'DRVAL2'], 1000], 20], '#9ccfdf',
        ['<', ['to-number', ['get', 'DRVAL2'], 1000], 50], '#82c0d4',
        ['<', ['to-number', ['get', 'DRVAL2'], 1000], 100], '#6bb1c7',
        '#5aa2bb'
      ],
      'fill-opacity': 0.85
    }
  })
  addLayer({
    id: `${prefix}depare-outline`,
    type: 'line',
    'source-layer': 'DEPARE',
    paint: { 'line-color': '#7faec0', 'line-width': 0.5, 'line-opacity': 0.4 }
  })

  // === B. Dredged Areas (DRGARE) ===
  addLayer({
    id: `${prefix}drgare-fill`, type: 'fill', 'source-layer': 'DRGARE',
    paint: { 'fill-color': '#c8d8e8', 'fill-opacity': 0.5 }
  })
  addLayer({
    id: `${prefix}drgare-outline`, type: 'line', 'source-layer': 'DRGARE',
    paint: { 'line-color': '#6090b0', 'line-width': 1, 'line-dasharray': [4, 2] }
  })

  // === C. Land Areas (LNDARE) ===
  addLayer({
    id: `${prefix}lndare-fill`, type: 'fill', 'source-layer': 'LNDARE',
    paint: { 'fill-color': '#e8d8a8', 'fill-opacity': 1 }
  })
  addLayer({
    id: `${prefix}lndare-outline`, type: 'line', 'source-layer': 'LNDARE',
    paint: { 'line-color': '#8b7355', 'line-width': 1 }
  })

  // === D. Coastline (COALNE) ===
  addLayer({
    id: `${prefix}coalne`, type: 'line', 'source-layer': 'COALNE',
    paint: {
      'line-color': '#4a3728',
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 3, 0.5, 8, 1, 12, 1.5, 16, 2.5]
    }
  })

  // === E. Shoreline Construction (SLCONS) ===
  addLayer({
    id: `${prefix}slcons`, type: 'line', 'source-layer': 'SLCONS',
    paint: { 'line-color': '#3d3d3d', 'line-width': 2 }
  })

  // === F. Restricted Areas (RESARE) ===
  addLayer({
    id: `${prefix}resare-fill`, type: 'fill', 'source-layer': 'RESARE',
    paint: { 'fill-color': '#e87040', 'fill-opacity': 0.15 }
  })
  addLayer({
    id: `${prefix}resare-outline`, type: 'line', 'source-layer': 'RESARE',
    paint: { 'line-color': '#e87040', 'line-width': 1.5, 'line-dasharray': [5, 3] }
  })

  // === G. Anchorage Areas (ACHARE) ===
  addLayer({
    id: `${prefix}achare-fill`, type: 'fill', 'source-layer': 'ACHARE',
    paint: { 'fill-color': '#9060c0', 'fill-opacity': 0.12 }
  })
  addLayer({
    id: `${prefix}achare-outline`, type: 'line', 'source-layer': 'ACHARE',
    paint: { 'line-color': '#9060c0', 'line-width': 1.5, 'line-dasharray': [5, 3] }
  })

  // === H. Depth Contours (DEPCNT) ===
  addLayer({
    id: `${prefix}depcnt`, type: 'line', 'source-layer': 'DEPCNT',
    paint: {
      'line-color': ['case',
        ['<=', ['to-number', ['get', 'VALDCO'], 0], 5], '#4a7a90',
        '#6a9ab0'
      ],
      'line-width': ['case',
        ['<=', ['to-number', ['get', 'VALDCO'], 0], 5], 1.2,
        0.8
      ],
      'line-opacity': 0.7
    }
  })

  // === I. Bridges (BRIDGE) ===
  addLayer({
    id: `${prefix}bridge`, type: 'line', 'source-layer': 'BRIDGE',
    paint: { 'line-color': '#666666', 'line-width': 3 }
  })

  // === J. Depth Soundings (SOUNDG) ===
  addLayer({
    id: `${prefix}soundg`, type: 'circle', 'source-layer': 'SOUNDG',
    minzoom: 11,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 14, 3, 16, 4],
      'circle-color': ['case',
        ['<', ['to-number', ['get', 'DEPTH'], 0], 0], '#2d8040',
        ['<', ['to-number', ['get', 'DEPTH'], 0], 5], '#1a1a1a',
        '#555555'
      ],
      'circle-opacity': 0.8
    }
  })

  // === K. Wrecks (WRECKS) ===
  addLayer({
    id: `${prefix}wrecks`, type: 'circle', 'source-layer': 'WRECKS',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6],
      'circle-color': '#cc3333',
      'circle-stroke-color': '#800000',
      'circle-stroke-width': 1.5
    }
  })

  // === L. Obstructions (OBSTRN) ===
  addLayer({
    id: `${prefix}obstrn`, type: 'circle', 'source-layer': 'OBSTRN',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5],
      'circle-color': '#dd4444',
      'circle-stroke-color': '#880000',
      'circle-stroke-width': 1
    }
  })

  // === M. Underwater Rocks (UWTROC) ===
  addLayer({
    id: `${prefix}uwtroc`, type: 'circle', 'source-layer': 'UWTROC',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 4],
      'circle-color': '#cc5555',
      'circle-stroke-color': '#660000',
      'circle-stroke-width': 1
    }
  })

  // === N. Buoys (BOYSPP) ===
  addLayer({
    id: `${prefix}boyspp`, type: 'circle', 'source-layer': 'BOYSPP',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 7],
      'circle-color': ['case',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 3], '#cc0000',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 4], '#00aa00',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 6], '#cccc00',
        '#ffffff'
      ],
      'circle-stroke-color': '#333333',
      'circle-stroke-width': 1.5
    }
  })

  // === O. Beacons (BCNSPP) ===
  addLayer({
    id: `${prefix}bcnspp`, type: 'circle', 'source-layer': 'BCNSPP',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5],
      'circle-color': ['case',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 3], '#cc0000',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 4], '#00aa00',
        '#ffffff'
      ],
      'circle-stroke-color': '#333333',
      'circle-stroke-width': 1
    }
  })

  // === P. Lights (LIGHTS) ===
  addLayer({
    id: `${prefix}lights`, type: 'circle', 'source-layer': 'LIGHTS',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6],
      'circle-color': ['case',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 3], '#ff4444',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 4], '#44ff44',
        ['==', ['to-number', ['get', 'COLOUR'], 0], 1], '#ffffff',
        '#ffff44'
      ],
      'circle-stroke-color': '#9060c0',
      'circle-stroke-width': 2,
      'circle-opacity': 0.9
    }
  })

  // === Q. Sea Area Names (SEAARE) - skipped for performance ===

  return { sources, layers }
}
```

- [ ] **Step 2: Verify the file was written correctly**

Read the file back and confirm no syntax issues. Run vite to check for compile errors:

Check browser console or vite output for import errors.

- [ ] **Step 3: Commit frontend style changes**

```bash
git add src/styles/nauticalChartStyle.js
git commit -m "feat: switch nautical chart style to vector tile sources"
```

---

## Task 3: Frontend — Update ChartView.jsx to use vector tile sources

**Files:**
- Modify: `src/components/ChartView.jsx`

- [ ] **Step 1: Simplify `loadS57Layers()` function**

Replace the `loadS57Layers` function (lines ~1023-1086) with:

```javascript
  // Load S-57 vector chart layers (vector tiles via Martin)
  const loadS57Layers = async () => {
    try {
      const result = await getDownloadedS57Regions()
      if (!map.current) return

      if (!result.success || !result.regions || result.regions.length === 0) {
        console.log('[ChartView] No S-57 vector regions downloaded')
        setS57RegionCount(0)
        return
      }

      const regions = result.regions
      setS57RegionCount(regions.length)
      console.log(`[ChartView] Loading ${regions.length} S-57 vector regions`)

      for (const region of regions) {
        if (!map.current) return

        // Skip if already loaded
        const sourceId = `${S57_LAYER_PREFIX}${region.regionId}`
        if (map.current.getSource(sourceId)) {
          console.log(`[ChartView] S-57 region ${region.regionId} already loaded, skipping`)
          continue
        }

        // Create sources and layers from the nautical style
        const { sources, layers } = createNauticalStyle(region.regionId)

        // Add the vector tile source
        for (const [srcId, sourceConfig] of Object.entries(sources)) {
          if (!map.current.getSource(srcId)) {
            map.current.addSource(srcId, sourceConfig)
          }
        }

        // Add all layers
        for (const layer of layers) {
          map.current.addLayer(layer)
        }

        console.log(`[ChartView] Added S-57 vector tile layers for ${region.regionId}`)
      }

      // Collect all S-57 layer IDs for queryRenderedFeatures
      const allS57Layers = (map.current.getStyle()?.layers || [])
        .filter(l => l.id.startsWith(S57_LAYER_PREFIX))
        .map(l => l.id)
      s57LayerIdsRef.current = allS57Layers

      console.log(`[ChartView] Loaded S-57 vector regions successfully`)
      setS57LayersLoaded(n => n + 1)
    } catch (err) {
      console.error('Error loading S-57 layers:', err)
    }
  }
```

Key changes:
- `createNauticalStyle(region.regionId)` — no longer needs `availableLayers` or `apiBaseUrl` params
- No longer calls `getRegionLayers()` — vector tiles handle missing layers silently
- Source check uses `${S57_LAYER_PREFIX}${region.regionId}` (one source per region, not per layer)

- [ ] **Step 2: Remove unused imports if applicable**

Check if `getRegionLayers` was imported in ChartView.jsx. If so, remove it. The current import is `getDownloadedRegions as getDownloadedS57Regions` which stays.

Also update the `createNauticalStyle` import — it no longer needs `apiBaseUrl`:
The import line stays the same: `import { createNauticalStyle, S57_LAYER_PREFIX } from '../styles/nauticalChartStyle'`
But the call site changes (already handled in Step 1).

- [ ] **Step 3: Commit ChartView changes**

```bash
git add src/components/ChartView.jsx
git commit -m "feat: load S57 charts as vector tiles from Martin"
```

---

## Task 4: End-to-end test — Download NH region and verify rendering

- [ ] **Step 1: Restart API server with backend changes**

```bash
pkill -f "node api-server/server.js"; sleep 1
node api-server/server.js > api.log 2>&1 &
sleep 2 && curl -s http://localhost:3002/api/s57/regions | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} regions available')"
```

Expected: `24 regions available`

- [ ] **Step 2: Trigger NH region download via API**

```bash
curl -s -X POST http://localhost:3002/api/s57/download/start \
  -H 'Content-Type: application/json' \
  -d '{"regions":["NH"]}' | python3 -m json.tool
```

Expected: Returns a jobId.

- [ ] **Step 3: Poll job status until complete**

```bash
# Replace JOB_ID with the actual job ID from step 2
curl -s http://localhost:3002/api/s57/download/jobs/JOB_ID/status | python3 -m json.tool
```

Watch for status progressing through: `downloading` → `extracting` → `converting` → `tiling` → `finalizing` → `completed`

- [ ] **Step 4: Verify mbtiles file was created**

```bash
ls -la tiles/s57/s57_NH.mbtiles
ls -la tiles/s57/s57_NH.metadata.json
cat tiles/s57/s57_NH.metadata.json
```

Expected: mbtiles file exists (several MB), metadata JSON lists layers with feature counts.

- [ ] **Step 5: Verify NO GeoJSON directory remains**

```bash
ls tiles/s57/NH/ 2>/dev/null && echo "ERROR: GeoJSON dir still exists" || echo "OK: GeoJSON cleaned up"
```

Expected: `OK: GeoJSON cleaned up`

- [ ] **Step 6: Restart Martin and verify it discovers the new mbtiles**

```bash
pkill -f martin; sleep 1
martin --config martin-config.yaml > martin.log 2>&1 &
sleep 2
curl -s http://localhost:3001/catalog | python3 -c "import sys,json; d=json.load(sys.stdin); print('Sources:', list(d.get('tiles',{}).keys()))"
```

Expected: Shows `s57_NH` in the sources list.

- [ ] **Step 7: Verify Martin serves vector tiles**

```bash
# Try fetching a tile at a zoom level that should have data (zoom 10, covering NH coast)
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/s57_NH/10/311/373"
```

Expected: `200` (returns binary protobuf tile data)

- [ ] **Step 8: Verify the downloaded regions API returns mbtiles-based data**

```bash
curl -s http://localhost:3002/api/s57/downloaded | python3 -m json.tool
```

Expected: Shows NH region with `sizeMB` reflecting mbtiles size, `layers` array listing extracted layers.

- [ ] **Step 9: Open the app in browser and verify chart rendering**

Open `http://localhost:3000` in browser. Navigate to the NH coast area. Verify:
1. S-57 depth areas (blue graduated fills) render
2. Coastline renders
3. Navigation aids (buoys, lights) render at appropriate zoom levels
4. Sublayer toggle menu works (toggle layers on/off)
5. Long-press on a feature shows the feature card with attributes
6. Zooming in/out shows appropriate level of detail (fewer features at low zoom)

- [ ] **Step 10: Test region deletion**

```bash
curl -s -X DELETE http://localhost:3002/api/s57/regions/NH | python3 -m json.tool
ls tiles/s57/s57_NH.mbtiles 2>/dev/null && echo "ERROR: mbtiles still exists" || echo "OK: deleted"
```

Expected: `OK: deleted`

- [ ] **Step 11: Commit all changes**

```bash
git add -A
git commit -m "feat: S57 vector tiles pipeline - tippecanoe + Martin + MapLibre"
```
