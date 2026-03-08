import React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { S57_SUBLAYER_GROUPS } from './S57SubLayerMenu'

// Map S-57 object class names to human-readable names
const S57_OBJECT_NAMES = {}
for (const group of S57_SUBLAYER_GROUPS) {
  for (const sl of group.sublayers) {
    S57_OBJECT_NAMES[sl.id] = { name: sl.name, desc: sl.desc, group: group.name }
  }
}

// S-57 coded value lookups
const CATWRK_VALUES = { 1: 'Non-dangerous', 2: 'Dangerous', 3: 'Distributed remains', 4: 'Mast showing', 5: 'Hull showing' }
const CATOBS_VALUES = { 1: 'Snag/stump', 2: 'Wellhead', 3: 'Diffuser', 4: 'Crib', 5: 'Fish haven', 6: 'Foul area', 7: 'Foul ground', 8: 'Ice boom', 9: 'Ground tackle', 10: 'Boom' }
const CATRES_VALUES = { 1: 'Offshore safety zone', 2: 'Nature reserve', 3: 'Bird sanctuary', 4: 'Game reserve', 5: 'Seal sanctuary', 6: 'Degaussing range', 7: 'Military area', 8: 'Historic wreck', 9: 'Navigational aid safety zone', 10: 'Minefield', 11: 'Swimming area', 12: 'Waiting area', 13: 'Research area', 14: 'Dredging area', 15: 'Fish sanctuary', 16: 'Ecological reserve', 17: 'No wake area', 18: 'Swinging area' }
const RESTRN_VALUES = { 1: 'Anchoring prohibited', 2: 'Anchoring restricted', 3: 'Fishing prohibited', 4: 'Fishing restricted', 5: 'Trawling prohibited', 6: 'Trawling restricted', 7: 'Entry prohibited', 8: 'Entry restricted', 9: 'Dredging prohibited', 10: 'Dredging restricted', 11: 'Diving prohibited', 12: 'Diving restricted', 13: 'No wake', 14: 'Area to be avoided', 15: 'Construction prohibited' }
const COLOUR_VALUES = { 1: 'White', 2: 'Black', 3: 'Red', 4: 'Green', 5: 'Blue', 6: 'Yellow', 7: 'Grey', 8: 'Brown', 9: 'Amber', 10: 'Violet', 11: 'Orange', 12: 'Magenta', 13: 'Pink' }
const LITCHR_VALUES = { 1: 'Fixed', 2: 'Flashing', 3: 'Long flashing', 4: 'Quick flashing', 5: 'Very quick flashing', 6: 'Ultra quick flashing', 7: 'Isophase', 8: 'Occulting', 9: 'Interrupted quick', 10: 'Interrupted very quick', 11: 'Morse', 12: 'Fixed/flashing', 13: 'Fl (long)/Fl', 25: 'Q + LFl', 28: 'Alternating' }
const BOYSHP_VALUES = { 1: 'Conical', 2: 'Can', 3: 'Spherical', 4: 'Pillar', 5: 'Spar', 6: 'Barrel', 7: 'Super-buoy', 8: 'Ice buoy' }

function lookupCoded(value, table) {
  if (value == null) return null
  // Handle comma-separated or array values
  const vals = Array.isArray(value) ? value : String(value).split(',')
  return vals.map(v => table[Number(v.toString().trim())] || `Code ${v}`).join(', ')
}

function formatDepthFeet(meters) {
  if (meters == null) return null
  const ft = Math.abs(Number(meters)) * 3.28084
  return `${ft.toFixed(1)} ft`
}

