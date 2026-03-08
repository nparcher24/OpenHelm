import React from 'react'

/**
 * WaypointMenu Component
 * Context menu that appears after long-press release on the chart
 * Offers options: Add Waypoint, Measure Depth
 */

import { MapPinIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { S57_SUBLAYER_GROUPS } from './S57SubLayerMenu'

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
        className="absolute bg-terminal-surface rounded-lg shadow-glow-green border-2 border-terminal-green z-50 overflow-hidden"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${menuWidth}px`,
          touchAction: 'none'
        }}
      >
        {/* Coordinates header */}
        <div className="px-3 py-2 border-b border-terminal-border bg-terminal-bg">
          <div className="text-xs font-mono text-terminal-green-dim">
            {formatLat} / {formatLng}
          </div>
        </div>

        {/* Menu options */}
        <div className="py-1">
          {/* Add Waypoint */}
          <button
            onClick={() => onAddWaypoint({ lat, lng })}
            className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-terminal-green/10 active:bg-terminal-green/20 transition-colors touch-manipulation"
          >
            <MapPinIcon className="w-5 h-5 text-terminal-green" />
            <span className="text-terminal-green font-medium">Add Waypoint</span>
          </button>

          {/* Measure Depth */}
          <button
            onClick={() => onMeasureDepth({ screenX, screenY })}
            className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-terminal-green/10 active:bg-terminal-green/20 transition-colors touch-manipulation"
          >
            <svg className="w-5 h-5 text-terminal-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M2 12h20" strokeLinecap="round" />
              <path d="M6 18c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
            </svg>
            <span className="text-terminal-cyan font-medium">Measure Depth</span>
          </button>
        </div>

        {/* Nearby S-57 features */}
        {features.length > 0 && (
          <div className="border-t border-terminal-border">
            <div className="px-3 py-1.5 bg-terminal-bg">
              <span className="text-xs font-semibold text-terminal-amber uppercase tracking-wide">Nearby Features</span>
            </div>
            {features.map((feat, i) => {
              const name = feat.properties?.OBJNAM
              const typeName = S57_NAMES[feat.objectClass?.toUpperCase()] || feat.objectClass
              return (
                <button
                  key={`${feat.objectClass}-${feat.properties?.FIDN || i}`}
                  onClick={() => onViewFeature && onViewFeature(feat)}
                  className="w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-terminal-amber/10 active:bg-terminal-amber/20 transition-colors touch-manipulation"
                >
                  <InformationCircleIcon className="w-5 h-5 text-terminal-amber flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm text-terminal-amber font-medium truncate">{typeName}</div>
                    {name && <div className="text-xs text-terminal-green-dim truncate">{name}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
})

export default WaypointMenu
