import React from 'react'

/**
 * WaypointMenu Component
 * Context menu that appears after long-press release on the chart
 * Offers options: Add Waypoint, Measure Depth
 */

import { MapPinIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { S57_SUBLAYER_GROUPS } from './S57SubLayerMenu'
import { Glass } from '../ui/primitives'

// Build lookup from S-57 object class to human-readable name
const S57_NAMES = {}
for (const group of S57_SUBLAYER_GROUPS) {
  for (const sl of group.sublayers) {
    S57_NAMES[sl.id] = sl.name
  }
}

const WaypointMenu = React.memo(function WaypointMenu({
  position, // { screenX, screenY, lat, lng }
  nearbyFeatures, // array of { objectClass, properties, geometry, ... }
  onAddWaypoint,
  onMeasureDepth,
  onViewFeature,
  onClose
}) {
  if (!position) return null

  const { screenX, screenY, lat, lng } = position
  const features = nearbyFeatures || []

  // Smart positioning logic
  const menuWidth = 220
  // Base height + extra per feature item
  const menuHeight = 120 + (features.length > 0 ? 28 + features.length * 44 : 0)
  const padding = 16

  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  // Default: position below and to the right of touch point
  let left = screenX - menuWidth / 2
  let top = screenY + padding

  // If too close to right edge, shift left
  if (left + menuWidth > windowWidth - padding) {
    left = windowWidth - menuWidth - padding
  }

  // If too close to left edge, shift right
  if (left < padding) {
    left = padding
  }

  // If too close to bottom, position above touch point
  if (top + menuHeight > windowHeight - padding) {
    top = screenY - menuHeight - padding
  }

  // Format coordinates for display
  const formatLat = Math.abs(lat).toFixed(4) + '°' + (lat >= 0 ? 'N' : 'S')
  const formatLng = Math.abs(lng).toFixed(4) + '°' + (lng >= 0 ? 'E' : 'W')

  return (
    <>
      {/* Backdrop for dismissing */}
      <div
        className="absolute inset-0 z-40"
        onClick={onClose}
        style={{
          background: 'transparent',
          touchAction: 'none'
        }}
      />

      {/* Menu */}
      <div
        className="absolute z-50"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${menuWidth}px`,
          touchAction: 'none'
        }}
      >
        <Glass radius={12} style={{ padding: 0, overflow: 'hidden' }}>
          {/* Coordinates header */}
          <div style={{ padding: '8px 12px', borderBottom: '0.5px solid var(--bg-hairline-strong)' }}>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--fg2)' }}>
              {formatLat} / {formatLng}
            </div>
          </div>

          {/* Menu options */}
          <div style={{ padding: '4px 0' }}>
            {/* Add Waypoint */}
            <button
              onClick={() => onAddWaypoint({ lat, lng })}
              style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 0, cursor: 'pointer', touchAction: 'manipulation', textAlign: 'left' }}
            >
              <MapPinIcon style={{ width: 20, height: 20, color: 'var(--fg1)', flexShrink: 0 }} />
              <span style={{ color: 'var(--fg1)', fontWeight: 500 }}>Add Waypoint</span>
            </button>

            {/* Measure Depth */}
            <button
              onClick={() => onMeasureDepth({ screenX, screenY })}
              style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 0, cursor: 'pointer', touchAction: 'manipulation', textAlign: 'left' }}
            >
              <svg style={{ width: 20, height: 20, color: 'var(--tint-teal)', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M2 12h20" strokeLinecap="round" />
                <path d="M6 18c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
              </svg>
              <span style={{ color: 'var(--tint-teal)', fontWeight: 500 }}>Measure Depth</span>
            </button>
          </div>

          {/* Nearby S-57 features */}
          {features.length > 0 && (
            <div style={{ borderTop: '0.5px solid var(--bg-hairline-strong)' }}>
              <div style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.15)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tint-yellow)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nearby Features</span>
              </div>
              {features.map((feat, i) => {
                const name = feat.properties?.OBJNAM
                const typeName = S57_NAMES[feat.objectClass?.toUpperCase()] || feat.objectClass
                return (
                  <button
                    key={`${feat.objectClass}-${feat.properties?.FIDN || i}`}
                    onClick={() => onViewFeature && onViewFeature(feat)}
                    style={{ width: '100%', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 0, cursor: 'pointer', touchAction: 'manipulation', textAlign: 'left' }}
                  >
                    <InformationCircleIcon style={{ width: 20, height: 20, color: 'var(--tint-yellow)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--tint-yellow)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeName}</div>
                      {name && <div style={{ fontSize: 12, color: 'var(--fg2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Glass>
      </div>
    </>
  )
})

export default WaypointMenu
