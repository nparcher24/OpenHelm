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
          <div className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-pulse mr-2"></div>
          <span className="text-xs text-slate-400">Loading...</span>
        </div>
      )
    }

    switch (status.status) {
      case 'downloaded':
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            <span className="text-xs text-green-600 dark:text-green-400">Downloaded</span>
          </div>
        )
      case 'update_available':
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
            <span className="text-xs text-yellow-600 dark:text-yellow-400">Update Available</span>
          </div>
        )
      case 'not_downloaded':
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-slate-400 rounded-full mr-2"></div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Not Downloaded</span>
          </div>
        )
      case 'unknown':
      default:
        return (
          <div className="flex items-center">
            <div className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full mr-2"></div>
            <span className="text-xs text-slate-400">Unknown</span>
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
      <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-marine-600 dark:text-marine-400 hover:text-marine-700 dark:hover:text-marine-300 mb-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Chart Manager</span>
            </button>
            <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              Loading ENC Charts - {chartType?.name}
            </h2>
          </div>
        </div>
        
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-marine-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-600 dark:text-slate-300">
              Loading Electronic Navigational Charts...
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {catalogueLoading ? 'Fetching catalogue from local API server' : 'Processing chart data'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-marine-600 dark:text-marine-400 hover:text-marine-700 dark:hover:text-marine-300 mb-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Chart Manager</span>
          </button>
          <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
            ENC Charts - {chartType?.name}
          </h2>
          <p className="text-slate-600 dark:text-slate-300">
            Select Electronic Navigational Charts for {chartType?.description}
          </p>
          {error && (
            <p className="text-yellow-600 dark:text-yellow-400 text-sm mt-2">
              ⚠️ {error}
            </p>
          )}
        </div>
      </div>

      {/* Catalogue Update Status */}
      {catalogueUpdateStatus && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl p-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div>
              <h4 className="font-medium text-blue-800 dark:text-blue-200">
                Updating Chart Database
              </h4>
              <p className="text-sm text-blue-600 dark:text-blue-300">
                {catalogueUpdateStatus}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search and Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Search Charts</label>
            <input
              type="text"
              placeholder="Search by name, ID, or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-marine-500 focus:border-marine-500"
            />
          </div>

          {/* Filter by Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chart Type</label>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-marine-500 focus:border-marine-500"
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Coast Guard District</label>
            <select
              value={filterCoastGuardDistrict}
              onChange={(e) => setFilterCoastGuardDistrict(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-marine-500 focus:border-marine-500"
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
              className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors touch-manipulation"
            >
              {selectedRegions.size === filteredAndSortedRegions.length ? 'Deselect All' : 'Select All'}
            </button>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {selectedRegions.size} selected / {filteredAndSortedRegions.length} total
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Rendering {visibleItems.length} rows (virtualized)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Virtualized Chart Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden mb-6">
        {/* Table Header */}
        <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-[auto_1fr_100px_80px_100px_120px_120px] gap-4 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            <div>
              <input
                type="checkbox"
                checked={selectedRegions.size === filteredAndSortedRegions.length && filteredAndSortedRegions.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 text-marine-600 bg-gray-100 border-gray-300 rounded focus:ring-marine-500"
              />
            </div>
            <div>
              <button
                onClick={() => handleSort('name')}
                className="flex items-center space-x-1 hover:text-marine-600 dark:hover:text-marine-400"
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
                className="flex items-center space-x-1 hover:text-marine-600 dark:hover:text-marine-400"
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
                className="flex items-center space-x-1 hover:text-marine-600 dark:hover:text-marine-400"
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
                className="flex items-center space-x-1 hover:text-marine-600 dark:hover:text-marine-400"
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
                className="flex items-center space-x-1 hover:text-marine-600 dark:hover:text-marine-400"
              >
                <span>Publication Date</span>
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
                className="flex items-center space-x-1 hover:text-marine-600 dark:hover:text-marine-400"
              >
                <span>Download Status</span>
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
                  className={`grid grid-cols-[auto_1fr_100px_80px_100px_120px_120px] gap-4 px-4 py-3 border-b border-slate-200 dark:border-slate-700 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50 ${
                    selectedRegions.has(region.id)
                      ? 'bg-marine-50 dark:bg-marine-900/30'
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
                      className="w-4 h-4 text-marine-600 bg-gray-100 border-gray-300 rounded focus:ring-marine-500"
                    />
                  </div>
                  <div className="flex flex-col justify-center min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {region.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      ID: {region.id}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full truncate ${
                      region.chartType === 'Harbor' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      region.chartType === 'Approach' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      region.chartType === 'Coastal' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      region.chartType === 'General' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                    }`}>
                      {region.chartType}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {region.coastGuardDistrict || '-'}
                      </span>
                      {region.coastGuardDistrict && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {COAST_GUARD_DISTRICTS[region.coastGuardDistrict]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                      {region.scale || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
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
          <div className="text-slate-400 dark:text-slate-500 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
            No charts found
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            Try adjusting your search terms or filters
          </p>
        </div>
      )}

      {/* Action Bar */}
      {selectedRegions.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-600 p-4 shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="text-slate-700 dark:text-slate-200">
              <span className="font-semibold">{selectedRegions.size} regions selected</span>
              <span className="text-slate-500 dark:text-slate-400 ml-2">({totalSize} MB total)</span>
            </div>
            <button
              onClick={handleConfirmSelection}
              className="bg-marine-600 hover:bg-marine-700 text-white px-6 py-3 rounded-lg font-medium transition-colors touch-manipulation"
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