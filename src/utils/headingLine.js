// Heading line — Apple-Maps-style forward cone with a thin gradient centerline
// and tabular-numeric distance ticks. Length is half the viewport height.
// `color` is a CSS color string (hex or `var(--*)`) — passed through into SVG
// attributes so theme changes recolor the line automatically.

const METERS_PER_FOOT = 0.3048
const FEET_PER_MILE = 5280

const NICE_INTERVALS_FT = [
  5, 10, 25, 50, 100, 250, 500,
  1000, 2000, 2500,
  FEET_PER_MILE * 0.25,
  FEET_PER_MILE * 0.5,
  FEET_PER_MILE,
  FEET_PER_MILE * 2,
  FEET_PER_MILE * 5,
  FEET_PER_MILE * 10,
  FEET_PER_MILE * 25,
  FEET_PER_MILE * 50,
  FEET_PER_MILE * 100,
]

function formatDistance(feet) {
  if (feet >= FEET_PER_MILE) {
    const miles = feet / FEET_PER_MILE
    if (miles === Math.floor(miles)) return `${Math.floor(miles)} mi`
    return `${miles.toFixed(1)} mi`.replace('.0 mi', ' mi')
  }
  if (feet >= 1000) return `${Math.round(feet).toLocaleString()} ft`
  if (feet === Math.floor(feet)) return `${Math.floor(feet)} ft`
  return `${Math.round(feet)} ft`
}

function pickTickInterval(totalFeet) {
  const targetTicks = 3
  const idealInterval = totalFeet / targetTicks

  for (const interval of NICE_INTERVALS_FT) {
    const ticks = Math.floor(totalFeet / interval)
    if (ticks >= 2 && ticks <= 4 && interval >= idealInterval * 0.5) return interval
  }
  for (const interval of NICE_INTERVALS_FT) {
    if (interval >= idealInterval * 0.5) return interval
  }
  return NICE_INTERVALS_FT[NICE_INTERVALS_FT.length - 1]
}

function metersPerPixel(latitude, zoom) {
  return (Math.cos(latitude * Math.PI / 180) * 2 * Math.PI * 6378137) / (256 * Math.pow(2, zoom))
}

const DRIFT_COLOR = 'var(--beacon)'

