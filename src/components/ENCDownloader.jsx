import { useEffect, useState } from 'react'
import { XCircleIcon, CheckCircleIcon, ArrowDownTrayIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useJobProgress } from '../hooks/useJobProgress'
import {
  getAvailableRegions,
  getStorageInfo,
  getDownloadedRegions,
  startRegionDownload,
  getDownloadJobStatus,
  cancelDownload,
  checkForUpdates,
  deleteRegion,
  restartMartin,
  getMartinStatus
} from '../services/encDownloadService'

function ENCDownloader() {
  // Available regions from NOAA
  const [availableRegions, setAvailableRegions] = useState([])
  const [loadingRegions, setLoadingRegions] = useState(true)

  // Downloaded regions
  const [downloadedRegions, setDownloadedRegions] = useState([])
  const [loadingDownloaded, setLoadingDownloaded] = useState(true)

  // Storage info
  const [storageInfo, setStorageInfo] = useState(null)
  const [loadingStorage, setLoadingStorage] = useState(true)

  // Selection state for download
  const [selectedRegions, setSelectedRegions] = useState(new Set())

  // Job state
  const [jobId, setJobId] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState(null)

  // Update check state
  const [updateCheckResult, setUpdateCheckResult] = useState(null)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)

  // Deletion state
  const [isDeleting, setIsDeleting] = useState(false)

  // Martin status
  const [martinStatus, setMartinStatus] = useState(null)
  const [isRestartingMartin, setIsRestartingMartin] = useState(false)

  // Use job progress hook
  const jobProgress = useJobProgress(jobId, !!jobId, getDownloadJobStatus)

  // Load initial data
  useEffect(() => {
    loadAvailableRegions()
    loadDownloadedRegions()
    loadStorageInfo()
    loadMartinStatus()
  }, [])

  // Reload data when job completes
  useEffect(() => {
    if (jobProgress.isComplete && !jobProgress.isError) {
      loadDownloadedRegions()
      loadStorageInfo()
      loadMartinStatus()
      setIsDownloading(false)
    }
  }, [jobProgress.isComplete, jobProgress.isError])

  async function loadAvailableRegions() {
    try {
      setLoadingRegions(true)
      const result = await getAvailableRegions()
      if (result.success) {
        setAvailableRegions(result.regions || [])
      }
    } catch (err) {
      console.error('Failed to load available regions:', err)
      setError('Failed to load available regions')
    } finally {
      setLoadingRegions(false)
    }
  }

  async function loadDownloadedRegions() {
    try {
      setLoadingDownloaded(true)
      const result = await getDownloadedRegions()
      if (result.success) {
        setDownloadedRegions(result.regions || [])
      }
    } catch (err) {
      console.error('Failed to load downloaded regions:', err)
    } finally {
      setLoadingDownloaded(false)
    }
  }

  async function loadStorageInfo() {
    try {
      setLoadingStorage(true)
      const info = await getStorageInfo()
      setStorageInfo(info)
    } catch (err) {
      console.error('Failed to load storage info:', err)
    } finally {
      setLoadingStorage(false)
    }
  }

  async function loadMartinStatus() {
    try {
      const status = await getMartinStatus()
      setMartinStatus(status)
    } catch (err) {
      console.error('Failed to load Martin status:', err)
      setMartinStatus({ running: false, error: err.message })
    }
  }

  // Check if a region is already downloaded
  function isRegionDownloaded(regionId) {
    return downloadedRegions.some(r => r.regionId === regionId)
  }

  // Toggle region selection
  function toggleRegionSelection(regionId) {
    setSelectedRegions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(regionId)) {
        newSet.delete(regionId)
      } else {
        newSet.add(regionId)
      }
      return newSet
    })
  }

  // Start download of selected regions
  async function handleStartDownload() {
    if (selectedRegions.size === 0) return

    try {
      setError(null)
      setIsDownloading(true)
      const regions = Array.from(selectedRegions)
      const result = await startRegionDownload(regions)
      setJobId(result.jobId)
      setSelectedRegions(new Set()) // Clear selection
    } catch (err) {
      console.error('Failed to start download:', err)
      setError(err.message)
      setIsDownloading(false)
    }
  }

  // Cancel download
  async function handleCancelDownload() {
    if (!jobId) return

    try {
      await cancelDownload(jobId)
      setJobId(null)
      setIsDownloading(false)
    } catch (err) {
      console.error('Failed to cancel download:', err)
      setError(err.message)
    }
  }

  // Delete a downloaded region
  async function handleDeleteRegion(regionId) {
    if (!confirm(`Are you sure you want to delete ${regionId}? This will remove the nautical chart data.`)) {
      return
    }

    try {
      setIsDeleting(true)
      await deleteRegion(regionId)
      await loadDownloadedRegions()
      await loadStorageInfo()
    } catch (err) {
      console.error('Failed to delete region:', err)
      setError(err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  // Check for updates
  async function handleCheckUpdates() {
    try {
      setIsCheckingUpdates(true)
      setError(null)
      const result = await checkForUpdates()
      setUpdateCheckResult(result)
    } catch (err) {
      console.error('Failed to check for updates:', err)
      setError(err.message)
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  // Restart Martin tileserver
  async function handleRestartMartin() {
    try {
      setIsRestartingMartin(true)
      await restartMartin()
      // Wait a moment then check status
      setTimeout(async () => {
        await loadMartinStatus()
        setIsRestartingMartin(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to restart Martin:', err)
      setError(err.message)
      setIsRestartingMartin(false)
    }
  }

  // Calculate estimated download size
  const estimatedDownloadMB = Array.from(selectedRegions).reduce((sum, regionId) => {
    const region = availableRegions.find(r => r.id === regionId)
    return sum + (region?.sizeMB || 0)
  }, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-terminal-green text-glow mb-2 uppercase tracking-wider">
          NOAA Nautical Charts (ENC)
        </h2>
        <p className="text-terminal-green-dim">
          Download official NOAA Electronic Navigational Charts for offline use
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-terminal-red/10 border border-terminal-red/50 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <XCircleIcon className="h-5 w-5 text-terminal-red" />
            <p className="text-terminal-red">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-terminal-red hover:text-terminal-red-bright"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Storage Info Panel */}
      {!loadingStorage && storageInfo && (
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4">
          <h3 className="text-sm font-semibold text-terminal-green mb-3 uppercase tracking-wide">
            Storage Information
          </h3>

          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-sm">
              <span className="text-terminal-green-dim">Disk Usage</span>
              <span className="text-terminal-green font-medium font-mono">
                {storageInfo.disk.freeGB} GB free / {storageInfo.disk.totalGB} GB total
              </span>
            </div>
            <div className="w-full bg-terminal-border rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  storageInfo.disk.usedPercent > 90
                    ? 'bg-terminal-red shadow-glow-red'
                    : storageInfo.disk.usedPercent > 75
                    ? 'bg-terminal-amber shadow-glow-amber'
                    : 'bg-terminal-green shadow-glow-green-sm'
                }`}
                style={{ width: `${storageInfo.disk.usedPercent}%` }}
              />
            </div>
          </div>

          {storageInfo.enc.downloadedCount > 0 && (
            <div className="text-sm text-terminal-green-dim">
              {storageInfo.enc.downloadedCount} ENC region{storageInfo.enc.downloadedCount !== 1 ? 's' : ''} downloaded
              ({storageInfo.enc.totalSizeMB} MB)
            </div>
          )}
        </div>
      )}

      {/* Martin Status */}
      <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              martinStatus?.running
                ? 'bg-terminal-green shadow-glow-green-sm'
                : 'bg-terminal-red shadow-glow-red'
            }`} />
            <div>
              <h3 className="text-sm font-semibold text-terminal-green uppercase tracking-wide">
                Tile Server Status
              </h3>
              <p className="text-xs text-terminal-green-dim">
                {martinStatus?.running ? 'Martin is running and serving tiles' : 'Martin is not running'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRestartMartin}
            disabled={isRestartingMartin}
            className="terminal-btn flex items-center space-x-2"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isRestartingMartin ? 'animate-spin' : ''}`} />
            <span>{isRestartingMartin ? 'Restarting...' : 'Restart'}</span>
          </button>
        </div>
      </div>

      {/* Available Regions for Download */}
      <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4">
        <h3 className="text-lg font-semibold text-terminal-green mb-4 uppercase tracking-wide">
          Available Regions
        </h3>

        {loadingRegions ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-terminal-green"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {availableRegions.map((region) => {
              const isDownloaded = isRegionDownloaded(region.id)
              const isSelected = selectedRegions.has(region.id)

              return (
                <div
                  key={region.id}
                  className={`p-4 rounded-lg border transition-all ${
                    isDownloaded
                      ? 'bg-terminal-green/5 border-terminal-green/30'
                      : isSelected
                      ? 'bg-terminal-cyan/10 border-terminal-cyan/50'
                      : 'bg-terminal-bg border-terminal-border hover:border-terminal-green/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-semibold text-terminal-green">{region.name}</h4>
                        <span className="text-xs px-2 py-0.5 rounded bg-terminal-border text-terminal-green-dim font-mono">
                          {region.id}
                        </span>
                        {isDownloaded && (
                          <span className="text-xs px-2 py-0.5 rounded bg-terminal-green/20 text-terminal-green flex items-center space-x-1">
                            <CheckCircleIcon className="h-3 w-3" />
                            <span>Downloaded</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-terminal-green-dim mt-1">{region.description}</p>
                      <p className="text-xs text-terminal-green-dim mt-1 font-mono">
                        Size: {region.sizeMB} MB ({region.sizeGB} GB)
                      </p>
                    </div>

                    {!isDownloaded && !isDownloading && (
                      <button
                        onClick={() => toggleRegionSelection(region.id)}
                        className={`ml-4 px-4 py-2 rounded-lg font-medium transition-all ${
                          isSelected
                            ? 'bg-terminal-cyan text-terminal-bg'
                            : 'border border-terminal-border text-terminal-green hover:border-terminal-green hover:bg-terminal-green/10'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Download Button */}
        {selectedRegions.size > 0 && !isDownloading && (
          <div className="mt-4 pt-4 border-t border-terminal-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-terminal-green">
                  {selectedRegions.size} region{selectedRegions.size !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-terminal-green-dim font-mono">
                  Estimated download: {estimatedDownloadMB} MB
                </p>
              </div>
              <button
                onClick={handleStartDownload}
                className="terminal-btn-primary flex items-center space-x-2"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                <span>Download Selected</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Download Progress */}
      {isDownloading && jobProgress && (
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-terminal-green uppercase tracking-wide">
              Download Progress
            </h3>
            {jobProgress.connected !== undefined && (
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  jobProgress.connected ? 'bg-terminal-green shadow-glow-green-sm' : 'bg-terminal-amber shadow-glow-amber'
                }`} />
                <span className="text-xs text-terminal-green-dim">
                  {jobProgress.connected ? 'Connected' : 'Polling'}
                </span>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-terminal-green-dim">
                {jobProgress.message || 'Downloading...'}
              </span>
              <span className="text-terminal-green font-medium font-mono">
                {jobProgress.progress || 0}%
              </span>
            </div>
            <div className="w-full bg-terminal-border rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-terminal-green shadow-glow-green-sm transition-all duration-300"
                style={{ width: `${jobProgress.progress || 0}%` }}
              />
            </div>
          </div>

          {/* ETA */}
          {jobProgress.estimatedTimeLeft && (
            <p className="text-sm text-terminal-green-dim">
              Estimated time remaining: {jobProgress.estimatedTimeLeft}
            </p>
          )}

          {/* Cancel Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCancelDownload}
              className="terminal-btn-danger"
            >
              Cancel Download
            </button>
          </div>
        </div>
      )}

      {/* Downloaded Regions */}
      {downloadedRegions.length > 0 && (
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-terminal-green uppercase tracking-wide">
              Downloaded Regions ({downloadedRegions.length})
            </h3>
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates}
              className="terminal-btn flex items-center space-x-2"
            >
              <ArrowPathIcon className={`h-4 w-4 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdates ? 'Checking...' : 'Check for Updates'}</span>
            </button>
          </div>

          {/* Update Check Results */}
          {updateCheckResult && (
            <div className="mb-4 p-3 rounded-lg bg-terminal-bg border border-terminal-border">
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-terminal-green">
                  <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                  {updateCheckResult.summary.upToDate} up to date
                </span>
                {updateCheckResult.summary.updatesAvailable > 0 && (
                  <span className="text-terminal-amber">
                    {updateCheckResult.summary.updatesAvailable} update{updateCheckResult.summary.updatesAvailable !== 1 ? 's' : ''} available
                  </span>
                )}
                {updateCheckResult.summary.errors > 0 && (
                  <span className="text-terminal-red">
                    {updateCheckResult.summary.errors} error{updateCheckResult.summary.errors !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          {loadingDownloaded ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-terminal-green"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {downloadedRegions.map((region) => {
                const updateInfo = updateCheckResult?.regions?.find(r => r.regionId === region.regionId)

                return (
                  <div
                    key={region.regionId}
                    className="p-4 rounded-lg bg-terminal-bg border border-terminal-border"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-semibold text-terminal-green">{region.name}</h4>
                          <span className="text-xs px-2 py-0.5 rounded bg-terminal-border text-terminal-green-dim font-mono">
                            {region.regionId}
                          </span>
                          {updateInfo?.hasUpdate && (
                            <span className="text-xs px-2 py-0.5 rounded bg-terminal-amber/20 text-terminal-amber">
                              Update available
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-terminal-green-dim mt-1">{region.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-terminal-green-dim font-mono">
                          <span>Size: {region.sizeMB} MB</span>
                          <span>Downloaded: {new Date(region.downloadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteRegion(region.regionId)}
                        disabled={isDeleting}
                        className="ml-4 p-2 text-terminal-red hover:bg-terminal-red/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete region"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4">
        <h3 className="text-sm font-semibold text-terminal-green mb-2 uppercase tracking-wide">
          About NCDS Charts
        </h3>
        <div className="text-sm text-terminal-green-dim space-y-2">
          <p>
            NCDS (NOAA Chart Display Service) provides pre-rendered raster tiles of official
            Electronic Navigational Charts (ENC) for offline marine navigation.
          </p>
          <p>
            These charts include navigational aids, depth contours, hazards, and other
            critical maritime information required for safe navigation.
          </p>
          <p className="text-xs">
            Data source: NOAA Office of Coast Survey |{' '}
            <a
              href="https://distribution.charts.noaa.gov/ncds"
              target="_blank"
              rel="noopener noreferrer"
              className="text-terminal-cyan hover:underline"
            >
              distribution.charts.noaa.gov/ncds
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ENCDownloader
