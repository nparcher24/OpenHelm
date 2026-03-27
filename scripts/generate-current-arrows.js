#!/usr/bin/env node
/**
 * Current Arrow SVG Generator
 * Generates arrow sprites for ocean current visualization.
 * Arrows are cyan/blue, sized by current speed.
 * Oriented pointing UP (north) — MapLibre rotates via icon-rotate.
 *
 * Usage: node scripts/generate-current-arrows.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'current-arrows')

const SIZE = 64
const CX = SIZE / 2
const COLOR = '#00ddff' // Cyan to differentiate from red wind barbs
const SW = 3.0

// Current speeds in knots — arrows scale with speed
// Ocean currents are typically 0-4 kt, so we use finer increments
const SPEEDS = [0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0]

function generateArrow(speed) {
  const elements = []

  if (speed < 0.1) {
    // No current — small dot
    elements.push(`<circle cx="${CX}" cy="${CX}" r="3" fill="${COLOR}" opacity="0.5"/>`)
    return wrap(elements)
  }

  // Arrow length scales with speed (min 10px, max 28px)
  const len = Math.min(28, Math.max(10, speed * 10))
  const tipY = CX - len
  const tailY = CX + len * 0.3
  const headSize = Math.min(8, 4 + speed * 1.5) // arrowhead scales too

  // Shaft
  elements.push(`<line x1="${CX}" y1="${tailY}" x2="${CX}" y2="${tipY}" stroke="${COLOR}" stroke-width="${SW}" stroke-linecap="round"/>`)

  // Arrowhead (filled triangle)
  elements.push(`<polygon points="${CX},${tipY - 2} ${CX - headSize},${tipY + headSize} ${CX + headSize},${tipY + headSize}" fill="${COLOR}"/>`)

  return wrap(elements)
}

function wrap(elements) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">\n${elements.join('\n')}\n</svg>`
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

for (const speed of SPEEDS) {
  const svg = generateArrow(speed)
  // Use speed * 100 for filename to avoid dots (0.25 → 025)
  const tag = String(Math.round(speed * 100)).padStart(3, '0')
  const filename = `arrow-${tag}.svg`
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg)
  console.log(`Generated ${filename} (${speed} kt)`)
}

console.log(`\nGenerated ${SPEEDS.length} current arrow SVGs in ${OUTPUT_DIR}`)
