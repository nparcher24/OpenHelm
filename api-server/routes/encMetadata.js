/**
 * ENC Metadata API Routes - Clean endpoints for chart metadata
 */

import express from 'express'
import { XMLParser } from 'fast-xml-parser'
import encMetadataService from '../services/encMetadataService.js'
import encSimpleParser from '../services/encSimpleParser.js'
import chartDownloadService from '../services/chartDownloadService.js'

const router = express.Router()

// Simple cache for API responses
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch complete ENC catalogue from NOAA, parse, and store in database
 * This will overwrite existing data with fresh NOAA data
 */
router.post('/fetch-full-catalogue', async (req, res) => {
  try {
    console.log('[ENC Metadata API] 📡 Full catalogue fetch requested')
    
    // Initialize database
    await encMetadataService.initialize()
    
    // Get starting stats
    const initialStats = await encMetadataService.getStats()
    console.log(`[ENC Metadata API] 📊 Database before fetch: ${initialStats.total_charts} charts`)
    
    // Fetch NOAA XML
    console.log('[ENC Metadata API] 🌊 Fetching complete catalogue from NOAA...')
    const startTime = Date.now()
    
    const response = await fetch('https://www.charts.noaa.gov/ENCs/ENCProdCat_19115.xml', {
      headers: { 'User-Agent': 'OpenHelm Marine Navigation Application v1.0' },
      timeout: 60000 // 1 minute timeout for large XML
    })
    
    if (!response.ok) {
      throw new Error(`NOAA API Error - HTTP ${response.status}: ${response.statusText}`)
    }
    
    const xmlData = await response.text()
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ENC Metadata API] ✅ Received ${xmlData.length.toLocaleString()} bytes in ${fetchTime}s`)
    
    // Parse XML
    console.log('[ENC Metadata API] 🔄 Parsing XML catalogue...')
    const parseStart = Date.now()
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
      parseTagValue: true,
      textNodeName: '#text',
      removeNSPrefix: false,
      processEntities: false,
      htmlEntities: false
    })
    
    const xmlObj = parser.parse(xmlData)
    const parseTime = ((Date.now() - parseStart) / 1000).toFixed(1)
    
    // Extract datasets
    const datasets = xmlObj.DS_Series?.composedOf || []
    console.log(`[ENC Metadata API] ✅ Parsed ${datasets.length.toLocaleString()} datasets in ${parseTime}s`)
    
    if (datasets.length === 0) {
      throw new Error('No datasets found in NOAA XML response')
    }
    
    // Clear existing data to ensure fresh dataset
    console.log('[ENC Metadata API] 🗑️  Clearing existing database entries...')
    const clearedCount = await encMetadataService.clearAll()
    console.log(`[ENC Metadata API] ✅ Cleared ${clearedCount} existing entries`)
    
    // Process all datasets
    let successCount = 0
    let errorCount = 0
    const processStart = Date.now()
    
    console.log('[ENC Metadata API] ⚙️  Processing complete dataset...')
    
    // Process in optimized batches
    const batchSize = 50 // Smaller batches for better progress reporting
    
    for (let i = 0; i < datasets.length; i += batchSize) {
      const batch = datasets.slice(i, i + batchSize)
      const batchStart = Date.now()
      
      for (let j = 0; j < batch.length; j++) {
        const dataset = batch[j].DS_DataSet
        const index = i + j
        
        try {
          const chartMetadata = encSimpleParser.parseChartMetadata(dataset, index)
          
          if (chartMetadata && chartMetadata.chart_id) {
            await encMetadataService.upsertMetadata(chartMetadata)
            successCount++
          } else {
            errorCount++
          }
        } catch (error) {
          console.error(`[ENC Metadata API] ❌ Error processing dataset ${index}: ${error.message}`)
          errorCount++
        }
      }
      
      // Progress reporting every batch
      const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1)
      const progress = ((i + batch.length) / datasets.length * 100).toFixed(1)
      const avgTimePerChart = (Date.now() - processStart) / (i + batch.length)
      const estimatedTimeLeft = ((datasets.length - (i + batch.length)) * avgTimePerChart / 1000 / 60).toFixed(1)
      
      console.log(`[ENC Metadata API] 📈 Progress: ${progress}% (${successCount.toLocaleString()} processed, ${estimatedTimeLeft}min remaining)`)
    }
    
    const totalProcessTime = ((Date.now() - processStart) / 1000 / 60).toFixed(1)
    
    // Get final statistics
    const finalStats = await encMetadataService.getStats()
    
    // Clear API cache to ensure fresh data
    cache.clear()
    
    const summary = {
      success: true,
      message: `Successfully processed complete ENC catalogue from NOAA`,
      timing: {
        fetch_time_seconds: parseFloat(fetchTime),
        parse_time_seconds: parseFloat(parseTime),
        process_time_minutes: parseFloat(totalProcessTime),
        total_time_minutes: ((Date.now() - startTime) / 1000 / 60).toFixed(1)
      },
      statistics: {
        datasets_found: datasets.length,
        charts_processed: successCount,
        processing_errors: errorCount,
        success_rate: ((successCount / datasets.length) * 100).toFixed(1) + '%'
      },
      database: {
        charts_before: initialStats.total_charts,
        charts_after: finalStats.total_charts,
        charts_with_bounds: finalStats.charts_with_bounds,
        date_range: `${finalStats.oldest_chart} to ${finalStats.newest_chart}`,
        scale_range: `${finalStats.min_scale?.toLocaleString()} to ${finalStats.max_scale?.toLocaleString()}`,
        total_file_size_gb: (finalStats.total_size_mb / 1024).toFixed(2)
      }
    }
    
    console.log(`[ENC Metadata API] 🎉 COMPLETE: Processed ${successCount.toLocaleString()} charts in ${totalProcessTime}min`)
    console.log(`[ENC Metadata API] 📊 Success rate: ${summary.statistics.success_rate}`)
    console.log(`[ENC Metadata API] 💾 Database: ${finalStats.total_charts} charts, ${summary.database.total_file_size_gb}GB total`)
    
    // Initialize charts directory and check download status
    console.log('[ENC Metadata API] 📥 Checking chart download status...')
    try {
      await chartDownloadService.initializeChartsDirectory()
      const downloadStatusSummary = await chartDownloadService.getDownloadStatusSummary()
      summary.download_status = downloadStatusSummary
    } catch (error) {
      console.warn('[ENC Metadata API] ⚠️  Could not check download status:', error.message)
      summary.download_status = { error: error.message }
    }
    
    res.json(summary)
    
  } catch (error) {
    console.error('[ENC Metadata API] ❌ FETCH FAILED:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch and process ENC catalogue',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * Quick fetch for testing (first 10 charts only)
 */
router.post('/fetch-sample', async (req, res) => {
  try {
    console.log('[ENC Metadata API] 🧪 Sample fetch requested (first 10 charts)')
    
    await encMetadataService.initialize()
    
    // Fetch and parse XML (same as full fetch)
    const response = await fetch('https://www.charts.noaa.gov/ENCs/ENCProdCat_19115.xml', {
      headers: { 'User-Agent': 'OpenHelm Marine Navigation Application' },
      timeout: 30000
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const xmlData = await response.text()
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
      parseTagValue: true,
      textNodeName: '#text',
      removeNSPrefix: false,
      processEntities: false,
      htmlEntities: false
    })
    
    const xmlObj = parser.parse(xmlData)
    const datasets = xmlObj.DS_Series?.composedOf || []
    
    // Process only first 10 charts for testing
    const sampleSize = Math.min(10, datasets.length)
    let successCount = 0
    
    console.log(`[ENC Metadata API] 🔄 Processing ${sampleSize} sample charts...`)
    
    for (let i = 0; i < sampleSize; i++) {
      const dataset = datasets[i].DS_DataSet
      const chartMetadata = encSimpleParser.parseChartMetadata(dataset, i)
      
      if (chartMetadata && chartMetadata.chart_id) {
        await encMetadataService.upsertMetadata(chartMetadata)
        successCount++
        console.log(`[ENC Metadata API] ✅ ${chartMetadata.chart_id}: ${chartMetadata.chart_name}`)
      }
    }
    
    res.json({
      success: true,
      message: `Sample fetch complete: ${successCount} charts processed`,
      processed: successCount,
      sample_size: sampleSize,
      total_available: datasets.length
    })
    
  } catch (error) {
    console.error('[ENC Metadata API] Error during sample fetch:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get all charts with filtering options
 */
router.get('/charts', async (req, res) => {
  try {
    await encMetadataService.initialize()
    
    const filters = {}
    
    // Parse query parameters
    if (req.query.search) filters.search = req.query.search
    if (req.query.limit) filters.limit = parseInt(req.query.limit)
    if (req.query.scale_min) filters.scale_min = parseInt(req.query.scale_min)
    if (req.query.scale_max) filters.scale_max = parseInt(req.query.scale_max)
    
    // Parse bounding box filter
    if (req.query.bounds) {
      const [west, south, east, north] = req.query.bounds.split(',').map(parseFloat)
      filters.bounds = { west, south, east, north }
    }
    
    const charts = await encMetadataService.getCharts(filters)
    
    res.json({
      success: true,
      data: charts,
      count: charts.length,
      filters
    })
    
  } catch (error) {
    console.error('[ENC Metadata API] Error getting charts:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get single chart metadata by ID
 */
router.get('/charts/:id', async (req, res) => {
  try {
    await encMetadataService.initialize()
    
    const chart = await encMetadataService.getChart(req.params.id)
    
    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      })
    }
    
    res.json({
      success: true,
      data: chart
    })
    
  } catch (error) {
    console.error('[ENC Metadata API] Error getting chart:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get database statistics
 */
router.get('/stats', async (req, res) => {
  try {
    await encMetadataService.initialize()
    const stats = await encMetadataService.getStats()
    
    res.json({
      success: true,
      data: stats
    })
    
  } catch (error) {
    console.error('[ENC Metadata API] Error getting stats:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Search charts by geographic bounds
 */
router.get('/search/bounds/:west/:south/:east/:north', async (req, res) => {
  try {
    await encMetadataService.initialize()
    
    const bounds = {
      west: parseFloat(req.params.west),
      south: parseFloat(req.params.south),
      east: parseFloat(req.params.east),
      north: parseFloat(req.params.north)
    }
    
    const charts = await encMetadataService.getCharts({ bounds })
    
    res.json({
      success: true,
      data: charts,
      count: charts.length,
      bounds
    })
    
  } catch (error) {
    console.error('[ENC Metadata API] Error searching by bounds:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get cache status
 */
router.get('/cache/status', (req, res) => {
  res.json({
    success: true,
    cached_items: cache.size,
    cache_ttl_ms: CACHE_TTL,
    memory_usage: process.memoryUsage()
  })
})

/**
 * Clear cache
 */
router.delete('/cache', (req, res) => {
  const clearedCount = cache.size
  cache.clear()
  
  console.log('[ENC Metadata API] Cache cleared:', clearedCount, 'entries removed')
  
  res.json({
    success: true,
    message: `Cache cleared: ${clearedCount} entries removed`
  })
})

/**
 * Get download status for all charts
 */
router.get('/download-status', async (req, res) => {
  try {
    console.log('[ENC Metadata API] 📥 Download status check requested')
    
    const filters = {}
    if (req.query.limit) filters.limit = parseInt(req.query.limit)
    if (req.query.search) filters.search = req.query.search
    
    const result = await chartDownloadService.checkAllChartsDownloadStatus(filters)
    
    res.json(result)
    
  } catch (error) {
    console.error('[ENC Metadata API] Error checking download status:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get download status summary
 */
router.get('/download-status/summary', async (req, res) => {
  try {
    const summary = await chartDownloadService.getDownloadStatusSummary()
    
    res.json({
      success: true,
      data: summary
    })
    
  } catch (error) {
    console.error('[ENC Metadata API] Error getting download status summary:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get download status for a specific chart
 */
router.get('/download-status/:chartId', async (req, res) => {
  try {
    const chartId = req.params.chartId
    const status = await chartDownloadService.checkChartDownloadStatus(chartId)
    
    res.json({
      success: true,
      data: status
    })
    
  } catch (error) {
    console.error('[ENC Metadata API] Error checking chart download status:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

export default router