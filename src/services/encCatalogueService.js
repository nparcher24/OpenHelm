/**
 * ENC Catalogue Service
 * Fetches ENC chart metadata from database via local API server
 */

import { logInfo, logError } from '../utils/logger.js'

import { API_BASE } from '../utils/apiConfig.js'
const API_BASE_URL = `${API_BASE}/api`

/**
 * Fetch complete ENC catalogue from NOAA and update database
 * @returns {Promise<Object>} Promise resolving to update summary
 */
export async function startENCCatalogueUpdate() {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  
  try {
    logInfo(`[ENC] [${requestId}] Starting background ENC catalogue update from NOAA...`)
    logInfo(`[ENC] [${requestId}] API Base URL: ${API_BASE_URL}`)
    logInfo(`[ENC] [${requestId}] Target endpoint: ${API_BASE_URL}/enc-metadata/fetch-full-catalogue`)
    
    logInfo(`[ENC] [${requestId}] Making POST request to start background job...`)
    const requestStartTime = Date.now()
    
    const response = await fetch(`${API_BASE_URL}/enc-metadata/fetch-full-catalogue`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
    
    const requestTime = ((Date.now() - requestStartTime) / 1000).toFixed(1)
    
    logInfo(`[ENC] [${requestId}] Received response in ${requestTime}s - Status: ${response.status} ${response.statusText}`)
    
    if (!response.ok) {
      const errorMsg = `API Error ${response.status}: ${response.statusText}`
      logError(`[ENC] [${requestId}] ${errorMsg}`)
      
      // Try to get error details from response body
      try {
        const errorText = await response.text()
        logError(`[ENC] [${requestId}] Response body:`, errorText)
      } catch (e) {
        logError(`[ENC] [${requestId}] Could not read response body:`, e.message)
      }
      
      throw new Error(errorMsg)
    }
    
    logInfo(`[ENC] [${requestId}] Reading JSON response...`)
    const result = await response.json()
    
    logInfo(`[ENC] [${requestId}] Background job started:`, JSON.stringify(result, null, 2))
    
    if (!result.success) {
      const errorMsg = result.message || 'Failed to start background job'
      logError(`[ENC] [${requestId}] ${errorMsg}`)
      throw new Error(errorMsg)
    }
    
    logInfo(`[ENC] [${requestId}] Background job started successfully: ${result.jobId}`)
    return result
    
  } catch (error) {
    logError(`[ENC] [${requestId}] Error starting catalogue update: ${error.message}`, error)
    
    if (error.name === 'TypeError') {
      logError(`[ENC] [${requestId}] Network error - check if API server is running`)
    }
    
    logError(`[ENC] [${requestId}] Full error object:`, error)
    throw new Error(`Failed to start ENC catalogue update: ${error.message}`)
  }
}

export async function cancelENCCatalogueUpdate(jobId) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  
  try {
    logInfo(`[ENC] [${requestId}] Cancelling job: ${jobId}`)
    
    const response = await fetch(`${API_BASE_URL}/enc-metadata/jobs/${jobId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    logInfo(`[ENC] [${requestId}] Cancel response:`, result)
    
    return result
    
  } catch (error) {
    logError(`[ENC] [${requestId}] Error cancelling job: ${error.message}`, error)
    throw new Error(`Failed to cancel job: ${error.message}`)
  }
}

export async function getJobStatus(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/enc-metadata/jobs/${jobId}/status`, {
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
    
  } catch (error) {
    logError(`[ENC] Error getting job status: ${error.message}`, error)
    throw new Error(`Failed to get job status: ${error.message}`)
  }
}

// Legacy function - now redirects to the new background system
export async function updateENCCatalogueFromNOAA() {
  logInfo(`[ENC] Legacy updateENCCatalogueFromNOAA called - redirecting to background job system`)
  return await startENCCatalogueUpdate()
}

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
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  
  try {
    logInfo(`[ENC] [${requestId}] Fetching ENC charts from database...`)
    logInfo(`[ENC] [${requestId}] Endpoint: ${API_BASE_URL}/enc-metadata/charts`)
    
    const response = await fetch(`${API_BASE_URL}/enc-metadata/charts`, {
      headers: {
        'Accept': 'application/json',
      }
    })
    
    logInfo(`[ENC] [${requestId}] Database fetch response: ${response.status} ${response.statusText}`)
    
    if (!response.ok) {
      const errorMsg = `API Error ${response.status}: ${response.statusText}`
      logError(`[ENC] [${requestId}] ${errorMsg}`)
      throw new Error(errorMsg)
    }
    
    const result = await response.json()
    
    logInfo(`[ENC] [${requestId}] Database response success: ${result.success}, count: ${result.count || 'unknown'}`)
    
    if (!result.success) {
      const errorMsg = result.message || 'API returned error response'
      logError(`[ENC] [${requestId}] Database query failed: ${errorMsg}`)
      throw new Error(errorMsg)
    }
    
    logInfo(`[ENC] [${requestId}] Successfully fetched ${result.count} charts from database`)
    
    if (!result.data || !Array.isArray(result.data)) {
      logError(`[ENC] [${requestId}] Invalid data format - expected array, got:`, typeof result.data)
      throw new Error('Invalid data format received from database')
    }
    
    // Transform database format to frontend format
    logInfo(`[ENC] [${requestId}] Transforming ${result.data.length} charts to frontend format...`)
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
    
    logInfo(`[ENC] [${requestId}] Successfully transformed ${transformedCharts.length} charts`)
    logInfo(`[ENC] [${requestId}] Sample transformed chart:`, JSON.stringify(transformedCharts[0] || {}, null, 2))
    
    return transformedCharts
    
  } catch (error) {
    logError(`[ENC] [${requestId}] Error fetching ENC charts from database: ${error.message}`, error)
    
    // Log specific error types
    if (error.name === 'TypeError') {
      logError(`[ENC] [${requestId}] Network error - check if API server is running on ${API_BASE_URL}`)
    }
    
    logError(`[ENC] [${requestId}] Full error details:`, error)
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

