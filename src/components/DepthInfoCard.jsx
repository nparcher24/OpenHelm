import React from 'react'
import { Glass } from '../ui/primitives'

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
        className="absolute z-50"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${cardWidth}px`,
          minHeight: `${cardHeight}px`,
          touchAction: 'none'
        }}
      >
        <Glass radius={12} style={{ padding: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
              <div style={{ width: 32, height: 32, border: '4px solid var(--fg1)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : error ? (
            <div style={{ color: 'var(--tint-red)', fontSize: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>[ERROR] No Data</div>
              <div>{error}</div>
            </div>
          ) : (
            <>
              {/* Position - bigger font, 4 decimals */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 20, color: 'var(--fg1)' }}>
                  <div>{formatLatitude(lat)}</div>
                  <div>{formatLongitude(lon)}</div>
                </div>
              </div>

              {/* Depth - feet only */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--fg1)' }}>
                  {formatDepthFeet(depth)}
                </div>
                {uncertainty && uncertainty > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--fg2)' }}>
                    ± {formatDepthFeet(uncertainty)} uncertainty
                  </div>
                )}
              </div>

              {/* Source */}
              {tileId && (
                <div style={{ fontSize: 11, color: 'var(--fg2)', paddingTop: 8, borderTop: '0.5px solid var(--bg-hairline-strong)' }}>
                  Source: BlueTopo {tileId}
                </div>
              )}
            </>
          )}
        </Glass>
      </div>
    </>
  )
})

export default DepthInfoCard
