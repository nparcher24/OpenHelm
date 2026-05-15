/**
 * Nautical Chart Style - S-52 inspired MapLibre GL layers.
 * Palette is theme-driven via chartPalettes.js (day / dark / night).
 *
 * One vector source per region, layers reference source-layer.
 * Martin serves tiles from s57_{regionId}.mbtiles.
 */
import { getChartPalette } from './chartPalettes.js'

export { getChartPalette } from './chartPalettes.js'

export const S57_LAYER_PREFIX = 's57-'

const SUFFIXES = [
  'depare-fill', 'depare-outline',
  'drgare-fill', 'drgare-outline',
  'lndare-fill', 'lndare-outline',
  'coalne', 'slcons',
  'resare-fill', 'resare-outline',
  'achare-fill', 'achare-outline',
  'depcnt', 'bridge',
  'soundg', 'wrecks', 'obstrn', 'uwtroc',
  'boyspp', 'bcnspp', 'lights',
]

function buildLayers(prefix, sourceId, p) {
  return [
    // === A. Depth Areas (DEPARE) — graduated fill by depth (DRVAL2 = deeper edge) ===
    { id: `${prefix}depare-fill`, type: 'fill', source: sourceId, 'source-layer': 'DEPARE',
      paint: {
        'fill-color': [
          'case',
          ['<', ['to-number', ['get', 'DRVAL2'], 1000], 0],   p.depthIntertidal,
          ['<', ['to-number', ['get', 'DRVAL2'], 1000], 2],   p.depthShallow,
          ['<', ['to-number', ['get', 'DRVAL2'], 1000], 5],   p.depth2,
          ['<', ['to-number', ['get', 'DRVAL2'], 1000], 10],  p.depth5,
          ['<', ['to-number', ['get', 'DRVAL2'], 1000], 20],  p.depth10,
          ['<', ['to-number', ['get', 'DRVAL2'], 1000], 50],  p.depth20,
          ['<', ['to-number', ['get', 'DRVAL2'], 1000], 100], p.depth50,
          p.depthDeep,
        ],
        'fill-opacity': 0.85,
      },
    },
    { id: `${prefix}depare-outline`, type: 'line', source: sourceId, 'source-layer': 'DEPARE',
      paint: { 'line-color': p.depthOutline, 'line-width': 0.5, 'line-opacity': 0.4 } },

    // === B. Dredged Areas ===
    { id: `${prefix}drgare-fill`, type: 'fill', source: sourceId, 'source-layer': 'DRGARE',
      paint: { 'fill-color': p.dredged, 'fill-opacity': 0.5 } },
    { id: `${prefix}drgare-outline`, type: 'line', source: sourceId, 'source-layer': 'DRGARE',
      paint: { 'line-color': p.dredgedOutline, 'line-width': 1, 'line-dasharray': [4, 2] } },

    // === C. Land Areas ===
    { id: `${prefix}lndare-fill`, type: 'fill', source: sourceId, 'source-layer': 'LNDARE',
      paint: { 'fill-color': p.landFill, 'fill-opacity': 1 } },
    { id: `${prefix}lndare-outline`, type: 'line', source: sourceId, 'source-layer': 'LNDARE',
      paint: { 'line-color': p.landOutline, 'line-width': 1 } },

    // === D. Coastline ===
    { id: `${prefix}coalne`, type: 'line', source: sourceId, 'source-layer': 'COALNE',
      paint: {
        'line-color': p.coastline,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 3, 0.5, 8, 1, 12, 1.5, 16, 2.5],
      },
    },

    // === E. Shoreline Construction ===
    { id: `${prefix}slcons`, type: 'line', source: sourceId, 'source-layer': 'SLCONS',
      paint: { 'line-color': p.shoreline, 'line-width': 2 } },

    // === F. Restricted Areas ===
    { id: `${prefix}resare-fill`, type: 'fill', source: sourceId, 'source-layer': 'RESARE',
      paint: { 'fill-color': p.restricted, 'fill-opacity': 0.15 } },
    { id: `${prefix}resare-outline`, type: 'line', source: sourceId, 'source-layer': 'RESARE',
      paint: { 'line-color': p.restricted, 'line-width': 1.5, 'line-dasharray': [5, 3] } },

    // === G. Anchorage Areas ===
    { id: `${prefix}achare-fill`, type: 'fill', source: sourceId, 'source-layer': 'ACHARE',
      paint: { 'fill-color': p.anchorage, 'fill-opacity': 0.12 } },
    { id: `${prefix}achare-outline`, type: 'line', source: sourceId, 'source-layer': 'ACHARE',
      paint: { 'line-color': p.anchorage, 'line-width': 1.5, 'line-dasharray': [5, 3] } },

    // === H. Depth Contours ===
    { id: `${prefix}depcnt`, type: 'line', source: sourceId, 'source-layer': 'DEPCNT',
      paint: {
        'line-color': ['case',
          ['<=', ['to-number', ['get', 'VALDCO'], 0], 5], p.contourShallow,
          p.contour,
        ],
        'line-width': ['case',
          ['<=', ['to-number', ['get', 'VALDCO'], 0], 5], 1.2,
          0.8,
        ],
        'line-opacity': 0.7,
      },
    },

    // === I. Bridges ===
    { id: `${prefix}bridge`, type: 'line', source: sourceId, 'source-layer': 'BRIDGE',
      paint: { 'line-color': p.bridge, 'line-width': 3 } },

    // === J. Depth Soundings ===
    { id: `${prefix}soundg`, type: 'circle', source: sourceId, 'source-layer': 'SOUNDG',
      minzoom: 11,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 14, 3, 16, 4],
        'circle-color': ['case',
          ['<', ['to-number', ['get', 'DEPTH'], 0], 0], p.soundingIntertidal,
          ['<', ['to-number', ['get', 'DEPTH'], 0], 5], p.soundingShallow,
          p.sounding,
        ],
        'circle-opacity': 0.85,
      },
    },

    // === K. Wrecks ===
    { id: `${prefix}wrecks`, type: 'circle', source: sourceId, 'source-layer': 'WRECKS',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6],
        'circle-color': p.wreck,
        'circle-stroke-color': p.wreckStroke,
        'circle-stroke-width': 1.5,
      },
    },

    // === L. Obstructions ===
    { id: `${prefix}obstrn`, type: 'circle', source: sourceId, 'source-layer': 'OBSTRN',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5],
        'circle-color': p.obstruction,
        'circle-stroke-color': p.obstructionStroke,
        'circle-stroke-width': 1,
      },
    },

    // === M. Underwater Rocks ===
    { id: `${prefix}uwtroc`, type: 'circle', source: sourceId, 'source-layer': 'UWTROC',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 4],
        'circle-color': p.rock,
        'circle-stroke-color': p.rockStroke,
        'circle-stroke-width': 1,
      },
    },

    // === N. Buoys (S-57 COLOUR: 1=white 3=red 4=green 6=yellow) ===
    { id: `${prefix}boyspp`, type: 'circle', source: sourceId, 'source-layer': 'BOYSPP',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 7],
        'circle-color': ['case',
          ['==', ['to-number', ['get', 'COLOUR'], 0], 3], p.buoyRed,
          ['==', ['to-number', ['get', 'COLOUR'], 0], 4], p.buoyGreen,
          ['==', ['to-number', ['get', 'COLOUR'], 0], 6], p.buoyYellow,
          p.buoyWhite,
        ],
        'circle-stroke-color': p.buoyStroke,
        'circle-stroke-width': 1.5,
      },
    },

    // === O. Beacons ===
    { id: `${prefix}bcnspp`, type: 'circle', source: sourceId, 'source-layer': 'BCNSPP',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5],
        'circle-color': ['case',
          ['==', ['to-number', ['get', 'COLOUR'], 0], 3], p.buoyRed,
          ['==', ['to-number', ['get', 'COLOUR'], 0], 4], p.buoyGreen,
          p.buoyWhite,
        ],
        'circle-stroke-color': p.buoyStroke,
        'circle-stroke-width': 1,
      },
    },

    // === P. Lights ===
    { id: `${prefix}lights`, type: 'circle', source: sourceId, 'source-layer': 'LIGHTS',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6],
        'circle-color': ['case',
          ['==', ['to-number', ['get', 'COLOUR'], 0], 3], p.lightRed,
          ['==', ['to-number', ['get', 'COLOUR'], 0], 4], p.lightGreen,
          ['==', ['to-number', ['get', 'COLOUR'], 0], 1], p.lightWhite,
          p.lightYellow,
        ],
        'circle-stroke-color': p.lightStroke,
        'circle-stroke-width': 2,
        'circle-opacity': 0.9,
      },
    },
  ]
}

