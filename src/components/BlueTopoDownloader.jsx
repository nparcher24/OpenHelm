import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, XCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { useJobProgress } from '../hooks/useJobProgress'
import {
  getStorageInfo,
  startTileDownload,
  cancelTileDownload,
  getTileDownloadStatus,
  getDownloadedTiles,
  deleteTile,
  deleteTilesBatch,
  deleteRawFile,
  deleteRawFilesBatch,
  reprocessAllRawFiles
} from '../services/blueTopoDownloadService'

function BlueTopoDownloader() {
  const location = useLocation()
  const navigate = useNavigate()

  // Selected tiles from BlueTopoTileSelector
  const selectedTiles = location.state?.tiles || []

  // Debug logging
  console.log('[BlueTopoDownloader] Component mounted')
  console.log('[BlueTopoDownloader] Selected tiles:', selectedTiles)
  console.log('[BlueTopoDownloader] Location state:', location.state)

  // Job state
  const [jobId, setJobId] = useState(null)
  const [isStarted, setIsStarted] = useState(false)
  const [error, setError] = useState(null)

  // Storage info
  const [storageInfo, setStorageInfo] = useState(null)
  const [loadingStorage, setLoadingStorage] = useState(true)

  // Downloaded tiles metadata
  const [downloadedTilesMetadata, setDownloadedTilesMetadata] = useState(new Map())
  const [loadingDownloadedTiles, setLoadingDownloadedTiles] = useState(true)

  // Multi-select state for deletion
  const [selectedTilesForDeletion, setSelectedTilesForDeletion] = useState(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  // Raw file operations state
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [reprocessJobId, setReprocessJobId] = useState(null)

  // Use existing job progress hook with BlueTopo status fetcher
  const jobProgress = useJobProgress(jobId, !!jobId, getTileDownloadStatus)

  // Track reprocess job progress separately
  const reprocessProgress = useJobProgress(reprocessJobId, !!reprocessJobId, getTileDownloadStatus)

  // Load storage info and downloaded tiles on mount
  useEffect(() => {
    async function loadStorage() {
      try {
        const info = await getStorageInfo()
        setStorageInfo(info)
      } catch (error) {
        console.error('Failed to load storage info:', error)
        setError('Failed to load storage information')
      } finally {
        setLoadingStorage(false)
      }
    }

    async function loadDownloadedTiles() {
      try {
        setLoadingDownloadedTiles(true)
        const result = await getDownloadedTiles()
        if (result.success && result.tiles) {
          // Create a map for quick lookup: tileId -> metadata
          const metadataMap = new Map()
          result.tiles.forEach(tile => {
            metadataMap.set(tile.tileId, tile)
          })
          setDownloadedTilesMetadata(metadataMap)
          console.log('[BlueTopoDownloader] Loaded downloaded tiles:', metadataMap)
        }
      } catch (error) {
        console.error('Failed to load downloaded tiles:', error)
      } finally {
        setLoadingDownloadedTiles(false)
      }
    }

    loadStorage()
    loadDownloadedTiles()
  }, [])

  // Reload EVERYTHING on EVERY progress update during downloads
  useEffect(() => {
    if (!jobProgress.tiles || !isStarted) return

    console.log('[BlueTopoDownloader] Progress update - reloading ALL data')

    // Reload downloaded tiles list
    ;(async () => {
      try {
        const result = await getDownloadedTiles()
        if (result.success && result.tiles) {
          const metadataMap = new Map()
          result.tiles.forEach(tile => {
            metadataMap.set(tile.tileId, tile)
          })
          setDownloadedTilesMetadata(metadataMap)
          console.log('[BlueTopoDownloader] Reloaded tiles, count:', result.tiles.length)
        }
      } catch (error) {
        console.error('[BlueTopoDownloader] Failed to reload tiles:', error)
      }
    })()

    // Reload storage info
    ;(async () => {
      try {
        const info = await getStorageInfo()
        setStorageInfo(info)
        console.log('[BlueTopoDownloader] Reloaded storage info')
      } catch (error) {
        console.error('[BlueTopoDownloader] Failed to reload storage:', error)
      }
    })()
  }, [jobProgress, isStarted])

  // Handle reprocess completion
  useEffect(() => {
    if (!reprocessProgress || !isReprocessing) return

    // Check if reprocessing is complete
    if (reprocessProgress.status === 'completed' || reprocessProgress.status === 'completed_with_errors') {
      console.log('[BlueTopoDownloader] Reprocessing complete, reloading data')
      setIsReprocessing(false)
      setReprocessJobId(null)

      // Reload everything after reprocessing
      reloadDownloadedTiles()
    }
  }, [reprocessProgress, isReprocessing])

  // Don't redirect - allow viewing downloaded tiles even without selection
  // useEffect(() => {
  //   if (selectedTiles.length === 0 && !jobId) {
  //     navigate('/settings')
  //   }
  // }, [selectedTiles, navigate, jobId])

  // Calculate estimated size
  const estimatedSizeMB = selectedTiles.length * 170
  const estimatedSizeGB = (estimatedSizeMB / 1024).toFixed(2)

  // Start download
  async function handleStartDownload() {
    console.log('[BlueTopoDownloader] Start download clicked')
    console.log('[BlueTopoDownloader] Sending tiles to API:', selectedTiles)
    try {
      setError(null)
      const result = await startTileDownload(selectedTiles)
      console.log('[BlueTopoDownloader] Download started, jobId:', result.jobId)
      setJobId(result.jobId)
      setIsStarted(true)
    } catch (error) {
      console.error('[BlueTopoDownloader] Failed to start download:', error)
      setError(error.message)
    }
  }

  // Cancel download
  async function handleCancel() {
    if (jobId) {
      try {
        await cancelTileDownload(jobId)
      } catch (error) {
        console.error('Failed to cancel download:', error)
      }
    }
    navigate('/settings')
  }

  // Navigate back to settings
  function handleBack() {
    navigate('/settings')
  }

  // Get tile state from job progress
  function getTileState(tileId) {
    if (!jobProgress.tiles) return null
    return jobProgress.tiles.find(t => t.tileId === tileId)
  }

  // Reload downloaded tiles list and storage info
  async function reloadDownloadedTiles() {
    try {
      const result = await getDownloadedTiles()
      if (result.success && result.tiles) {
        const metadataMap = new Map()
        result.tiles.forEach(tile => {
          metadataMap.set(tile.tileId, tile)
        })
        setDownloadedTilesMetadata(metadataMap)
        console.log('[BlueTopoDownloader] Reloaded tiles, count:', result.tiles.length)
      }

      // Reload storage info to reflect freed space
      const info = await getStorageInfo()
      setStorageInfo(info)
      console.log('[BlueTopoDownloader] Reloaded storage info:', info.disk)
    } catch (error) {
      console.error('Failed to reload tiles:', error)
    }
  }

  // Toggle individual tile selection
  function toggleTileSelection(tileId) {
    setSelectedTilesForDeletion(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tileId)) {
        newSet.delete(tileId)
      } else {
        newSet.add(tileId)
      }
      return newSet
    })
  }

  // Toggle all tiles selection
  function toggleAllTilesSelection() {
    if (selectedTilesForDeletion.size === downloadedTilesMetadata.size) {
      // Deselect all
      setSelectedTilesForDeletion(new Set())
    } else {
      // Select all
      const allTileIds = Array.from(downloadedTilesMetadata.keys())
      setSelectedTilesForDeletion(new Set(allTileIds))
    }
  }

  // Delete a single tile
  async function handleDeleteTile(tileId) {
    if (!confirm(`Are you sure you want to delete tile ${tileId}? This will permanently remove all tile data from the device.`)) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteTile(tileId)
      await reloadDownloadedTiles()
      setSelectedTilesForDeletion(prev => {
        const newSet = new Set(prev)
        newSet.delete(tileId)
        return newSet
      })
    } catch (error) {
      console.error('Failed to delete tile:', error)
      setError(`Failed to delete tile: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Delete selected tiles in batch
  async function handleDeleteSelected() {
    const selectedCount = selectedTilesForDeletion.size
    if (selectedCount === 0) return

    if (!confirm(`Are you sure you want to delete ${selectedCount} tile${selectedCount > 1 ? 's' : ''}? This will permanently remove all tile data from the device.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const tileIds = Array.from(selectedTilesForDeletion)
      const result = await deleteTilesBatch(tileIds)

      if (result.results.failed.length > 0) {
        setError(`Deleted ${result.results.deleted.length} tiles, but ${result.results.failed.length} failed`)
      }

      await reloadDownloadedTiles()
      setSelectedTilesForDeletion(new Set())
    } catch (error) {
      console.error('Failed to delete tiles:', error)
      setError(`Failed to delete tiles: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Delete a single raw file
  async function handleDeleteRawFile(tileId) {
    if (!confirm(`Are you sure you want to delete the raw GeoTIFF file for ${tileId}? This will NOT affect the processed tiles.`)) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteRawFile(tileId)
      await reloadDownloadedTiles()
    } catch (error) {
      console.error('Failed to delete raw file:', error)
      setError(`Failed to delete raw file: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Delete raw files for selected tiles
  async function handleDeleteSelectedRawFiles() {
    // Filter to only tiles that have raw files
    const tilesWithRawFiles = Array.from(selectedTilesForDeletion).filter(tileId => {
      const tile = downloadedTilesMetadata.get(tileId)
      return tile?.rawFile?.exists
    })

    if (tilesWithRawFiles.length === 0) {
      setError('None of the selected tiles have raw files')
      return
    }

    if (!confirm(`Are you sure you want to delete ${tilesWithRawFiles.length} raw GeoTIFF file${tilesWithRawFiles.length > 1 ? 's' : ''}? This will NOT affect the processed tiles.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteRawFilesBatch(tilesWithRawFiles)

      if (result.results.failed.length > 0) {
        setError(`Deleted ${result.results.deleted.length} raw files, but ${result.results.failed.length} failed`)
      }

      await reloadDownloadedTiles()
    } catch (error) {
      console.error('Failed to delete raw files:', error)
      setError(`Failed to delete raw files: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Start reprocessing all raw files
  async function handleReprocessRawFiles() {
    if (!confirm('This will reprocess all available raw GeoTIFF files and regenerate tile data. This may take some time. Continue?')) {
      return
    }

    try {
      setIsReprocessing(true)
      setError(null)
      const result = await reprocessAllRawFiles()
      console.log('[BlueTopoDownloader] Reprocess started, jobId:', result.jobId)
      setReprocessJobId(result.jobId)
    } catch (error) {
      console.error('[BlueTopoDownloader] Failed to start reprocessing:', error)
      setError(error.message)
      setIsReprocessing(false)
    }
  }

  // Format bytes to MB/GB
  function formatBytes(bytes) {
    if (bytes === 0) return '0 MB'
    const mb = bytes / 1024 / 1024
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`
    }
    return `${(mb / 1024).toFixed(2)} GB`
  }

  // Format seconds to time string
  function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}m ${secs}s`
  }

  // Calculate overall stats
  const completedCount = jobProgress.tiles?.filter(t => t.status === 'completed').length || 0
  const failedCount = jobProgress.tiles?.filter(t => t.status === 'failed').length || 0
  const downloadingCount = jobProgress.tiles?.filter(t => t.status === 'downloading').length || 0

  // Calculate total downloaded size
  const totalDownloadedBytes = jobProgress.tiles?.reduce((sum, tile) =>
    sum + (tile.downloadedBytes || 0), 0
  ) || 0

  const totalExpectedBytes = jobProgress.tiles?.reduce((sum, tile) =>
    sum + (tile.totalBytes || 0), 0
  ) || (estimatedSizeMB * 1024 * 1024)

  // Calculate combined speed
  const combinedSpeedMBps = jobProgress.tiles?.filter(t => t.status === 'downloading')
    .reduce((sum, tile) => sum + (tile.speedMBps || 0), 0) || 0

  return (
    <div className="bg-terminal-bg min-h-full">
      {/* Header */}
      <div className="bg-terminal-surface border-b border-terminal-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-terminal-green/10 transition-colors"
              >
                <ArrowLeftIcon className="h-6 w-6 text-terminal-green" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-terminal-green text-glow uppercase tracking-wider">
                  BlueTopo Tile Downloader
                </h1>
                <p className="text-sm text-terminal-green-dim">
                  {selectedTiles.length} tile{selectedTiles.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            </div>
            {isStarted && (
              <button
                onClick={handleCancel}
                className="terminal-btn-danger"
              >
                Cancel Download
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-terminal-red/10 border border-terminal-red/50 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <XCircleIcon className="h-5 w-5 text-terminal-red" />
              <p className="text-terminal-red">{error}</p>
            </div>
          </div>
        )}

        {/* Storage Info Panel */}
        {!loadingStorage && storageInfo && (
          <div className="bg-terminal-surface rounded-lg border border-terminal-border p-6">
            <h2 className="text-lg font-semibold text-terminal-green mb-4 uppercase tracking-wide">
              Storage Information
            </h2>

            {/* Disk Space Bar */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-terminal-green-dim">Disk Usage</span>
                <span className="text-terminal-green font-medium">
                  {storageInfo.disk.freeGB} GB free / {storageInfo.disk.totalGB} GB total
                </span>
              </div>
              <div className="w-full bg-terminal-border rounded-full h-4 overflow-hidden">
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
              <p className="text-xs text-terminal-green-dim">
                {storageInfo.disk.usedPercent}% used ({storageInfo.disk.usedGB} GB)
              </p>
            </div>

            {/* Download Size Estimate */}
            <div className="flex items-center justify-between p-4 bg-terminal-bg rounded-lg border border-terminal-border">
              <div>
                <p className="text-sm font-medium text-terminal-green">
                  Estimated Download Size
                </p>
                <p className="text-xs text-terminal-green-dim">
                  {selectedTiles.length} tiles × ~170 MB each
                </p>
              </div>
              <p className="text-2xl font-bold text-terminal-cyan text-glow">
                {estimatedSizeGB} GB
              </p>
            </div>

            {/* Existing Tiles Info */}
            {storageInfo.tiles.existingTiles > 0 && (
              <div className="mt-4 pt-4 border-t border-terminal-border">
                <p className="text-sm text-terminal-green-dim">
                  {storageInfo.tiles.existingTiles} BlueTopo tile{storageInfo.tiles.existingTiles !== 1 ? 's' : ''} already downloaded
                  ({storageInfo.tiles.totalSizeMB} MB)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Chart Selector Action Panel */}
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-terminal-green mb-1 uppercase tracking-wide">
                Select Charts to Download
              </h3>
              <p className="text-sm text-terminal-green-dim">
                Choose BlueTopo regions from the interactive map
              </p>
            </div>
            <button
              onClick={() => navigate('/bluetopo-tiles')}
              className="terminal-btn-primary flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span>Open Chart Selector</span>
            </button>
          </div>
        </div>

        {/* Selected Tiles for Deletion Panel */}
        {selectedTilesForDeletion.size > 0 && (
          <div className="bg-terminal-green/5 border-2 border-terminal-green/50 rounded-lg p-6 shadow-glow-green-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center justify-center w-12 h-12 bg-terminal-green/20 border border-terminal-green rounded-full">
                  <span className="text-2xl font-bold text-terminal-green text-glow">{selectedTilesForDeletion.size}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-terminal-green">
                    {selectedTilesForDeletion.size} Tile{selectedTilesForDeletion.size !== 1 ? 's' : ''} Selected for Deletion
                  </h3>
                  <p className="text-sm text-terminal-green-dim">
                    View selected tiles on the map or clear selection
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    // Get selected tile IDs and navigate to map view
                    const selectedIds = Array.from(selectedTilesForDeletion)
                    const selectedTileData = Array.from(downloadedTilesMetadata.values())
                      .filter(tile => selectedIds.includes(tile.tileId))

                    // Navigate to tiles view with selected tiles highlighted
                    navigate('/bluetopo-tiles', {
                      state: {
                        highlightedTiles: selectedIds,
                        tiles: selectedTileData
                      }
                    })
                  }}
                  className="terminal-btn-primary flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span>View on Map</span>
                </button>

                <button
                  onClick={() => setSelectedTilesForDeletion(new Set())}
                  className="terminal-btn flex items-center space-x-2"
                >
                  <XCircleIcon className="h-5 w-5" />
                  <span>Clear Selection</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reprocess Progress */}
        {isReprocessing && reprocessProgress && (
          <div className="bg-terminal-surface rounded-lg border border-terminal-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-terminal-green uppercase tracking-wide">
                Reprocessing Raw Files
              </h2>
              {reprocessProgress.connected !== undefined && (
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${reprocessProgress.connected ? 'bg-terminal-green shadow-glow-green-sm' : 'bg-terminal-amber shadow-glow-amber'}`} />
                  <span className="text-xs text-terminal-green-dim">
                    {reprocessProgress.connected ? 'Connected' : 'Polling'}
                  </span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-terminal-green-dim">
                  {reprocessProgress.summary?.completedTiles || 0} of {reprocessProgress.summary?.totalTiles || 0} tiles reprocessed
                  {reprocessProgress.summary?.failedTiles > 0 && ` (${reprocessProgress.summary.failedTiles} failed)`}
                </span>
                <span className="text-terminal-green font-medium">
                  {reprocessProgress.progress || 0}%
                </span>
              </div>
              <div className="w-full bg-terminal-border rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-terminal-amber shadow-glow-amber transition-all duration-300"
                  style={{ width: `${reprocessProgress.progress || 0}%` }}
                />
              </div>
            </div>

            {/* Status Message */}
            {reprocessProgress.message && (
              <p className="mt-4 text-sm text-terminal-green-dim">
                {reprocessProgress.message}
              </p>
            )}
          </div>
        )}

        {/* Downloaded Tiles Table */}
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-terminal-green uppercase tracking-wide">
              Downloaded Tiles {!loadingDownloadedTiles && `(${downloadedTilesMetadata.size})`}
            </h2>

            <div className="flex items-center space-x-2">
              {/* Reprocess Raw Files Button */}
              {!isStarted && (
                <button
                  onClick={handleReprocessRawFiles}
                  disabled={loadingDownloadedTiles || isReprocessing}
                  className="px-4 py-2 bg-terminal-amber/20 border border-terminal-amber text-terminal-amber rounded-lg hover:bg-terminal-amber/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  title="Reprocess all raw GeoTIFF files"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>{isReprocessing ? 'Reprocessing...' : 'Reprocess Raw Files'}</span>
                </button>
              )}

              {/* Delete buttons when tiles are selected */}
              {!loadingDownloadedTiles && selectedTilesForDeletion.size > 0 && (
                <>
                  <button
                    onClick={handleDeleteSelectedRawFiles}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-terminal-amber/20 border border-terminal-amber text-terminal-amber rounded-lg hover:bg-terminal-amber/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                    title="Delete raw GeoTIFF files only (keeps processed tiles)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Delete Raw Files ({selectedTilesForDeletion.size})</span>
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                    className="terminal-btn-danger flex items-center space-x-2"
                  >
                    <XCircleIcon className="h-5 w-5" />
                    <span>Delete Tiles ({selectedTilesForDeletion.size})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {loadingDownloadedTiles ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-terminal-green mb-4 shadow-glow-green"></div>
              <p className="text-terminal-green-dim">Loading downloaded tiles...</p>
            </div>
          ) : downloadedTilesMetadata.size === 0 ? (
            <div className="text-center py-12">
              <p className="text-terminal-green-dim">No tiles downloaded yet. Select tiles from the chart selector to begin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-terminal-bg text-terminal-green border-b border-terminal-border">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedTilesForDeletion.size === downloadedTilesMetadata.size && downloadedTilesMetadata.size > 0}
                        onChange={toggleAllTilesSelection}
                        className="terminal-checkbox"
                      />
                    </th>
                    <th className="px-4 py-3">Tile ID</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Downloaded Date</th>
                    <th className="px-4 py-3">Published Date</th>
                    <th className="px-4 py-3">Tile Scheme</th>
                    <th className="px-4 py-3">Raw File</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(downloadedTilesMetadata.values()).map((tile) => (
                    <tr
                      key={tile.tileId}
                      className="border-b border-terminal-border hover:bg-terminal-green/5"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedTilesForDeletion.has(tile.tileId)}
                          onChange={() => toggleTileSelection(tile.tileId)}
                          className="terminal-checkbox"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-terminal-green font-mono">
                        {tile.tileId}
                      </td>
                      <td className="px-4 py-3 text-terminal-green-dim">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-terminal-green/10 text-terminal-green border border-terminal-green/30">
                          {tile.version || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-terminal-green-dim font-mono">
                        {tile.downloadedDate ? new Date(tile.downloadedDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-terminal-green-dim font-mono">
                        {tile.publishedDate ? new Date(tile.publishedDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-terminal-green-dim text-xs font-mono">
                        {tile.tileSchemeVersion || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        {tile.rawFile && tile.rawFile.exists ? (
                          <div className="flex items-center space-x-2">
                            <CheckCircleIcon className="h-4 w-4 text-terminal-green" />
                            <span className="text-xs text-terminal-green-dim font-mono">
                              {tile.rawFile.sizeMB} MB
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-terminal-green-dim">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          {tile.rawFile && tile.rawFile.exists && (
                            <button
                              onClick={() => handleDeleteRawFile(tile.tileId)}
                              disabled={isDeleting}
                              className="text-terminal-amber hover:text-terminal-amber font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete raw GeoTIFF file"
                            >
                              Del Raw
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTile(tile.tileId)}
                            disabled={isDeleting}
                            className="text-terminal-red hover:text-terminal-red font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isStarted && jobProgress && (
          <div className="bg-terminal-surface rounded-lg border border-terminal-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-terminal-green uppercase tracking-wide">
                Download Progress
              </h2>
              {jobProgress.connected !== undefined && (
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${jobProgress.connected ? 'bg-terminal-green shadow-glow-green-sm' : 'bg-terminal-amber shadow-glow-amber'}`} />
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
                  {completedCount} of {selectedTiles.length} tiles complete
                  {failedCount > 0 && ` (${failedCount} failed)`}
                </span>
                <span className="text-terminal-green font-medium">
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

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-terminal-bg rounded-lg border border-terminal-border">
              <div>
                <p className="text-xs text-terminal-green-dim uppercase tracking-wide">Downloaded</p>
                <p className="text-lg font-semibold text-terminal-green font-mono">
                  {formatBytes(totalDownloadedBytes)} / {formatBytes(totalExpectedBytes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-terminal-green-dim uppercase tracking-wide">Speed</p>
                <p className="text-lg font-semibold text-terminal-cyan font-mono">
                  {combinedSpeedMBps.toFixed(1)} MB/s
                </p>
              </div>
              <div>
                <p className="text-xs text-terminal-green-dim uppercase tracking-wide">Active Downloads</p>
                <p className="text-lg font-semibold text-terminal-green font-mono">
                  {downloadingCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-terminal-green-dim uppercase tracking-wide">Time Remaining</p>
                <p className="text-lg font-semibold text-terminal-green font-mono">
                  {jobProgress.estimatedTimeLeft || '--'}
                </p>
              </div>
            </div>

            {/* Status Message */}
            {jobProgress.message && (
              <p className="mt-4 text-sm text-terminal-green-dim">
                {jobProgress.message}
              </p>
            )}
          </div>
        )}

        {/* Start Button (before download starts) */}
        {!isStarted && selectedTiles.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={handleStartDownload}
              disabled={loadingStorage || !storageInfo}
              className="px-8 py-4 bg-terminal-green text-terminal-bg text-lg font-bold rounded-lg hover:bg-terminal-green-bright shadow-glow-green disabled:bg-terminal-green-dim disabled:shadow-none disabled:cursor-not-allowed transition-all uppercase tracking-wider"
            >
              Start Download
            </button>
          </div>
        )}

        {/* Tile Progress Cards */}
        {isStarted && jobProgress.tiles && (
          <div className="bg-terminal-surface rounded-lg border border-terminal-border p-6">
            <h2 className="text-lg font-semibold text-terminal-green mb-4 uppercase tracking-wide">
              Individual Tile Progress
            </h2>

            <div className="space-y-3">
              {selectedTiles.map((tile) => {
                const tileState = getTileState(tile.tile)
                const downloadedMetadata = downloadedTilesMetadata.get(tile.tile)

                if (!tileState) {
                  return (
                    <TileProgressCard
                      key={tile.tile}
                      tileId={tile.tile}
                      resolution={tile.resolution}
                      status="waiting"
                      progress={0}
                      downloadedMetadata={downloadedMetadata}
                    />
                  )
                }

                return (
                  <TileProgressCard
                    key={tile.tile}
                    tileId={tileState.tileId}
                    resolution={tile.resolution}
                    status={tileState.status}
                    progress={tileState.progress}
                    downloadedBytes={tileState.downloadedBytes}
                    totalBytes={tileState.totalBytes}
                    speedMBps={tileState.speedMBps}
                    estimatedSecondsLeft={tileState.estimatedSecondsLeft}
                    error={tileState.error}
                    downloadedMetadata={downloadedMetadata}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Individual tile progress card component
 */
function TileProgressCard({
  tileId,
  resolution,
  status,
  progress,
  downloadedBytes,
  totalBytes,
  speedMBps,
  estimatedSecondsLeft,
  error,
  downloadedMetadata
}) {
  // Status color mapping - terminal theme
  const statusColors = {
    waiting: 'bg-terminal-bg border-terminal-border',
    downloading: 'bg-terminal-cyan/5 border-terminal-cyan/50',
    converting: 'bg-terminal-amber/5 border-terminal-amber/50',
    completed: 'bg-terminal-green/5 border-terminal-green/50',
    failed: 'bg-terminal-red/5 border-terminal-red/50'
  }

  const statusIcons = {
    waiting: null,
    downloading: null,
    converting: null,
    completed: <CheckCircleIcon className="h-5 w-5 text-terminal-green" />,
    failed: <XCircleIcon className="h-5 w-5 text-terminal-red" />
  }

  const statusLabels = {
    waiting: '[..] Waiting',
    downloading: '[>>] Downloading',
    converting: '[~~] Converting',
    completed: '[OK] Completed',
    failed: '[!!] Failed'
  }

  const statusTextColors = {
    waiting: 'text-terminal-green-dim',
    downloading: 'text-terminal-cyan',
    converting: 'text-terminal-amber',
    completed: 'text-terminal-green',
    failed: 'text-terminal-red'
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 MB'
    const mb = bytes / 1024 / 1024
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className={`border rounded-lg p-4 ${statusColors[status] || statusColors.waiting}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {statusIcons[status]}
          <h3 className="font-semibold text-terminal-green font-mono">
            {tileId}
          </h3>
          <span className="text-xs px-2 py-1 rounded bg-terminal-border text-terminal-green-dim font-mono">
            {resolution}
          </span>
        </div>
        <span className={`text-sm font-mono ${statusTextColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>

      {/* Progress Bar */}
      {(status === 'downloading' || status === 'converting') && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-terminal-green-dim font-mono">
            <span>{progress}%</span>
            {totalBytes > 0 && (
              <span>{formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</span>
            )}
          </div>
          <div className="w-full bg-terminal-border rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                status === 'converting' ? 'bg-terminal-amber shadow-glow-amber' : 'bg-terminal-cyan shadow-glow-cyan'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Download Stats */}
      {status === 'downloading' && (speedMBps > 0 || estimatedSecondsLeft > 0) && (
        <div className="mt-2 flex items-center space-x-4 text-xs text-terminal-green-dim font-mono">
          {speedMBps > 0 && (
            <span>Speed: {speedMBps.toFixed(1)} MB/s</span>
          )}
          {estimatedSecondsLeft > 0 && (
            <span>ETA: {estimatedSecondsLeft < 60 ? `${estimatedSecondsLeft}s` : `${Math.floor(estimatedSecondsLeft / 60)}m`}</span>
          )}
        </div>
      )}

      {/* Error Message */}
      {status === 'failed' && error && (
        <p className="mt-2 text-sm text-terminal-red font-mono">
          {error}
        </p>
      )}

      {/* Completed Info */}
      {status === 'completed' && totalBytes > 0 && (
        <p className="mt-2 text-sm text-terminal-green font-mono">
          Downloaded {formatBytes(totalBytes)}
        </p>
      )}

      {/* Already Downloaded Info */}
      {downloadedMetadata && (
        <div className="mt-2 pt-2 border-t border-terminal-border">
          <div className="flex items-center space-x-2 mb-1">
            <CheckCircleIcon className="h-4 w-4 text-terminal-green" />
            <span className="text-xs font-medium text-terminal-green">
              Already Downloaded
            </span>
          </div>
          <div className="space-y-1 text-xs text-terminal-green-dim font-mono">
            {downloadedMetadata.downloadedDate && (
              <div className="flex justify-between">
                <span>Downloaded on device:</span>
                <span className="font-medium text-terminal-green">
                  {new Date(downloadedMetadata.downloadedDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {downloadedMetadata.publishedDate && (
              <div className="flex justify-between">
                <span>Published by NOAA:</span>
                <span className="font-medium text-terminal-green">
                  {new Date(downloadedMetadata.publishedDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {downloadedMetadata.version && (
              <div className="flex justify-between">
                <span>Version:</span>
                <span className="font-medium text-terminal-cyan">
                  {downloadedMetadata.version}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BlueTopoDownloader
