import { useEffect, useState } from 'react'
import { XCircleIcon, CheckCircleIcon, ArrowDownTrayIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useJobProgress } from '../hooks/useJobProgress'
import { Glass } from '../ui/primitives'
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
    if (jobProgress.isComplete) {
      loadDownloadedRegions()
      loadStorageInfo()
      loadMartinStatus()
      setIsDownloading(false)
      if (jobProgress.isError) {
        setError(jobProgress.message || 'Download failed')
      }
    }
  }, [jobProgress.isComplete])

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
      await loadMartinStatus()
    } catch (err) {
      setError(err.message)
    } finally {
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
      case 'completed_with_errors': return 'Completed with errors'
      case 'failed': return 'Failed'
      default: return 'Processing...'
    }
  }

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--fg1)' }}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--fg1)' }}>
          Vector Nautical Charts (S-57)
        </h2>
        <p style={{ color: 'var(--fg2)' }}>
          Download NOAA S-57 vector ENC data with depth shading, contours, soundings, and nav aids
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg p-4" style={{ background: 'rgba(229,72,72,0.1)', border: '0.5px solid rgba(229,72,72,0.5)' }}>
          <div className="flex items-center space-x-2">
            <XCircleIcon className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--tint-red)' }} />
            <p style={{ color: 'var(--tint-red)' }}>{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-sm" style={{ color: 'var(--tint-red)' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Storage Info */}
      {!loadingStorage && storageInfo && (
        <Glass pad={16} radius={12}>
          <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--fg1)' }}>
            Storage Information
          </h3>
          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--fg2)' }}>Disk Usage</span>
              <span className="font-medium font-mono" style={{ color: 'var(--fg1)' }}>
                {storageInfo.disk.freeGB} GB free / {storageInfo.disk.totalGB} GB total
              </span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: 'var(--fill-2)' }}>
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${storageInfo.disk.usedPercent}%`,
                  borderRadius: 999,
                  background: storageInfo.disk.usedPercent > 90
                    ? 'var(--tint-red)'
                    : storageInfo.disk.usedPercent > 75
                    ? 'var(--tint-yellow)'
                    : 'var(--signal)',
                  boxShadow: '0 0 8px var(--signal-glow)'
                }}
              />
            </div>
          </div>
          {storageInfo.s57.downloadedCount > 0 && (
            <div className="text-sm" style={{ color: 'var(--fg2)' }}>
              {storageInfo.s57.downloadedCount} vector chart region{storageInfo.s57.downloadedCount !== 1 ? 's' : ''} downloaded
              ({storageInfo.s57.totalSizeMB} MB)
            </div>
          )}
        </Glass>
      )}

      {/* Martin Status */}
      <Glass pad={16} radius={12}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full" style={{ background: martinStatus?.running ? 'var(--signal)' : 'var(--tint-red)' }} />
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--fg1)' }}>
                Tile Server Status
              </h3>
              <p className="text-xs" style={{ color: 'var(--fg2)' }}>
                {martinStatus?.running ? 'Martin is running and serving tiles' : 'Martin is not running'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRestartMartin}
            disabled={isRestartingMartin}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm touch-manipulation"
            style={{ background: 'var(--fill-1)', border: '0.5px solid var(--bg-hairline-strong)', color: 'var(--fg1)' }}
          >
            <ArrowPathIcon className={`h-4 w-4 ${isRestartingMartin ? 'animate-spin' : ''}`} />
            <span>{isRestartingMartin ? 'Restarting...' : 'Restart'}</span>
          </button>
        </div>
      </Glass>

      {/* Available Regions */}
      <Glass pad={16} radius={12}>
        <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide" style={{ color: 'var(--fg1)' }}>
          Available Regions
        </h3>

        {loadingRegions ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8" style={{ border: '2px solid var(--fill-2)', borderTopColor: 'var(--signal)' }} />
          </div>
        ) : (
          <div className="space-y-3">
            {availableRegions.map((region) => {
              const isDownloaded = isRegionDownloaded(region.id)
              const isSelected = selectedRegions.has(region.id)

              return (
                <div
                  key={region.id}
                  className="p-4 rounded-lg transition-all"
                  style={{
                    border: '0.5px solid',
                    borderColor: isDownloaded ? 'var(--signal)' : isSelected ? 'var(--tint-teal)' : 'var(--bg-hairline-strong)',
                    background: isDownloaded ? 'rgba(47,181,107,0.06)' : isSelected ? 'rgba(47,215,200,0.08)' : 'var(--bg)'
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 flex-wrap gap-1">
                        <h4 className="font-semibold" style={{ color: 'var(--fg1)' }}>{region.name}</h4>
                        <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'var(--fill-2)', color: 'var(--fg2)' }}>
                          {region.id}
                        </span>
                        {isDownloaded && (
                          <span className="text-xs px-2 py-0.5 rounded flex items-center space-x-1" style={{ background: 'rgba(47,181,107,0.15)', color: 'var(--signal)' }}>
                            <CheckCircleIcon className="h-3 w-3" />
                            <span>Downloaded</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1" style={{ color: 'var(--fg2)' }}>
                        S-57 vector charts with depth shading, contours, and nav aids
                      </p>
                      <p className="text-xs mt-1 font-mono" style={{ color: 'var(--fg2)' }}>
                        Estimated download: ~{region.sizeMB} MB (converts to vector tiles)
                      </p>
                    </div>

                    {!isDownloaded && !isDownloading && (
                      <button
                        onClick={() => toggleRegionSelection(region.id)}
                        className="ml-4 px-4 py-2 rounded-lg font-medium transition-all touch-manipulation"
                        style={isSelected
                          ? { background: 'var(--tint-teal)', color: '#fff' }
                          : { background: 'var(--fill-1)', border: '0.5px solid var(--bg-hairline-strong)', color: 'var(--fg1)' }
                        }
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
          <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid var(--bg-hairline-strong)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--fg1)' }}>
                  {selectedRegions.size} region{selectedRegions.size !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs font-mono" style={{ color: 'var(--fg2)' }}>
                  Estimated download: ~{estimatedDownloadMB} MB + conversion time (~5-15 min/region)
                </p>
              </div>
              <button
                onClick={handleStartDownload}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium touch-manipulation"
                style={{ background: 'var(--signal)', color: '#fff' }}
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                <span>Download & Convert</span>
              </button>
            </div>
          </div>
        )}
      </Glass>

      {/* Download Progress */}
      {isDownloading && jobProgress && (
        <Glass pad={16} radius={12}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold uppercase tracking-wide" style={{ color: 'var(--fg1)' }}>
              Conversion Progress
            </h3>
            {jobProgress.connected !== undefined && (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full" style={{ background: jobProgress.connected ? 'var(--signal)' : 'var(--tint-yellow)' }} />
                <span className="text-xs" style={{ color: 'var(--fg2)' }}>
                  {jobProgress.connected ? 'Connected' : 'Polling'}
                </span>
              </div>
            )}
          </div>

          {/* Phase indicator */}
          <div className="mb-3 text-sm font-medium" style={{ color: 'var(--tint-teal)' }}>
            {getPhaseLabel(jobProgress.status)}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--fg2)' }}>
                {jobProgress.message || 'Processing...'}
              </span>
              <span className="font-medium font-mono" style={{ color: 'var(--fg1)' }}>
                {jobProgress.progress || 0}%
              </span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: 'var(--fill-2)' }}>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${jobProgress.progress || 0}%`, borderRadius: 999, background: 'var(--signal)', boxShadow: '0 0 8px var(--signal-glow)' }}
              />
            </div>
          </div>

          {/* Cancel Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCancelDownload}
              className="px-4 py-2 rounded-lg font-medium touch-manipulation"
              style={{ background: 'rgba(229,72,72,0.14)', color: '#E54848', border: '0.5px solid rgba(229,72,72,0.4)' }}
            >
              Cancel
            </button>
          </div>
        </Glass>
      )}

      {/* Downloaded Regions */}
      {downloadedRegions.length > 0 && (
        <Glass pad={16} radius={12}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold uppercase tracking-wide" style={{ color: 'var(--fg1)' }}>
              Downloaded Regions ({downloadedRegions.length})
            </h3>
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm touch-manipulation"
              style={{ background: 'var(--fill-1)', border: '0.5px solid var(--bg-hairline-strong)', color: 'var(--fg1)' }}
            >
              <ArrowPathIcon className={`h-4 w-4 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdates ? 'Checking...' : 'Check for Updates'}</span>
            </button>
          </div>

          {/* Update Check Results */}
          {updateCheckResult && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--bg-hairline-strong)' }}>
              <div className="flex items-center space-x-4 text-sm">
                <span style={{ color: 'var(--signal)' }}>
                  <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                  {updateCheckResult.summary.upToDate} up to date
                </span>
                {updateCheckResult.summary.updatesAvailable > 0 && (
                  <span style={{ color: 'var(--tint-yellow)' }}>
                    {updateCheckResult.summary.updatesAvailable} update{updateCheckResult.summary.updatesAvailable !== 1 ? 's' : ''} available
                  </span>
                )}
              </div>
            </div>
          )}

          {loadingDownloaded ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8" style={{ border: '2px solid var(--fill-2)', borderTopColor: 'var(--signal)' }} />
            </div>
          ) : (
            <div className="space-y-3">
              {downloadedRegions.map((region) => {
                const updateInfo = updateCheckResult?.regions?.find(r => r.regionId === region.regionId)

                return (
                  <div
                    key={region.regionId}
                    className="p-4 rounded-lg"
                    style={{ background: 'var(--bg)', border: '0.5px solid var(--bg-hairline-strong)' }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 flex-wrap gap-1">
                          <h4 className="font-semibold" style={{ color: 'var(--fg1)' }}>{region.name}</h4>
                          <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'var(--fill-2)', color: 'var(--fg2)' }}>
                            {region.regionId}
                          </span>
                          {updateInfo?.hasUpdate && (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,195,58,0.15)', color: 'var(--tint-yellow)' }}>
                              Update available
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 mt-2 text-xs font-mono" style={{ color: 'var(--fg2)' }}>
                          <span>Size: {region.sizeMB} MB</span>
                          <span>Downloaded: {new Date(region.downloadedAt).toLocaleDateString()}</span>
                          {region.fileCount > 0 && <span>Charts: {region.fileCount}</span>}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteRegion(region.regionId)}
                        disabled={isDeleting}
                        className="ml-4 p-2 rounded-lg transition-colors disabled:opacity-50 touch-manipulation"
                        style={{ color: 'var(--tint-red)' }}
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
        </Glass>
      )}

      {/* Help Text */}
      <Glass pad={16} radius={12}>
        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--fg1)' }}>
          About S-57 Vector Charts
        </h3>
        <div className="text-sm space-y-2" style={{ color: 'var(--fg2)' }}>
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
              style={{ color: 'var(--tint-teal)' }}
            >
              charts.noaa.gov/ENCs
            </a>
          </p>
        </div>
      </Glass>
    </div>
  )
}

export default S57Downloader
