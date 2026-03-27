// Heading line with distance tick marks
// Renders an SVG line from the boat icon extending in the heading direction
// Length is always 1/3 of viewport height; tick marks show statute distances

const METERS_PER_FOOT = 0.3048
const FEET_PER_MILE = 5280

// "Nice" distance intervals in feet, from small to large
const NICE_INTERVALS_FT = [
  5, 10, 25, 50, 100, 250, 500,
  1000, 2000, 2500,
  FEET_PER_MILE * 0.25,   // 0.25 mi
  FEET_PER_MILE * 0.5,    // 0.5 mi
  FEET_PER_MILE,           // 1 mi
  FEET_PER_MILE * 2,       // 2 mi
  FEET_PER_MILE * 5,       // 5 mi
  FEET_PER_MILE * 10,      // 10 mi
  FEET_PER_MILE * 25,      // 25 mi
  FEET_PER_MILE * 50,      // 50 mi
  FEET_PER_MILE * 100,     // 100 mi
]

// Format a distance in feet to a readable label
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

// Pick a nice tick interval that gives ~4-6 ticks for the given total distance in feet
function pickTickInterval(totalFeet) {
  const targetTicks = 3
  const idealInterval = totalFeet / targetTicks

  for (const interval of NICE_INTERVALS_FT) {
    const ticks = Math.floor(totalFeet / interval)
    if (ticks >= 2 && ticks <= 4 && interval >= idealInterval * 0.5) return interval
  }
  // Fallback: find closest to giving 3 ticks
  for (const interval of NICE_INTERVALS_FT) {
    if (interval >= idealInterval * 0.5) return interval
  }
  return NICE_INTERVALS_FT[NICE_INTERVALS_FT.length - 1]
}

// Calculate meters-per-pixel at a given latitude and zoom level
function metersPerPixel(latitude, zoom) {
  return (Math.cos(latitude * Math.PI / 180) * 2 * Math.PI * 6378137) / (256 * Math.pow(2, zoom))
}

// Build the heading line SVG content (everything above the boat icon)
// color = boat fill color (green for fix, red for no fix)
export function buildHeadingLineSVG(map, boatLat, color = '#22c55e') {
  if (!map) return null

  const viewportHeight = map.getCanvas().clientHeight
  const linePixelLength = Math.floor(viewportHeight / 2)
  const zoom = map.getZoom()

  // Real-world distance the line represents
  const mpp = metersPerPixel(boatLat, zoom)
  const lineMeters = linePixelLength * mpp
  const lineFeet = lineMeters / METERS_PER_FOOT

  const tickInterval = pickTickInterval(lineFeet)
  const pixelsPerFoot = linePixelLength / lineFeet

  // SVG dimensions — line goes straight up from center bottom
  const svgWidth = 200
  const svgHeight = linePixelLength + 10  // small padding at top
  const centerX = svgWidth / 2
  const bottomY = svgHeight
  const tickWidth = 10
  const labelOffset = tickWidth + 4

  let paths = ''
  let labels = ''

  // Main heading line (boat color with dark outline for contrast)
  paths += `<line x1="${centerX}" y1="${bottomY}" x2="${centerX}" y2="${bottomY - linePixelLength}" stroke="rgba(0,0,0,0.5)" stroke-width="3" stroke-linecap="round"/>`
  paths += `<line x1="${centerX}" y1="${bottomY}" x2="${centerX}" y2="${bottomY - linePixelLength}" stroke="${color}" stroke-width="1.75" stroke-linecap="round"/>`

  // Arrow at tip (shifted up slightly so the line doesn't poke through)
  const tipY = bottomY - linePixelLength - 4
  const arrowSize = 6
  paths += `<path d="M${centerX} ${tipY} L${centerX - arrowSize} ${tipY + arrowSize * 1.5} L${centerX + arrowSize} ${tipY + arrowSize * 1.5} Z" fill="${color}" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/>`

  // Tick marks (right side only)
  let dist = tickInterval
  while (dist < lineFeet) {
    const tickY = bottomY - (dist * pixelsPerFoot)
    if (tickY < tipY + 10) break  // don't overlap arrow

    // Dark outline tick
    paths += `<line x1="${centerX}" y1="${tickY}" x2="${centerX + tickWidth}" y2="${tickY}" stroke="rgba(0,0,0,0.5)" stroke-width="3.5" stroke-linecap="round"/>`
    // Colored tick
    paths += `<line x1="${centerX}" y1="${tickY}" x2="${centerX + tickWidth}" y2="${tickY}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`

    // Label (right side of tick)
    const label = formatDistance(dist)
    labels += `<text x="${centerX + labelOffset}" y="${tickY + 5}" font-family="system-ui, sans-serif" font-size="15" font-weight="600" fill="${color}" stroke="rgba(0,0,0,0.6)" stroke-width="1.5" paint-order="stroke fill">${label}</text>`

    dist += tickInterval
  }

  return { svgWidth, svgHeight, paths, labels }
}

// Create the full heading line SVG element string
export function createHeadingLineSVGString(map, boatLat, color) {
  const result = buildHeadingLineSVG(map, boatLat, color)
  if (!result) return ''

  const { svgWidth, svgHeight, paths, labels } = result

  return `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="display:block; pointer-events:none; overflow:visible; filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));">${paths}${labels}</svg>`
}
