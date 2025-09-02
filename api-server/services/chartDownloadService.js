/**
 * Chart Download Status Service
 * Compares catalogue metadata with downloaded charts to determine status
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import encMetadataService from './encMetadataService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHARTS_DIRECTORY = path.resolve(__dirname, '../../tiles/nautical')

/**
 * Chart download status types
 */
export const DOWNLOAD_STATUS = {
  NOT_DOWNLOADED: 'not_downloaded',
  DOWNLOADED: 'downloaded', 
  UPDATE_AVAILABLE: 'update_available',
  UNKNOWN: 'unknown'
}

/**
 * Get information about a downloaded chart file
 */
async function getDownloadedChartInfo(chartId) {
  try {
    const chartFilePath = path.join(CHARTS_DIRECTORY, `${chartId}.mbtiles`)
    
    try {
      const stats = await fs.stat(chartFilePath)
      return {
        exists: true,
        filePath: chartFilePath,
        fileSize: stats.size,
        downloadDate: stats.mtime,
        lastModified: stats.mtime
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          exists: false,
          filePath: chartFilePath,
          fileSize: null,
          downloadDate: null,
          lastModified: null
        }
      }
      throw error
    }
  } catch (error) {
    console.error(`[Chart Download] Error checking downloaded chart ${chartId}:`, error.message)
    return {
      exists: false,
      filePath: null,
      fileSize: null,
      downloadDate: null,
      lastModified: null
    }
  }
}

/**
 * Determine download status for a chart
 */
function determineDownloadStatus(catalogueChart, downloadedInfo) {
  if (!downloadedInfo.exists) {
    return DOWNLOAD_STATUS.NOT_DOWNLOADED
  }
  
  // If we don't have publication dates, we can't determine update status
  if (!catalogueChart.publication_date) {
    return DOWNLOAD_STATUS.DOWNLOADED
  }
  
  try {
    const catalogueDate = new Date(catalogueChart.publication_date)
    const downloadDate = new Date(downloadedInfo.downloadDate)
    
    // If catalogue chart is newer than our downloaded version, update available
    if (catalogueDate > downloadDate) {
      return DOWNLOAD_STATUS.UPDATE_AVAILABLE
    }
    
    return DOWNLOAD_STATUS.DOWNLOADED
    
  } catch (error) {
    // If date parsing fails, just return that it's downloaded
    console.warn(`[Chart Download] Could not parse dates for ${catalogueChart.chart_id}:`, error.message)
    return DOWNLOAD_STATUS.DOWNLOADED
  }
}

/**
 * Check download status for a single chart
 */
export async function checkChartDownloadStatus(chartId) {
  try {
    await encMetadataService.initialize()
    
    // Get chart metadata from catalogue
    const catalogueChart = await encMetadataService.getChart(chartId)
    if (!catalogueChart) {
      throw new Error(`Chart ${chartId} not found in catalogue`)
    }
    
    // Get downloaded file information
    const downloadedInfo = await getDownloadedChartInfo(chartId)
    
    // Determine status
    const status = determineDownloadStatus(catalogueChart, downloadedInfo)
    
    return {
      chart_id: chartId,
      status,
      catalogue_date: catalogueChart.publication_date,
      download_date: downloadedInfo.downloadDate,
      file_size_mb: downloadedInfo.fileSize ? (downloadedInfo.fileSize / 1024 / 1024).toFixed(2) : null,
      file_path: downloadedInfo.filePath
    }
    
  } catch (error) {
    console.error(`[Chart Download] Error checking status for ${chartId}:`, error.message)
    return {
      chart_id: chartId,
      status: DOWNLOAD_STATUS.UNKNOWN,
      catalogue_date: null,
      download_date: null,
      file_size_mb: null,
      file_path: null,
      error: error.message
    }
  }
}

/**
 * Check download status for all charts in the catalogue
 */
