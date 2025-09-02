/**
 * Comprehensive ENC XML Parser for NOAA ISO 19139 Metadata
 * Extracts all available fields from the complex nested XML structure
 */

class ENCParserService {
  
  /**
   * Parse complete ENC dataset from XML metadata
   */
  parseENCDataset(dataset, index) {
    try {
      // Debug: Check if extractChartType method exists
      if (typeof this.extractChartType !== 'function') {
        console.error(`[Parser] ERROR: extractChartType is not a function! Available methods:`, Object.getOwnPropertyNames(this))
        return null
      }
      
      // Navigate to the metadata object
      const metadata = this.getMetadata(dataset)
      if (!metadata) {
        console.log(`[Parser] Dataset ${index}: No valid metadata found`)
        return null
      }

      // Extract all fields using comprehensive parsing
      const chartData = {
        // Basic identification
        id: this.extractChartId(metadata, index),
        name: this.extractTitle(metadata, index),
        title: this.extractTitle(metadata, index),
        abstract: this.extractAbstract(metadata),

        // Geographic bounds - critical for mapping
        ...this.extractGeographicExtent(metadata),

        // Scale information - critical for chart classification
        ...this.extractSpatialResolution(metadata),

        // Classification and status
        chartType: this.extractChartType(metadata),
        status: this.extractStatus(metadata),
        language: this.extractLanguage(metadata),

        // Dates
        ...this.extractDates(metadata),

        // Distribution and download info
        ...this.extractDistributionInfo(metadata),

        // Keywords and descriptive info
        keywords: this.extractKeywords(metadata),
        
        // Organization info
        ...this.extractContactInfo(metadata),

        // Quality and lineage
        ...this.extractDataQuality(metadata),

        // Store raw metadata for debugging
        rawXmlData: this.extractRawXmlSample(metadata)
      }

      // Calculate derived fields
      if (chartData.westBound && chartData.eastBound && chartData.southBound && chartData.northBound) {
        chartData.centerLat = (chartData.northBound + chartData.southBound) / 2
        chartData.centerLon = (chartData.eastBound + chartData.westBound) / 2
      }

      // Determine chart type from scale if not already determined
      if (!chartData.chartType && chartData.scaleDenominator) {
        chartData.chartType = this.determineChartTypeFromScale(chartData.scaleDenominator)
      }

      // Generate scale text
      if (chartData.scaleDenominator) {
        chartData.scaleText = `1:${chartData.scaleDenominator.toLocaleString()}`
      }

      console.log(`[Parser] Successfully parsed chart: ${chartData.id} - ${chartData.name}`)
      return chartData

    } catch (error) {
      console.error(`[Parser] Error parsing dataset ${index}:`, error.message)
      return null
    }
  }

  /**
   * Navigate to the metadata object through the nested structure
   */
  getMetadata(dataset) {
    // Try different paths to find metadata
    const paths = [
      'DS_DataSet.has.MD_Metadata',
      'DS_DataSet.has',
      'DS_DataSet',
      'has.MD_Metadata',
      'MD_Metadata'
    ]

    for (const path of paths) {
      const obj = this.getNestedValue(dataset, path)
      if (obj && typeof obj === 'object') {
        return obj
      }
    }

    return null
  }

  /**
   * Extract chart ID from various possible locations
   */
  extractChartId(metadata, index) {
    // Try multiple paths for chart ID
    const idPaths = [
      'identificationInfo.MD_DataIdentification.citation.CI_Citation.identifier.MD_Identifier.code.gco:CharacterString',
      'identificationInfo.MD_DataIdentification.citation.CI_Citation.identifier.code.gco:CharacterString',
      'identificationInfo.MD_DataIdentification.citation.CI_Citation.identifier.gco:CharacterString',
      'identificationInfo.MD_DataIdentification.citation.CI_Citation.title.gco:CharacterString',
      'fileIdentifier.gco:CharacterString'
    ]

    for (const path of idPaths) {
      const id = this.getNestedValue(metadata, path)
      if (id && typeof id === 'string') {
        // Extract ID from title if needed (e.g., "US1AK90M - Chart Name" -> "US1AK90M")
        const match = id.match(/^([A-Z0-9_]+)/)
        if (match) return match[1]
        return id.trim()
      }
    }

    // Fallback to generated ID
    return `ENC_${index.toString().padStart(4, '0')}`
  }