export function buildHeadingLineSVG(map, boatLat, color = 'var(--signal)', heading = null, cog = null, palette = null) {
  if (!map) return null

  const viewportHeight = map.getCanvas().clientHeight
  const linePixelLength = Math.floor(viewportHeight / 2)
  const zoom = map.getZoom()

  const mpp = metersPerPixel(boatLat, zoom)
  const lineMeters = linePixelLength * mpp
  const lineFeet = lineMeters / METERS_PER_FOOT

  const tickInterval = pickTickInterval(lineFeet)
  const pixelsPerFoot = linePixelLength / lineFeet

  const svgWidth = 360
  const svgHeight = linePixelLength + 12
  const centerX = svgWidth / 2
  const bottomY = svgHeight
  const tipY = bottomY - linePixelLength

  // Forward cone: narrow at base (vessel), wider at the tip — opposite of a
  // beam, more like a soft directional fan. ~28px each side at the tip (2×).
  const coneTipHalfW = 28

  // Theme-aware label/halo. Falls back to the original white-on-black look.
  const labelFill = palette?.text     ?? '#FFFFFF'
  const labelHalo = palette?.textHalo ?? 'rgba(0,0,0,0.65)'
  const lineHalo  = palette?.textHalo ?? 'rgba(0,0,0,0.32)'

  const defs = `
    <linearGradient id="hl-line" x1="50%" y1="100%" x2="50%" y2="0%">
      <stop offset="0%"   stop-color="${color}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.30"/>
    </linearGradient>
    <linearGradient id="hl-cone" x1="50%" y1="100%" x2="50%" y2="0%">
      <stop offset="0%"   stop-color="${color}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
  `

  let paths = ''
  let labels = ''

  // Translucent forward cone
  paths += `<path d="M${centerX} ${bottomY} L${centerX - coneTipHalfW} ${tipY} L${centerX + coneTipHalfW} ${tipY} Z" fill="url(#hl-cone)"/>`

  // Centerline — soft dark backing for legibility on bright tiles, thin
  // gradient foreground that fades toward the tip.
  paths += `<line x1="${centerX}" y1="${bottomY}" x2="${centerX}" y2="${tipY}" stroke="${lineHalo}" stroke-width="4.5" stroke-linecap="round"/>`
  paths += `<line x1="${centerX}" y1="${bottomY}" x2="${centerX}" y2="${tipY}" stroke="url(#hl-line)" stroke-width="2.5" stroke-linecap="round"/>`

  // Symmetrical thin tick marks with mono-numeric labels (2× sized).
  const tickHalf = 10
  let dist = tickInterval
  while (dist < lineFeet) {
    const tickY = bottomY - (dist * pixelsPerFoot)
    if (tickY < tipY + 16) break

    paths += `<line x1="${centerX - tickHalf}" y1="${tickY}" x2="${centerX + tickHalf}" y2="${tickY}" stroke="${lineHalo}" stroke-width="4.5" stroke-linecap="round"/>`
    paths += `<line x1="${centerX - tickHalf}" y1="${tickY}" x2="${centerX + tickHalf}" y2="${tickY}" stroke="${color}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`

    const label = formatDistance(dist)
    labels += `<text x="${centerX + tickHalf + 12}" y="${tickY + 8}" font-family="JetBrains Mono, ui-monospace, SFMono-Regular, monospace" font-size="22" font-weight="600" fill="${labelFill}" stroke="${labelHalo}" stroke-width="4.5" paint-order="stroke fill" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">${label}</text>`

    dist += tickInterval
  }

  // Drift / ground-track vector — Beacon Blue when COG diverges from heading
  // by more than 20°. Thin line + small chevron tip, no tick ladder.
  if (heading != null && cog != null) {
    let drift = cog - heading
    while (drift > 180) drift -= 360
    while (drift < -180) drift += 360

    if (Math.abs(drift) > 20) {
      const gtLength = Math.floor(linePixelLength / 3)
      const gtEndX = centerX + Math.sin(drift * Math.PI / 180) * gtLength
      const gtEndY = bottomY - Math.cos(drift * Math.PI / 180) * gtLength

      const driftRad = drift * Math.PI / 180
      const arrowSz = 10
      const gtTipX = gtEndX + Math.sin(driftRad) * 6
      const gtTipY = gtEndY - Math.cos(driftRad) * 6
      const perpX = Math.cos(driftRad)
      const perpY = Math.sin(driftRad)
      const gtBaseX1 = gtTipX - Math.sin(driftRad) * arrowSz * 1.6 + perpX * arrowSz
      const gtBaseY1 = gtTipY + Math.cos(driftRad) * arrowSz * 1.6 + perpY * arrowSz
      const gtBaseX2 = gtTipX - Math.sin(driftRad) * arrowSz * 1.6 - perpX * arrowSz
      const gtBaseY2 = gtTipY + Math.cos(driftRad) * arrowSz * 1.6 - perpY * arrowSz

      paths += `<line x1="${centerX}" y1="${bottomY}" x2="${gtEndX}" y2="${gtEndY}" stroke="${lineHalo}" stroke-width="4.5" stroke-linecap="round"/>`
      paths += `<line x1="${centerX}" y1="${bottomY}" x2="${gtEndX}" y2="${gtEndY}" stroke="${DRIFT_COLOR}" stroke-width="2.8" stroke-linecap="round" opacity="0.9"/>`
      paths += `<path d="M${gtTipX} ${gtTipY} L${gtBaseX1} ${gtBaseY1} L${gtBaseX2} ${gtBaseY2} Z" fill="${DRIFT_COLOR}" stroke="${lineHalo}" stroke-width="1" stroke-linejoin="round"/>`
    }
  }

  return { svgWidth, svgHeight, defs, paths, labels }
}

export function createHeadingLineSVGString(map, boatLat, color, heading, cog, palette = null) {
  const result = buildHeadingLineSVG(map, boatLat, color, heading, cog, palette)
  if (!result) return ''

  const { svgWidth, svgHeight, defs, paths, labels } = result

  return `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="display:block; pointer-events:none; overflow:visible; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));"><defs>${defs}</defs>${paths}${labels}</svg>`
}
