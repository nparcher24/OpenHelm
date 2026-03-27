#!/usr/bin/env node
/**
 * Wind Barb Sprite Generator
 * Generates standard meteorological wind barb PNGs for MapLibre map display.
 *
 * Convention:
 * - Calm: circle
 * - Half barb (short line): 5 knots
 * - Full barb (long line): 10 knots
 * - Pennant (filled triangle): 50 knots
 *
 * Barbs are drawn pointing UP (north). MapLibre rotates via icon-rotate.
 *
 * Usage: node scripts/generate-wind-barbs.js
 * Requires: npm install canvas (dev dependency)
 */

import { createCanvas } from 'canvas'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'wind-barbs')

const SIZE = 64
const CENTER_X = SIZE / 2
const CENTER_Y = SIZE / 2
const STAFF_LENGTH = 26
const BARB_LENGTH = 12
const BARB_HALF_LENGTH = 7
const BARB_SPACING = 5
const PENNANT_WIDTH = 5
const LINE_WIDTH = 2.5
const COLOR = '#00ff88' // Terminal green to match app theme

// Speeds to generate
const SPEEDS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100]

function drawWindBarb(ctx, speed) {
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.strokeStyle = COLOR
  ctx.fillStyle = COLOR
  ctx.lineWidth = LINE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (speed < 3) {
    // Calm - draw two concentric circles
    ctx.beginPath()
    ctx.arc(CENTER_X, CENTER_Y, 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(CENTER_X, CENTER_Y, 3, 0, Math.PI * 2)
    ctx.stroke()
    return
  }

  // Draw staff (vertical line pointing up from center)
  const staffTop = CENTER_Y - STAFF_LENGTH
  const staffBottom = CENTER_Y + 4

  ctx.beginPath()
  ctx.moveTo(CENTER_X, staffBottom)
  ctx.lineTo(CENTER_X, staffTop)
  ctx.stroke()

  // Decompose speed into pennants, full barbs, half barbs
  let remaining = Math.round(speed / 5) * 5 // Round to nearest 5
  const pennants = Math.floor(remaining / 50)
  remaining -= pennants * 50
  const fullBarbs = Math.floor(remaining / 10)
  remaining -= fullBarbs * 10
  const halfBarbs = Math.floor(remaining / 5)

  // Draw from top of staff downward
  let yPos = staffTop

  // Draw pennants (filled triangles)
  for (let i = 0; i < pennants; i++) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X, yPos)
    ctx.lineTo(CENTER_X + BARB_LENGTH, yPos + PENNANT_WIDTH / 2)
    ctx.lineTo(CENTER_X, yPos + PENNANT_WIDTH)
    ctx.closePath()
    ctx.fill()
    yPos += PENNANT_WIDTH + 1
  }

  // Small gap after pennants
  if (pennants > 0 && (fullBarbs > 0 || halfBarbs > 0)) {
    yPos += 2
  }

  // Draw full barbs (long lines to the right)
  for (let i = 0; i < fullBarbs; i++) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X, yPos)
    ctx.lineTo(CENTER_X + BARB_LENGTH, yPos - BARB_SPACING)
    ctx.stroke()
    yPos += BARB_SPACING
  }

  // Draw half barbs (shorter lines to the right)
  for (let i = 0; i < halfBarbs; i++) {
    ctx.beginPath()
    ctx.moveTo(CENTER_X, yPos)
    ctx.lineTo(CENTER_X + BARB_HALF_LENGTH, yPos - BARB_SPACING / 2)
    ctx.stroke()
    yPos += BARB_SPACING
  }
}

// Main
fs.mkdirSync(OUTPUT_DIR, { recursive: true })

for (const speed of SPEEDS) {
  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')

  drawWindBarb(ctx, speed)

  const filename = `barb-${speed}.png`
  const filepath = path.join(OUTPUT_DIR, filename)
  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(filepath, buffer)
  console.log(`Generated ${filename} (${buffer.length} bytes)`)
}

console.log(`\nGenerated ${SPEEDS.length} wind barb sprites in ${OUTPUT_DIR}`)
