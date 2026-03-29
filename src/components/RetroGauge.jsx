import { useRef, useEffect } from 'react'
import { buildLinearGaugeSVG } from '../utils/retroGauges'

/**
 * RetroGauge — 90's truck cluster style horizontal linear gauge
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

  // Digital readout color
  let readoutColor = 'text-terminal-green'
  if (value != null) {
    if (invertWarning) {
      if (alarmAt != null && value <= alarmAt) readoutColor = 'text-terminal-red'
      else if (warnAt != null && value <= warnAt) readoutColor = 'text-terminal-amber'
    } else {
      if (alarmAt != null && value >= alarmAt) readoutColor = 'text-terminal-red'
      else if (warnAt != null && value >= warnAt) readoutColor = 'text-terminal-amber'
    }
  }

  const displayVal = value != null
    ? (typeof value === 'number' ? value.toFixed(decimals) : value)
    : '--'

  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <div className="flex-shrink-0 w-16 text-right">
        <span className="text-[10px] text-terminal-green-dim uppercase tracking-wider font-mono font-semibold">{label}</span>
      </div>

      {/* Gauge bar */}
      <div className="flex-1 min-w-0" ref={containerRef}>
        <div ref={svgRef} />
      </div>

      {/* Digital readout */}
      <div className="flex-shrink-0 w-20 text-right">
        <span className={`${large ? 'text-2xl' : 'text-lg'} font-mono font-bold text-glow-sm ${readoutColor}`}>
          {displayVal}
        </span>
        {unit && (
          <span className="text-[10px] text-terminal-green-dim ml-1 font-mono">{unit}</span>
        )}
      </div>
    </div>
  )
}

export default RetroGauge