/**
 * Create all nautical chart layers for a given region.
 * Returns { sources: {id: sourceConfig}, layers: [layerConfig] }.
 */
export function createNauticalStyle(regionId, availableLayers, tileServerUrl, theme = 'dark') {
  const palette = getChartPalette(theme)
  const sources = {}
  const prefix = `${S57_LAYER_PREFIX}${regionId}-`
  const sourceId = `${S57_LAYER_PREFIX}${regionId}`

  sources[sourceId] = {
    type: 'vector',
    tiles: [`${tileServerUrl}/s57_${regionId}/{z}/{x}/{y}`],
    minzoom: 0,
    maxzoom: 14,
  }

  return { sources, layers: buildLayers(prefix, sourceId, palette) }
}

/**
 * Re-paint all loaded S-57 layers in place to match a new theme.
 * Cheaper than re-adding sources/layers — only paint properties change.
 */
export function applyChartPalette(map, theme) {
  if (!map || !map.getStyle) return
  const palette = getChartPalette(theme)
  const style = map.getStyle()
  if (!style?.layers) return

  // Extract per-region prefixes by matching each S-57 layer id against the
  // known suffix table — suffixes themselves contain hyphens, so a naïve
  // last-hyphen split doesn't work.
  const prefixes = new Set()
  for (const layer of style.layers) {
    if (!layer.id.startsWith(S57_LAYER_PREFIX)) continue
    for (const suffix of SUFFIXES) {
      const tail = `-${suffix}`
      if (layer.id.endsWith(tail)) {
        prefixes.add(layer.id.slice(0, layer.id.length - suffix.length))
        break
      }
    }
  }

  for (const prefix of prefixes) {
    const fresh = buildLayers(prefix, /*sourceId unused*/ '', palette)
    const bySuffix = new Map(fresh.map((l) => [l.id.slice(prefix.length), l]))
    for (const suffix of SUFFIXES) {
      const layerId = `${prefix}${suffix}`
      if (!map.getLayer(layerId)) continue
      const spec = bySuffix.get(suffix)
      if (!spec?.paint) continue
      for (const [prop, value] of Object.entries(spec.paint)) {
        try { map.setPaintProperty(layerId, prop, value) } catch { /* layer gone */ }
      }
    }
  }
}
