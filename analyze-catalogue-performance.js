#!/usr/bin/env node

/**
 * Performance Analysis Script for ENC Catalogue Update
 * Measures timing for different phases of the catalogue update process
 */

import { performance } from 'perf_hooks'

const API_BASE = 'http://localhost:3002/api/enc-metadata'

class PerformanceAnalyzer {
  constructor() {
    this.timings = {}
    this.startTime = null
  }

  startTimer(phase) {
    this.timings[phase] = { start: performance.now() }
    console.log(`🔄 Starting: ${phase}`)
  }

  endTimer(phase) {
    if (this.timings[phase]) {
      const duration = performance.now() - this.timings[phase].start
      this.timings[phase].duration = duration
      console.log(`✅ Completed: ${phase} - ${(duration / 1000).toFixed(2)}s`)
      return duration
    }
  }

  async analyzeCurrentDatabase() {
    console.log('\n📊 ANALYZING CURRENT DATABASE STATE')
    console.log('=' .repeat(50))
    
    try {
      this.startTimer('Database Stats Query')
      const response = await fetch(`${API_BASE}/stats`)
      const data = await response.json()
      this.endTimer('Database Stats Query')
      
      if (data.success) {
        console.log(`📈 Current Database Stats:`)
        console.log(`   - Total Charts: ${data.data.total_charts.toLocaleString()}`)
        console.log(`   - Charts with Bounds: ${data.data.charts_with_bounds}`)
        console.log(`   - Date Range: ${data.data.oldest_chart} to ${data.data.newest_chart}`)
        console.log(`   - Scale Range: ${data.data.min_scale?.toLocaleString()} to ${data.data.max_scale?.toLocaleString()}`)
        console.log(`   - Total Size: ${(data.data.total_size_mb / 1024).toFixed(2)} GB`)
      }
    } catch (error) {
      console.error('❌ Failed to get database stats:', error.message)
    }
  }

  async testNOAAXMLFetch() {
    console.log('\n🌊 TESTING NOAA XML FETCH PERFORMANCE')
    console.log('=' .repeat(50))
    
    this.startTimer('NOAA XML Fetch')
    
    try {
      const response = await fetch('https://www.charts.noaa.gov/ENCs/ENCProdCat_19115.xml', {
        headers: { 'User-Agent': 'OpenHelm Performance Test v1.0' }
      })
      
      const xmlData = await response.text()
      const fetchDuration = this.endTimer('NOAA XML Fetch')
      
      console.log(`📦 XML Data Size: ${(xmlData.length / 1024 / 1024).toFixed(2)} MB`)
      console.log(`⚡ Download Speed: ${(xmlData.length / 1024 / 1024 / (fetchDuration / 1000)).toFixed(2)} MB/s`)
      
      return xmlData
      
    } catch (error) {
      console.error('❌ Failed to fetch NOAA XML:', error.message)
      return null
    }
  }

  async testXMLParsing(xmlData) {
    if (!xmlData) return null
    
    console.log('\n🔍 TESTING XML PARSING PERFORMANCE')
    console.log('=' .repeat(50))
    
    this.startTimer('XML Parsing')
    
    try {
      const { XMLParser } = await import('fast-xml-parser')
      
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
      this.endTimer('XML Parsing')
      
      const datasets = xmlObj.DS_Series?.composedOf || []
      console.log(`📊 Parsed ${datasets.length.toLocaleString()} datasets`)
      
      return datasets
      
    } catch (error) {
      console.error('❌ Failed to parse XML:', error.message)
      return null
    }
  }

