/**
 * Depth Query Service
 * Queries depth data from raw GeoTIFF files using GDAL
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const RAW_FILES_DIR = path.join(PROJECT_ROOT, 'tiles', 'bluetopo_raw');
const GPKG_GLOB = path.join(PROJECT_ROOT, 'BlueTopo_Tile_Scheme_*.gpkg');

/**
 * Find which tile(s) contain the given coordinate
 * @param {number} lon - Longitude (WGS84)
 * @param {number} lat - Latitude (WGS84)
 * @returns {Promise<Array<string>>} Array of tile IDs
 */
async function findTilesContainingPoint(lon, lat) {
  try {
    // Find the GeoPackage file
    const { stdout } = await execAsync(`ls ${GPKG_GLOB}`);
    const gpkgPath = stdout.trim().split('\n')[0];

    if (!gpkgPath) {
      throw new Error('Tile scheme GeoPackage not found');
    }

    // Query GeoPackage for tiles containing this point using spatial filter
    const query = `ogrinfo -al -spat ${lon} ${lat} ${lon} ${lat} "${gpkgPath}" 2>/dev/null | grep "tile (String) =" | sed 's/.*= //'`;

    const { stdout: tilesOutput } = await execAsync(query);
    const tiles = tilesOutput.trim().split('\n').filter(t => t.length > 0);

    return tiles;
  } catch (error) {
    console.error('[DepthQuery] Error finding tiles:', error.message);
    return [];
  }
}

/**
 * Query depth from a GeoTIFF file
 * @param {string} tileId - Tile identifier
 * @param {number} lon - Longitude (WGS84)
 * @param {number} lat - Latitude (WGS84)
 * @returns {Promise<{depth: number, uncertainty: number}|null>}
 */
async function queryDepthFromTile(tileId, lon, lat) {
  try {
    const tiffPath = path.join(RAW_FILES_DIR, `${tileId}.tiff`);

    // Check if file exists
    try {
      await fs.access(tiffPath);
    } catch (error) {
      console.warn(`[DepthQuery] Raw file not found: ${tileId}`);
      return null;
    }

    // Query with gdallocationinfo
    // -wgs84 flag handles coordinate transformation automatically
    // -valonly returns just the pixel values
    const command = `gdallocationinfo -wgs84 -valonly "${tiffPath}" ${lon} ${lat}`;
    const { stdout } = await execAsync(command);

    const values = stdout.trim().split('\n').map(v => parseFloat(v));

    // Band 1 = Elevation (negative = depth below sea level in meters)
    // Band 2 = Uncertainty (meters)
    // Band 3 = Contributor
    const elevation = values[0];
    const uncertainty = values[1];

    // Check for NaN or no-data
    if (isNaN(elevation) || !isFinite(elevation)) {
      return null;
    }

    return {
      depth: elevation, // Negative values = depth below sea level
      uncertainty: uncertainty || 0
    };

  } catch (error) {
    // Location is outside this tile's bounds
    if (error.message.includes('Location is off this file') ||
        error.message.includes('Failed to compute location')) {
      return null;
    }
    console.error(`[DepthQuery] Error querying depth from ${tileId}:`, error.message);
    return null;
  }
}

/**
 * Get depth at a location (main public function)
 * @param {number} lon - Longitude (WGS84)
 * @param {number} lat - Latitude (WGS84)
 * @returns {Promise<Object>} Depth query result
 */
export async function getDepthAtLocation(lon, lat) {
  try {
    console.log(`[DepthQuery] Querying depth at ${lat}, ${lon}`);

    // Find tiles containing this point
    const tiles = await findTilesContainingPoint(lon, lat);

    if (tiles.length === 0) {
      return {
        success: false,
        message: 'No BlueTopo coverage at this location'
      };
    }

    console.log(`[DepthQuery] Found ${tiles.length} tile(s): ${tiles.join(', ')}`);

    // Try each tile until we get a valid depth reading
    for (const tileId of tiles) {
      const result = await queryDepthFromTile(tileId, lon, lat);

      if (result !== null) {
        console.log(`[DepthQuery] Success: depth=${result.depth}m, uncertainty=${result.uncertainty}m from ${tileId}`);
        return {
          success: true,
          depth: result.depth,
          uncertainty: result.uncertainty,
          tileId: tileId,
          location: { lat, lon }
        };
      }
    }

    // No valid depth found in any tile (likely on land or no-data area)
    return {
      success: false,
      message: 'No depth data at this location (may be on land or shallow)'
    };

  } catch (error) {
    console.error('[DepthQuery] Error in getDepthAtLocation:', error);
    return {
      success: false,
      message: error.message
    };
  }
}