function getFeatureProperties(props, objectClass) {
  const items = []
  const oc = objectClass.toUpperCase()

  // Object name
  if (props.OBJNAM) items.push({ label: 'Name', value: props.OBJNAM })

  // Type-specific properties
  if (oc === 'WRECKS') {
    if (props.VALSOU != null) items.push({ label: 'Depth', value: formatDepthFeet(props.VALSOU) })
    if (props.CATWRK != null) items.push({ label: 'Category', value: lookupCoded(props.CATWRK, CATWRK_VALUES) })
  } else if (oc === 'OBSTRN') {
    if (props.VALSOU != null) items.push({ label: 'Depth', value: formatDepthFeet(props.VALSOU) })
    if (props.CATOBS != null) items.push({ label: 'Category', value: lookupCoded(props.CATOBS, CATOBS_VALUES) })
  } else if (oc === 'RESARE') {
    if (props.CATRES != null) items.push({ label: 'Category', value: lookupCoded(props.CATRES, CATRES_VALUES) })
    if (props.RESTRN != null) items.push({ label: 'Restriction', value: lookupCoded(props.RESTRN, RESTRN_VALUES) })
  } else if (oc === 'LIGHTS') {
    if (props.LITCHR != null) items.push({ label: 'Character', value: lookupCoded(props.LITCHR, LITCHR_VALUES) })
    if (props.COLOUR != null) items.push({ label: 'Color', value: lookupCoded(props.COLOUR, COLOUR_VALUES) })
    if (props.SIGPER != null) items.push({ label: 'Period', value: `${props.SIGPER}s` })
    if (props.VALNMR != null) items.push({ label: 'Range', value: `${props.VALNMR} nm` })
  } else if (oc === 'BOYSPP' || oc === 'BOYCAR' || oc === 'BOYLAT' || oc === 'BOYISD' || oc === 'BOYSAW') {
    if (props.COLOUR != null) items.push({ label: 'Color', value: lookupCoded(props.COLOUR, COLOUR_VALUES) })
    if (props.BOYSHP != null) items.push({ label: 'Shape', value: lookupCoded(props.BOYSHP, BOYSHP_VALUES) })
  } else if (oc === 'BCNSPP' || oc === 'BCNCAR' || oc === 'BCNLAT' || oc === 'BCNISD' || oc === 'BCNSAW') {
    if (props.COLOUR != null) items.push({ label: 'Color', value: lookupCoded(props.COLOUR, COLOUR_VALUES) })
  } else if (oc === 'DEPARE') {
    if (props.DRVAL1 != null) items.push({ label: 'Min Depth', value: formatDepthFeet(props.DRVAL1) })
    if (props.DRVAL2 != null) items.push({ label: 'Max Depth', value: formatDepthFeet(props.DRVAL2) })
  } else if (oc === 'ACHARE') {
    if (props.CATACH != null) items.push({ label: 'Category', value: `Code ${props.CATACH}` })
  } else if (oc === 'SOUNDG') {
    if (props.DEPTH != null) items.push({ label: 'Depth', value: formatDepthFeet(props.DEPTH) })
  } else if (oc === 'UWTROC') {
    if (props.VALSOU != null) items.push({ label: 'Depth', value: formatDepthFeet(props.VALSOU) })
    if (props.WATLEV != null) items.push({ label: 'Water Level', value: `Code ${props.WATLEV}` })
  }

  return items
}

const S57FeatureCard = React.memo(function S57FeatureCard({ feature, onClose }) {
  if (!feature) return null

  const props = feature.properties || {}
  const objectClass = (feature.objectClass || '').toUpperCase()
  const info = S57_OBJECT_NAMES[objectClass] || { name: objectClass, desc: '', group: '' }
  const items = getFeatureProperties(props, objectClass)

  // Extract coordinates from geometry
  let lat = null, lng = null
  const geom = feature.geometry
  if (geom) {
    if (geom.type === 'Point') {
      [lng, lat] = geom.coordinates
    } else if (geom.type === 'MultiPoint' && geom.coordinates.length > 0) {
      [lng, lat] = geom.coordinates[0]
    } else if (geom.type === 'Polygon' && geom.coordinates[0]?.length > 0) {
      // Centroid approximation from first ring
      const ring = geom.coordinates[0]
      lng = ring.reduce((s, c) => s + c[0], 0) / ring.length
      lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
    } else if (geom.type === 'LineString' && geom.coordinates.length > 0) {
      [lng, lat] = geom.coordinates[0]
    }
  }

  // Smart positioning: center of screen
  const cardWidth = 300
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const left = Math.max(16, (windowWidth - cardWidth) / 2)
  const top = Math.max(16, windowHeight * 0.15)

  return (
    <>
      <div
        className="absolute inset-0 z-40 bg-black/30"
        onClick={onClose}
        style={{ touchAction: 'none' }}
      />

      <div
        className="absolute bg-terminal-surface rounded-lg shadow-glow-green border-2 border-terminal-green z-50 overflow-hidden"
        style={{ left: `${left}px`, top: `${top}px`, width: `${cardWidth}px`, maxHeight: '70vh', touchAction: 'none' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-bg">
          <div>
            <div className="text-sm font-semibold text-terminal-green">{info.name}</div>
            {info.desc && <div className="text-xs text-terminal-green-dim">{info.desc}</div>}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-terminal-green/10 rounded touch-manipulation"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5 text-terminal-green-dim" />
          </button>
        </div>

        {/* Properties */}
        <div className="p-4 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 56px)' }}>
          {items.length > 0 ? (
            items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-terminal-green-dim">{item.label}</span>
                <span className="text-terminal-green font-medium text-right ml-3">{item.value}</span>
              </div>
            ))
          ) : (
            <div className="text-sm text-terminal-green-dim italic">No additional details</div>
          )}

          {/* Coordinates */}
          {lat != null && lng != null && (
            <div className="pt-2 mt-2 border-t border-terminal-border">
              <div className="font-mono text-sm text-terminal-green">
                <div>{Math.abs(lat).toFixed(5)}&deg; {lat >= 0 ? 'N' : 'S'}</div>
                <div>{Math.abs(lng).toFixed(5)}&deg; {lng >= 0 ? 'E' : 'W'}</div>
              </div>
            </div>
          )}

          {/* S-57 object class */}
          <div className="pt-2 mt-1 border-t border-terminal-border text-xs text-terminal-green-dim">
            S-57: {objectClass}
          </div>
        </div>
      </div>
    </>
  )
})

export default S57FeatureCard
