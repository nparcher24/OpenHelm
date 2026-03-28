/**
 * CUSP Download Service - Frontend API Client
 * Communicates with backend CUSP API endpoints
 */

import { API_BASE as _API_BASE } from '../utils/apiConfig.js'
const API_BASE = `${_API_BASE}/api/cusp`

/**
 * Get CUSP status (whether it exists, size, last modified)
 */
export async function getCUSPStatus() {
  const response = await fetch(`${API_BASE}/status`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get CUSP status');
  }

  return data;
}

/**
 * Get storage information (disk space, CUSP data)
 */
export async function getStorageInfo() {
  const response = await fetch(`${API_BASE}/storage`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get storage info');
  }

  return data;
}

/**
 * Start CUSP download and processing job
 */
export async function startCUSPDownload() {
  const response = await fetch(`${API_BASE}/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to start download');
  }

  return data;
}

/**
 * Get job status by job ID
 */
export async function getJobStatus(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${jobId}/status`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get job status');
  }

  return data;
}

/**
 * Cancel a running job
 */
export async function cancelJob(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'DELETE'
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to cancel job');
  }

  return data;
}

/**
 * Delete CUSP MBTiles data
 */
export async function deleteCUSPData() {
  const response = await fetch(`${API_BASE}/data`, {
    method: 'DELETE'
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete data');
  }

  return data;
}
