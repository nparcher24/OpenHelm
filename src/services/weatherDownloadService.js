/**
 * Weather Download Service - Frontend
 * API wrapper for weather data download operations
 */

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3002/api/weather'
  : `http://${window.location.hostname}:3002/api/weather`

export async function getStorageInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/storage`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[WeatherService] getStorageInfo failed:', err)
    return { success: false, error: err.message }
  }
}

export async function getRegions() {
  try {
    const response = await fetch(`${API_BASE_URL}/regions`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[WeatherService] getRegions failed:', err)
    return { success: false, regions: [] }
  }
}

export async function estimateDownloadSize(bounds, forecastDays) {
  try {
    const params = `bounds=${bounds.join(',')}&forecastDays=${forecastDays}`
    const response = await fetch(`${API_BASE_URL}/estimate?${params}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[WeatherService] estimateDownloadSize failed:', err)
    return { stations: {}, gridPoints: 0, estimatedApiCalls: 0 }
  }
}

export async function startDownload(name, bounds, forecastDays, dataTypes, maxParallel) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/download/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, bounds, forecastDays, dataTypes, maxParallel })
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

export async function getDownloadJobStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}/status`)
  if (!response.ok) throw new Error(`Failed to fetch job status: ${response.statusText}`)
  return await response.json()
}

export async function cancelDownload(jobId) {
  const response = await fetch(`${API_BASE_URL}/download/jobs/${jobId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Failed to cancel download: ${response.statusText}`)
  return await response.json()
}

export async function deleteRegion(regionId) {
  const response = await fetch(`${API_BASE_URL}/regions/${regionId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Failed to delete region: ${response.statusText}`)
  return await response.json()
}
