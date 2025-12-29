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
 * Start background job to fetch complete ENC catalogue from NOAA
 * Returns immediately with job ID for progress tracking
 */
router.post('/fetch-full-catalogue', async (req, res) => {
  const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  
  try {
    console.log(`[ENC Metadata API] 🚀 [${jobId}] Background catalogue fetch requested`)
    
    // Check if there's already an active job
    const activeJob = Array.from(global.activeJobs.entries()).find(([id, job]) => job.status === 'running')
    if (activeJob) {
      console.log(`[ENC Metadata API] ⏳ [${jobId}] Active job found: ${activeJob[0]}`)
      return res.json({
        success: true,
        jobId: activeJob[0],
        message: 'NOAA catalogue fetch already in progress',
        status: 'running'
      })
    }
    
    // Initialize job tracking
    global.activeJobs.set(jobId, {
      controller: new AbortController(),
      startTime: Date.now(),
      status: 'starting'
    })
    
    // Initialize progress tracker
    if (!global.progressTrackers.has(jobId)) {
      global.progressTrackers.set(jobId, { progress: 0, status: 'starting', clients: new Set() })
    }
    
    // Start background job immediately
    setImmediate(() => performNOAAFetch(jobId))
    
    // Return job ID immediately
    console.log(`[ENC Metadata API] ✅ [${jobId}] Background job started`)
    res.json({
      success: true,
      jobId: jobId,
      message: 'NOAA catalogue fetch started in background',
      status: 'starting',
      websocketUrl: `ws://localhost:3002`
    })
    
  } catch (error) {
    console.error(`[ENC Metadata API] ❌ [${jobId}] Failed to start background job:`, error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to start NOAA catalogue fetch',
      message: error.message,
      jobId: jobId
    })
  }
})

/**
 * Background function to perform the actual NOAA fetch
 */
