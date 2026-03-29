// Retro linear gauge SVG builders — 90's truck instrument cluster style
// Follows the same raw SVG string pattern as hudTapes.js

const COLORS = {
  green: '#00ff00',
  greenDim: '#00aa00',
  greenGlow: 'rgba(0,255,0,0.4)',
  amber: '#ffaa00',
  amberDim: '#cc8800',
  amberGlow: 'rgba(255,170,0,0.4)',
  red: '#ff4444',
  redDim: '#cc3333',
  redGlow: 'rgba(255,68,68,0.4)',
  bg: '#0a0a0a',
  bgRecessed: '#050505',
  tickInactive: '#1a1a1a',
  tickDim: '#222222',
  label: '#00aa00',
  white: '#e0e0e0'
}

/**
 * Build a horizontal retro linear gauge SVG string.
 *
 * @param {number|null} value - Current value (null = no data)
 * @param {number} min - Minimum scale value
 * @param {number} max - Maximum scale value
 * @param {number} width - SVG width in pixels
 * @param {object} options
 * @param {number} [options.height=40] - Bar height
 * @param {number} [options.majorInterval] - Major tick interval (auto if omitted)
 * @param {number} [options.minorInterval] - Minor tick interval (auto if omitted)
 * @param {number} [options.warnAt] - Value where color changes to amber
 * @param {number} [options.alarmAt] - Value where color changes to red
 * @param {boolean} [options.invertWarning] - If true, warn/alarm below threshold (e.g., oil pressure)
 * @param {string[]} [options.labels] - Custom scale labels array
 * @returns {string} Raw SVG string
 */
export function buildLinearGaugeSVG(value, min, max, width, options = {}) {
  if (!width || width < 20) return ''

  const {
    height = 40,
    majorInterval,
    minorInterval,
    warnAt,
    alarmAt,
    invertWarning = false
  } = options

  const w = Math.round(width)
  const h = height
  const range = max - min
  const padL = 2
  const padR = 2
  const barW = w - padL - padR
  const barH = Math.round(h * 0.55)
  const barY = 4
  const tickAreaY = barY + barH + 2

  // Auto-calculate intervals if not specified
  const majInt = majorInterval || calcMajorInterval(range)
  const minInt = minorInterval || majInt / 5

  // Segment count — each pixel-wide stripe
  const segCount = Math.max(1, Math.round(barW / 3))
  const segW = barW / segCount
  const segGap = Math.max(0.5, segW * 0.15)

  // Determine fill ratio
  const clampedVal = value != null ? Math.max(min, Math.min(max, value)) : min
  const fillRatio = value != null ? (clampedVal - min) / range : 0

  // For inverted warnings (low = danger), all active segments share one color
  // based on the current reading. For normal warnings (high = danger), each
  // segment is colored by its position on the scale (green → amber → red zones).
  const uniformColor = invertWarning && value != null
    ? getSegmentColor(clampedVal, warnAt, alarmAt, invertWarning)
    : null

  // Build segments
  let segments = ''
  for (let i = 0; i < segCount; i++) {
    const segRatio = (i + 1) / segCount
    const segValue = min + segRatio * range
    const x = padL + i * segW
    const isActive = value != null && segRatio <= fillRatio + (0.5 / segCount)

    let color
    if (!isActive) {
      color = COLORS.tickInactive
    } else if (uniformColor) {
      color = uniformColor.color
    } else {
      color = getSegmentColor(segValue, warnAt, alarmAt, invertWarning).color
    }

    segments += `<rect x="${x}" y="${barY}" width="${Math.max(0.5, segW - segGap)}" height="${barH}" rx="1" fill="${color}" ${isActive ? `filter="url(#glow-${c2id(color)})"` : ''}/>`
  }

  // Sweep indicator line at current value
  let sweepLine = ''
  if (value != null) {
    const sweepX = padL + fillRatio * barW
    const sweepCol = uniformColor || getSegmentColor(clampedVal, warnAt, alarmAt, invertWarning)
    sweepLine = `<line x1="${sweepX}" y1="${barY - 1}" x2="${sweepX}" y2="${barY + barH + 1}" stroke="${sweepCol.color}" stroke-width="2" filter="url(#glow-${c2id(sweepCol.color)})"/>`
  }

  // Tick marks and labels — use integer step count to avoid floating-point drift
  let ticks = ''
  let labels = ''
  const tickCount = Math.round(range / minInt)
  for (let step = 0; step <= tickCount; step++) {
    const v = min + step * minInt
    const ratio = (v - min) / range
    const x = padL + ratio * barW
    const distToMajor = Math.abs(((v - min) % majInt))
    const isMajor = distToMajor < 0.001 || Math.abs(distToMajor - majInt) < 0.001

    if (isMajor) {
      ticks += `<line x1="${x}" y1="${tickAreaY}" x2="${x}" y2="${tickAreaY + 6}" stroke="${COLORS.greenDim}" stroke-width="1.5"/>`
      const labelVal = Number.isInteger(v) ? v : v.toFixed(1)
      labels += `<text x="${x}" y="${tickAreaY + 15}" font-size="10" font-family="JetBrains Mono, monospace" fill="${COLORS.label}" text-anchor="middle" font-weight="600">${labelVal}</text>`
    } else {
      ticks += `<line x1="${x}" y1="${tickAreaY}" x2="${x}" y2="${tickAreaY + 3}" stroke="${COLORS.tickDim}" stroke-width="0.8"/>`
    }
  }

  // Recessed background
  const bg = `<rect x="${padL - 1}" y="${barY - 1}" width="${barW + 2}" height="${barH + 2}" rx="2" fill="${COLORS.bgRecessed}" stroke="${COLORS.tickDim}" stroke-width="0.5"/>`

  // Glow filters
  const defs = `<defs>
    <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`

  const svgH = tickAreaY + 18
  return `<svg width="${w}" height="${svgH}" viewBox="0 0 ${w} ${svgH}" style="display:block;">${defs}${bg}${segments}${sweepLine}${ticks}${labels}</svg>`
}

// Map a color hex to a filter ID fragment
function c2id(hex) {
  if (hex === COLORS.green) return 'green'
  if (hex === COLORS.amber) return 'amber'
  if (hex === COLORS.red) return 'red'
  return 'green'
}

function getSegmentColor(segValue, warnAt, alarmAt, invertWarning) {
  if (warnAt == null && alarmAt == null) {
    return { color: COLORS.green, glow: COLORS.greenGlow }
  }

  if (invertWarning) {
    // Lower is worse (e.g., oil pressure, fuel level)
    if (alarmAt != null && segValue <= alarmAt) return { color: COLORS.red, glow: COLORS.redGlow }
    if (warnAt != null && segValue <= warnAt) return { color: COLORS.amber, glow: COLORS.amberGlow }
    return { color: COLORS.green, glow: COLORS.greenGlow }
  } else {
    // Higher is worse (e.g., RPM, temp)
    if (alarmAt != null && segValue >= alarmAt) return { color: COLORS.red, glow: COLORS.redGlow }
    if (warnAt != null && segValue >= warnAt) return { color: COLORS.amber, glow: COLORS.amberGlow }
    return { color: COLORS.green, glow: COLORS.greenGlow }
  }
}

function calcMajorInterval(range) {
  if (range <= 20) return 5
  if (range <= 50) return 10
  if (range <= 200) return 50
  if (range <= 1000) return 200
  if (range <= 5000) return 1000
  return 2000
}
