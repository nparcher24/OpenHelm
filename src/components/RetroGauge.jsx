import { useRef, useEffect } from 'react'
import { buildLinearGaugeSVG } from '../utils/retroGauges'

/**
 * RetroGauge — horizontal linear gauge bar
 * Uses raw SVG injection (same pattern as HudOverlay)
 */
function RetroGauge({ value, min, max, label, unit, decimals = 0, warnAt, alarmAt, invertWarning = false, majorInterval, minorInterval, large = false }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    const raf = requestAnimationFrame(() => {
      const w = containerRef.current?.offsetWidth
      if (!w) return
      svgRef.current.innerHTML = buildLinearGaugeSVG(value, min, max, w, {
        height: large ? 48 : 36,
        majorInterval,
        minorInterval,
        warnAt,
        alarmAt,
        invertWarning
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [value, min, max, warnAt, alarmAt, invertWarning, majorInterval, minorInterval, large])

  // Rebuild on resize
  useEffect(() => {
    const onResize = () => {
      if (!svgRef.current || !containerRef.current) return
      const w = containerRef.current.offsetWidth
      svgRef.current.innerHTML = buildLinearGaugeSVG(value, min, max, w, {
        height: large ? 48 : 36,
        majorInterval,
        minorInterval,
        warnAt,
        alarmAt,
        invertWarning
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [value, min, max, warnAt, alarmAt, invertWarning, majorInterval, minorInterval, large])

  // Digital readout color based on alarm state
  let readoutColor = 'var(--fg1)'
  if (value != null) {
    if (invertWarning) {
      if (alarmAt != null && value <= alarmAt) readoutColor = 'var(--tint-red)'
      else if (warnAt != null && value <= warnAt) readoutColor = 'var(--tint-yellow)'
    } else {
      if (alarmAt != null && value >= alarmAt) readoutColor = 'var(--tint-red)'
      else if (warnAt != null && value >= warnAt) readoutColor = 'var(--tint-yellow)'
    }
  }

  const displayVal = value != null
    ? (typeof value === 'number' ? value.toFixed(decimals) : value)
    : '--'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* Label */}
      <div style={{ flexShrink: 0, width: 88, textAlign: 'right' }}>
        <span style={{ fontSize: 14, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{label}</span>
      </div>

      {/* Gauge bar */}
      <div style={{ flex: 1, minWidth: 0 }} ref={containerRef}>
        <div ref={svgRef} />
      </div>

      {/* Digital readout */}
      <div style={{ flexShrink: 0, width: 110, textAlign: 'right' }}>
        <span style={{ fontSize: large ? 32 : 24, fontFamily: 'var(--font-mono)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: readoutColor }}>
          {displayVal}
        </span>
        {unit && (
          <span style={{ fontSize: 14, color: 'var(--fg3)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{unit}</span>
        )}
      </div>
    </div>
  )
}

export default RetroGauge