async function performNOAAFetch(jobId) {
  const job = global.activeJobs.get(jobId)
  if (!job) return
  
  try {
    // Update job status
    job.status = 'running'
    global.broadcastProgress(jobId, 0, 'initializing', 'Initializing database service...')
    
    console.log(`[ENC Metadata API] 🗄️  [${jobId}] Initializing database service...`)
    await encMetadataService.initialize()
    console.log(`[ENC Metadata API] ✅ [${jobId}] Database service initialized successfully`)
    
    global.broadcastProgress(jobId, 5, 'fetching', 'Getting current database stats...')
    
    // Get starting stats
    const initialStats = await encMetadataService.getStats()
    console.log(`[ENC Metadata API] 📊 [${jobId}] Database before fetch: ${initialStats.total_charts} charts`)
    
    // Check for cancellation
    if (job.controller.signal.aborted) {
      throw new Error('Job was cancelled')
    }
    
    // Fetch NOAA XML
    global.broadcastProgress(jobId, 10, 'downloading', 'Downloading NOAA catalogue XML...')
    console.log(`[ENC Metadata API] 🌊 [${jobId}] Fetching complete catalogue from NOAA...`)
    console.log(`[ENC Metadata API] 🌊 [${jobId}] URL: https://www.charts.noaa.gov/ENCs/ENCProdCat_19115.xml`)
    const startTime = Date.now()
    
    const response = await fetch('https://www.charts.noaa.gov/ENCs/ENCProdCat_19115.xml', {
      headers: { 'User-Agent': 'OpenHelm Marine Navigation Application v1.0' },
      signal: job.controller.signal // Add cancellation support
    })
    
    console.log(`[ENC Metadata API] 📡 [${jobId}] NOAA response status: ${response.status} ${response.statusText}`)
    console.log(`[ENC Metadata API] 📡 [${jobId}] NOAA response headers:`, Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      const errorMsg = `NOAA API Error - HTTP ${response.status}: ${response.statusText}`
      console.error(`[ENC Metadata API] ❌ [${jobId}] ${errorMsg}`)
      throw new Error(errorMsg)
    }
    
    global.broadcastProgress(jobId, 15, 'downloading', 'Reading XML response...')
    console.log(`[ENC Metadata API] 📥 [${jobId}] Reading response text from NOAA...`)
    const xmlData = await response.text()
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ENC Metadata API] ✅ [${jobId}] Received ${xmlData.length.toLocaleString()} bytes in ${fetchTime}s`)
    console.log(`[ENC Metadata API] 📄 [${jobId}] XML sample (first 200 chars): ${xmlData.slice(0, 200)}`)
    
    // Parse XML with optimized configuration
    global.broadcastProgress(jobId, 20, 'parsing', 'Parsing NOAA XML catalogue...')
    console.log(`[ENC Metadata API] 🔄 [${jobId}] Parsing XML catalogue with optimized settings...`)
    const parseStart = Date.now()
    
    // Check for cancellation
    if (job.controller.signal.aborted) {
      throw new Error('Job was cancelled')
    }
    
    // Optimized XML parser configuration for ENC catalogue
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
      parseTagValue: false,        // Don't parse tag values we don't need - saves time
      textNodeName: '#text',
      removeNSPrefix: true,        // Remove namespace prefixes - reduces memory
      processEntities: false,
      htmlEntities: false,
      trimValues: true,            // Trim whitespace - cleaner data
      parseTrueNumberOnly: false,  // Don't auto-convert numbers - faster parsing
      arrayMode: false,            // Don't force arrays - simpler structure
      alwaysCreateTextNode: false, // Only create text nodes when needed
      ignoreNameSpace: true,       // Ignore namespaces for faster parsing
      parseNodeValue: false        // Skip node value parsing - significant speedup
    })
    
    console.log(`[ENC Metadata API] 🔄 [${jobId}] Starting XML parsing with FastXMLParser...`)
    const xmlObj = parser.parse(xmlData)
    const parseTime = ((Date.now() - parseStart) / 1000).toFixed(1)
    console.log(`[ENC Metadata API] ✅ [${jobId}] XML parsing complete in ${parseTime}s`)
    
    // Extract datasets
    global.broadcastProgress(jobId, 25, 'parsing', 'Extracting chart datasets...')
    console.log(`[ENC Metadata API] 🔍 [${jobId}] Extracting datasets from parsed XML...`)
    const datasets = xmlObj.DS_Series?.composedOf || []
    console.log(`[ENC Metadata API] ✅ [${jobId}] Parsed ${datasets.length.toLocaleString()} datasets in ${parseTime}s`)
    console.log(`[ENC Metadata API] 📊 [${jobId}] XML structure check - DS_Series exists: ${!!xmlObj.DS_Series}, composedOf exists: ${!!xmlObj.DS_Series?.composedOf}`)
    
    if (datasets.length === 0) {
      console.error(`[ENC Metadata API] ❌ [${jobId}] No datasets found in NOAA XML response`)
      console.error(`[ENC Metadata API] 🔍 [${jobId}] XML object keys: ${Object.keys(xmlObj)}`)
      throw new Error('No datasets found in NOAA XML response')
    }
    
    // Clear existing data to ensure fresh dataset
    global.broadcastProgress(jobId, 30, 'cleaning', 'Clearing existing database entries...')
    console.log(`[ENC Metadata API] 🗑️  [${jobId}] Clearing existing database entries...`)
    const clearedCount = await encMetadataService.clearAll()
    console.log(`[ENC Metadata API] ✅ [${jobId}] Cleared ${clearedCount} existing entries`)
    
    // Check for cancellation
    if (job.controller.signal.aborted) {
      throw new Error('Job was cancelled')
    }
    
    // Process all datasets
    let successCount = 0
    let errorCount = 0
    const processStart = Date.now()
    
    global.broadcastProgress(jobId, 35, 'processing', `Processing ${datasets.length.toLocaleString()} chart datasets...`)
    console.log(`[ENC Metadata API] ⚙️  [${jobId}] Processing complete dataset...`)
    
    // Process in optimized batches with parallel processing
    const batchSize = 100 // Larger batches for better parallel performance
    
    for (let i = 0; i < datasets.length; i += batchSize) {
      // Check for cancellation before each batch
      if (job.controller.signal.aborted) {
        throw new Error('Job was cancelled')
      }
      
      const batch = datasets.slice(i, i + batchSize)
      const batchStart = Date.now()
      
      // Process batch in parallel with Promise.all
      const batchPromises = batch.map(async (item, j) => {
        const dataset = item.DS_DataSet
        const index = i + j
        
        try {
          const chartMetadata = encSimpleParser.parseChartMetadata(dataset, index)
          
          if (chartMetadata && chartMetadata.chart_id) {
            await encMetadataService.upsertMetadata(chartMetadata)
            return { success: true, chartId: chartMetadata.chart_id }
          } else {
            return { success: false, error: 'No chart ID', index }
          }
        } catch (error) {
          console.error(`[ENC Metadata API] ❌ [${jobId}] Error processing dataset ${index}: ${error.message}`)
          return { success: false, error: error.message, index }
        }
      })
      
      // Wait for all charts in batch to complete
      const batchResults = await Promise.all(batchPromises)
      
      // Count results
      batchResults.forEach(result => {
        if (result.success) {
          successCount++
        } else {
          errorCount++
        }
      })
      
      // Progress reporting every batch
      const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1)
      const processingProgress = ((i + batch.length) / datasets.length)
      const overallProgress = Math.min(95, 35 + (processingProgress * 50)) // 35% to 85% for processing
      const avgTimePerChart = (Date.now() - processStart) / (i + batch.length)
      const estimatedTimeLeft = ((datasets.length - (i + batch.length)) * avgTimePerChart / 1000 / 60).toFixed(1)
      
      const progressMessage = `Processed ${successCount.toLocaleString()}/${datasets.length.toLocaleString()} charts`
      global.broadcastProgress(jobId, overallProgress, 'processing', progressMessage, `${estimatedTimeLeft} min`)
      
      console.log(`[ENC Metadata API] 📈 [${jobId}] Progress: ${overallProgress.toFixed(1)}% (${successCount.toLocaleString()} processed, ${estimatedTimeLeft}min remaining)`)
    }
    
    const totalProcessTime = ((Date.now() - processStart) / 1000 / 60).toFixed(1)
    
    // Get final statistics
    global.broadcastProgress(jobId, 90, 'finalizing', 'Getting final database statistics...')
    const finalStats = await encMetadataService.getStats()
    
    // Clear API cache to ensure fresh data
    cache.clear()
    
    // Check download status
    global.broadcastProgress(jobId, 95, 'finalizing', 'Checking chart download status...')
    let downloadStatusSummary = null
    try {
      await chartDownloadService.initializeChartsDirectory()
      downloadStatusSummary = await chartDownloadService.getDownloadStatusSummary()
    } catch (error) {
      console.warn(`[ENC Metadata API] ⚠️  [${jobId}] Could not check download status:`, error.message)
      downloadStatusSummary = { error: error.message }
    }
    
    const summary = {
      success: true,
      jobId: jobId,
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
      },
      download_status: downloadStatusSummary
    }
    
    console.log(`[ENC Metadata API] 🎉 [${jobId}] COMPLETE: Processed ${successCount.toLocaleString()} charts in ${totalProcessTime}min`)
    console.log(`[ENC Metadata API] 📊 [${jobId}] Success rate: ${summary.statistics.success_rate}`)
    console.log(`[ENC Metadata API] 💾 [${jobId}] Database: ${finalStats.total_charts} charts, ${summary.database.total_file_size_gb}GB total`)
    
    // Mark job as completed
    job.status = 'completed'
    global.broadcastProgress(jobId, 100, 'completed', `Successfully processed ${successCount.toLocaleString()} charts!`)
    
    // Store final result for later retrieval
    global.activeJobs.set(jobId, { ...job, result: summary })
    
  } catch (error) {
    console.error(`[ENC Metadata API] ❌ [${jobId}] FETCH FAILED:`, error.message)
    console.error(`[ENC Metadata API] ❌ [${jobId}] Full error:`, error)
    console.error(`[ENC Metadata API] ❌ [${jobId}] Error stack:`, error.stack)
    
    const errorResult = {
      success: false,
      jobId: jobId,
      error: 'Failed to fetch and process ENC catalogue',
      message: error.message,
      timestamp: new Date().toISOString(),
      cancelled: error.message.includes('cancelled')
    }
    
    // Mark job as failed
    if (global.activeJobs.has(jobId)) {
      const job = global.activeJobs.get(jobId)
      job.status = error.message.includes('cancelled') ? 'cancelled' : 'failed'
      job.result = errorResult
    }
    
    // Broadcast error status
    const status = error.message.includes('cancelled') ? 'cancelled' : 'failed'
    global.broadcastProgress(jobId, 0, status, error.message)
    
    console.error(`[ENC Metadata API] 📤 [${jobId}] Job failed:`, errorResult)
  }
}

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

/**
 * Get job status and progress (polling fallback for WebSocket)
 */
router.get('/jobs/:jobId/status', (req, res) => {
  const { jobId } = req.params
  
  const job = global.activeJobs.get(jobId)
  const tracker = global.progressTrackers.get(jobId)
  
  if (!job && !tracker) {
    return res.status(404).json({
      success: false,
      message: 'Job not found',
      jobId
    })
  }
  
  const response = {
    success: true,
    jobId,
    status: job?.status || 'unknown',
    progress: tracker?.progress || 0,
    message: tracker?.status || 'unknown',
    startTime: job?.startTime,
    result: job?.result || null,
    timestamp: Date.now()
  }
  
  res.json(response)
})

/**
 * Cancel a running job
 */
router.delete('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params
  
  const job = global.activeJobs.get(jobId)
  if (!job) {
    return res.status(404).json({
      success: false,
      message: 'Job not found',
      jobId
    })
  }
  
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return res.json({
      success: true,
      message: `Job already ${job.status}`,
      jobId,
      status: job.status
    })
  }
  
  // Cancel the job
  try {
    job.controller.abort()
    job.status = 'cancelling'
    console.log(`[ENC Metadata API] 🛑 [${jobId}] Job cancellation requested`)
    
    global.broadcastProgress(jobId, 0, 'cancelling', 'Cancelling job...')
    
    res.json({
      success: true,
      message: 'Job cancellation requested',
      jobId,
      status: 'cancelling'
    })
  } catch (error) {
    console.error(`[ENC Metadata API] ❌ Error cancelling job ${jobId}:`, error.message)
    res.status(500).json({
      success: false,
      message: 'Failed to cancel job',
      error: error.message,
      jobId
    })
  }
})

/**
 * Get all active jobs
 */
router.get('/jobs', (req, res) => {
  const jobs = []
  
  for (const [jobId, job] of global.activeJobs.entries()) {
    const tracker = global.progressTrackers.get(jobId)
    
    jobs.push({
      jobId,
      status: job.status,
      startTime: job.startTime,
      progress: tracker?.progress || 0,
      message: tracker?.status || 'unknown',
      hasResult: !!job.result
    })
  }
  
  res.json({
    success: true,
    jobs,
    count: jobs.length
  })
})

/**
 * Test endpoint to check if logging is working
 */
router.get('/test-logging', (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2)
  console.log(`[ENC Metadata API] 🧪 [${requestId}] Test logging endpoint called`)
  console.log(`[ENC Metadata API] 🧪 [${requestId}] Request headers:`, req.headers)
  console.log(`[ENC Metadata API] 🧪 [${requestId}] Current time: ${new Date().toISOString()}`)
  
  res.json({
    success: true,
    message: 'Logging test successful',
    requestId: requestId,
    timestamp: new Date().toISOString()
  })
})

export default router