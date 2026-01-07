/**
 * DepthInfoCard Component
 * Displays depth measurement information with smart positioning
 */

// Helper formatting functions
function formatLatitude(lat) {
  const degrees = Math.abs(lat)
  const deg = Math.floor(degrees)
  const min = ((degrees - deg) * 60).toFixed(3)
  const dir = lat >= 0 ? 'N' : 'S'
  return `${deg}° ${min}' ${dir}`
}

function formatLongitude(lon) {
  const degrees = Math.abs(lon)
  const deg = Math.floor(degrees)
  const min = ((degrees - deg) * 60).toFixed(3)
  const dir = lon >= 0 ? 'E' : 'W'
  return `${deg}° ${min}' ${dir}`
}

function formatDepth(depth) {
  if (depth === null || depth === undefined) return 'N/A'

  // Convert to positive depth value (depth below sea level)
  const depthMeters = Math.abs(depth)
  const depthFeet = depthMeters * 3.28084

  return `${depthMeters.toFixed(1)} m (${depthFeet.toFixed(1)} ft)`
}

export default function DepthInfoCard({
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
      {/* Backdrop for dismissing */}
      <div
        className="absolute inset-0 z-40"
        onClick={onClose}
        style={{ background: 'transparent' }}
      />

      {/* Info Card */}
      <div
        className="absolute bg-white dark:bg-slate-800 rounded-lg shadow-2xl border-2 border-marine-600 dark:border-marine-400 z-50"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${cardWidth}px`,
          minHeight: `${cardHeight}px`
        }}
      >
        {/* Header */}
        <div className="bg-marine-600 dark:bg-marine-700 px-4 py-3 rounded-t-lg flex items-center justify-between">
          <h3 className="font-semibold text-white">Depth Measurement</h3>
          <button
            onClick={onClose}
            className="text-white hover:text-marine-200 transition-colors touch-manipulation"
            style={{ minWidth: '44px', minHeight: '44px' }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-marine-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="text-red-600 dark:text-red-400 text-sm">
              <div className="font-semibold mb-1">No Data</div>
              <div>{error}</div>
            </div>
          ) : (
            <>
              {/* Position */}
              <div className="space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Position</div>
                <div className="font-mono text-sm text-slate-800 dark:text-slate-200">
                  <div>{formatLatitude(lat)}</div>
                  <div>{formatLongitude(lon)}</div>
                </div>
              </div>

              {/* Depth */}
              <div className="space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Depth</div>
                <div className="text-2xl font-bold text-marine-700 dark:text-marine-400">
                  {formatDepth(depth)}
                </div>
                {uncertainty && uncertainty > 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    ± {formatDepth(uncertainty)} uncertainty
                  </div>
                )}
              </div>

              {/* Source */}
              {tileId && (
                <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                  Source: BlueTopo {tileId}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
