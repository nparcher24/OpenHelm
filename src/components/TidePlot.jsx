/**
 * TidePlot - Pure SVG inline tide prediction curve
 * Shows a 24-hour window of tide predictions centered on a given time.
 */
function TidePlot({ predictions, hiLo, centerTime, width = 260, height = 100 }) {
  if (!predictions || predictions.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--fg2)', textAlign: 'center', padding: '8px 0' }}>No tide data</div>
    )
  }

  const padding = { top: 12, right: 8, bottom: 16, left: 30 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  // Find 24-hour window centered on forecastTime (or first prediction if no centerTime)
  const centerMs = centerTime ? new Date(centerTime).getTime() : new Date(predictions[0].t).getTime()
  const windowStart = centerMs - 12 * 60 * 60 * 1000
  const windowEnd = centerMs + 12 * 60 * 60 * 1000

  // Filter predictions to window
  const windowData = predictions.filter(p => {
    const t = new Date(p.t).getTime()
    return t >= windowStart && t <= windowEnd
  })

  if (windowData.length < 2) {
    return (
      <div style={{ fontSize: 12, color: 'var(--fg2)', textAlign: 'center', padding: '8px 0' }}>Insufficient data for this time</div>
    )
  }

  // Compute scales
  const values = windowData.map(p => p.v)
  const minVal = Math.min(...values) - 0.5
  const maxVal = Math.max(...values) + 0.5
  const valRange = maxVal - minVal || 1

  const toX = (t) => {
    const ms = new Date(t).getTime()
    return padding.left + ((ms - windowStart) / (windowEnd - windowStart)) * plotW
  }
  const toY = (v) => {
    return padding.top + plotH - ((v - minVal) / valRange) * plotH
  }

  // Build SVG path
  const pathPoints = windowData.map(p => `${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`)
  const pathD = `M ${pathPoints.join(' L ')}`

  // Y-axis ticks
  const yTicks = []
  const step = valRange > 8 ? 2 : valRange > 4 ? 1 : 0.5
  for (let v = Math.ceil(minVal / step) * step; v <= maxVal; v += step) {
    yTicks.push(v)
  }

  // X-axis time labels (every 6 hours)
  const xLabels = []
  for (let t = windowStart; t <= windowEnd; t += 6 * 60 * 60 * 1000) {
    const d = new Date(t)
    xLabels.push({ t, label: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) })
  }

  // Hi/Lo markers in window
  const windowHiLo = (hiLo || []).filter(p => {
    const t = new Date(p.t).getTime()
    return t >= windowStart && t <= windowEnd
  })

  // "Now" line
  const now = Date.now()
  const nowInWindow = now >= windowStart && now <= windowEnd

  return (
    <svg width={width} height={height} className="block">
      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={padding.left} y1={toY(v)}
            x2={width - padding.right} y2={toY(v)}
            stroke="var(--bg-hairline-strong)" strokeWidth={0.5}
          />
          <text x={padding.left - 4} y={toY(v) + 3}
            textAnchor="end" fill="var(--fg2)" fontSize={9} fontFamily="monospace">
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {xLabels.map((xl, i) => (
        <text key={i} x={toX(new Date(xl.t).toISOString())} y={height - 2}
          textAnchor="middle" fill="var(--fg2)" fontSize={8} fontFamily="monospace">
          {xl.label}
        </text>
      ))}

      {/* Tide curve */}
      <path d={pathD} fill="none" stroke="var(--signal)" strokeWidth={1.5} />

      {/* "Now" line */}
      {nowInWindow && (
        <line
          x1={toX(new Date(now).toISOString())} y1={padding.top}
          x2={toX(new Date(now).toISOString())} y2={padding.top + plotH}
          stroke="var(--tint-yellow)" strokeWidth={1} strokeDasharray="3,3"
        />
      )}

      {/* Selected time line */}
      {centerTime && (
        <line
          x1={toX(centerTime)} y1={padding.top}
          x2={toX(centerTime)} y2={padding.top + plotH}
          stroke="var(--tint-red)" strokeWidth={1} opacity={0.7}
        />
      )}

      {/* Hi/Lo markers */}
      {windowHiLo.map((p, i) => (
        <g key={i}>
          <circle cx={toX(p.t)} cy={toY(p.v)} r={3}
            fill={p.type === 'H' ? '#60a5fa' : 'var(--tint-teal)'} />
          <text x={toX(p.t)} y={toY(p.v) + (p.type === 'H' ? -6 : 12)}
            textAnchor="middle" fill={p.type === 'H' ? '#60a5fa' : 'var(--tint-teal)'} fontSize={8} fontFamily="monospace">
            {p.v.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  )
}

export default TidePlot
