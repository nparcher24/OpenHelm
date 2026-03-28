// HUD tape SVG builders — fighter-jet style scrolling tapes
// Follows the same raw SVG string pattern as headingLine.js

const DEFAULT_COLOR = '#22c55e'
const BLACK_OUTLINE = 'rgba(0,0,0,0.8)'
const FONT = 'system-ui, sans-serif'

// Convert hex color to rgba with given alpha
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function textAttrs(color) {
  return `font-family="${FONT}" font-weight="700" fill="${color}"`
}

// Cardinal direction lookup for heading tape
const CARDINALS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }

// ── Heading Tape (horizontal, scrolling) ──
export function buildHeadingTapeSVG(heading, containerWidth, color = DEFAULT_COLOR) {
  if (!containerWidth || containerWidth < 10) return ''

  const w = Math.round(containerWidth)
  const h = 55
  const pxPerDeg = 12
  const cx = w / 2

  const halfRange = Math.ceil(w / 2 / pxPerDeg) + 10

  let ticks = ''
  let labels = ''

  for (let i = -halfRange; i <= halfRange; i++) {
    const tickDeg = Math.round(heading) + i
    const normDeg = ((tickDeg % 360) + 360) % 360
    const x = cx + i * pxPerDeg

    if (tickDeg % 10 === 0) {
      // Major tick
      ticks += `<line x1="${x}" y1="0" x2="${x}" y2="22" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`

      // Label — cardinal or 3-digit number
      const label = CARDINALS[normDeg] || String(normDeg).padStart(3, '0')
      labels += `<text x="${x}" y="44" font-size="22" text-anchor="middle" ${textAttrs(color)}>${label}</text>`
    } else if (tickDeg % 5 === 0) {
      // Minor tick
      ticks += `<line x1="${x}" y1="0" x2="${x}" y2="12" stroke="${hexToRgba(color, 0.4)}" stroke-width="5" stroke-linecap="round"/>`
    }
  }

  // Baseline
  const baseline = `<line x1="0" y1="0.5" x2="${w}" y2="0.5" stroke="${hexToRgba(color, 0.4)}" stroke-width="5"/>`

  // Center caret (pointing down at top of tape)
  const caret = `<path d="M${cx} 0 L${cx - 10} -12 L${cx + 10} -12 Z" fill="${color}"/>`

  // Fade mask
  const defs = `<defs>
    <linearGradient id="hud-hdg-fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="black" stop-opacity="1"/>
      <stop offset="8%" stop-color="white" stop-opacity="1"/>
      <stop offset="92%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="black" stop-opacity="1"/>
    </linearGradient>
    <mask id="hud-hdg-mask">
      <rect x="0" y="-20" width="${w}" height="${h + 20}" fill="url(#hud-hdg-fade)"/>
    </mask>
  </defs>`

  return `<svg width="${w}" height="${h}" viewBox="0 -15 ${w} ${h + 15}" style="display:block;pointer-events:none;overflow:visible;">${defs}${baseline}<g mask="url(#hud-hdg-mask)">${ticks}${labels}</g>${caret}</svg>`
}

// ── Vertical Tape (speed or depth ladder) ──
export function buildVerticalTapeSVG(value, side, majorInterval, minorInterval, pxPerUnit, containerHeight, svgId, color = DEFAULT_COLOR, inverted = false) {
  if (!containerHeight || containerHeight < 10) return ''

  const svgW = 130
  const h = Math.round(containerHeight)
  const isLeft = side === 'left'
  const baseX = isLeft ? svgW : 0
  const cy = h / 2

  const halfRange = Math.ceil(h / 2 / pxPerUnit) + majorInterval * 3

  let ticks = ''
  let labels = ''

  for (let i = -halfRange; i <= halfRange; i++) {
    const tickVal = Math.round(value / minorInterval) * minorInterval + i * minorInterval
    if (tickVal < 0) continue
    const y = inverted ? cy + (tickVal - value) * pxPerUnit : cy - (tickVal - value) * pxPerUnit
    if (y < -20 || y > h + 20) continue

    const isMajor = Math.abs(tickVal % majorInterval) < 0.01

    if (isMajor) {
      const tickLen = 22
      const x1 = isLeft ? baseX - tickLen : baseX
      const x2 = isLeft ? baseX : baseX + tickLen

      // Major tick
      ticks += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`

      // Label
      const lx = isLeft ? x1 - 6 : x2 + 6
      const anchor = isLeft ? 'end' : 'start'
      labels += `<text x="${lx}" y="${y + 7}" font-size="22" text-anchor="${anchor}" ${textAttrs(color)}>${Math.round(tickVal)}</text>`
    } else {
      const tickLen = 11
      const x1 = isLeft ? baseX - tickLen : baseX
      const x2 = isLeft ? baseX : baseX + tickLen
      ticks += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${hexToRgba(color, 0.4)}" stroke-width="5" stroke-linecap="round"/>`
    }
  }

  // Vertical baseline
  const baseline = `<line x1="${baseX}" y1="0" x2="${baseX}" y2="${h}" stroke="${hexToRgba(color, 0.4)}" stroke-width="5"/>`

  // Caret pointing inward at center
  const caretW = 14
  const caretH = 22
  let caret
  if (isLeft) {
    caret = `<path d="M${baseX} ${cy} L${baseX - caretW} ${cy - caretH / 2} L${baseX - caretW} ${cy + caretH / 2} Z" fill="${color}"/>`
  } else {
    caret = `<path d="M${baseX} ${cy} L${baseX + caretW} ${cy - caretH / 2} L${baseX + caretW} ${cy + caretH / 2} Z" fill="${color}"/>`
  }

  // Fade mask
  const defs = `<defs>
    <linearGradient id="${svgId}-fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="10%" stop-color="black" stop-opacity="1"/>
      <stop offset="90%" stop-color="black" stop-opacity="1"/>
      <stop offset="100%" stop-color="black" stop-opacity="0"/>
    </linearGradient>
    <mask id="${svgId}-mask">
      <rect x="-20" y="0" width="${svgW + 40}" height="${h}" fill="url(#${svgId}-fade)"/>
    </mask>
  </defs>`

  return `<svg width="${svgW}" height="${h}" viewBox="0 0 ${svgW} ${h}" style="display:block;pointer-events:none;overflow:visible;">${baseline}${ticks}${labels}${caret}</svg>`
}

// ── Convenience wrappers ──
export function buildSpeedTapeSVG(speedKts, containerHeight, color) {
  return buildVerticalTapeSVG(speedKts ?? 0, 'left', 5, 1, 24, containerHeight, 'hud-spd', color)
}

export function buildDepthTapeSVG(depthFt, containerHeight, color) {
  return buildVerticalTapeSVG(depthFt ?? 0, 'right', 10, 2, 12, containerHeight, 'hud-dpt', color, true)
}