  /**
   * Extract chart title/name
   */
  extractTitle(metadata, index) {
    const titlePaths = [
      'identificationInfo.MD_DataIdentification.citation.CI_Citation.title.gco:CharacterString',
      'identificationInfo.MD_DataIdentification.citation.CI_Citation.alternateTitle.gco:CharacterString',
      'identificationInfo.MD_DataIdentification.citation.title.gco:CharacterString'
    ]

    for (const path of titlePaths) {
      const title = this.getNestedValue(metadata, path)
      if (title && typeof title === 'string') {
        return title.trim()
      }
    }

    return `ENC Chart ${index}`
  }

  /**
   * Extract chart abstract/description
   */
  extractAbstract(metadata) {
    const abstractPaths = [
      'identificationInfo.MD_DataIdentification.abstract.gco:CharacterString',
      'identificationInfo.MD_DataIdentification.abstract'
    ]

    for (const path of abstractPaths) {
      const abstract = this.getNestedValue(metadata, path)
      if (abstract && typeof abstract === 'string') {
        return abstract.trim()
      }
    }

    return null
  }

  /**
   * Extract geographic extent (bounding box)
   */
  extractGeographicExtent(metadata) {
    const result = {}
    
    // Try different paths for geographic extent
    const extentPaths = [
      'identificationInfo.MD_DataIdentification.extent.EX_Extent.geographicElement.EX_GeographicBoundingBox',
      'identificationInfo.MD_DataIdentification.extent.EX_Extent.geographicElement',
      'identificationInfo.MD_DataIdentification.extent'
    ]

    for (const basePath of extentPaths) {
      const extent = this.getNestedValue(metadata, basePath)
      if (extent && typeof extent === 'object') {
        
        // Handle array of geographic elements
        const bbox = Array.isArray(extent) ? extent.find(e => e.EX_GeographicBoundingBox) : extent
        const boundingBox = bbox?.EX_GeographicBoundingBox || bbox

        if (boundingBox) {
          // Extract individual bounds
          const bounds = {
            westBound: this.extractNumericValue(boundingBox, ['westBoundLongitude.gco:Decimal', 'westBoundLongitude']),
            eastBound: this.extractNumericValue(boundingBox, ['eastBoundLongitude.gco:Decimal', 'eastBoundLongitude']),
            southBound: this.extractNumericValue(boundingBox, ['southBoundLatitude.gco:Decimal', 'southBoundLatitude']),
            northBound: this.extractNumericValue(boundingBox, ['northBoundLatitude.gco:Decimal', 'northBoundLatitude'])
          }

          // Only return if we have at least one valid bound
          if (Object.values(bounds).some(v => v !== null)) {
            return bounds
          }
        }
      }
    }

    return { westBound: null, eastBound: null, southBound: null, northBound: null }
  }

  /**
   * Extract spatial resolution (scale) information
   */
  extractSpatialResolution(metadata) {
    const result = {}

    // Try different paths for spatial resolution
    const resolutionPaths = [
      'identificationInfo.MD_DataIdentification.spatialResolution.MD_Resolution.equivalentScale.MD_RepresentativeFraction.denominator.gco:Integer',
      'identificationInfo.MD_DataIdentification.spatialResolution.MD_Resolution.equivalentScale.MD_RepresentativeFraction.denominator',
      'identificationInfo.MD_DataIdentification.spatialResolution.equivalentScale.denominator.gco:Integer',
      'identificationInfo.MD_DataIdentification.spatialResolution.equivalentScale.denominator'
    ]

    for (const path of resolutionPaths) {
      const scale = this.extractNumericValue(metadata, [path])
      if (scale) {
        result.scaleDenominator = Math.floor(scale)
        break
      }
    }

    // Also look for distance-based resolution
    const distancePaths = [
      'identificationInfo.MD_DataIdentification.spatialResolution.MD_Resolution.distance.gco:Distance'
    ]

    for (const path of distancePaths) {
      const distance = this.getNestedValue(metadata, path)
      if (distance) {
        result.spatialResolution = distance
        break
      }
    }

    return result
  }

