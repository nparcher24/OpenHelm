/**
 * Simple ENC Parser - Focused on the 36 fields we identified
 */

class ENCSimpleParser {
  
  /**
   * Parse ENC dataset to extract the proven 36 metadata fields
   */
  parseChartMetadata(dataset, index) {
    try {
      if (!dataset.has || !dataset.has.MD_Metadata) {
        console.log(`[Simple Parser] Dataset ${index}: No metadata found`)
        return null
      }

      const metadata = dataset.has.MD_Metadata
      const chartData = {}

      // IDENTIFICATION FIELDS (18 fields)
      chartData.chart_id = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.citation.CI_Citation.title.gco:CharacterString')
      chartData.chart_name = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.citation.CI_Citation.alternateTitle.gco:CharacterString')
      chartData.edition = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.citation.CI_Citation.edition.gco:CharacterString')
      chartData.publication_date = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.citation.CI_Citation.date[0].CI_Date.date.gco:Date')
      chartData.status = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.status.MD_ProgressCode.codeListValue')
      chartData.maintenance_frequency = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.resourceMaintenance.MD_MaintenanceInformation.maintenanceAndUpdateFrequency.MD_MaintenanceFrequencyCode.codeListValue')
      chartData.language = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.language.gco:CharacterString')
      chartData.scale_denominator = this.extractNumeric(metadata, 'identificationInfo.MD_DataIdentification.spatialResolution.MD_Resolution.equivalentScale.MD_RepresentativeFraction.denominator.gco:Integer')
      chartData.panel_info = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.extent.EX_Extent.description.gco:CharacterString')
      
      // Extract coast guard district from keywords
      const keywords = this.extractValue(metadata, 'identificationInfo.MD_DataIdentification.descriptiveKeywords.MD_Keywords.keyword[0].gco:CharacterString')
      if (keywords && keywords.includes('coast guard district:')) {
        chartData.coast_guard_district = keywords.replace('coast guard district:', '').trim()
      }

      // TEMPORAL FIELDS (1 field)
      chartData.last_updated = this.extractValue(metadata, 'dateStamp.gco:DateTime')

      // DISTRIBUTION FIELDS (4 fields)
      chartData.file_size_mb = this.extractNumeric(metadata, 'distributionInfo.MD_Distribution.transferOptions.MD_DigitalTransferOptions.transferSize.gco:Real')
      chartData.download_url = this.extractValue(metadata, 'distributionInfo.MD_Distribution.transferOptions.MD_DigitalTransferOptions.onLine.CI_OnlineResource.linkage.URL')
      const zipDesc = this.extractValue(metadata, 'distributionInfo.MD_Distribution.transferOptions.MD_DigitalTransferOptions.onLine.CI_OnlineResource.description.gco:CharacterString')
      if (zipDesc && zipDesc.includes('zipfile date and time:')) {
        chartData.zip_created = zipDesc.replace('zipfile date and time:', '').trim()
      }

      // QUALITY FIELDS (4 fields)
      chartData.data_source = this.extractValue(metadata, 'dataQualityInfo.DQ_DataQuality.lineage.LI_Lineage.source.LI_Source.description.gco:CharacterString')

      // CONTACT FIELDS (4 fields)
      chartData.organization = this.extractValue(metadata, 'contact.CI_ResponsibleParty.organisationName.gco:CharacterString')

      // OTHER FIELDS (5 fields) - mostly structural, not critical for navigation

      // GEOGRAPHIC BOUNDS - Try to extract if available
      // These might be in different locations in the XML structure
      const extentInfo = metadata?.identificationInfo?.MD_DataIdentification?.extent
      if (extentInfo) {
        chartData.bounds_north = this.extractGeographicBound(extentInfo, 'northBoundLatitude')
        chartData.bounds_south = this.extractGeographicBound(extentInfo, 'southBoundLatitude')
        chartData.bounds_east = this.extractGeographicBound(extentInfo, 'eastBoundLongitude')
        chartData.bounds_west = this.extractGeographicBound(extentInfo, 'westBoundLongitude')
      }

      // Clean up chart_id if it looks like a chart number
      if (chartData.chart_id && chartData.chart_id.match(/^[A-Z0-9_]+$/)) {
        // Use chart_id as-is (e.g., "US1AK90M")
      } else {
        // Fallback to generated ID
        chartData.chart_id = `ENC_${index.toString().padStart(4, '0')}`
      }

      // Use chart_name if available, otherwise use chart_id
      if (!chartData.chart_name && chartData.chart_id) {
        chartData.chart_name = chartData.chart_id
      }

      console.log(`[Simple Parser] Parsed chart: ${chartData.chart_id} - ${chartData.chart_name}`)
      return chartData

    } catch (error) {
      console.error(`[Simple Parser] Error parsing dataset ${index}:`, error.message)
      return null
    }
  }

  /**
   * Extract simple value from nested object path
   */
  extractValue(obj, path) {
    try {
      const keys = path.split('.')
      let current = obj
      
      for (const key of keys) {
        if (key.includes('[') && key.includes(']')) {
          // Handle array access like "date[0]"
          const [arrayKey, indexStr] = key.split('[')
          const index = parseInt(indexStr.replace(']', ''))
          current = current[arrayKey]
          if (Array.isArray(current) && current.length > index) {
            current = current[index]
          } else {
            return null
          }
        } else {
          current = current?.[key]
        }
        
        if (current === null || current === undefined) {
          return null
        }
      }
      
      return typeof current === 'string' ? current.trim() : current
    } catch (error) {
      return null
    }
  }

  /**
   * Extract numeric value
   */
  extractNumeric(obj, path) {
    const value = this.extractValue(obj, path)
    if (value === null || value === undefined) return null
    
    const num = parseFloat(value)
    return isNaN(num) ? null : num
  }

  /**
   * Extract geographic bounds from extent structure
   */
  extractGeographicBound(extentInfo, boundType) {
    try {
      // Try different possible structures for geographic bounds
      const geoElement = extentInfo?.EX_Extent?.geographicElement
      
      if (geoElement) {
        // Handle array of geographic elements
        const elements = Array.isArray(geoElement) ? geoElement : [geoElement]
        
        for (const element of elements) {
          const bbox = element?.EX_GeographicBoundingBox
          if (bbox) {
            const bound = bbox[boundType]
            if (bound) {
              // Try different value formats
              const value = bound['gco:Decimal'] || bound['gco:Real'] || bound
              const num = parseFloat(value)
              return isNaN(num) ? null : num
            }
          }
        }
      }
      
      return null
    } catch (error) {
      return null
    }
  }
}

export default new ENCSimpleParser()