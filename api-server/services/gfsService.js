/**
 * NOAA GFS (Global Forecast System) Service
 * Downloads wind data from NOMADS filter service and parses GRIB2 via eccodes CLI.
 * Free, no rate limits, no API key required.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const execFileAsync = promisify(execFile)

const NOMADS_BASE = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl'
const GFS_CYCLES = ['18', '12', '06', '00'] // Try most recent first
const TMP_DIR = path.join(os.tmpdir(), 'openhelm-gfs')

/**
 * Find the most recent available GFS cycle.
 * GFS runs take ~4 hours to produce, so the latest cycle may not be ready.
 * We probe NOMADS with HEAD requests to find the newest available.
 */
export async function findLatestGFSCycle(signal) {
  // Try today and yesterday
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dates = [
    formatDateGFS(today),
    formatDateGFS(yesterday)
  ]

  for (const dateStr of dates) {
    for (const cycle of GFS_CYCLES) {
      const url = buildGFSUrl(dateStr, cycle, '000', [], null)
      try {
        const resp = await fetch(url, { method: 'HEAD', signal })
        if (resp.ok) {
          console.log(`[GFS] Found latest cycle: ${dateStr}/${cycle}z`)
          return { date: dateStr, cycle }
        }
      } catch {
        // Network error, try next
      }
    }
  }

  throw new Error('No GFS cycles available on NOMADS')
}

/**
 * Build a NOMADS filter URL for a specific GFS file.
 * @param {string} dateStr - YYYYMMDD
 * @param {string} cycle - '00', '06', '12', or '18'
 * @param {string} forecastHour - '000', '003', etc.
 * @param {string[]} variables - e.g., ['UGRD', 'VGRD']
 * @param {number[]|null} bbox - [west, south, east, north] or null for no spatial filter
 */
export function buildGFSUrl(dateStr, cycle, forecastHour, variables, bbox) {
  const fHour = String(forecastHour).padStart(3, '0')
  const params = new URLSearchParams()
  params.set('file', `gfs.t${cycle}z.pgrb2.0p25.f${fHour}`)
  params.set('lev_10_m_above_ground', 'on')

  for (const v of variables) {
    params.set(`var_${v}`, 'on')
  }

  if (bbox) {
    const [west, south, east, north] = bbox
    params.set('leftlon', String(west))
    params.set('rightlon', String(east))
    params.set('toplat', String(north))
    params.set('bottomlat', String(south))
  }

  params.set('dir', `/gfs.${dateStr}/${cycle}/atmos`)

  return `${NOMADS_BASE}?${params.toString()}`
}

/**
 * Download a single GFS GRIB2 file from NOMADS.
 * @returns {string} Path to downloaded file
 */
export async function downloadGFSFile(dateStr, cycle, forecastHour, bbox, signal) {
  await fs.mkdir(TMP_DIR, { recursive: true })

  const fHour = String(forecastHour).padStart(3, '0')
  const outPath = path.join(TMP_DIR, `gfs_${dateStr}_${cycle}z_f${fHour}.grib2`)

  // Skip if already downloaded (reuse across retries)
  try {
    const stat = await fs.stat(outPath)
    if (stat.size > 1000) return outPath
  } catch { /* doesn't exist */ }

  const url = buildGFSUrl(dateStr, cycle, fHour, ['UGRD', 'VGRD'], bbox)

  const resp = await fetch(url, { signal })
  if (!resp.ok) {
    throw new Error(`NOMADS download failed: HTTP ${resp.status} for f${fHour}`)
  }

  const buffer = Buffer.from(await resp.arrayBuffer())
  await fs.writeFile(outPath, buffer)

  return outPath
}

/**
 * Parse a GRIB2 file using eccodes grib_get_data CLI.
 * Extracts U and V wind components, filters to bbox.
 * @param {string} filePath - Path to GRIB2 file
 * @param {number[]} bbox - [west, south, east, north]
 * @returns {{ u: Array<{lat, lon, value}>, v: Array<{lat, lon, value}> }}
 */
export async function parseGrib2ToPoints(filePath, bbox) {
  const [west, south, east, north] = bbox
  // GRIB2 longitudes are 0-360
  const lonMin = west < 0 ? 360 + west : west
  const lonMax = east < 0 ? 360 + east : east

  const result = {}

  for (const varName of ['10u', '10v']) {
    const { stdout } = await execFileAsync('grib_get_data', ['-w', `shortName=${varName}`, filePath], {
      maxBuffer: 50 * 1024 * 1024
    })

    const points = []
    const lines = stdout.split('\n')
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/)
      if (parts.length < 3) continue
      const lat = parseFloat(parts[0])
      const lon360 = parseFloat(parts[1])
      const val = parseFloat(parts[2])
      if (lat >= south && lat <= north && lon360 >= lonMin && lon360 <= lonMax) {
        points.push({
          lat,
          lon: lon360 > 180 ? lon360 - 360 : lon360,
          value: val
        })
      }
    }
    result[varName] = points
  }

  return result
}

/**
 * Convert wind U/V components (m/s) to speed (knots) and meteorological direction (degrees).
 */
export function uvToSpeedDir(u, v) {
  const speedMs = Math.sqrt(u * u + v * v)
  const speedKt = speedMs * 1.94384
  const dirDeg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
  return { speed: parseFloat(speedKt.toFixed(1)), direction: Math.round(dirDeg) }
}

/**
 * Compute GFS forecast hours for a given number of forecast days.
 * GFS: hourly for 0-120h, 3-hourly for 120-384h.
 * We download every 3h throughout for consistency and speed.
 */
export function computeForecastHours(forecastDays) {
  const maxHour = forecastDays * 24
  const hours = []
  for (let h = 0; h <= Math.min(maxHour, 384); h += 3) {
    hours.push(h)
  }
  return hours
}

/**
 * Compute the valid timestamp for a forecast hour given the cycle time.
 * @param {string} dateStr - YYYYMMDD
 * @param {string} cycle - '00', '06', '12', '18'
 * @param {number} forecastHour
 * @returns {string} ISO-like timestamp: "YYYY-MM-DDTHH:00"
 */
export function forecastHourToTimestamp(dateStr, cycle, forecastHour) {
  const year = parseInt(dateStr.substring(0, 4))
  const month = parseInt(dateStr.substring(4, 6)) - 1
  const day = parseInt(dateStr.substring(6, 8))
  const hour = parseInt(cycle)

  const base = new Date(Date.UTC(year, month, day, hour))
  base.setUTCHours(base.getUTCHours() + forecastHour)

  const y = base.getUTCFullYear()
  const m = String(base.getUTCMonth() + 1).padStart(2, '0')
  const d = String(base.getUTCDate()).padStart(2, '0')
  const h = String(base.getUTCHours()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:00`
}

/**
 * Clean up temporary GRIB2 files.
 */
export async function cleanupTempFiles() {
  try {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
  } catch { /* ok */ }
}

// Helper
function formatDateGFS(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}