  /**
   * Extract chart type
   */
  extractChartType(metadata) {
    // Try to extract chart type from keywords or topic categories
    const keywordPaths = [
      'identificationInfo.MD_DataIdentification.descriptiveKeywords.MD_Keywords.keyword',
      'identificationInfo.MD_DataIdentification.topicCategory'
    ]

    for (const path of keywordPaths) {
      const keywords = this.getNestedValue(metadata, path)
      if (keywords) {
        const keywordList = Array.isArray(keywords) ? keywords : [keywords]
        for (const kw of keywordList) {
          const keyword = this.getNestedValue(kw, 'gco:CharacterString') || kw
          if (keyword && typeof keyword === 'string') {
            const lowerKw = keyword.toLowerCase()
            if (lowerKw.includes('harbor') || lowerKw.includes('harbour')) return 'Harbor'
            if (lowerKw.includes('approach')) return 'Approach'
            if (lowerKw.includes('coastal')) return 'Coastal'
            if (lowerKw.includes('general')) return 'General'
            if (lowerKw.includes('overview')) return 'Overview'
          }
        }
      }
    }

    // Fallback - will be determined from scale later
    return null
  }

  /**
   * Extract chart status
   */
  extractStatus(metadata) {
    const statusPaths = [
      'identificationInfo.MD_DataIdentification.status.MD_ProgressCode',
      'identificationInfo.MD_DataIdentification.status'
    ]

    for (const path of statusPaths) {
      const status = this.getNestedValue(metadata, path)
      if (status && typeof status === 'string') {
        return status.trim()
      }
    }

    return null
  }

  /**
   * Extract language information
   */
  extractLanguage(metadata) {
    const languagePaths = [
      'identificationInfo.MD_DataIdentification.language.gco:CharacterString',
      'identificationInfo.MD_DataIdentification.language',
      'language.gco:CharacterString',
      'language'
    ]

    for (const path of languagePaths) {
      const language = this.getNestedValue(metadata, path)
      if (language && typeof language === 'string') {
        return language.trim()
      }
    }

    return null
  }

  /**
   * Extract date information
   */
  extractDates(metadata) {
    const result = {}

    // Date stamp (last updated)
    const dateStampPaths = [
      'dateStamp.gco:DateTime',
      'dateStamp.gco:Date',
      'dateStamp'
    ]

    for (const path of dateStampPaths) {
      const dateStamp = this.getNestedValue(metadata, path)
      if (dateStamp) {
        result.dateStamp = this.parseDate(dateStamp)
        break
      }
    }

    // Publication and revision dates from citation
    const citationDates = this.getNestedValue(metadata, 'identificationInfo.MD_DataIdentification.citation.CI_Citation.date')
    if (citationDates) {
      const dates = Array.isArray(citationDates) ? citationDates : [citationDates]
      
      for (const dateObj of dates) {
        const date = dateObj.CI_Date || dateObj
        const dateType = this.getNestedValue(date, 'dateType.CI_DateTypeCode')
        const dateValue = this.getNestedValue(date, 'date.gco:Date') || this.getNestedValue(date, 'date.gco:DateTime')
        
        if (dateValue) {
          const parsedDate = this.parseDate(dateValue)
          if (dateType === 'publication') {
            result.publicationDate = parsedDate
          } else if (dateType === 'revision') {
            result.revisionDate = parsedDate
          }
        }
      }
    }

    return result
  }

  /**
   * Extract distribution/download information
   */
  extractDistributionInfo(metadata) {
    const result = {}

    // Try to extract download URL
    const distributionPaths = [
      'distributionInfo.MD_Distribution.transferOptions.MD_DigitalTransferOptions.onLine.CI_OnlineResource.linkage.URL',
      'distributionInfo.MD_Distribution.transferOptions.MD_DigitalTransferOptions.onLine.CI_OnlineResource.linkage',
      'distributionInfo.MD_Distribution.transferOptions'
    ]

    for (const path of distributionPaths) {
      const url = this.getNestedValue(metadata, path)
      if (url && typeof url === 'string' && url.includes('http')) {
        result.downloadUrl = url.trim()
        break
      }
    }

    // Extract format information
    const formatPaths = [
      'distributionInfo.MD_Distribution.distributionFormat.MD_Format.name.gco:CharacterString',
      'distributionInfo.MD_Distribution.distributionFormat.MD_Format.name'
    ]

    for (const path of formatPaths) {
      const format = this.getNestedValue(metadata, path)
      if (format && typeof format === 'string') {
        result.fileFormat = format.trim()
        break
      }
    }

    return result
  }

