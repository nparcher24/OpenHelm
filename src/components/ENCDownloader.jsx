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
      await loadMartinStatus()
    } catch (err) {
      console.error('Failed to restart Martin:', err)
      setError(err.message)
    } finally {
      setIsRestartingMartin(false)
    }
  }

  // Calculate estimated download size
  const estimatedDownloadMB = Array.from(selectedRegions).reduce((sum, regionId) => {
    const region = availableRegions.find(r => r.id === regionId)
    return sum + (region?.sizeMB || 0)
  }, 0)

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--fg1)' }}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--fg1)' }}>
          NOAA Nautical Charts (ENC)
        </h2>
        <p style={{ color: 'var(--fg2)' }}>
          Download official NOAA Electronic Navigational Charts for offline use
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg p-4" style={{ background: 'rgba(229,72,72,0.1)', border: '0.5px solid rgba(229,72,72,0.5)' }}>
          <div className="flex items-center space-x-2">
            <XCircleIcon className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--tint-red)' }} />
            <p style={{ color: 'var(--tint-red)' }}>{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-sm"
              style={{ color: 'var(--tint-red)' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Storage Info Panel */}
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

          {storageInfo.enc.downloadedCount > 0 && (
            <div className="text-sm" style={{ color: 'var(--fg2)' }}>
              {storageInfo.enc.downloadedCount} ENC region{storageInfo.enc.downloadedCount !== 1 ? 's' : ''} downloaded
              ({storageInfo.enc.totalSizeMB} MB)
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

      {/* Available Regions for Download */}
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
                      <p className="text-sm mt-1" style={{ color: 'var(--fg2)' }}>{region.description}</p>
                      <p className="text-xs mt-1 font-mono" style={{ color: 'var(--fg2)' }}>
                        Size: {region.sizeMB} MB ({region.sizeGB} GB)
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
                  Estimated download: {estimatedDownloadMB} MB
                </p>
              </div>
              <button
                onClick={handleStartDownload}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium touch-manipulation"
                style={{ background: 'var(--signal)', color: '#fff' }}
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                <span>Download Selected</span>
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
              Download Progress
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

          {/* Progress Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--fg2)' }}>
                {jobProgress.message || 'Downloading...'}
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

          {/* ETA */}
          {jobProgress.estimatedTimeLeft && (
            <p className="text-sm" style={{ color: 'var(--fg2)' }}>
              Estimated time remaining: {jobProgress.estimatedTimeLeft}
            </p>
          )}

          {/* Cancel Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCancelDownload}
              className="px-4 py-2 rounded-lg font-medium touch-manipulation"
              style={{ background: 'rgba(229,72,72,0.14)', color: '#E54848', border: '0.5px solid rgba(229,72,72,0.4)' }}
            >
              Cancel Download
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
                {updateCheckResult.summary.errors > 0 && (
                  <span style={{ color: 'var(--tint-red)' }}>
                    {updateCheckResult.summary.errors} error{updateCheckResult.summary.errors !== 1 ? 's' : ''}
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
                        <p className="text-sm mt-1" style={{ color: 'var(--fg2)' }}>{region.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs font-mono" style={{ color: 'var(--fg2)' }}>
                          <span>Size: {region.sizeMB} MB</span>
                          <span>Downloaded: {new Date(region.downloadedAt).toLocaleDateString()}</span>
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
          About NCDS Charts
        </h3>
        <div className="text-sm space-y-2" style={{ color: 'var(--fg2)' }}>
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
              style={{ color: 'var(--tint-teal)' }}
            >
              distribution.charts.noaa.gov/ncds
            </a>
          </p>
        </div>
      </Glass>
    </div>
  )
}

export default ENCDownloader
