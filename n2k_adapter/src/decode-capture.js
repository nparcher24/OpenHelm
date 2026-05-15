/**
 * decode-capture.js — Offline decoder for candump captures.
 *
 * Reads a `candump -tz` log file, parses each 29-bit J1939/N2K frame,
 * runs it through canboatjs FromPgn (with fast-packet reassembly), and
 * prints a per-source inventory: PGNs seen, descriptions, frame counts.
 *
 * Usage:
 *   node n2k_adapter/src/decode-capture.js <path-to-candump.log>
 *
 * The script is intentionally diagnostic-only — does not write back into
 * the bus and does not duplicate `api-server/services/nmea2000Service.js`.
 */
import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { FromPgn } = require('@canboat/canboatjs')

const file = process.argv[2]
if (!file) {
  console.error('[decode] usage: node decode-capture.js <candump.log>')
  process.exit(1)
}

// candump -tz line format:
//   (000.001234)  can0  09F80103   [8]  81 16 FC 15 96 CE B4 D2
const LINE_RE = /^\s*\(([\d.]+)\)\s+\S+\s+([0-9A-Fa-f]+)\s+\[(\d+)\]\s+(.*)$/

function decodeId(id) {
  const prio = (id >>> 26) & 0x7
  const dp = (id >>> 24) & 0x1
  const pf = (id >>> 16) & 0xFF
  const ps = (id >>> 8) & 0xFF
  const sa = id & 0xFF
  let pgn, dst
  if (pf >= 240) {
    pgn = (dp << 16) | (pf << 8) | ps
    dst = 0xFF
  } else {
    pgn = (dp << 16) | (pf << 8)
    dst = ps
  }
  return { pgn, src: sa, dst, prio }
}

const fromPgn = new FromPgn()
fromPgn.on('error', () => {})       // suppress parse errors for unknown/proprietary

// Aggregator: src -> Map<pgn, { count, description }>
const inventory = new Map()
function note(src, pgn, description) {
  if (!inventory.has(src)) inventory.set(src, new Map())
  const bySrc = inventory.get(src)
  if (!bySrc.has(pgn)) bySrc.set(pgn, { count: 0, description })
  bySrc.get(pgn).count++
}

// Track raw frames too (so we still see proprietary/unknown PGNs even
// when canboatjs can't decode them).
const rawBySrc = new Map()
function noteRaw(src, pgn) {
  if (!rawBySrc.has(src)) rawBySrc.set(src, new Map())
  const m = rawBySrc.get(src)
  m.set(pgn, (m.get(pgn) || 0) + 1)
}

fromPgn.on('pgn', (msg) => {
  note(msg.src, msg.pgn, msg.description || '')
})

const lines = fs.readFileSync(file, 'utf8').split('\n')
let totalFrames = 0
let parseFailures = 0

for (const line of lines) {
  const m = LINE_RE.exec(line)
  if (!m) continue
  const id = parseInt(m[2], 16)
  const len = parseInt(m[3], 10)
  const data = Buffer.from(m[4].trim().split(/\s+/).map(b => parseInt(b, 16)))
  const info = decodeId(id)
  noteRaw(info.src, info.pgn)
  totalFrames++
  try {
    fromPgn.parsePgnData(info, len, data)
  } catch (e) {
    parseFailures++
  }
}

const sources = [...new Set([...inventory.keys(), ...rawBySrc.keys()])].sort((a, b) => a - b)

console.log(`[decode] ${file}`)
console.log(`[decode] frames=${totalFrames}  parseErrors=${parseFailures}  sources=${sources.length}`)
console.log('')

for (const src of sources) {
  const decoded = inventory.get(src) || new Map()
  const raw = rawBySrc.get(src) || new Map()
  const allPgns = new Set([...decoded.keys(), ...raw.keys()])
  console.log(`── src ${src.toString(16).padStart(2, '0')} (${src}) — ${allPgns.size} unique PGN(s)`)
  for (const pgn of [...allPgns].sort((a, b) => a - b)) {
    const dec = decoded.get(pgn)
    const rawCount = raw.get(pgn) || 0
    const decCount = dec ? dec.count : 0
    const desc = dec ? dec.description : '(undecoded / proprietary)'
    console.log(`   PGN ${pgn.toString().padStart(6)}  raw=${String(rawCount).padStart(4)}  decoded=${String(decCount).padStart(3)}  ${desc}`)
  }
  console.log('')
}