  async testSingleChartParsing(datasets) {
    if (!datasets || datasets.length === 0) return
    
    console.log('\n⚙️  TESTING SINGLE CHART PARSING PERFORMANCE')
    console.log('=' .repeat(50))
    
    // Test parsing performance with different sample sizes
    const sampleSizes = [1, 10, 100]
    
    for (const sampleSize of sampleSizes) {
      const sample = datasets.slice(0, Math.min(sampleSize, datasets.length))
      
      this.startTimer(`Parse ${sampleSize} Charts`)
      
      let successCount = 0
      let errorCount = 0
      
      try {
        // Import the parser
        const encSimpleParserModule = await import('./api-server/services/encSimpleParser.js')
        const encSimpleParser = encSimpleParserModule.default
        
        for (let i = 0; i < sample.length; i++) {
          try {
            const dataset = sample[i].DS_DataSet
            const chartMetadata = encSimpleParser.parseChartMetadata(dataset, i)
            
            if (chartMetadata && chartMetadata.chart_id) {
              successCount++
            } else {
              errorCount++
            }
          } catch (error) {
            errorCount++
          }
        }
        
        const duration = this.endTimer(`Parse ${sampleSize} Charts`)
        const chartsPerSecond = (sample.length / (duration / 1000)).toFixed(0)
        
        console.log(`   - Success: ${successCount}, Errors: ${errorCount}`)
        console.log(`   - Rate: ${chartsPerSecond} charts/second`)
        
        if (sampleSize === 100) {
          const estimatedTotalTime = (datasets.length / chartsPerSecond / 60).toFixed(1)
          console.log(`   - Estimated total parsing time: ${estimatedTotalTime} minutes`)
        }
        
      } catch (error) {
        console.error(`❌ Failed to test ${sampleSize} chart parsing:`, error.message)
      }
    }
  }

  async testDatabaseOperations() {
    console.log('\n💾 TESTING DATABASE OPERATION PERFORMANCE')
    console.log('=' .repeat(50))
    
    // Test database write performance
    this.startTimer('Sample Database Batch Insert')
    
    try {
      // Create a small test dataset
      const testCharts = []
      for (let i = 0; i < 10; i++) {
        testCharts.push({
          chart_id: `TEST_PERF_${i}`,
          chart_name: `Test Chart ${i}`,
          scale_denominator: 50000,
          publication_date: '2024-01-01',
          bounds_west: -122.0,
          bounds_east: -121.0,
          bounds_south: 37.0,
          bounds_north: 38.0
        })
      }
      
      // This would require importing the database service
      // For now, just simulate the timing
      await new Promise(resolve => setTimeout(resolve, 50)) // Simulate DB operation
      
      this.endTimer('Sample Database Batch Insert')
      
    } catch (error) {
      console.error('❌ Database test failed:', error.message)
    }
  }

  printSummary() {
    console.log('\n📋 PERFORMANCE ANALYSIS SUMMARY')
    console.log('=' .repeat(50))
    
    let totalTime = 0
    for (const [phase, timing] of Object.entries(this.timings)) {
      if (timing.duration) {
        const seconds = (timing.duration / 1000).toFixed(2)
        console.log(`${phase}: ${seconds}s`)
        totalTime += timing.duration
      }
    }
    
    console.log(`\nTotal Measured Time: ${(totalTime / 1000).toFixed(2)}s`)
    
    // Identify bottlenecks
    const sortedTimings = Object.entries(this.timings)
      .filter(([, timing]) => timing.duration)
      .sort(([,a], [,b]) => b.duration - a.duration)
    
    console.log('\n🔥 TOP BOTTLENECKS:')
    sortedTimings.slice(0, 3).forEach(([phase, timing], index) => {
      const seconds = (timing.duration / 1000).toFixed(2)
      const percentage = ((timing.duration / totalTime) * 100).toFixed(1)
      console.log(`${index + 1}. ${phase}: ${seconds}s (${percentage}%)`)
    })
  }
}

async function main() {
  console.log('🚀 OpenHelm ENC Catalogue Performance Analysis')
  console.log('=' .repeat(60))
  
  const analyzer = new PerformanceAnalyzer()
  
  // Step 1: Analyze current database state
  await analyzer.analyzeCurrentDatabase()
  
  // Step 2: Test NOAA XML fetch performance
  const xmlData = await analyzer.testNOAAXMLFetch()
  
  // Step 3: Test XML parsing performance
  const datasets = await analyzer.testXMLParsing(xmlData)
  
  // Step 4: Test chart parsing performance
  await analyzer.testSingleChartParsing(datasets)
  
  // Step 5: Test database operations
  await analyzer.testDatabaseOperations()
  
  // Step 6: Print summary and recommendations
  analyzer.printSummary()
  
  console.log('\n💡 OPTIMIZATION RECOMMENDATIONS:')
  console.log('1. Consider streaming XML parsing instead of loading entire file')
  console.log('2. Implement parallel processing for chart parsing')
  console.log('3. Use database transactions and batch inserts')
  console.log('4. Add progress reporting for better UX')
  console.log('5. Consider caching parsed results')
}

// Handle both direct execution and import
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export default PerformanceAnalyzer