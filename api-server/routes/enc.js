/**
 * ENC API Routes - Enhanced with database functionality
 */

import express from 'express'
import encService from '../services/encService.js'

const router = express.Router()

// Reduced cache TTL since we now have database storage
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get ENC catalogue with database support
 */
router.get('/catalogue', async (req, res) => {
  try {
    console.log('[API] ENC catalogue requested')
    
    // Check cache first for immediate response
    const cached = cache.get('enc_catalogue')
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[API] Returning cached ENC catalogue')
      return res.json({
        success: true,
        data: cached.data,
        count: cached.data.length,
        cached: true
      })
    }

    console.log('[API] Fetching ENC catalogue from database/NOAA...')
    const charts = await encService.fetchENCCatalogue(req.query.refresh === 'true')
    
    // Cache the result for fast subsequent requests
    cache.set('enc_catalogue', {
      data: charts,
      timestamp: Date.now()
    })
    
    console.log(`[API] ENC catalogue fetched successfully: ${charts.length} charts`)
    
    res.json({
      success: true,
      data: charts,
      count: charts.length,
      cached: false
    })
    
  } catch (error) {
    console.error('[API] Error fetching ENC catalogue:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get filtered charts
 */
router.get('/charts', async (req, res) => {
  try {
    const filters = {}
    
    // Parse query parameters for filtering
    if (req.query.type) filters.chartType = req.query.type
    if (req.query.search) filters.search = req.query.search
    if (req.query.limit) filters.limit = parseInt(req.query.limit)
    
    // Parse bounding box filter
    if (req.query.bounds) {
      const [west, south, east, north] = req.query.bounds.split(',').map(parseFloat)
      filters.bounds = { west, south, east, north }
    }

    const charts = await encService.getCharts(filters)
    
    res.json({
      success: true,
      data: charts,
      count: charts.length,
      filters
    })
    
  } catch (error) {
    console.error('[API] Error getting filtered charts:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get single chart by ID
 */
router.get('/charts/:id', async (req, res) => {
  try {
    const chart = await encService.getChart(req.params.id)
    
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
    console.error('[API] Error getting chart:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Get database and service statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await encService.getServiceStats()
    
    res.json({
      success: true,
      data: stats
    })
    
  } catch (error) {
    console.error('[API] Error getting stats:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

/**
 * Force refresh ENC data from NOAA
 */
router.post('/refresh', async (req, res) => {
  try {
    console.log('[API] Force refresh requested')
    
    // Clear cache
    cache.clear()
    
    // Trigger fresh fetch from NOAA
    const charts = await encService.refreshENCData()
    
    console.log(`[API] Refresh complete: ${charts.length} charts`)
    
    res.json({
      success: true,
      message: `Successfully refreshed ${charts.length} charts from NOAA`,
      count: charts.length
    })
    
  } catch (error) {
    console.error('[API] Error during refresh:', error)
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
  const cached = cache.get('enc_catalogue')
  
  res.json({
    success: true,
    cached: !!cached,
    cacheAge: cached ? Date.now() - cached.timestamp : null,
    cacheTTL: CACHE_TTL,
    itemCount: cached ? cached.data.length : 0,
    memoryUsage: process.memoryUsage()
  })
})

/**
 * Clear cache
 */
router.delete('/cache', (req, res) => {
  const clearedCount = cache.size
  cache.clear()
  
  console.log('[API] Cache cleared:', clearedCount, 'entries removed')
  
  res.json({
    success: true,
    message: `Cache cleared: ${clearedCount} entries removed`
  })
})

export default router