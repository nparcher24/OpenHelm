/**
 * Satellite Tile Service
 * Frontend service for satellite imagery tile URLs and region metadata
 */

import { API_BASE } from '../utils/apiConfig.js'

/**
 * Get all downloaded satellite regions
 */
export async function getSatelliteRegions() {
  try {
    const response = await fetch(`${API_BASE}/api/satellite/regions`)
    if (!response.ok) throw new Error(`Failed to fetch regions: ${response.statusText}`)
    return await response.json()
  } catch (error) {
    console.error('Error fetching satellite regions:', error)
    return { success: false, regions: [] }
  }
}

/**
 * Get the satellite tile URL template for MapLibre
 * Returns the XYZ tile URL served by Express static middleware
 */
export function getSatelliteTileUrl() {
  return `${API_BASE}/satellite-tiles/{z}/{x}/{y}.png`
}

/**
 * Calculate combined bounds of all regions
 * @param {Array<{bounds: number[]}>} regions - Regions with bounds [w,s,e,n]
 * @returns {[number, number, number, number]|null} [west, south, east, north]
 */
export function getCombinedBounds(regions) {
  if (!regions || regions.length === 0) return null

  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity

  for (const region of regions) {
    if (region.bounds && region.bounds.length === 4) {
      west = Math.min(west, region.bounds[0])
      south = Math.min(south, region.bounds[1])
      east = Math.max(east, region.bounds[2])
      north = Math.max(north, region.bounds[3])
    }
  }

  return west === Infinity ? null : [west, south, east, north]
}
