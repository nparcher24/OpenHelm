/**
 * Frontend API client for the software update service.
 */

const API_BASE = 'http://localhost:3002/api/update'

/**
 * Check GitHub for the latest release.
 */
export async function checkForUpdate() {
  const res = await fetch(`${API_BASE}/check`)
  if (!res.ok) throw new Error(`Check failed: ${res.status}`)
  return res.json()
}

/**
 * Get current version and last check info.
 */
export async function getUpdateStatus() {
  const res = await fetch(`${API_BASE}/status`)
  if (!res.ok) throw new Error(`Status failed: ${res.status}`)
  return res.json()
}

/**
 * Trigger the self-update process.
 * @param {string} tag - The release tag to update to (e.g. "v0.2.0")
 * @returns {{ jobId: string }}
 */
export async function applyUpdate(tag) {
  const res = await fetch(`${API_BASE}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag })
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Apply failed: ${res.status}`)
  }
  return res.json()
}

/**
 * Get update job status (polling fallback for WebSocket).
 * Compatible with useJobProgress customStatusFetcher interface.
 */
export async function getUpdateJobStatus(jobId) {
  const res = await fetch(`${API_BASE}/job/${jobId}`)
  if (!res.ok) throw new Error(`Job status failed: ${res.status}`)
  return res.json()
}
