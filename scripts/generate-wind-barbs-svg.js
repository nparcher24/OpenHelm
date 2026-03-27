#!/usr/bin/env node
/**
 * Wind Barb SVG-to-PNG Generator (no native dependencies)
 * Generates wind barb PNGs from inline SVGs using sharp if available,
 * otherwise outputs SVG files that Vite will serve.
 *
 * Usage: node scripts/generate-wind-barbs-svg.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'wind-barbs')

const SIZE = 64
const CX = SIZE / 2
const CY = SIZE / 2
const STAFF_LEN = 26
const BARB_LEN = 12
const HALF_BARB_LEN = 7
const SPACING = 5
const PENNANT_H = 5
const COLOR = '#ff4444'
const SW = 3.5

const SPEEDS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100]

function generateBarb(speed) {
  const elements = []

  if (speed < 3) {
    // Calm: two concentric circles
    elements.push(`<circle cx="${CX}" cy="${CY}" r="6" fill="none" stroke="${COLOR}" stroke-width="${SW}"/>`)
    elements.push(`<circle cx="${CX}" cy="${CY}" r="3" fill="none" stroke="${COLOR}" stroke-width="${SW}"/>`)
  } else {
    const staffTop = CY - STAFF_LEN
    const staffBot = CY + 4

    // Staff
    elements.push(`<line x1="${CX}" y1="${staffBot}" x2="${CX}" y2="${staffTop}" stroke="${COLOR}" stroke-width="${SW}" stroke-linecap="round"/>`)

    // Decompose
    let rem = Math.round(speed / 5) * 5
    const pennants = Math.floor(rem / 50)
    rem -= pennants * 50
    const fullBarbs = Math.floor(rem / 10)
    rem -= fullBarbs * 10
    const halfBarbs = Math.floor(rem / 5)

    let y = staffTop

    // Pennants
    for (let i = 0; i < pennants; i++) {
      elements.push(`<polygon points="${CX},${y} ${CX + BARB_LEN},${y + PENNANT_H / 2} ${CX},${y + PENNANT_H}" fill="${COLOR}"/>`)
      y += PENNANT_H + 1
    }

    if (pennants > 0 && (fullBarbs > 0 || halfBarbs > 0)) y += 2

    // Full barbs
    for (let i = 0; i < fullBarbs; i++) {
      elements.push(`<line x1="${CX}" y1="${y}" x2="${CX + BARB_LEN}" y2="${y - SPACING}" stroke="${COLOR}" stroke-width="${SW}" stroke-linecap="round"/>`)
      y += SPACING
    }

    // Half barbs
    for (let i = 0; i < halfBarbs; i++) {
      elements.push(`<line x1="${CX}" y1="${y}" x2="${CX + HALF_BARB_LEN}" y2="${y - SPACING / 2}" stroke="${COLOR}" stroke-width="${SW}" stroke-linecap="round"/>`)
      y += SPACING
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">\n${elements.join('\n')}\n</svg>`
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

for (const speed of SPEEDS) {
  const svg = generateBarb(speed)
  const filename = `barb-${speed}.svg`
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg)
  console.log(`Generated ${filename}`)
}

console.log(`\nGenerated ${SPEEDS.length} wind barb SVGs in ${OUTPUT_DIR}`)
console.log('Note: MapLibre can load SVGs via map.loadImage() — they render as raster at display time.')
