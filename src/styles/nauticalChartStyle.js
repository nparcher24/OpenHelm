/**
 * Nautical Chart Style - S-52 Inspired MapLibre GL Layers
 * IHO S-52 ECDIS color scheme for S-57 vector ENC data
 *
 * Vector tile approach: one source per region, layers reference source-layer
 * Martin serves tiles from s57_{regionId}.mbtiles
 */

export const S57_LAYER_PREFIX = 's57-'

/**
 * Create all nautical chart layers for a given region.
 * Single vector tile source per region; all S-57 layers inside as source-layers.
 * Returns { sources: {id: sourceConfig}, layers: [layerConfig] }
 */
export function createNauticalStyle(regionId, availableLayers, tileServerUrl) {
  const sources = {}
  const layers = []
  const prefix = `${S57_LAYER_PREFIX}${regionId}-`
  const sourceId = `${S57_LAYER_PREFIX}${regionId}`

  // Single vector tile source for the entire region
  sources[sourceId] = {
    type: 'vector',
    tiles: [`${tileServerUrl}/s57_${regionId}/{z}/{x}/{y}`],
    minzoom: 0,
    maxzoom: 14
  }

  // All layers reference the same source, with source-layer for each S-57 object class.
  // Layers that don't exist in the mbtiles simply render nothing (MapLibre ignores missing source-layers).

  // === A. Depth Areas (DEPARE) - graduated fill by depth ===
  layers.push({
    id: `${prefix}depare-fill`,
    type: 'fill',
    source: sourceId,
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
  layers.push({
    id: `${prefix}depare-outline`,
    type: 'line',
    source: sourceId,
    'source-layer': 'DEPARE',
    paint: { 'line-color': '#7faec0', 'line-width': 0.5, 'line-opacity': 0.4 }
  })

  // === B. Dredged Areas (DRGARE) ===
  layers.push({
    id: `${prefix}drgare-fill`, type: 'fill', source: sourceId, 'source-layer': 'DRGARE',
    paint: { 'fill-color': '#c8d8e8', 'fill-opacity': 0.5 }
  })
  layers.push({
    id: `${prefix}drgare-outline`, type: 'line', source: sourceId, 'source-layer': 'DRGARE',
    paint: { 'line-color': '#6090b0', 'line-width': 1, 'line-dasharray': [4, 2] }
  })

  // === C. Land Areas (LNDARE) ===
  layers.push({
    id: `${prefix}lndare-fill`, type: 'fill', source: sourceId, 'source-layer': 'LNDARE',
    paint: { 'fill-color': '#e8d8a8', 'fill-opacity': 1 }
  })
  layers.push({
    id: `${prefix}lndare-outline`, type: 'line', source: sourceId, 'source-layer': 'LNDARE',
    paint: { 'line-color': '#8b7355', 'line-width': 1 }
  })

  // === D. Coastline (COALNE) ===
  layers.push({
    id: `${prefix}coalne`, type: 'line', source: sourceId, 'source-layer': 'COALNE',
    paint: {
      'line-color': '#4a3728',
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 3, 0.5, 8, 1, 12, 1.5, 16, 2.5]
    }
  })

  // === E. Shoreline Construction (SLCONS) ===
  layers.push({
    id: `${prefix}slcons`, type: 'line', source: sourceId, 'source-layer': 'SLCONS',
    paint: { 'line-color': '#3d3d3d', 'line-width': 2 }
  })

  // === F. Restricted Areas (RESARE) ===
  layers.push({
    id: `${prefix}resare-fill`, type: 'fill', source: sourceId, 'source-layer': 'RESARE',
    paint: { 'fill-color': '#e87040', 'fill-opacity': 0.15 }
  })
  layers.push({
    id: `${prefix}resare-outline`, type: 'line', source: sourceId, 'source-layer': 'RESARE',
    paint: { 'line-color': '#e87040', 'line-width': 1.5, 'line-dasharray': [5, 3] }
  })

  // === G. Anchorage Areas (ACHARE) ===
  layers.push({
    id: `${prefix}achare-fill`, type: 'fill', source: sourceId, 'source-layer': 'ACHARE',
    paint: { 'fill-color': '#9060c0', 'fill-opacity': 0.12 }
  })
  layers.push({
    id: `${prefix}achare-outline`, type: 'line', source: sourceId, 'source-layer': 'ACHARE',
    paint: { 'line-color': '#9060c0', 'line-width': 1.5, 'line-dasharray': [5, 3] }
  })

  // === H. Depth Contours (DEPCNT) ===
  layers.push({
    id: `${prefix}depcnt`, type: 'line', source: sourceId, 'source-layer': 'DEPCNT',
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
  layers.push({
    id: `${prefix}bridge`, type: 'line', source: sourceId, 'source-layer': 'BRIDGE',
    paint: { 'line-color': '#666666', 'line-width': 3 }
  })

  // === J. Depth Soundings (SOUNDG) ===
  layers.push({
    id: `${prefix}soundg`, type: 'circle', source: sourceId, 'source-layer': 'SOUNDG',
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
  layers.push({
    id: `${prefix}wrecks`, type: 'circle', source: sourceId, 'source-layer': 'WRECKS',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6],
      'circle-color': '#cc3333',
      'circle-stroke-color': '#800000',
      'circle-stroke-width': 1.5
    }
  })

  // === L. Obstructions (OBSTRN) ===
  layers.push({
    id: `${prefix}obstrn`, type: 'circle', source: sourceId, 'source-layer': 'OBSTRN',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5],
      'circle-color': '#dd4444',
      'circle-stroke-color': '#880000',
      'circle-stroke-width': 1
    }
  })

  // === M. Underwater Rocks (UWTROC) ===
  layers.push({
    id: `${prefix}uwtroc`, type: 'circle', source: sourceId, 'source-layer': 'UWTROC',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 4],
      'circle-color': '#cc5555',
      'circle-stroke-color': '#660000',
      'circle-stroke-width': 1
    }
  })

  // === N. Buoys (BOYSPP) ===
  layers.push({
    id: `${prefix}boyspp`, type: 'circle', source: sourceId, 'source-layer': 'BOYSPP',
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
  layers.push({
    id: `${prefix}bcnspp`, type: 'circle', source: sourceId, 'source-layer': 'BCNSPP',
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
  layers.push({
    id: `${prefix}lights`, type: 'circle', source: sourceId, 'source-layer': 'LIGHTS',
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

  // === Q. Sea Area Names (SEAARE) - just use as data, no symbol layer for perf ===
  // Skipping SEAARE text labels for now to avoid needing font glyphs

  return { sources, layers }
}
