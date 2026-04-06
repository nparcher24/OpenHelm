# S-57 Vector Tiles Pipeline

## Problem

S-57 charts are converted to GeoJSON and served as static files. MapLibre loads entire GeoJSON blobs into memory at all zoom levels. This is slow to load, memory-intensive (especially on Pi 5), and provides no level-of-detail simplification.

## Solution

Add Tippecanoe to the conversion pipeline to produce MBTiles vector tiles. Martin (already in the stack) auto-discovers and serves them. MapLibre loads vector tile sources instead of raw GeoJSON.

## Pipeline

```
.000 → ogr2ogr → GeoJSON (per layer) → tippecanoe → {region}.mbtiles → Martin → MapLibre
```

Tippecanoe produces one `.mbtiles` file per region containing all 17 S-57 layers. GeoJSON files are intermediate artifacts, deleted after mbtiles creation.

## Files to Change

### Backend: `api-server/services/s57DownloadService.js`

**Add Phase 4.5 after GeoJSON merge (Phase 4), before metadata save (Phase 5).**

Run tippecanoe with one `-L` flag per merged GeoJSON file:

```bash
tippecanoe \
  -zg \
  -o tiles/s57/s57_s57_{regionId}.mbtiles \
  --force \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  -L DEPARE:tiles/s57/{regionId}/DEPARE.geojson \
  -L SOUNDG:tiles/s57/{regionId}/SOUNDG.geojson \
  -L DEPCNT:tiles/s57/{regionId}/DEPCNT.geojson \
  ... (one per merged layer file)
```

Key tippecanoe flags:
- `-zg`: Auto-detect max zoom from data density
- `--drop-densest-as-needed`: Drop features at low zooms to keep tiles under size limit
- `--extend-zooms-if-still-dropping`: Add zoom levels if features still being dropped at max
- `--force`: Overwrite existing mbtiles file
- `-L NAME:file.geojson`: Named layer per S-57 object class

After mbtiles creation:
- Delete the per-region GeoJSON directory (`tiles/s57/{regionId}/`)
- Keep `metadata.json` inside the directory until after mbtiles is written, then store metadata alongside the mbtiles file as `tiles/s57/s57_{regionId}.metadata.json`
- Restart Martin so it discovers the new mbtiles

**Pre-flight check**: Verify `tippecanoe` is installed alongside existing `ogr2ogr` and `unzip` checks.

**Progress update**: Phase 4.5 maps to progress range 88-93% (between merge at 85% and metadata at 95%).

### Frontend: `src/styles/nauticalChartStyle.js`

**Change `createNauticalStyle()` to produce vector tile source configs instead of GeoJSON.**

Current source config per layer:
```js
{ type: 'geojson', data: '/tiles/s57/VA/DEPARE.geojson' }
```

New source config per region (single source, all layers inside):
```js
{ type: 'vector', tiles: [`${tileServerUrl}/s57_${regionId}/{z}/{x}/{y}`], minzoom: 0, maxzoom: 14 }
```

Where `tileServerUrl` is derived from browser hostname (same pattern used elsewhere — port 3001). Martin auto-generates the endpoint name from the mbtiles filename: `s57_NH.mbtiles` becomes `/s57_NH/{z}/{x}/{y}`. The `s57_` prefix is part of the filename to avoid collisions with other mbtiles in the tiles directory.

**Layer definitions** stay the same (paint, layout, filter rules) but gain:
- `source`: changes from `s57-{regionId}-{LAYERNAME}` to `s57-{regionId}` (one source per region)
- `source-layer`: added, set to the S-57 layer name (e.g., `DEPARE`, `SOUNDG`)

The function signature changes: instead of receiving a list of layer URLs, it receives a regionId and the tile server URL, and produces sources + layers for all 17 potential layers.

### Frontend: `src/components/ChartView.jsx`

**Change `loadS57Layers()` to use vector tile sources.**

Current flow:
1. For each region, fetch layer list from API
2. For each layer, create a GeoJSON source
3. Add layers referencing individual sources

New flow:
1. For each downloaded region, add one vector tile source pointing to Martin
2. Add all 17 layer style definitions referencing that source with `source-layer`
3. Layers that don't exist in the mbtiles simply render nothing (no error)

This simplifies the code — no need to query available layers per region. Just add all layer styles; missing source-layers are silently ignored by MapLibre.

**Feature querying** (`queryRenderedFeatures`): No change needed. Works identically with vector tile sources.

**Sublayer visibility** (`S57SubLayerMenu.jsx`): No change. Layer IDs stay the same pattern, visibility toggling works the same way.

### Frontend: `src/services/s57Service.js` (or equivalent)

**`getRegionLayers()` call becomes optional.** With vector tiles, we don't need to know which layers exist before adding sources. The layer list in the mbtiles metadata can still be read for UI display purposes, but it's no longer required for rendering.

### Martin: `martin-config.yaml`

**No change.** Martin already auto-discovers `.mbtiles` files in `./tiles/s57/`. The new `s57_{regionId}.mbtiles` files will be served automatically at `/s57_{regionId}/{z}/{x}/{y}`.

### Frontend: `src/components/S57Downloader.jsx`

**Minor change to storage display.** Instead of counting GeoJSON files per region, show mbtiles file size. The `getDownloadedRegions()` API response should include mbtiles file size.

### Backend: `api-server/services/s57DownloadService.js` — `getDownloadedRegions()`

**Change region detection.** Instead of scanning for directories containing `metadata.json`, scan for `s57_{regionId}.mbtiles` files in `tiles/s57/` and read the companion `s57_{regionId}.metadata.json`.

### Backend: `api-server/services/s57DownloadService.js` — `deleteRegion()`

**Change deletion target.** Delete `tiles/s57/s57_{regionId}.mbtiles` and `tiles/s57/s57_{regionId}.metadata.json` instead of a directory. Restart Martin after deletion.

## What Does NOT Change

- NOAA download URLs and region definitions
- S-57 `.000` parsing via ogr2ogr (still required — tippecanoe needs GeoJSON input)
- The 17 target layers (DEPARE, DEPCNT, SOUNDG, etc.)
- S-52 paint/layout styling rules (colors, widths, opacity, zoom-dependent rendering)
- Sublayer visibility toggle UI and state management
- Job progress WebSocket system
- Raw data storage/deletion (`tiles/s57_raw/`)
- Update checking against NOAA

## Testing

1. **Unit test the pipeline**: Download one small region (NH — 10MB), verify mbtiles is created with all expected layers
2. **Verify Martin serves tiles**: After mbtiles creation, `curl http://localhost:3001/s57_NH/0/0/0` should return a vector tile
3. **Verify MapLibre renders**: Load the chart view, confirm S-57 layers display correctly at multiple zoom levels
4. **Verify sublayer toggles**: Toggle individual layers and groups on/off
5. **Verify feature querying**: Long-press on a chart feature, confirm popup appears with correct attributes
6. **Verify deletion**: Delete a region, confirm mbtiles removed and Martin stops serving it
7. **Performance comparison**: Compare load time and memory usage vs old GeoJSON approach on Pi 5
