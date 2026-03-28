/**
 * Satellite Download Service - Frontend
 * API wrapper for satellite tile download operations
 */

import { API_BASE } from '../utils/apiConfig.js'
const API_BASE_URL = `${API_BASE}/api/satellite`

/**
 * Get storage information (disk space and satellite tile info)
 */
export async function getStorageInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/storage`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[SatelliteService] getStorageInfo failed:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Get list of downloaded regions
 */
export async function getRegions() {
  try {
    const response = await fetch(`${API_BASE_URL}/regions`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[SatelliteService] getRegions failed:', err)
    return { success: false, regions: [] }
  }
}

/**
 * Estimate tile count and download size
 * @param {number[]} bounds - [west, south, east, north]
 * @param {number[]} zoomRange - [minZoom, maxZoom]
 */
export async function estimateDownloadSize(bounds, zoomRange) {
  try {
    const params = `bounds=${bounds.join(',')}&minZoom=${zoomRange[0]}&maxZoom=${zoomRange[1]}`
    const response = await fetch(`${API_BASE_URL}/estimate?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[SatelliteService] estimateDownloadSize failed:', err)
    return { tileCount: 0, estimatedSizeMB: 0 }
  }
}

/**
 * Start a satellite tile download
 * @param {string} name - Region name
 * @param {number[]} bounds - [west, south, east, north]
 * @param {number[]} zoomRange - [minZoom, maxZoom]
 * @param {number} maxParallel - Max parallel downloads (default 6)
 */
export async function startDownload(name, bounds, zoomRange, maxParallel = 50) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/download/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, bounds, zoomRange, maxParallel })
    })
  } catch (fetchErr) {
    throw new Error(`Cannot reach API server at ${API_BASE_URL}. Is the API server running? (${fetchErr.message})`)
  }
  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const err = await response.json()
      errMsg = err.error || errMsg
    } catch { /* response wasn't JSON */ }
    throw new Error(`Server error: ${errMsg}`)
  }
  return await response.json()
}

/**
 * Get download job status (polling fallback)
 */
export async function getDownloadJobStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}/status`)
  if (!response.ok) throw new Error(`Failed to fetch job status: ${response.statusText}`)
  return await response.json()
}

/**
 * Cancel a download job
 */
export async function cancelDownload(jobId) {
  const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Failed to cancel download: ${response.statusText}`)
  return await response.json()
}

/**
 * Delete a downloaded region
 */
export async function deleteRegion(regionId) {
  const response = await fetch(`${API_BASE_URL}/regions/${regionId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Failed to delete region: ${response.statusText}`)
  return await response.json()
}
