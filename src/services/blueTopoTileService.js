/**
 * BlueTopo Tile Service
 * Frontend service for fetching BlueTopo tile metadata for map display
 */

import { API_BASE } from '../utils/apiConfig.js'

/**
 * Get metadata for all downloaded BlueTopo tiles
 * Returns tile bounds and zoom levels needed for map sources
 * @returns {Promise<{success: boolean, tiles: Array<{tileId: string, bounds: number[], minZoom: number, maxZoom: number}>}>}
 */
export async function getDownloadedTileMetadata() {
  try {
    const response = await fetch(`${API_BASE}/api/bluetopo/tiles/metadata`)
    if (!response.ok) {
      throw new Error(`Failed to fetch tile metadata: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching tile metadata:', error)
    return { success: false, tiles: [], error: error.message }
  }
}

/**
 * Get the tile URL template for a specific BlueTopo tile
 * @param {string} tileId - The tile identifier
 * @returns {string} URL template for MapLibre raster source
 */
export function getTileUrl(tileId) {
  return `${API_BASE}/tiles/bluetopo/${tileId}/{z}/{x}/{y}.png`
}

/**
 * Calculate the combined bounds of all provided tiles
 * @param {Array<{bounds: number[]}>} tiles - Array of tiles with bounds
 * @returns {[number, number, number, number]} Combined bounds [minx, miny, maxx, maxy]
 */
export function getCombinedBounds(tiles) {
  if (!tiles || tiles.length === 0) {
    return null
  }

  let minx = Infinity
  let miny = Infinity
  let maxx = -Infinity
  let maxy = -Infinity

  for (const tile of tiles) {
    if (tile.bounds) {
      minx = Math.min(minx, tile.bounds[0])
      miny = Math.min(miny, tile.bounds[1])
      maxx = Math.max(maxx, tile.bounds[2])
      maxy = Math.max(maxy, tile.bounds[3])
    }
  }

  return [minx, miny, maxx, maxy]
}

/**
 * Query depth at a specific location
 * @param {number} lon - Longitude (WGS84)
 * @param {number} lat - Latitude (WGS84)
 * @returns {Promise<{success: boolean, depth?: number, uncertainty?: number, tileId?: string, message?: string}>}
 */
export async function getDepthAtLocation(lon, lat) {
  try {
    const response = await fetch(`${API_BASE}/api/bluetopo/depth?lat=${lat}&lon=${lon}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch depth: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching depth:', error)
    return {
      success: false,
      message: error.message
    }
  }
}
