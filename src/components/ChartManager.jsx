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
        return <div className="w-3 h-3 bg-terminal-green rounded-full shadow-glow-green-sm"></div>
      case 'partial':
        return <div className="w-3 h-3 bg-terminal-amber rounded-full shadow-glow-amber"></div>
      case 'downloading':
        return <div className="w-3 h-3 bg-terminal-cyan rounded-full animate-pulse shadow-glow-cyan"></div>
      case 'available':
        return <div className="w-3 h-3 bg-terminal-border rounded-full"></div>
      default:
        return <div className="w-3 h-3 bg-terminal-border rounded-full"></div>
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
        <h2 className="text-3xl font-bold text-terminal-green text-glow mb-2 uppercase tracking-wider">
          NOAA Chart Manager
        </h2>
        <p className="text-terminal-green-dim">
          Download and manage NOAA nautical charts for offline navigation
        </p>
      </div>

      {/* Chart Types */}
      <div className="bg-terminal-surface rounded-lg border border-terminal-border p-6">
        <h3 className="text-lg font-semibold text-terminal-green mb-6 uppercase tracking-wide">
          Chart Types
        </h3>

        <div className="space-y-6">
          {chartTypes.map((chartType) => (
            <div
              key={chartType.id}
              className="border border-terminal-border rounded-lg p-6 hover:border-terminal-green/50 hover:bg-terminal-green/5 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="mb-3">
                    <h4 className="text-xl font-semibold text-terminal-green">
                      {chartType.name}
                    </h4>
                    <p className="text-terminal-green-dim">
                      {chartType.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-terminal-green-dim">Format: </span>
                      <span className="text-terminal-green font-medium">{chartType.format}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col space-y-3 ml-6 min-w-[180px]">
                  <button
                    onClick={() => navigate('/bluetopo-downloader')}
                    className="terminal-btn-primary"
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