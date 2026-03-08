/**
 * Nautical Chart Style - S-52 Inspired MapLibre GL Layers
 * IHO S-52 ECDIS color scheme for S-57 vector ENC data
 *
 * GeoJSON-direct approach: each layer is its own GeoJSON source
 * No source-layer needed (unlike vector tile sources)
 */

export const S57_LAYER_PREFIX = 's57-'

/**
 * Create all nautical chart layers for a given region.
 * Each S-57 layer becomes a separate GeoJSON source.
 * Returns { sources: {id: sourceConfig}, layers: [layerConfig] }
 */
export function createNauticalStyle(regionId, availableLayers, apiBaseUrl) {
  const sources = {}
  const layers = []
  const prefix = `${S57_LAYER_PREFIX}${regionId}-`

  // Helper to add source + layers only if the layer data exists
  const hasLayer = (name) => availableLayers.includes(name)

  // === A. Depth Areas (DEPARE) - graduated fill by depth ===
  if (hasLayer('DEPARE')) {
    const src = `${prefix}DEPARE`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/DEPARE.geojson` }

    layers.push({
      id: `${prefix}depare-fill`,
      type: 'fill',
      source: src,
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
    layers.push({
      id: `${prefix}depare-outline`,
      type: 'line',
      source: src,
      paint: { 'line-color': '#7faec0', 'line-width': 0.5, 'line-opacity': 0.4 }
    })
  }

  // === B. Dredged Areas (DRGARE) ===
  if (hasLayer('DRGARE')) {
    const src = `${prefix}DRGARE`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/DRGARE.geojson` }
    layers.push({
      id: `${prefix}drgare-fill`, type: 'fill', source: src,
      paint: { 'fill-color': '#c8d8e8', 'fill-opacity': 0.5 }
    })
    layers.push({
      id: `${prefix}drgare-outline`, type: 'line', source: src,
      paint: { 'line-color': '#6090b0', 'line-width': 1, 'line-dasharray': [4, 2] }
    })
  }

  // === C. Land Areas (LNDARE) ===
  if (hasLayer('LNDARE')) {
    const src = `${prefix}LNDARE`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/LNDARE.geojson` }
    layers.push({
      id: `${prefix}lndare-fill`, type: 'fill', source: src,
      paint: { 'fill-color': '#e8d8a8', 'fill-opacity': 1 }
    })
    layers.push({
      id: `${prefix}lndare-outline`, type: 'line', source: src,
      paint: { 'line-color': '#8b7355', 'line-width': 1 }
    })
  }

  // === D. Coastline (COALNE) ===
  if (hasLayer('COALNE')) {
    const src = `${prefix}COALNE`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/COALNE.geojson` }
    layers.push({
      id: `${prefix}coalne`, type: 'line', source: src,
      paint: {
        'line-color': '#4a3728',
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 3, 0.5, 8, 1, 12, 1.5, 16, 2.5]
      }
    })
  }

  // === E. Shoreline Construction (SLCONS) ===
  if (hasLayer('SLCONS')) {
    const src = `${prefix}SLCONS`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/SLCONS.geojson` }
    layers.push({
      id: `${prefix}slcons`, type: 'line', source: src,
      paint: { 'line-color': '#3d3d3d', 'line-width': 2 }
    })
  }

  // === F. Restricted Areas (RESARE) ===
  if (hasLayer('RESARE')) {
    const src = `${prefix}RESARE`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/RESARE.geojson` }
    layers.push({
      id: `${prefix}resare-fill`, type: 'fill', source: src,
      paint: { 'fill-color': '#e87040', 'fill-opacity': 0.15 }
    })
    layers.push({
      id: `${prefix}resare-outline`, type: 'line', source: src,
      paint: { 'line-color': '#e87040', 'line-width': 1.5, 'line-dasharray': [5, 3] }
    })
  }

  // === G. Anchorage Areas (ACHARE) ===
  if (hasLayer('ACHARE')) {
    const src = `${prefix}ACHARE`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/ACHARE.geojson` }
    layers.push({
      id: `${prefix}achare-fill`, type: 'fill', source: src,
      paint: { 'fill-color': '#9060c0', 'fill-opacity': 0.12 }
    })
    layers.push({
      id: `${prefix}achare-outline`, type: 'line', source: src,
      paint: { 'line-color': '#9060c0', 'line-width': 1.5, 'line-dasharray': [5, 3] }
    })
  }

  // === H. Depth Contours (DEPCNT) ===
  if (hasLayer('DEPCNT')) {
    const src = `${prefix}DEPCNT`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/DEPCNT.geojson` }
    layers.push({
      id: `${prefix}depcnt`, type: 'line', source: src,
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
  }

  // === I. Bridges (BRIDGE) ===
  if (hasLayer('BRIDGE')) {
    const src = `${prefix}BRIDGE`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/BRIDGE.geojson` }
    layers.push({
      id: `${prefix}bridge`, type: 'line', source: src,
      paint: { 'line-color': '#666666', 'line-width': 3 }
    })
  }

  // === J. Depth Soundings (SOUNDG) ===
  if (hasLayer('SOUNDG')) {
    const src = `${prefix}SOUNDG`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/SOUNDG.geojson` }
    layers.push({
      id: `${prefix}soundg`, type: 'circle', source: src,
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
  }

  // === K. Wrecks (WRECKS) ===
  if (hasLayer('WRECKS')) {
    const src = `${prefix}WRECKS`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/WRECKS.geojson` }
    layers.push({
      id: `${prefix}wrecks`, type: 'circle', source: src,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6],
        'circle-color': '#cc3333',
        'circle-stroke-color': '#800000',
        'circle-stroke-width': 1.5
      }
    })
  }

  // === L. Obstructions (OBSTRN) ===
  if (hasLayer('OBSTRN')) {
    const src = `${prefix}OBSTRN`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/OBSTRN.geojson` }
    layers.push({
      id: `${prefix}obstrn`, type: 'circle', source: src,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5],
        'circle-color': '#dd4444',
        'circle-stroke-color': '#880000',
        'circle-stroke-width': 1
      }
    })
  }

  // === M. Underwater Rocks (UWTROC) ===
  if (hasLayer('UWTROC')) {
    const src = `${prefix}UWTROC`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/UWTROC.geojson` }
    layers.push({
      id: `${prefix}uwtroc`, type: 'circle', source: src,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 4],
        'circle-color': '#cc5555',
        'circle-stroke-color': '#660000',
        'circle-stroke-width': 1
      }
    })
  }

  // === N. Buoys (BOYSPP) ===
  if (hasLayer('BOYSPP')) {
    const src = `${prefix}BOYSPP`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/BOYSPP.geojson` }
    layers.push({
      id: `${prefix}boyspp`, type: 'circle', source: src,
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
  }

  // === O. Beacons (BCNSPP) ===
  if (hasLayer('BCNSPP')) {
    const src = `${prefix}BCNSPP`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/BCNSPP.geojson` }
    layers.push({
      id: `${prefix}bcnspp`, type: 'circle', source: src,
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
  }

  // === P. Lights (LIGHTS) ===
  if (hasLayer('LIGHTS')) {
    const src = `${prefix}LIGHTS`
    sources[src] = { type: 'geojson', data: `${apiBaseUrl}/tiles/s57/${regionId}/LIGHTS.geojson` }
    layers.push({
      id: `${prefix}lights`, type: 'circle', source: src,
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
  }

  // === Q. Sea Area Names (SEAARE) - just use as data, no symbol layer for perf ===
  // Skipping SEAARE text labels for now to avoid needing font glyphs

  return { sources, layers }
}
