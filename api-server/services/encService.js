/**
 * ENC Service - Comprehensive Electronic Navigational Chart service with database storage
 */

import { XMLParser } from 'fast-xml-parser'
import databaseService from './databaseService.js'
import encParserService from './encParserService.js'

let isInitialized = false

/**
 * Initialize the ENC service and database
 */
async function initializeService() {
  if (!isInitialized) {
    console.log('[ENC Service] Initializing service...')
    await databaseService.initialize()
    isInitialized = true
  }
}

/**
 * Fetch and parse ENC catalogue from NOAA with database caching
 * @param {boolean} forceRefresh - Force refresh from NOAA instead of using cache
 * @returns {Promise<Array>} Promise resolving to array of parsed ENC chart objects
 */
async function fetchENCCatalogue(forceRefresh = false) {
  try {
    await initializeService()

    // Check if we have cached data and it's recent (less than 24 hours old)
    const stats = await databaseService.getStats()
    const hasRecentData = stats.total_charts > 0

    if (!forceRefresh && hasRecentData) {
      console.log('[ENC Service] Using cached ENC data from database')
      return await databaseService.getCharts()
    }

    console.log('[ENC Service] Fetching fresh ENC catalogue from NOAA...')
    
    // NOAA ENC Product Catalog URL
    const catalogueUrl = 'https://www.charts.noaa.gov/ENCs/ENCProdCat_19115.xml'
    
    const response = await fetch(catalogueUrl, {
      headers: {
        'User-Agent': 'OpenHelm Marine Navigation Application'
      },
      timeout: 30000 // 30 second timeout
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const xmlData = await response.text()
    console.log(`[ENC Service] Received ${xmlData.length} bytes of XML data`)
    
    // Parse XML using fast-xml-parser with optimal settings for ISO 19139
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
    console.log('[ENC Service] XML root keys:', Object.keys(xmlObj))
    
    // Navigate through the XML structure to find datasets
    const datasets = await extractDatasets(xmlObj)
    console.log(`[ENC Service] Found ${datasets.length} datasets`)
    
    if (datasets.length === 0) {
      throw new Error('No datasets found in XML response')
    }

    // Parse all datasets and store in database
    console.log('[ENC Service] Parsing datasets and storing in database...')
    const charts = []
    let successCount = 0
    let errorCount = 0

    // Clear existing data
    await databaseService.clearCharts()

    // Process datasets in batches to avoid memory issues
    const batchSize = 100
    for (let i = 0; i < datasets.length; i += batchSize) {
      const batch = datasets.slice(i, i + batchSize)
      
      for (let j = 0; j < batch.length; j++) {
        const dataset = batch[j]
        const index = i + j
        
        try {
          const chartData = encParserService.parseENCDataset(dataset, index)
          
          if (chartData) {
            // Store in database
            await databaseService.upsertChart(chartData)
            charts.push(formatChartForAPI(chartData))
            successCount++
            
            // Log progress every 1000 charts
            if (successCount % 1000 === 0) {
              console.log(`[ENC Service] Processed ${successCount} charts...`)
            }
          } else {
            errorCount++
          }
        } catch (error) {
          console.error(`[ENC Service] Error processing dataset ${index}:`, error.message)
          errorCount++
        }
      }
    }

    console.log(`[ENC Service] Processing complete:`)
    console.log(`[ENC Service] - Successfully parsed: ${successCount} charts`)
    console.log(`[ENC Service] - Errors: ${errorCount} datasets`)
    console.log(`[ENC Service] - Total stored in database: ${charts.length} charts`)

    return charts

  } catch (error) {
    console.error('[ENC Service] Error fetching ENC catalogue:', error)
    throw new Error(`Failed to fetch ENC catalogue: ${error.message}`)
  }
}

/**
 * Extract datasets from parsed XML object
 */
async function extractDatasets(xmlObj) {
  let datasets = []
  
  // The datasets are located at DS_Series.composedOf (discovered via debug script)
  if (xmlObj.DS_Series && xmlObj.DS_Series.composedOf) {
    console.log('[ENC Service] Found DS_Series.composedOf structure')
    const composedOf = xmlObj.DS_Series.composedOf
    
    // composedOf is an array of objects, each containing DS_DataSet
    if (Array.isArray(composedOf)) {
      console.log(`[ENC Service] Found ${composedOf.length} composedOf entries`)
      
      for (const entry of composedOf) {
        if (entry.DS_DataSet) {
          datasets.push(entry.DS_DataSet)
        }
      }
    } else {
      // Single object case
      if (composedOf.DS_DataSet) {
        datasets.push(composedOf.DS_DataSet)
      }
    }
  }
  
  // Fallback search if main method didn't work
  if (datasets.length === 0) {
    console.log('[ENC Service] Searching for datasets using fallback methods...')
    // Look for partOf structure (original structure)
    if (xmlObj.DS_Series && xmlObj.DS_Series.partOf) {
      const partOf = xmlObj.DS_Series.partOf
      const partOfArray = Array.isArray(partOf) ? partOf : [partOf]
      
      for (const part of partOfArray) {
        if (part.DS_DataSet || (part.has && part.has.DS_DataSet)) {
          const dataset = part.DS_DataSet || part.has.DS_DataSet
          if (Array.isArray(dataset)) {
            datasets.push(...dataset)
          } else {
            datasets.push(dataset)
          }
        }
      }
    }
  }

  console.log(`[ENC Service] Dataset extraction complete: found ${datasets.length} datasets`)
  return datasets
}

/**
 * Format chart data for API response
 */
function formatChartForAPI(chartData) {
  return {
    id: chartData.id,
    name: chartData.name,
    title: chartData.title,
    abstract: chartData.abstract,
    scale: chartData.scaleDenominator,
    scaleText: chartData.scaleText,
    chartType: chartData.chartType,
    status: chartData.status,
    bounds: {
      west: chartData.westBound,
      east: chartData.eastBound,
      south: chartData.southBound,
      north: chartData.northBound
    },
    center: {
      lat: chartData.centerLat,
      lon: chartData.centerLon
    },
    publicationDate: chartData.publicationDate,
    revisionDate: chartData.revisionDate,
    dateStamp: chartData.dateStamp,
    downloadUrl: chartData.downloadUrl,
    keywords: chartData.keywords,
    organization: chartData.organization
  }
}

/**
 * Get charts with filtering options
 */
async function getCharts(filters = {}) {
  await initializeService()
  const chartsFromDB = await databaseService.getCharts(filters)
  return chartsFromDB.map(formatChartForAPI)
}

/**
 * Get single chart by ID
 */
async function getChart(id) {
  await initializeService()
  const chartFromDB = await databaseService.getChart(id)
  return chartFromDB ? formatChartForAPI(chartFromDB) : null
}

/**
 * Get database statistics
 */
async function getServiceStats() {
  await initializeService()
  return await databaseService.getStats()
}

/**
 * Force refresh of ENC data from NOAA
 */
async function refreshENCData() {
  console.log('[ENC Service] Force refreshing ENC data...')
  return await fetchENCCatalogue(true)
}

export default {
  fetchENCCatalogue,
  getCharts,
  getChart,
  getServiceStats,
  refreshENCData
}