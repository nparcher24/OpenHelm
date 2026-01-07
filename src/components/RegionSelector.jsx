import { useState, useEffect, useMemo, useRef } from 'react'
import { fetchChartsDownloadStatus } from '../services/encCatalogueService.js'

// Coast Guard District mapping for user-friendly names
const COAST_GUARD_DISTRICTS = {
  '1': 'New England',
  '5': 'Mid-Atlantic', 
  '7': 'Southeast',
  '8': 'Gulf Coast & Inland',
  '9': 'Great Lakes',
  '11': 'Pacific Southwest', 
  '13': 'Pacific Northwest',
  '14': 'Pacific Islands',
  '17': 'Alaska'
}

function RegionSelector({ chartType, onBack, onSelectRegion, encCatalogue, catalogueLoading, catalogueUpdateStatus }) {
  const [selectedRegions, setSelectedRegions] = useState(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [regions, setRegions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [filterBy, setFilterBy] = useState('all')
  const [filterCoastGuardDistrict, setFilterCoastGuardDistrict] = useState('all')
  const [downloadStatus, setDownloadStatus] = useState(new Map())
  const [downloadStatusLoading, setDownloadStatusLoading] = useState(false)
  const fetchingDownloadStatus = useRef(false)
  
  // Virtualization state
  const [scrollTop, setScrollTop] = useState(0)
  const ROW_HEIGHT = 65 // Height of each table row in pixels
  const BUFFER_SIZE = 10 // Extra rows to render above and below visible area
  const VISIBLE_ROWS = Math.ceil(600 / ROW_HEIGHT) // Assuming ~600px viewport height

  // Process passed ENC catalogue data when it becomes available
  useEffect(() => {
    if (catalogueLoading || !encCatalogue) {
      setLoading(catalogueLoading || true)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      console.log('Processing passed ENC catalogue data for', chartType?.name)
      
      // Convert ENC chart data to region format - using real database data
      const convertedRegions = encCatalogue.map(chart => ({
        id: chart.id,
        name: chart.name,
        charts: [chart.id],
        chartType: chart.chartType, // Already determined in service
        scale: chart.scaleText,
        size: chart.fileSize, // Real file size from database
        bounds: chart.bounds,
        center: chart.center,
        publicationDate: chart.publicationDate,
        revisionDate: chart.revisionDate,
        downloadUrl: chart.downloadUrl,
        edition: chart.edition,
        organization: chart.organization,
        coastGuardDistrict: chart.coastGuardDistrict
      }))
      
      setRegions(convertedRegions)
      console.log(`Processed ${convertedRegions.length} NOAA ENC charts from cached data`)
      
      // Debug: Log sample of converted data to verify real geographic data is being used
      if (convertedRegions.length > 0) {
        const sample = convertedRegions.slice(0, 5)
        console.log('Sample converted charts:', sample.map(c => ({
          id: c.id,
          name: c.name,
          area: c.area,
          state: c.state,
          size: c.size,
          scale: c.scale,
          center: c.center
        })))
      }
      
    } catch (err) {
      console.error('Failed to process ENC charts:', err)
      setError(`Failed to process ENC chart data: ${err.message}`)
      setRegions([])
    } finally {
      setLoading(false)
    }
  }, [encCatalogue, catalogueLoading, chartType])

  // Fetch download status when ENC catalogue is loaded (only once)
  useEffect(() => {
    if (encCatalogue && encCatalogue.length > 0 && !fetchingDownloadStatus.current && downloadStatus.size === 0) {
      fetchingDownloadStatus.current = true
      setDownloadStatusLoading(true)
      
      console.log('Fetching download status for', encCatalogue.length, 'charts - FIRST TIME ONLY')
      
      fetchChartsDownloadStatus()
        .then(statusMap => {
          setDownloadStatus(statusMap)
          console.log('Download status loaded for', statusMap.size, 'charts')
        })
        .catch(error => {
          console.error('Failed to fetch download status:', error)
          setError(`Failed to load download status: ${error.message}`)
        })
        .finally(() => {
          setDownloadStatusLoading(false)
          fetchingDownloadStatus.current = false
        })
    }
  }, [encCatalogue, downloadStatus.size])

  // Helper function to get chart type from scale
  const getChartTypeFromScale = (scale) => {
    if (!scale || scale === 0) return 'General'  // Default to General instead of Unknown
    
    if (scale <= 12000) return 'Harbor'
    if (scale <= 50000) return 'Approach'  
    if (scale <= 100000) return 'Coastal'
    if (scale <= 1000000) return 'General'
    return 'Overview'
  }

  // Helper function to render download status badge
  const renderDownloadStatusBadge = (chartId) => {
    const status = downloadStatus.get(chartId)

    if (!status || downloadStatusLoading) {
      return (
        <div className="flex items-center">
          <div className="w-2 h-2 bg-terminal-border rounded-full animate-pulse mr-2"></div>
          <span className="text-xs text-terminal-green-dim font-mono">[..]</span>
        </div>
      )
    }

    switch (status.status) {
      case 'downloaded':
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-terminal-green rounded-full mr-2 shadow-glow-green-sm"></div>
            <span className="text-xs text-terminal-green font-mono">[OK]</span>
          </div>
        )
      case 'update_available':
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-terminal-amber rounded-full mr-2"></div>
            <span className="text-xs text-terminal-amber font-mono">[UPD]</span>
          </div>
        )
      case 'not_downloaded':
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-terminal-green-dim rounded-full mr-2"></div>
            <span className="text-xs text-terminal-green-dim font-mono">[--]</span>
          </div>
        )
      case 'unknown':
      default:
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-terminal-border rounded-full mr-2"></div>
            <span className="text-xs text-terminal-green-dim font-mono">[??]</span>
          </div>
        )
    }
  }


  // Get unique Coast Guard Districts for filter dropdown
  const availableDistricts = useMemo(() => {
    const districts = regions
      .map(region => region.coastGuardDistrict)
      .filter(district => district && district !== '')
      .map(district => district.toString())
    return [...new Set(districts)].sort((a, b) => parseInt(a) - parseInt(b))
  }, [regions])

  // Enhanced filtering and sorting with memoization for performance
  const filteredAndSortedRegions = useMemo(() => {
    return regions
      .filter(region => {
        // Text search
        const matchesSearch = searchTerm === '' || 
          region.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          region.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          region.chartType.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (region.coastGuardDistrict && region.coastGuardDistrict.toString().includes(searchTerm.toLowerCase()))

        // Type filter
        const matchesFilter = filterBy === 'all' || 
          region.chartType.toLowerCase() === filterBy.toLowerCase()

        // Coast Guard District filter
        const matchesDistrictFilter = filterCoastGuardDistrict === 'all' ||
          (region.coastGuardDistrict && region.coastGuardDistrict.toString() === filterCoastGuardDistrict)

        return matchesSearch && matchesFilter && matchesDistrictFilter
      })
      .sort((a, b) => {
        let aVal = a[sortBy]
        let bVal = b[sortBy]

        // Handle special cases
        if (sortBy === 'scale') {
          aVal = a.scale || 999999
          bVal = b.scale || 999999
        } else if (sortBy === 'size') {
          // Convert size strings to numbers for comparison
          const aSize = parseFloat(a.size?.replace(/[^\d.-]/g, '')) || 0
          const bSize = parseFloat(b.size?.replace(/[^\d.-]/g, '')) || 0
          aVal = aSize
          bVal = bSize
        } else if (sortBy === 'downloadStatus') {
          // Sort by download status priority
          const statusPriority = {
            'update_available': 1,
            'not_downloaded': 2,
            'downloaded': 3,
            'unknown': 4
          }
          const aStatus = downloadStatus.get(a.id)?.status || 'unknown'
          const bStatus = downloadStatus.get(b.id)?.status || 'unknown'
          aVal = statusPriority[aStatus] || 4
          bVal = statusPriority[bStatus] || 4
        }

        // String comparison
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }

        // Numeric comparison
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      })
  }, [regions, searchTerm, filterBy, filterCoastGuardDistrict, sortBy, sortDirection, downloadStatus])

  // Calculate visible items for virtualization
  const totalItems = filteredAndSortedRegions.length
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_SIZE)
  const endIndex = Math.min(totalItems - 1, startIndex + VISIBLE_ROWS + (BUFFER_SIZE * 2))
  const visibleItems = filteredAndSortedRegions.slice(startIndex, endIndex + 1)
  
  // Handle scroll events for virtualization
  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop)
  }

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDirection('asc')
    }
  }

  const handleRegionToggle = (regionId) => {
    const newSelected = new Set(selectedRegions)
    if (newSelected.has(regionId)) {
      newSelected.delete(regionId)
    } else {
      newSelected.add(regionId)
    }
    setSelectedRegions(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedRegions.size === filteredAndSortedRegions.length) {
      setSelectedRegions(new Set())
    } else {
      setSelectedRegions(new Set(filteredAndSortedRegions.map(r => r.id)))
    }
  }

  const handleConfirmSelection = () => {
    const selected = regions.filter(r => selectedRegions.has(r.id))
    onSelectRegion(selected)
  }

  const totalSize = regions
    .filter(r => selectedRegions.has(r.id))
    .reduce((total, r) => total + (r.size || 0), 0)
    .toFixed(1)

  // Loading state
  if (loading || catalogueLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto bg-terminal-bg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-terminal-green hover:text-terminal-green-bright mb-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Chart Manager</span>
            </button>
            <h2 className="text-3xl font-bold text-terminal-green text-glow uppercase tracking-wider">
              Loading ENC Charts - {chartType?.name}
            </h2>
          </div>
        </div>

        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-terminal-green border-t-transparent rounded-full animate-spin mx-auto shadow-glow-green"></div>
            <p className="text-terminal-green">
              Loading Electronic Navigational Charts...
            </p>
            <p className="text-sm text-terminal-green-dim font-mono">
              {catalogueLoading ? 'Fetching catalogue from local API server' : 'Processing chart data'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto bg-terminal-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-terminal-green hover:text-terminal-green-bright mb-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Chart Manager</span>
          </button>
          <h2 className="text-3xl font-bold text-terminal-green text-glow uppercase tracking-wider">
            ENC Charts - {chartType?.name}
          </h2>
          <p className="text-terminal-green-dim">
            Select Electronic Navigational Charts for {chartType?.description}
          </p>
          {error && (
            <p className="text-terminal-amber text-sm mt-2 font-mono">
              [!] {error}
            </p>
          )}
        </div>
      </div>

      {/* Catalogue Update Status */}
      {catalogueUpdateStatus && (
        <div className="bg-terminal-cyan/10 border border-terminal-cyan/50 rounded-xl p-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin"></div>
            <div>
              <h4 className="font-medium text-terminal-cyan">
                Updating Chart Database
              </h4>
              <p className="text-sm text-terminal-green-dim font-mono">
                {catalogueUpdateStatus}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search and Controls */}
      <div className="bg-terminal-surface rounded-xl border border-terminal-border p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-terminal-green mb-2 uppercase tracking-wide">Search Charts</label>
            <input
              type="text"
              placeholder="Search by name, ID, or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-green placeholder-terminal-green-dim focus:ring-2 focus:ring-terminal-green focus:border-terminal-green font-mono"
            />
          </div>

          {/* Filter by Type */}
          <div>
            <label className="block text-sm font-medium text-terminal-green mb-2 uppercase tracking-wide">Chart Type</label>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="w-full px-4 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-green focus:ring-2 focus:ring-terminal-green focus:border-terminal-green font-mono"
            >
              <option value="all">All Types</option>
              <option value="harbor">Harbor</option>
              <option value="approach">Approach</option>
              <option value="coastal">Coastal</option>
              <option value="general">General</option>
              <option value="overview">Overview</option>
            </select>
          </div>

          {/* Filter by Coast Guard District */}
          <div>
            <label className="block text-sm font-medium text-terminal-green mb-2 uppercase tracking-wide">Coast Guard District</label>
            <select
              value={filterCoastGuardDistrict}
              onChange={(e) => setFilterCoastGuardDistrict(e.target.value)}
              className="w-full px-4 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-green focus:ring-2 focus:ring-terminal-green focus:border-terminal-green font-mono"
            >
              <option value="all">All Districts</option>
              {availableDistricts.map(district => (
                <option key={district} value={district}>
                  District {district} - {COAST_GUARD_DISTRICTS[district] || 'Unknown'}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-end space-x-4">
            <button
              onClick={handleSelectAll}
              className="terminal-btn"
            >
              {selectedRegions.size === filteredAndSortedRegions.length ? 'Deselect All' : 'Select All'}
            </button>
            <div className="text-sm text-terminal-green-dim font-mono">
              {selectedRegions.size} selected / {filteredAndSortedRegions.length} total
              <div className="text-xs text-terminal-green-dim">
                Rendering {visibleItems.length} rows (virtualized)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Virtualized Chart Table */}
      <div className="bg-terminal-surface rounded-xl border border-terminal-border overflow-hidden mb-6">
        {/* Table Header */}
        <div className="bg-terminal-bg border-b border-terminal-border">
          <div className="grid grid-cols-[auto_1fr_100px_80px_100px_120px_120px] gap-4 px-4 py-3 text-sm font-medium text-terminal-green uppercase tracking-wide">
            <div>
              <input
                type="checkbox"
                checked={selectedRegions.size === filteredAndSortedRegions.length && filteredAndSortedRegions.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 accent-terminal-green bg-terminal-bg border-terminal-border rounded"
              />
            </div>
            <div>
              <button
                onClick={() => handleSort('name')}
                className="flex items-center space-x-1 hover:text-terminal-green-bright"
              >
                <span>Chart Name</span>
                {sortBy === 'name' && (
                  <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            <div>
              <button
                onClick={() => handleSort('chartType')}
                className="flex items-center space-x-1 hover:text-terminal-green-bright"
              >
                <span>Type</span>
                {sortBy === 'chartType' && (
                  <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            <div>
              <button
                onClick={() => handleSort('coastGuardDistrict')}
                className="flex items-center space-x-1 hover:text-terminal-green-bright"
                title="Coast Guard District - Maritime regions for chart organization"
              >
                <span>Region</span>
                {sortBy === 'coastGuardDistrict' && (
                  <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            <div>
              <button
                onClick={() => handleSort('scale')}
                className="flex items-center space-x-1 hover:text-terminal-green-bright"
              >
                <span>Scale</span>
                {sortBy === 'scale' && (
                  <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            <div>
              <button
                onClick={() => handleSort('publicationDate')}
                className="flex items-center space-x-1 hover:text-terminal-green-bright"
              >
                <span>Pub. Date</span>
                {sortBy === 'publicationDate' && (
                  <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            <div>
              <button
                onClick={() => handleSort('downloadStatus')}
                className="flex items-center space-x-1 hover:text-terminal-green-bright"
              >
                <span>Status</span>
                {sortBy === 'downloadStatus' && (
                  <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Virtualized Table Body */}
        <div 
          className="overflow-y-auto"
          style={{ height: '500px' }}
          onScroll={handleScroll}
        >
          {/* Virtual spacer before visible items */}
          <div style={{ height: startIndex * ROW_HEIGHT }}></div>
          
          {/* Visible rows */}
          <div>
            {visibleItems.map((region, index) => {
              const actualIndex = startIndex + index
              return (
                <div
                  key={region.id}
                  className={`grid grid-cols-[auto_1fr_100px_80px_100px_120px_120px] gap-4 px-4 py-3 border-b border-terminal-border cursor-pointer transition-colors hover:bg-terminal-green/5 ${
                    selectedRegions.has(region.id)
                      ? 'bg-terminal-green/10'
                      : ''
                  }`}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => handleRegionToggle(region.id)}
                >
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedRegions.has(region.id)}
                      onChange={() => handleRegionToggle(region.id)}
                      className="w-4 h-4 accent-terminal-green bg-terminal-bg border-terminal-border rounded"
                    />
                  </div>
                  <div className="flex flex-col justify-center min-w-0">
                    <div className="font-medium text-terminal-green truncate">
                      {region.name}
                    </div>
                    <div className="text-xs text-terminal-green-dim truncate font-mono">
                      ID: {region.id}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded truncate border ${
                      region.chartType === 'Harbor' ? 'bg-terminal-cyan/10 text-terminal-cyan border-terminal-cyan/30' :
                      region.chartType === 'Approach' ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/30' :
                      region.chartType === 'Coastal' ? 'bg-terminal-amber/10 text-terminal-amber border-terminal-amber/30' :
                      region.chartType === 'General' ? 'bg-terminal-green/10 text-terminal-green-dim border-terminal-green/30' :
                      'bg-terminal-border text-terminal-green-dim border-terminal-border'
                    }`}>
                      {region.chartType}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-terminal-green font-mono">
                        {region.coastGuardDistrict || '-'}
                      </span>
                      {region.coastGuardDistrict && (
                        <span className="text-xs text-terminal-green-dim truncate">
                          {COAST_GUARD_DISTRICTS[region.coastGuardDistrict]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm text-terminal-green-dim truncate font-mono">
                      {region.scale || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm text-terminal-green-dim truncate font-mono">
                      {region.publicationDate || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center">
                    {renderDownloadStatusBadge(region.id)}
                  </div>
                </div>
              )
            })}
          </div>
          
          {/* Virtual spacer after visible items */}
          <div style={{ height: (totalItems - endIndex - 1) * ROW_HEIGHT }}></div>
        </div>
      </div>

      {filteredAndSortedRegions.length === 0 && (
        <div className="text-center py-12">
          <div className="text-terminal-green-dim mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-terminal-green mb-1">
            No charts found
          </h3>
          <p className="text-terminal-green-dim font-mono">
            Try adjusting your search terms or filters
          </p>
        </div>
      )}

      {/* Action Bar */}
      {selectedRegions.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-terminal-surface border-t border-terminal-green p-4 shadow-glow-green">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="text-terminal-green font-mono">
              <span className="font-semibold">{selectedRegions.size} regions selected</span>
              <span className="text-terminal-green-dim ml-2">({totalSize} MB total)</span>
            </div>
            <button
              onClick={handleConfirmSelection}
              className="terminal-btn-primary"
            >
              Confirm Selection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RegionSelector