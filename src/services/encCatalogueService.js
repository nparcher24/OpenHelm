/**
 * ENC Catalogue Service
 * Fetches ENC chart metadata from database via local API server
 */

import { logInfo, logError } from '../utils/logger.js'

const API_BASE_URL = 'http://localhost:3002/api'

/**
 * Fetch download status for all charts
 * @returns {Promise<Map>} Map of chartId -> download status info
 */
export async function fetchChartsDownloadStatus() {
  try {
    logInfo('[ENC] Fetching chart download status...')
    
    const response = await fetch(`${API_BASE_URL}/enc-metadata/download-status`, {
      headers: {
        'Accept': 'application/json',
      }
    })
    
    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || 'API returned error response')
    }
    
    // Convert to Map for efficient lookup
    const statusMap = new Map()
    result.charts.forEach(chart => {
      statusMap.set(chart.chart_id, {
        status: chart.status,
        catalogueDate: chart.catalogue_date,
        downloadDate: chart.download_date,
        fileSizeMb: chart.file_size_mb
      })
    })
    
    logInfo(`[ENC] Successfully fetched download status for ${statusMap.size} charts`)
    return statusMap
    
  } catch (error) {
    logError(`[ENC] Error fetching download status: ${error.message}`, error)
    throw new Error(`Failed to load chart download status: ${error.message}`)
  }
}

/**
 * Fetch ENC charts from database (no external NOAA calls)
 * @returns {Promise<Array>} Promise resolving to array of ENC chart metadata
 */
export async function fetchENCCatalogue() {
  try {
    logInfo('[ENC] Fetching ENC charts from database...')
    
    const response = await fetch(`${API_BASE_URL}/enc-metadata/charts`, {
      headers: {
        'Accept': 'application/json',
      }
    })
    
    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || 'API returned error response')
    }
    
    logInfo(`[ENC] Successfully fetched ${result.count} charts from database`)
    
    // Transform database format to frontend format
    const transformedCharts = result.data.map(chart => ({
      id: chart.chart_id,
      name: chart.chart_name || chart.chart_id,
      title: chart.chart_name || chart.chart_id,
      abstract: null, // Not displayed in current UI
      scale: chart.scale_denominator,
      scaleText: chart.scale_denominator ? `1:${chart.scale_denominator.toLocaleString()}` : 'Unknown',
      chartType: determineChartTypeFromScale(chart.scale_denominator),
      status: chart.status || 'available',
      bounds: {
        west: chart.bounds_west,
        east: chart.bounds_east,
        south: chart.bounds_south,
        north: chart.bounds_north
      },
      center: {
        lat: chart.bounds_north && chart.bounds_south ? (chart.bounds_north + chart.bounds_south) / 2 : null,
        lon: chart.bounds_east && chart.bounds_west ? (chart.bounds_east + chart.bounds_west) / 2 : null
      },
      publicationDate: chart.publication_date,
      revisionDate: chart.last_updated,
      downloadUrl: chart.download_url,
      fileSize: chart.file_size_mb,
      edition: chart.edition,
      organization: chart.organization,
      coastGuardDistrict: chart.coast_guard_district
    }))
    
    return transformedCharts
    
  } catch (error) {
    logError(`[ENC] Error fetching ENC charts from database: ${error.message}`, error)
    throw new Error(`Failed to load ENC charts from database: ${error.message}`)
  }
}

/**
 * Determine chart type from scale denominator
 */
function determineChartTypeFromScale(scale) {
  if (!scale || scale === 0) return 'General'
  
  if (scale <= 12000) return 'Harbor'
  if (scale <= 50000) return 'Approach'  
  if (scale <= 100000) return 'Coastal'
  if (scale <= 1000000) return 'General'
  return 'Overview'
}

