/**
 * BlueTopo Download Service - Frontend
 * API wrapper for BlueTopo tile download operations
 */

// Use relative URL that works from any client
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3002/api/bluetopo'
  : `http://${window.location.hostname}:3002/api/bluetopo`;

/**
 * Get storage information (disk space and existing tiles)
 */
export async function getStorageInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/storage`);
    if (!response.ok) {
      throw new Error(`Failed to fetch storage info: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching storage info:', error);
    throw error;
  }
}

/**
 * Start downloading selected BlueTopo tiles
 * @param {Array} tiles - Array of tile objects {tile, url, resolution, minx, miny, maxx, maxy}
 * @param {number} maxParallel - Maximum number of parallel downloads (default 3)
 * @returns {Promise<{jobId: string, tileCount: number, estimatedSizeMB: number}>}
 */
export async function startTileDownload(tiles, maxParallel = 3) {
  try {
    const response = await fetch(`${API_BASE_URL}/download/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tiles, maxParallel })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Failed to start download: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error starting tile download:', error);
    throw error;
  }
}

/**
 * Get status of a download job (polling fallback when WebSocket is unavailable)
 * @param {string} jobId - Job ID returned from startTileDownload
 */
export async function getTileDownloadStatus(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch job status: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching job status:', error);
    throw error;
  }
}

/**
 * Cancel a download job
 * @param {string} jobId - Job ID to cancel
 */
export async function cancelTileDownload(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel download: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error cancelling download:', error);
    throw error;
  }
}

/**
 * Get list of downloaded tiles with metadata
 * @returns {Promise<{tiles: Array, tileSchemeVersion: string}>}
 */
export async function getDownloadedTiles() {
  try {
    const response = await fetch(`${API_BASE_URL}/tiles/downloaded`);
    if (!response.ok) {
      throw new Error(`Failed to fetch downloaded tiles: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching downloaded tiles:', error);
    throw error;
  }
}

/**
 * Delete a single downloaded tile
 * @param {string} tileId - Tile ID to delete
 */
export async function deleteTile(tileId) {
  try {
    const response = await fetch(`${API_BASE_URL}/tiles/${tileId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to delete tile: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting tile:', error);
    throw error;
  }
}

/**
 * Delete multiple tiles at once
 * @param {Array<string>} tileIds - Array of tile IDs to delete
 */
export async function deleteTilesBatch(tileIds) {
  try {
    const response = await fetch(`${API_BASE_URL}/tiles/delete-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tileIds })
    });

    if (!response.ok) {
      throw new Error(`Failed to delete tiles: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting tiles:', error);
    throw error;
  }
}

/**
 * Get list of all raw GeoTIFF files
 * @returns {Promise<{files: Array}>}
 */
export async function getRawFiles() {
  try {
    const response = await fetch(`${API_BASE_URL}/raw-files`);
    if (!response.ok) {
      throw new Error(`Failed to fetch raw files: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching raw files:', error);
    throw error;
  }
}

/**
 * Delete a single raw GeoTIFF file
 * @param {string} tileId - Tile ID whose raw file to delete
 */
export async function deleteRawFile(tileId) {
  try {
    const response = await fetch(`${API_BASE_URL}/raw-files/${tileId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to delete raw file: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting raw file:', error);
    throw error;
  }
}

/**
 * Delete multiple raw files at once
 * @param {Array<string>} tileIds - Array of tile IDs whose raw files to delete
 */
export async function deleteRawFilesBatch(tileIds) {
  try {
    const response = await fetch(`${API_BASE_URL}/raw-files/delete-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tileIds })
    });

    if (!response.ok) {
      throw new Error(`Failed to delete raw files: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting raw files:', error);
    throw error;
  }
}

/**
 * Reprocess all available raw GeoTIFF files
 * @returns {Promise<{jobId: string, message: string}>}
 */
export async function reprocessAllRawFiles() {
  try {
    const response = await fetch(`${API_BASE_URL}/raw-files/reprocess-all`, {
      method: 'POST'
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to start reprocessing: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error reprocessing raw files:', error);
    throw error;
  }
}

/**
 * Check if downloaded tiles have newer versions available
 * @param {Object} options - Options object
 * @param {boolean} options.online - If true, fetch latest GeoPackage from NOAA S3 first
 * @returns {Promise<{tiles: Array, summary: {upToDate, outdated, unknown, totalChecked}}>}
 */
export async function checkTileUpdates({ online = false } = {}) {
  try {
    const params = online ? '?online=true' : '';
    const response = await fetch(`${API_BASE_URL}/tiles/check-updates${params}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to check updates: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error checking tile updates:', error);
    throw error;
  }
}
