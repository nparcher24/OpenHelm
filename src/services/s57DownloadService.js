/**
 * S-57 Vector ENC Download Service - Frontend
 * API wrapper for S-57 download and conversion operations
 */

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3002/api/s57'
  : `http://${window.location.hostname}:3002/api/s57`;

export async function getAvailableRegions() {
  const response = await fetch(`${API_BASE_URL}/regions`);
  if (!response.ok) throw new Error(`Failed to fetch regions: ${response.statusText}`);
  return await response.json();
}

export async function getStorageInfo() {
  const response = await fetch(`${API_BASE_URL}/storage`);
  if (!response.ok) throw new Error(`Failed to fetch storage info: ${response.statusText}`);
  return await response.json();
}

export async function getDownloadedRegions() {
  const response = await fetch(`${API_BASE_URL}/downloaded`);
  if (!response.ok) throw new Error(`Failed to fetch downloaded regions: ${response.statusText}`);
  return await response.json();
}

export async function startRegionDownload(regions) {
  const response = await fetch(`${API_BASE_URL}/download/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regions })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to start download: ${response.statusText}`);
  }
  return await response.json();
}

export async function getDownloadJobStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}/status`);
  if (!response.ok) throw new Error(`Failed to fetch job status: ${response.statusText}`);
  return await response.json();
}

export async function cancelDownload(jobId) {
  const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to cancel download: ${response.statusText}`);
  return await response.json();
}

export async function checkForUpdates() {
  const response = await fetch(`${API_BASE_URL}/check-updates`);
  if (!response.ok) throw new Error(`Failed to check for updates: ${response.statusText}`);
  return await response.json();
}

export async function deleteRegion(regionId) {
  const response = await fetch(`${API_BASE_URL}/regions/${regionId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to delete region: ${response.statusText}`);
  return await response.json();
}

export async function restartMartin() {
  const response = await fetch(`${API_BASE_URL}/restart-martin`, { method: 'POST' });
  if (!response.ok) throw new Error(`Failed to restart Martin: ${response.statusText}`);
  return await response.json();
}

export async function getMartinStatus() {
  const response = await fetch(`${API_BASE_URL}/martin-status`);
  if (!response.ok) throw new Error(`Failed to check Martin status: ${response.statusText}`);
  return await response.json();
}
