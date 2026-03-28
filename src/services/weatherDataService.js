/**
 * Weather Data Service - Frontend
 * Reads cached weather data for map display (stations, grid, timestamps)
 */

import { API_BASE } from '../utils/apiConfig.js'
const API_BASE_URL = `${API_BASE}/api/weather`

/**
 * Get all weather regions
 */
export async function getWeatherRegions() {
  try {
    const response = await fetch(`${API_BASE_URL}/regions`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return data.regions || []
  } catch (err) {
    console.error('[WeatherData] getWeatherRegions failed:', err)
    return []
  }
}

/**
 * Get region metadata (stations, bounds, etc.)
 */
export async function getRegionData(regionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/regions/${regionId}/data`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[WeatherData] getRegionData failed:', err)
    return null
  }
}

/**
 * Get available forecast timestamps for a region
 * @param {string} regionId
 * @param {string} dataType - 'wind' or 'marine'
 */
export async function getTimestamps(regionId, dataType = 'wind') {
  try {
    const response = await fetch(`${API_BASE_URL}/regions/${regionId}/grid/${dataType}/timestamps`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return data.timestamps || []
  } catch (err) {
    console.error('[WeatherData] getTimestamps failed:', err)
    return []
  }
}

/**
 * Get GeoJSON grid data for a specific timestamp
 * @param {string} regionId
 * @param {string} dataType - 'wind' or 'marine'
 * @param {string} timestamp - ISO timestamp
 */
export async function getGridAtTime(regionId, dataType, timestamp) {
  try {
    const response = await fetch(`${API_BASE_URL}/regions/${regionId}/grid/${dataType}/${encodeURIComponent(timestamp)}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[WeatherData] getGridAtTime failed:', err)
    return null
  }
}

/**
 * Get detailed data for a specific station
 */
export async function getStationData(regionId, stationId) {
  try {
    const response = await fetch(`${API_BASE_URL}/regions/${regionId}/station/${stationId}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('[WeatherData] getStationData failed:', err)
    return null
  }
}

/**
 * Build GeoJSON FeatureCollection from station metadata for map display
 */
export function buildStationGeoJSON(metadata) {
  if (!metadata?.stations) return { type: 'FeatureCollection', features: [] }

  const features = []

  const addStations = (stations, stationType) => {
    for (const s of stations || []) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: {
          id: s.id,
          name: s.name,
          stationType,
          state: s.state || ''
        }
      })
    }
  }

  addStations(metadata.stations.tide, 'tide')
  addStations(metadata.stations.current, 'current')
  addStations(metadata.stations.met, 'met')
  addStations(metadata.stations.ndbc, 'ndbc')

  return { type: 'FeatureCollection', features }
}
