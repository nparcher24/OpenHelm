/**
 * Drift Service - Frontend API wrapper
 *
 * Thin fetch layer for /api/drift. All calls throw on network or HTTP error
 * (callers are expected to catch and surface to the UI). Mirrors the style
 * of src/services/waypointService.js.
 */

import { API_BASE } from '../utils/apiConfig.js'

const API_BASE_URL = `${API_BASE}/api/drift`

/**
 * Persist a new drift calibration.
 *
 * @param {{
 *   latitude: number,
 *   longitude: number,
 *   driftSpeedMps: number,
 *   driftBearingDeg: number,
 *   durationS: number,
 *   sampleCount: number
 * }} data
 * @returns {Promise<{success: boolean, drift: object}>}
 */
export async function saveDriftCalculation(data) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.error || `Failed to save drift: ${response.statusText}`
      )
    }
    return await response.json()
  } catch (error) {
    console.error('Error saving drift calculation:', error)
    throw error
  }
}

/**
 * Fetch the most recent drift calibration.
 *
 * @returns {Promise<{success: boolean, drift: object | null}>}
 */
export async function getLatestDrift() {
  try {
    const response = await fetch(`${API_BASE_URL}/latest`)
    if (!response.ok) {
      throw new Error(`Failed to fetch latest drift: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching latest drift:', error)
    throw error
  }
}
