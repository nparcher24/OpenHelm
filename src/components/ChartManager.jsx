import { useState, useEffect, useRef } from 'react'
import RegionSelector from './RegionSelector'
import BlueTopoTileSelector from './BlueTopoTileSelector'
import { fetchENCCatalogue, startENCCatalogueUpdate, cancelENCCatalogueUpdate } from '../services/encCatalogueService'
import { checkForUpdates, downloadTileScheme } from '../services/blueTopoService'
import { logInfo, logError, logWarn } from '../utils/logger'
import { useJobProgress } from '../hooks/useJobProgress.js'

function ChartManager() {
  const [currentView, setCurrentView] = useState('main') // 'main' or 'regionSelector'
  const [selectedChartType, setSelectedChartType] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState({})
  const [storageUsed, setStorageUsed] = useState('2.1 GB')
  const [storageTotal] = useState('32 GB')
  const [encCatalogue, setEncCatalogue] = useState(null)
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [currentJobId, setCurrentJobId] = useState(null)
  const [showBlueTopoModal, setShowBlueTopoModal] = useState(false)
  const [blueTopoUpdate, setBlueTopoUpdate] = useState(null)
  const [blueTopoChecking, setBlueTopoChecking] = useState(false)
  const [blueTopoDownloading, setBlueTopoDownloading] = useState(false)
  
  // Use ref to prevent multiple concurrent calls across component re-mounts
  const isLoadingRef = useRef(false)
  
  // For testing: bypass NOAA update and just load from database
  const [testMode] = useState(false) // Changed to false to use new background system
  
  // Use the job progress hook
  const jobProgress = useJobProgress(currentJobId, !!currentJobId)

  // NOAA Chart Types
  const chartTypes = [
    {
      id: 'noaa-enc',
      name: 'NOAA ENC (Vector Tiles)',
      description: 'Electronic Navigational Charts in vector tile format',
      format: 'Vector Tiles'
    },
    {
      id: 'bluetopo',
      name: 'NOAA BlueTopo',
      description: 'High-resolution bathymetric topography (2m-16m resolution)',
      format: 'GeoTIFF Tiles'
    }
  ]

  // Initialize catalogue loading - using new background job system
  useEffect(() => {
    let isMounted = true
    
    const initializeCatalogue = async () => {
      const componentId = Date.now().toString(36) + Math.random().toString(36).substr(2)
      
      // Prevent multiple concurrent calls
      if (isLoadingRef.current || hasInitialized) {
        logInfo(`[ChartManager] [${componentId}] Skipping initialization - already in progress (${isLoadingRef.current}) or completed (${hasInitialized})`)
        return
      }
      
      isLoadingRef.current = true
      logInfo(`[ChartManager] [${componentId}] Starting ENC catalogue initialization...`)
      logInfo(`[ChartManager] [${componentId}] Component mounted: ${isMounted}, Test mode: ${testMode}`)
      
      try {
        if (!isMounted) return
        
        setHasInitialized(true)
        setCatalogueLoading(true)
        
        if (testMode) {
          // Test mode: skip NOAA update, just load from existing database
          logInfo(`[ChartManager] [${componentId}] Test mode enabled - loading from existing database`)
          
          const fetchStartTime = Date.now()
          const catalogue = await fetchENCCatalogue()
          const fetchTime = ((Date.now() - fetchStartTime) / 1000).toFixed(1)
          
          if (!isMounted) return
          
          setEncCatalogue(catalogue)
          logInfo(`[ChartManager] [${componentId}] Loaded ${catalogue.length} charts from database in ${fetchTime}s`)
          
        } else {
          // Production mode: start background NOAA update job
          logInfo(`[ChartManager] [${componentId}] Production mode - starting background NOAA update`)
          
          const jobResult = await startENCCatalogueUpdate()
          
          if (!isMounted) return
          
          logInfo(`[ChartManager] [${componentId}] Background job started: ${jobResult.jobId}`)
          setCurrentJobId(jobResult.jobId)
          
          // Load existing catalogue while background job runs
          try {
            const catalogue = await fetchENCCatalogue()
            if (isMounted) {
              setEncCatalogue(catalogue)
              logInfo(`[ChartManager] [${componentId}] Loaded existing ${catalogue.length} charts while background job runs`)
            }
          } catch (error) {
            logWarn(`[ChartManager] [${componentId}] Could not load existing catalogue:`, error.message)
          }
        }
        
      } catch (error) {
        if (!isMounted) return
        
        logError(`[ChartManager] [${componentId}] Initialization failed: ${error.message}`, error)
        
        // Reset initialization flag on error so user can retry
        setHasInitialized(false)
        logInfo(`[ChartManager] [${componentId}] Reset initialization flag for retry`)
      } finally {
        if (isMounted) {
          setCatalogueLoading(false)
        }
        isLoadingRef.current = false
      }
    }
    
    logInfo('[ChartManager] Component mounted, starting catalogue initialization...')
    initializeCatalogue()
    
    return () => {
      logInfo('[ChartManager] Component unmounting')
      isMounted = false
    }
  }, [hasInitialized, testMode])
  
  // Handle job completion
  useEffect(() => {
    if (jobProgress.isComplete && jobProgress.result) {
      logInfo(`[ChartManager] Job completed with status: ${jobProgress.status}`)
      
      if (jobProgress.status === 'completed') {
        // Reload catalogue with fresh data
        fetchENCCatalogue().then(catalogue => {
          setEncCatalogue(catalogue)
          logInfo(`[ChartManager] Reloaded ${catalogue.length} charts after job completion`)
        }).catch(error => {
          logError(`[ChartManager] Failed to reload catalogue after job completion:`, error.message)
        })
      }
      
      // Clear job ID after a delay to show final status
      setTimeout(() => {
        setCurrentJobId(null)
      }, 3000)
    }
  }, [jobProgress.isComplete, jobProgress.result, jobProgress.status])
  
  // Cancel job handler
  const handleCancelJob = async () => {
    if (!currentJobId) return
    
    try {
      logInfo(`[ChartManager] Cancelling job: ${currentJobId}`)
      await cancelENCCatalogueUpdate(currentJobId)
      logInfo(`[ChartManager] Job cancellation requested`)
    } catch (error) {
      logError(`[ChartManager] Failed to cancel job:`, error.message)
    }
  }

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
    if (chartType.id === 'bluetopo') {
      setShowBlueTopoModal(true)
    } else {
      setCurrentView('regionSelector')
    }
  }

  const handleRegionsSelected = (regions) => {
    console.log('Selected regions for download:', regions)
    // TODO: Start download for selected regions
    setCurrentView('main')
  }

  const handleBlueTopoTilesSelected = (tiles) => {
    console.log('Selected BlueTopo tiles for download:', tiles)
    console.log(`Total tiles: ${tiles.length}`)
    console.log('Tile IDs:', tiles.map(t => t.tile))
    // TODO: Start download for selected BlueTopo tiles
    setShowBlueTopoModal(false)
  }

  const handleCheckBlueTopoUpdates = async () => {
    setBlueTopoChecking(true)
    try {
      const updateInfo = await checkForUpdates()
      setBlueTopoUpdate(updateInfo)
      console.log('BlueTopo update check:', updateInfo)

      // If update available, automatically download
      if (updateInfo.updateAvailable) {
        await handleDownloadBlueTopoScheme(updateInfo.latest)
      }
    } catch (error) {
      console.error('Error checking BlueTopo updates:', error)
      logError('Failed to check BlueTopo updates', error.message)
    } finally {
      setBlueTopoChecking(false)
    }
  }

  const handleDownloadBlueTopoScheme = async (latest) => {
    setBlueTopoDownloading(true)
    try {
      console.log('Downloading tile scheme:', latest.filename)
      const result = await downloadTileScheme(latest.url, latest.filename)
      console.log('Downloaded tile scheme:', result)
      logInfo(`Downloaded tile scheme: ${result.filename}`)

      // Update the update info to reflect download complete
      setBlueTopoUpdate(prev => ({
        ...prev,
        updateAvailable: false,
        message: 'Tile scheme updated successfully'
      }))
    } catch (error) {
      console.error('Error downloading tile scheme:', error)
      logError('Failed to download tile scheme', error.message)
    } finally {
      setBlueTopoDownloading(false)
    }
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
    <div className="relative h-full">
      <BlueTopoTileSelector
        isOpen={showBlueTopoModal}
        onClose={() => setShowBlueTopoModal(false)}
        onSelectTiles={handleBlueTopoTilesSelected}
      />

      <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          NOAA Chart Manager
        </h2>
        <p className="text-slate-600 dark:text-slate-300">
          Download and manage NOAA nautical charts for offline navigation
        </p>
      </div>

      {/* Job Progress Status */}
      {currentJobId && (
        <div className={`rounded-xl p-4 mb-6 ${
          jobProgress.isError
            ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700'
            : jobProgress.isCancelled
            ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700'
            : jobProgress.isComplete
            ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
            : 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              {jobProgress.isError ? (
                <div className="w-5 h-5 text-red-600 dark:text-red-400">
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : jobProgress.isCancelled ? (
                <div className="w-5 h-5 text-yellow-600 dark:text-yellow-400">
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : jobProgress.isComplete ? (
                <div className="w-5 h-5 text-green-600 dark:text-green-400">
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : (
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              )}
              <div>
                <h4 className={`font-medium ${
                  jobProgress.isError
                    ? 'text-red-800 dark:text-red-200'
                    : jobProgress.isCancelled
                    ? 'text-yellow-800 dark:text-yellow-200'
                    : jobProgress.isComplete
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-blue-800 dark:text-blue-200'
                }`}>
                  {jobProgress.isError
                    ? 'Update Failed'
                    : jobProgress.isCancelled
                    ? 'Update Cancelled'
                    : jobProgress.isComplete
                    ? 'Update Complete'
                    : 'Updating Chart Database'
                  }
                </h4>
                <p className={`text-sm ${
                  jobProgress.isError
                    ? 'text-red-600 dark:text-red-300'
                    : jobProgress.isCancelled
                    ? 'text-yellow-600 dark:text-yellow-300'
                    : jobProgress.isComplete
                    ? 'text-green-600 dark:text-green-300'
                    : 'text-blue-600 dark:text-blue-300'
                }`}>
                  {jobProgress.message || 'Processing charts...'}
                  {jobProgress.estimatedTimeLeft && !jobProgress.isComplete && (
                    <span className="ml-2">• ~{jobProgress.estimatedTimeLeft} remaining</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {!jobProgress.isComplete && !jobProgress.isError && !jobProgress.isCancelled && (
                <button
                  onClick={handleCancelJob}
                  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                >
                  Cancel
                </button>
              )}
              {jobProgress.isError && (
                <button
                  onClick={() => {
                    setHasInitialized(false)
                    setCurrentJobId(null)
                  }}
                  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
          
          {/* Progress Bar */}
          {!jobProgress.isError && !jobProgress.isCancelled && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Progress</span>
                <span className="font-medium">{Math.round(jobProgress.progress)}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    jobProgress.isComplete 
                      ? 'bg-green-600' 
                      : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, jobProgress.progress))}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {/* WebSocket Connection Status */}
          {jobProgress.isActive && (
            <div className="mt-2 flex items-center space-x-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${
                jobProgress.connected ? 'bg-green-500' : 'bg-yellow-500'
              }`}></div>
              <span className="text-slate-500 dark:text-slate-400">
                {jobProgress.connected ? 'Real-time updates' : 'Polling for updates'}
              </span>
            </div>
          )}
        </div>
      )}

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

                  {/* BlueTopo specific status */}
                  {chartType.id === 'bluetopo' && blueTopoUpdate && (
                    <div className={`mt-4 p-3 rounded-lg text-sm ${
                      blueTopoUpdate.updateAvailable
                        ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700'
                        : 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
                    }`}>
                      <div className="flex items-start space-x-2">
                        <svg className={`w-5 h-5 flex-shrink-0 ${
                          blueTopoUpdate.updateAvailable ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                        }`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{blueTopoUpdate.message}</div>
                          {blueTopoUpdate.latest && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                              Latest: {new Date(blueTopoUpdate.latest.lastModified).toLocaleDateString()} ({blueTopoUpdate.latest.sizeFormatted})
                            </div>
                          )}
                          {blueTopoUpdate.local && blueTopoUpdate.local.exists && (
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                              Local: {new Date(blueTopoUpdate.local.lastModified).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                <div className="flex flex-col space-y-3 ml-6 min-w-[180px]">
                  {chartType.id === 'bluetopo' && (
                    <button
                      onClick={handleCheckBlueTopoUpdates}
                      disabled={blueTopoChecking || blueTopoDownloading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white px-4 py-3 rounded-lg font-medium transition-colors touch-manipulation flex items-center justify-center"
                    >
                      {blueTopoChecking ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                          Checking...
                        </>
                      ) : blueTopoDownloading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                          Downloading...
                        </>
                      ) : (
                        'Check for Updates'
                      )}
                    </button>
                  )}
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
    </div>
  )
}

export default ChartManager