  /**
   * Extract keywords
   */
  extractKeywords(metadata) {
    const keywords = []
    
    const keywordPaths = [
      'identificationInfo.MD_DataIdentification.descriptiveKeywords.MD_Keywords.keyword'
    ]

    for (const path of keywordPaths) {
      const keywordData = this.getNestedValue(metadata, path)
      if (keywordData) {
        const keywordList = Array.isArray(keywordData) ? keywordData : [keywordData]
        for (const kw of keywordList) {
          const keyword = this.getNestedValue(kw, 'gco:CharacterString') || kw
          if (keyword && typeof keyword === 'string') {
            keywords.push(keyword.trim())
          }
        }
      }
    }

    return keywords
  }

  /**
   * Extract contact information
   */
  extractContactInfo(metadata) {
    const result = {}

    const contactPath = 'contact.CI_ResponsibleParty'
    const contact = this.getNestedValue(metadata, contactPath)
    
    if (contact) {
      result.organization = this.getNestedValue(contact, 'organisationName.gco:CharacterString') || 
                           this.getNestedValue(contact, 'organisationName')
      
      result.contactRole = this.getNestedValue(contact, 'role.CI_RoleCode') ||
                          this.getNestedValue(contact, 'role')
    }

    return result
  }

  /**
   * Extract data quality information
   */
  extractDataQuality(metadata) {
    const result = {}

    const qualityPath = 'dataQualityInfo.DQ_DataQuality'
    const quality = this.getNestedValue(metadata, qualityPath)

    if (quality) {
      // Extract lineage
      const lineage = this.getNestedValue(quality, 'lineage.DQ_Lineage.statement.gco:CharacterString') ||
                     this.getNestedValue(quality, 'lineage.statement.gco:CharacterString')
      if (lineage) {
        result.lineage = lineage.trim()
      }

      // Extract scope
      const scope = this.getNestedValue(quality, 'scope.DQ_Scope.level.MD_ScopeCode')
      if (scope) {
        result.dataQuality = scope
      }
    }

    return result
  }

  /**
   * Extract raw XML sample for debugging
   */
  extractRawXmlSample(metadata) {
    // Return a small sample of the metadata structure for debugging
    return {
      keys: Object.keys(metadata || {}),
      identificationInfo: metadata?.identificationInfo ? Object.keys(metadata.identificationInfo) : null,
      sample: metadata ? JSON.stringify(metadata).substring(0, 500) : null
    }
  }

  /**
   * Determine chart type from scale denominator
   */
  determineChartTypeFromScale(scale) {
    if (!scale || scale === 0) return 'General'
    
    if (scale <= 12000) return 'Harbor'
    if (scale <= 50000) return 'Approach'  
    if (scale <= 100000) return 'Coastal'
    if (scale <= 1000000) return 'General'
    return 'Overview'
  }

  /**
   * Parse date string to ISO format
   */
  parseDate(dateStr) {
    if (!dateStr) return null
    
    try {
      // Handle various date formats
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return null
      
      return date.toISOString().split('T')[0] // Return YYYY-MM-DD format
    } catch (error) {
      console.warn('[Parser] Failed to parse date:', dateStr)
      return null
    }
  }

  /**
   * Extract numeric value from multiple possible paths
   */
  extractNumericValue(obj, paths) {
    for (const path of paths) {
      const value = this.getNestedValue(obj, path)
      if (value !== null) {
        const num = parseFloat(value)
        if (!isNaN(num)) return num
      }
    }
    return null
  }

  /**
   * Get nested value from object using dot notation path
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return null
    
    try {
      const keys = path.split('.')
      let current = obj
      
      for (const key of keys) {
        if (current === null || current === undefined || typeof current !== 'object') {
          return null
        }
        
        // Handle special XML attributes and text nodes
        if (key === '#text' && current['#text']) {
          current = current['#text']
        } else if (current[key] !== undefined) {
          current = current[key]
        } else {
          return null
        }
      }
      
      // If final value has #text property, return that
      if (current && typeof current === 'object' && current['#text']) {
        return current['#text']
      }
      
      return current
    } catch (error) {
      return null
    }
  }
}

export default new ENCParserService()