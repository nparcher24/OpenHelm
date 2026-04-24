import React from 'react'

/**
 * DepthCrosshairs Component
 * Renders crosshairs during touch-and-hold and after measurement
 */

// Helper formatting functions
function formatLatitude(lat) {
  if (lat === null || lat === undefined) return ''
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`
}

function formatLongitude(lon) {
  if (lon === null || lon === undefined) return ''
  return `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`
}

function formatDepthFeet(depth) {
  if (depth === null || depth === undefined) return 'N/A'
  const depthMeters = Math.abs(depth)
  const depthFeet = depthMeters * 3.28084
  return `${depthFeet.toFixed(1)} ft`
}

const DepthCrosshairs = React.memo(function DepthCrosshairs({
  showing,
  x,
  y,
  holdComplete = false,
  lat = null,
  lon = null,
  depth = null
}) {
  if (!showing) return null

  const size = holdComplete ? 25 : 'full' // 50px total (25px each direction)
  // For large crosshairs, adjust Y to be above finger. For small crosshairs, Y is already adjusted.
  const adjustedY = holdComplete ? y : Math.max(y - 100, 50)

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      {/* Horizontal line */}
      <div
        style={{
          position: 'absolute',
          left: holdComplete ? `${x - size}px` : 0,
          right: holdComplete ? 'auto' : 0,
          top: `${adjustedY}px`,
          width: holdComplete ? `${size * 2}px` : '100%',
          height: '2px',
          transform: 'translateY(-1px)',
          background: 'var(--signal)',
          boxShadow: '0 0 8px rgba(0,200,100,0.6)'
        }}
      />

      {/* Vertical line */}
      <div
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: holdComplete ? `${adjustedY - size}px` : 0,
          bottom: holdComplete ? 'auto' : 0,
          width: '2px',
          height: holdComplete ? `${size * 2}px` : '100%',
          transform: 'translateX(-1px)',
          background: 'var(--signal)',
          boxShadow: '0 0 8px rgba(0,200,100,0.6)'
        }}
      />

      {/* Center circle */}
      <div
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${adjustedY}px`,
          width: '8px',
          height: '8px',
          transform: 'translate(-4px, -4px)',
          background: 'var(--signal)',
          borderRadius: '50%',
          boxShadow: '0 0 12px rgba(0,200,100,0.8)'
        }}
      />

      {/* Live depth display (up and right) - only during hold, not after */}
      {!holdComplete && depth !== null && depth !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: `${x + 20}px`,
            top: `${adjustedY - 30}px`,
            pointerEvents: 'none',
            fontSize: 12,
            color: 'var(--fg1)',
            fontFamily: 'monospace',
            fontWeight: 600,
            background: 'var(--bg-elev)',
            border: '0.5px solid var(--bg-hairline-strong)',
            padding: '4px 8px',
            borderRadius: 6,
            whiteSpace: 'nowrap'
          }}
        >
          {formatDepthFeet(depth)}
        </div>
      )}

      {/* Live position display (down and left) - only during hold, not after */}
      {!holdComplete && lat !== null && lon !== null && (
        <div
          style={{
            position: 'absolute',
            right: `${window.innerWidth - x + 20}px`,
            top: `${adjustedY + 20}px`,
            pointerEvents: 'none',
            fontSize: 12,
            color: 'var(--fg1)',
            fontFamily: 'monospace',
            background: 'var(--bg-elev)',
            border: '0.5px solid var(--bg-hairline-strong)',
            padding: '4px 8px',
            borderRadius: 6,
            whiteSpace: 'nowrap'
          }}
        >
          <div>{formatLatitude(lat)}</div>
          <div>{formatLongitude(lon)}</div>
        </div>
      )}
    </div>
  )
})

export default DepthCrosshairs
