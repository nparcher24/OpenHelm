/**
 * WaypointMenu Component
 * Context menu that appears after long-press release on the chart
 * Offers options: Add Waypoint, Measure Depth
 */

import { MapPinIcon } from '@heroicons/react/24/outline'

export default function WaypointMenu({
  position, // { screenX, screenY, lat, lng }
  onAddWaypoint,
  onMeasureDepth,
  onClose
}) {
  if (!position) return null

  const { screenX, screenY, lat, lng } = position

  // Smart positioning logic
  const menuWidth = 200
  const menuHeight = 120
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
      </div>
    </>
  )
}
