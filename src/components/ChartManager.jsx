import { useState, useEffect } from 'react'
import RegionSelector from './RegionSelector'
import { fetchENCCatalogue } from '../services/encCatalogueService'

function ChartManager() {
  const [currentView, setCurrentView] = useState('main') // 'main' or 'regionSelector'
  const [selectedChartType, setSelectedChartType] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState({})
  const [storageUsed, setStorageUsed] = useState('2.1 GB')
  const [storageTotal] = useState('32 GB')
  const [encCatalogue, setEncCatalogue] = useState(null)
  const [catalogueLoading, setCatalogueLoading] = useState(false)

  // NOAA Chart Types
  const chartTypes = [
    {
      id: 'noaa-enc',
      name: 'NOAA ENC (Vector Tiles)',
      description: 'Electronic Navigational Charts in vector tile format',
      format: 'Vector Tiles'
    }
  ]

  // Fetch ENC catalogue when component mounts
  useEffect(() => {
    let isMounted = true
    
    const loadENCCatalogue = async () => {
      try {
        if (!isMounted) return
        setCatalogueLoading(true)
        console.log('Chart Manager: Starting ENC catalogue fetch...')
        
        const catalogue = await fetchENCCatalogue()
        
        if (!isMounted) return
        setEncCatalogue(catalogue)
        console.log('Chart Manager: ENC catalogue has been parsed successfully')
        
      } catch (error) {
        if (!isMounted) return
        console.error('Chart Manager: Failed to load ENC catalogue:', error)
      } finally {
        if (isMounted) {
          setCatalogueLoading(false)
        }
      }
    }
    
    loadENCCatalogue()
    
    return () => {
      isMounted = false
    }
  }, [])

  const getStatusIcon = (status) => {
    switch (status) {
      case 'downloaded':
        return <div className="w-3 h-3 bg-green-500 rounded-full"></div>
      case 'partial':
        return <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
      case 'downloading':
        return <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
      case 'available':
        return <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
      default:
        return <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
    }
  }

  const getStatusText = (status, regionsDownloaded, totalRegions) => {
    switch (status) {
      case 'downloaded':
        return 'Fully Downloaded'
      case 'partial':
        return `${regionsDownloaded}/${totalRegions} Regions`
      case 'downloading':
        return 'Downloading'
      case 'available':
        return 'Not Downloaded'
      default:
        return 'Unknown'
    }
  }

  const handleSelectRegions = (chartType) => {
    setSelectedChartType(chartType)
    setCurrentView('regionSelector')
  }

  const handleRegionsSelected = (regions) => {
    console.log('Selected regions for download:', regions)
    // TODO: Start download for selected regions
    setCurrentView('main')
  }

  const handleBackToMain = () => {
    setCurrentView('main')
    setSelectedChartType(null)
  }

  const handleUpdate = (chartType) => {
    console.log('Updating chart type:', chartType.id)
    // TODO: Implement update logic
  }

  if (currentView === 'regionSelector') {
    return (
      <RegionSelector
        chartType={selectedChartType}
        onBack={handleBackToMain}
        onSelectRegion={handleRegionsSelected}
        encCatalogue={encCatalogue}
        catalogueLoading={catalogueLoading}
      />
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          NOAA Chart Manager
        </h2>
        <p className="text-slate-600 dark:text-slate-300">
          Download and manage NOAA nautical charts for offline navigation
        </p>
      </div>

      {/* Storage Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 p-6 mb-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Storage Overview
        </h3>
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-600 dark:text-slate-300">Used Space</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {storageUsed} / {storageTotal}
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
          <div 
            className="bg-marine-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${(parseFloat(storageUsed) / parseFloat(storageTotal)) * 100}%` }}
          ></div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {((parseFloat(storageTotal) - parseFloat(storageUsed))).toFixed(1)} GB available for charts
        </p>
      </div>

      {/* Chart Types */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 p-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">
          Chart Types
        </h3>
        
        <div className="space-y-6">
          {chartTypes.map((chartType) => (
            <div 
              key={chartType.id}
              className="border border-slate-200 dark:border-slate-600 rounded-lg p-6 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="mb-3">
                    <h4 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                      {chartType.name}
                    </h4>
                    <p className="text-slate-600 dark:text-slate-300">
                      {chartType.description}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Format: </span>
                      <span className="text-slate-700 dark:text-slate-200 font-medium">{chartType.format}</span>
                    </div>
                  </div>

                </div>

                <div className="flex flex-col space-y-3 ml-6 min-w-[180px]">
                  <button
                    onClick={() => handleSelectRegions(chartType)}
                    className="bg-marine-600 hover:bg-marine-700 text-white px-4 py-3 rounded-lg font-medium transition-colors touch-manipulation"
                  >
                    Select Regions
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Download Options */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 p-6 mt-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Download Options
        </h3>
        
        <div className="space-y-4">
          <label className="flex items-center space-x-3">
            <input 
              type="checkbox" 
              defaultChecked 
              className="w-4 h-4 text-marine-600 bg-gray-100 border-gray-300 rounded focus:ring-marine-500 dark:focus:ring-marine-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-slate-700 dark:text-slate-200">
              Download high-resolution charts (larger file size)
            </span>
          </label>
          
          <label className="flex items-center space-x-3">
            <input 
              type="checkbox" 
              defaultChecked 
              className="w-4 h-4 text-marine-600 bg-gray-100 border-gray-300 rounded focus:ring-marine-500 dark:focus:ring-marine-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-slate-700 dark:text-slate-200">
              Auto-update charts weekly
            </span>
          </label>
          
          <label className="flex items-center space-x-3">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-marine-600 bg-gray-100 border-gray-300 rounded focus:ring-marine-500 dark:focus:ring-marine-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-slate-700 dark:text-slate-200">
              Download over WiFi only
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}

export default ChartManager