export async function checkAllChartsDownloadStatus(filters = {}) {
  try {
    console.log('[Chart Download] 🔍 Checking download status for all charts...')
    const startTime = Date.now()
    
    await encMetadataService.initialize()
    
    // Get all charts from catalogue
    const catalogueCharts = await encMetadataService.getCharts(filters)
    console.log(`[Chart Download] Found ${catalogueCharts.length} charts in catalogue`)
    
    // Get list of downloaded files
    let downloadedFiles = []
    try {
      await fs.access(CHARTS_DIRECTORY)
      const files = await fs.readdir(CHARTS_DIRECTORY)
      downloadedFiles = files.filter(file => file.endsWith('.mbtiles'))
      console.log(`[Chart Download] Found ${downloadedFiles.length} downloaded chart files`)
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[Chart Download] Charts directory does not exist yet')
      } else {
        console.warn('[Chart Download] Error reading charts directory:', error.message)
      }
    }
    
    // Process charts in batches for better performance
    const batchSize = 100
    const results = []
    let statusCounts = {
      [DOWNLOAD_STATUS.NOT_DOWNLOADED]: 0,
      [DOWNLOAD_STATUS.DOWNLOADED]: 0,
      [DOWNLOAD_STATUS.UPDATE_AVAILABLE]: 0,
      [DOWNLOAD_STATUS.UNKNOWN]: 0
    }
    
    for (let i = 0; i < catalogueCharts.length; i += batchSize) {
      const batch = catalogueCharts.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (chart) => {
        const downloadedInfo = await getDownloadedChartInfo(chart.chart_id)
        const status = determineDownloadStatus(chart, downloadedInfo)
        
        statusCounts[status]++
        
        return {
          chart_id: chart.chart_id,
          chart_name: chart.chart_name,
          status,
          catalogue_date: chart.publication_date,
          download_date: downloadedInfo.downloadDate,
          file_size_mb: downloadedInfo.fileSize ? (downloadedInfo.fileSize / 1024 / 1024).toFixed(2) : null
        }
      })
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
      
      // Progress reporting
      const progress = ((i + batch.length) / catalogueCharts.length * 100).toFixed(1)
      console.log(`[Chart Download] Progress: ${progress}% (${results.length}/${catalogueCharts.length} processed)`)
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    
    console.log(`[Chart Download] ✅ Status check complete in ${totalTime}s`)
    console.log(`[Chart Download] 📊 Summary:`)
    console.log(`[Chart Download]   - Not Downloaded: ${statusCounts[DOWNLOAD_STATUS.NOT_DOWNLOADED]}`)
    console.log(`[Chart Download]   - Downloaded: ${statusCounts[DOWNLOAD_STATUS.DOWNLOADED]}`)
    console.log(`[Chart Download]   - Update Available: ${statusCounts[DOWNLOAD_STATUS.UPDATE_AVAILABLE]}`)
    console.log(`[Chart Download]   - Unknown Status: ${statusCounts[DOWNLOAD_STATUS.UNKNOWN]}`)
    
    return {
      success: true,
      charts: results,
      summary: {
        total_charts: results.length,
        status_counts: statusCounts,
        processing_time_seconds: parseFloat(totalTime)
      }
    }
    
  } catch (error) {
    console.error('[Chart Download] Error checking all charts status:', error)
    throw error
  }
}

/**
 * Get summary statistics for download status
 */
export async function getDownloadStatusSummary() {
  try {
    const statusCheck = await checkAllChartsDownloadStatus({ limit: null })
    return statusCheck.summary
  } catch (error) {
    console.error('[Chart Download] Error getting download status summary:', error)
    throw error
  }
}

/**
 * Ensure charts directory exists
 */
export async function initializeChartsDirectory() {
  try {
    await fs.mkdir(CHARTS_DIRECTORY, { recursive: true })
    console.log(`[Chart Download] Charts directory initialized: ${CHARTS_DIRECTORY}`)
  } catch (error) {
    console.error('[Chart Download] Error initializing charts directory:', error)
    throw error
  }
}

export default {
  checkChartDownloadStatus,
  checkAllChartsDownloadStatus,
  getDownloadStatusSummary,
  initializeChartsDirectory,
  DOWNLOAD_STATUS
}