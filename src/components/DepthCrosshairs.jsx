/**
 * DepthCrosshairs Component
 * Renders crosshairs during touch-and-hold and after measurement
 */

export default function DepthCrosshairs({
  showing,
  x,
  y,
  holdComplete = false
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
        className="absolute bg-terminal-green"
        style={{
          left: holdComplete ? `${x - size}px` : 0,
          right: holdComplete ? `auto` : 0,
          top: `${adjustedY}px`,
          width: holdComplete ? `${size * 2}px` : '100%',
          height: '2px',
          transform: 'translateY(-1px)',
          boxShadow: '0 0 8px rgba(0, 255, 0, 0.6)'
        }}
      />

      {/* Vertical line */}
      <div
        className="absolute bg-terminal-green"
        style={{
          left: `${x}px`,
          top: holdComplete ? `${adjustedY - size}px` : 0,
          bottom: holdComplete ? `auto` : 0,
          width: '2px',
          height: holdComplete ? `${size * 2}px` : '100%',
          transform: 'translateX(-1px)',
          boxShadow: '0 0 8px rgba(0, 255, 0, 0.6)'
        }}
      />

      {/* Center circle */}
      <div
        className="absolute bg-terminal-green rounded-full"
        style={{
          left: `${x}px`,
          top: `${adjustedY}px`,
          width: '8px',
          height: '8px',
          transform: 'translate(-4px, -4px)',
          boxShadow: '0 0 12px rgba(0, 255, 0, 0.8)'
        }}
      />
    </div>
  )
}
