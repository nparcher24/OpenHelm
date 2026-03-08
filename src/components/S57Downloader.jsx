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
} from '../services/s57DownloadService'

function S57Downloader() {
  const [availableRegions, setAvailableRegions] = useState([])
  const [loadingRegions, setLoadingRegions] = useState(true)
  const [downloadedRegions, setDownloadedRegions] = useState([])
  const [loadingDownloaded, setLoadingDownloaded] = useState(true)
  const [storageInfo, setStorageInfo] = useState(null)
  const [loadingStorage, setLoadingStorage] = useState(true)
  const [selectedRegions, setSelectedRegions] = useState(new Set())
  const [jobId, setJobId] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState(null)
  const [updateCheckResult, setUpdateCheckResult] = useState(null)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [martinStatus, setMartinStatus] = useState(null)
  const [isRestartingMartin, setIsRestartingMartin] = useState(false)

  const jobProgress = useJobProgress(jobId, !!jobId, getDownloadJobStatus)

  useEffect(() => {
    loadAvailableRegions()
    loadDownloadedRegions()
    loadStorageInfo()
    loadMartinStatus()
  }, [])

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
      if (result.success) setAvailableRegions(result.regions || [])
    } catch (err) {
      setError('Failed to load available regions')
    } finally {
      setLoadingRegions(false)
    }
  }

  async function loadDownloadedRegions() {
    try {
      setLoadingDownloaded(true)
      const result = await getDownloadedRegions()
      if (result.success) setDownloadedRegions(result.regions || [])
    } catch {
      // non-critical
    } finally {
      setLoadingDownloaded(false)
    }
  }

  async function loadStorageInfo() {
    try {
      setLoadingStorage(true)
      const info = await getStorageInfo()
      setStorageInfo(info)
    } catch {
      // non-critical
    } finally {
      setLoadingStorage(false)
    }
  }

  async function loadMartinStatus() {
    try {
      const status = await getMartinStatus()
      setMartinStatus(status)
    } catch (err) {
      setMartinStatus({ running: false, error: err.message })
    }
  }

  function isRegionDownloaded(regionId) {
    return downloadedRegions.some(r => r.regionId === regionId)
  }

  function toggleRegionSelection(regionId) {
    setSelectedRegions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(regionId)) newSet.delete(regionId)
      else newSet.add(regionId)
      return newSet
    })
  }

  async function handleStartDownload() {
    if (selectedRegions.size === 0) return
    try {
      setError(null)
      setIsDownloading(true)
      const regions = Array.from(selectedRegions)
      const result = await startRegionDownload(regions)
      setJobId(result.jobId)
      setSelectedRegions(new Set())
    } catch (err) {
      setError(err.message)
      setIsDownloading(false)
    }
  }

  async function handleCancelDownload() {
    if (!jobId) return
    try {
      await cancelDownload(jobId)
      setJobId(null)
      setIsDownloading(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteRegion(regionId) {
    if (!confirm(`Delete ${regionId} vector charts? This removes the converted MBTiles data.`)) return
    try {
      setIsDeleting(true)
      await deleteRegion(regionId)
      await loadDownloadedRegions()
      await loadStorageInfo()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleCheckUpdates() {
    try {
      setIsCheckingUpdates(true)
      setError(null)
      const result = await checkForUpdates()
      setUpdateCheckResult(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  async function handleRestartMartin() {
    try {
      setIsRestartingMartin(true)
      await restartMartin()
      setTimeout(async () => {
        await loadMartinStatus()
        setIsRestartingMartin(false)
      }, 2000)
    } catch (err) {
      setError(err.message)
      setIsRestartingMartin(false)
    }
  }

  const estimatedDownloadMB = Array.from(selectedRegions).reduce((sum, regionId) => {
    const region = availableRegions.find(r => r.id === regionId)
    return sum + (region?.sizeMB || 0)
  }, 0)

  // Map status to user-friendly phase names
  const getPhaseLabel = (status) => {
    switch (status) {
      case 'downloading': return 'Downloading S-57 data...'
      case 'extracting': return 'Extracting chart files...'
      case 'converting': return 'Converting to vector tiles...'
      case 'finalizing': return 'Restarting tile server...'
      case 'completed': return 'Complete!'
      case 'failed': return 'Failed'
      default: return 'Processing...'
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-terminal-green text-glow mb-2 uppercase tracking-wider">
          Vector Nautical Charts (S-57)
        </h2>
        <p className="text-terminal-green-dim">
          Download NOAA S-57 vector ENC data with depth shading, contours, soundings, and nav aids
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-terminal-red/10 border border-terminal-red/50 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <XCircleIcon className="h-5 w-5 text-terminal-red" />
            <p className="text-terminal-red">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-terminal-red hover:text-terminal-red-bright">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Storage Info */}
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
          {storageInfo.s57.downloadedCount > 0 && (
            <div className="text-sm text-terminal-green-dim">
              {storageInfo.s57.downloadedCount} vector chart region{storageInfo.s57.downloadedCount !== 1 ? 's' : ''} downloaded
              ({storageInfo.s57.totalSizeMB} MB)
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

      {/* Available Regions */}
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
                      <p className="text-sm text-terminal-green-dim mt-1">
                        S-57 vector charts with depth shading, contours, and nav aids
                      </p>
                      <p className="text-xs text-terminal-green-dim mt-1 font-mono">
                        Estimated download: ~{region.sizeMB} MB (converts to vector tiles)
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
                  Estimated download: ~{estimatedDownloadMB} MB + conversion time (~5-15 min/region)
                </p>
              </div>
              <button onClick={handleStartDownload} className="terminal-btn-primary flex items-center space-x-2">
                <ArrowDownTrayIcon className="h-5 w-5" />
                <span>Download & Convert</span>
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
              Conversion Progress
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

          {/* Phase indicator */}
          <div className="mb-3 text-sm text-terminal-cyan font-medium">
            {getPhaseLabel(jobProgress.status)}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-terminal-green-dim">
                {jobProgress.message || 'Processing...'}
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

          {/* Cancel Button */}
          <div className="mt-4 flex justify-end">
            <button onClick={handleCancelDownload} className="terminal-btn-danger">
              Cancel
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
                        <div className="flex items-center space-x-4 mt-2 text-xs text-terminal-green-dim font-mono">
                          <span>Size: {region.sizeMB} MB</span>
                          <span>Downloaded: {new Date(region.downloadedAt).toLocaleDateString()}</span>
                          {region.fileCount > 0 && <span>Charts: {region.fileCount}</span>}
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
          About S-57 Vector Charts
        </h3>
        <div className="text-sm text-terminal-green-dim space-y-2">
          <p>
            S-57 vector charts are converted from NOAA's free Electronic Navigational Chart (ENC) data.
            Unlike raster charts, vector data enables graduated depth shading, depth soundings,
            navigational aids, and hazard markers that render crisply at any zoom level.
          </p>
          <p>
            The conversion pipeline: S-57 .000 files are extracted with ogr2ogr, then tippecanoe
            generates vector MBTiles served by Martin. Processing takes 5-15 minutes per state.
          </p>
          <p className="text-xs">
            Data source: NOAA Office of Coast Survey |{' '}
            <a
              href="https://charts.noaa.gov/ENCs/ENCs.shtml"
              target="_blank"
              rel="noopener noreferrer"
              className="text-terminal-cyan hover:underline"
            >
              charts.noaa.gov/ENCs
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default S57Downloader
