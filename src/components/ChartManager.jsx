import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { logInfo } from '../utils/logger'

function ChartManager() {
  const navigate = useNavigate()
  const [hasInitialized, setHasInitialized] = useState(false)

  // NOAA Chart Types - Only BlueTopo now
  const chartTypes = [
    {
      id: 'bluetopo',
      name: 'NOAA BlueTopo',
      description: 'High-resolution bathymetric topography (2m-16m resolution)',
      format: 'GeoTIFF Tiles'
    }
  ]

  // Simple initialization - ENC catalogue removed
  useEffect(() => {
    logInfo('[ChartManager] Component mounted')
    setHasInitialized(true)

    return () => {
      logInfo('[ChartManager] Component unmounting')
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

  return (
    <div className="relative h-full">

      <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          NOAA Chart Manager
        </h2>
        <p className="text-slate-600 dark:text-slate-300">
          Download and manage NOAA nautical charts for offline navigation
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
                    onClick={() => navigate('/bluetopo-downloader')}
                    className="bg-marine-600 hover:bg-marine-700 text-white px-4 py-3 rounded-lg font-medium transition-colors touch-manipulation"
                  >
                    Downloader
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}

export default ChartManager