/**
 * ENC Download Service - Frontend
 * API wrapper for NCDS (NOAA Chart Display Service) ENC download operations
 */

import { API_BASE } from '../utils/apiConfig.js'
const API_BASE_URL = `${API_BASE}/api/ncds`

/**
 * Get list of available NCDS regions for download
 */
export async function getAvailableRegions() {
  try {
    const response = await fetch(`${API_BASE_URL}/regions`);
    if (!response.ok) {
      throw new Error(`Failed to fetch regions: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching available regions:', error);
    throw error;
  }
}

/**
 * Get storage information (disk space and existing ENC tiles)
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
 * Get list of downloaded ENC regions with metadata
 */
export async function getDownloadedRegions() {
  try {
    const response = await fetch(`${API_BASE_URL}/downloaded`);
    if (!response.ok) {
      throw new Error(`Failed to fetch downloaded regions: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching downloaded regions:', error);
    throw error;
  }
}

/**
 * Start downloading specified NCDS regions
 * @param {Array<string>} regions - Array of region IDs (e.g., ['ncds_02a', 'ncds_02b'])
 * @returns {Promise<{jobId: string, regionCount: number, message: string}>}
 */
export async function startRegionDownload(regions) {
  try {
    const response = await fetch(`${API_BASE_URL}/download/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ regions })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to start download: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error starting region download:', error);
    throw error;
  }
}

/**
 * Get status of a download job (polling fallback when WebSocket is unavailable)
 * @param {string} jobId - Job ID returned from startRegionDownload
 */
export async function getDownloadJobStatus(jobId) {
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
 * Cancel a running download job
 * @param {string} jobId - Job ID to cancel
 */
export async function cancelDownload(jobId) {
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
 * Check if downloaded regions have updates available from NOAA
 * @returns {Promise<{regions: Array, summary: {checked, updatesAvailable, upToDate}}>}
 */
export async function checkForUpdates() {
  try {
    const response = await fetch(`${API_BASE_URL}/check-updates`);
    if (!response.ok) {
      throw new Error(`Failed to check for updates: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error checking for updates:', error);
    throw error;
  }
}

/**
 * Delete a downloaded region
 * @param {string} regionId - Region ID to delete (e.g., 'ncds_02a')
 */
export async function deleteRegion(regionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/regions/${regionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to delete region: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting region:', error);
    throw error;
  }
}

/**
 * Manually restart Martin tileserver to reload ENC tiles
 */
export async function restartMartin() {
  try {
    const response = await fetch(`${API_BASE_URL}/restart-martin`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Failed to restart Martin: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error restarting Martin:', error);
    throw error;
  }
}

/**
 * Check if Martin tileserver is running
 */
export async function getMartinStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/martin-status`);
    if (!response.ok) {
      throw new Error(`Failed to check Martin status: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error checking Martin status:', error);
    throw error;
  }
}
