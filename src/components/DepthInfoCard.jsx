import React from 'react'

/**
 * DepthInfoCard Component
 * Displays depth measurement information with smart positioning
 */

// Helper formatting functions
function formatLatitude(lat) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`
}

function formatLongitude(lon) {
  return `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`
}

function formatDepthFeet(depth) {
  if (depth === null || depth === undefined) return 'N/A'

  // Convert to positive depth value (depth below sea level)
  const depthMeters = Math.abs(depth)
  const depthFeet = depthMeters * 3.28084

  return `${depthFeet.toFixed(1)} ft`
}

const DepthInfoCard = React.memo(function DepthInfoCard({
  measurement,
  loading,
  onClose
}) {
  if (!measurement && !loading) return null

  const { lat, lon, depth, uncertainty, error, screenX, screenY, tileId } = measurement || {}

  // Smart positioning logic
  const cardWidth = 280
  const cardHeight = 180
  const padding = 16
  const crosshairSize = 50

  // Get window dimensions
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  // Adjust crosshair Y for the 100px offset used during hold
  const adjustedY = Math.max(screenY - 100, 50)

  // Default: position to the right of crosshairs
  let left = screenX + crosshairSize + padding
  let top = adjustedY - cardHeight / 2

  // If too close to right edge, position to left
  if (left + cardWidth > windowWidth - padding) {
    left = screenX - crosshairSize - cardWidth - padding
  }

  // If too close to left edge (fallback), center horizontally
  if (left < padding) {
    left = Math.max(padding, windowWidth / 2 - cardWidth / 2)
  }

  // Adjust vertical position if near edges
  if (top < padding) {
    top = padding
  }
  if (top + cardHeight > windowHeight - padding) {
    top = windowHeight - cardHeight - padding
  }

  return (
    <>
      {/* Backdrop for dismissing - prevent browser zoom on multi-touch */}
      <div
        className="absolute inset-0 z-40"
        onClick={onClose}
        style={{
          background: 'transparent',
          touchAction: 'none'
        }}
      />

      {/* Info Card - prevent browser zoom */}
      <div
        className="absolute bg-terminal-surface rounded-lg shadow-glow-green border-2 border-terminal-green z-50"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${cardWidth}px`,
          minHeight: `${cardHeight}px`,
          touchAction: 'none'
        }}
      >
        {/* Content */}
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-terminal-green border-t-transparent rounded-full animate-spin shadow-glow-green"></div>
            </div>
          ) : error ? (
            <div className="text-terminal-red text-sm">
              <div className="font-semibold mb-1">[ERROR] No Data</div>
              <div>{error}</div>
            </div>
          ) : (
            <>
              {/* Position - bigger font, 4 decimals */}
              <div className="space-y-1">
                <div className="font-mono text-2xl text-terminal-green">
                  <div>{formatLatitude(lat)}</div>
                  <div>{formatLongitude(lon)}</div>
                </div>
              </div>

              {/* Depth - feet only */}
              <div className="space-y-1">
                <div className="text-3xl font-bold text-terminal-green text-glow">
                  {formatDepthFeet(depth)}
                </div>
                {uncertainty && uncertainty > 0 && (
                  <div className="text-xs text-terminal-green-dim">
                    ± {formatDepthFeet(uncertainty)} uncertainty
                  </div>
                )}
              </div>

              {/* Source */}
              {tileId && (
                <div className="text-xs text-terminal-green-dim pt-2 border-t border-terminal-border">
                  Source: BlueTopo {tileId}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
})

export default DepthInfoCard
