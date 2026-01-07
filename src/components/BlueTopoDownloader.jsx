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
    <div className="h-screen overflow-y-auto bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <ArrowLeftIcon className="h-6 w-6 text-slate-600 dark:text-slate-300" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  BlueTopo Tile Downloader
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {selectedTiles.length} tile{selectedTiles.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            </div>
            {isStarted && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        )}

        {/* Storage Info Panel */}
        {!loadingStorage && storageInfo && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Storage Information
            </h2>

            {/* Disk Space Bar */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Disk Usage</span>
                <span className="text-slate-900 dark:text-slate-100 font-medium">
                  {storageInfo.disk.freeGB} GB free / {storageInfo.disk.totalGB} GB total
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    storageInfo.disk.usedPercent > 90
                      ? 'bg-red-600'
                      : storageInfo.disk.usedPercent > 75
                      ? 'bg-yellow-600'
                      : 'bg-marine-600'
                  }`}
                  style={{ width: `${storageInfo.disk.usedPercent}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {storageInfo.disk.usedPercent}% used ({storageInfo.disk.usedGB} GB)
              </p>
            </div>

            {/* Download Size Estimate */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Estimated Download Size
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedTiles.length} tiles × ~170 MB each
                </p>
              </div>
              <p className="text-2xl font-bold text-marine-600 dark:text-marine-400">
                {estimatedSizeGB} GB
              </p>
            </div>

            {/* Existing Tiles Info */}
            {storageInfo.tiles.existingTiles > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {storageInfo.tiles.existingTiles} BlueTopo tile{storageInfo.tiles.existingTiles !== 1 ? 's' : ''} already downloaded
                  ({storageInfo.tiles.totalSizeMB} MB)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Chart Selector Action Panel */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Select Charts to Download
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Choose BlueTopo regions from the interactive map
              </p>
            </div>
            <button
              onClick={() => navigate('/bluetopo-tiles')}
              className="px-6 py-3 bg-marine-600 text-white rounded-lg hover:bg-marine-700 transition-colors flex items-center space-x-2 font-medium"
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
          <div className="bg-marine-50 dark:bg-marine-900/20 border-2 border-marine-300 dark:border-marine-700 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center justify-center w-12 h-12 bg-marine-600 rounded-full">
                  <span className="text-2xl font-bold text-white">{selectedTilesForDeletion.size}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {selectedTilesForDeletion.size} Tile{selectedTilesForDeletion.size !== 1 ? 's' : ''} Selected for Deletion
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
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
                  className="px-4 py-2 bg-marine-600 text-white rounded-lg hover:bg-marine-700 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span>View on Map</span>
                </button>

                <button
                  onClick={() => setSelectedTilesForDeletion(new Set())}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center space-x-2"
                >
                  <XCircleIcon className="h-5 w-5" />
                  <span>Clear Selection</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Downloaded Tiles Table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Downloaded Tiles {!loadingDownloadedTiles && `(${downloadedTilesMetadata.size})`}
            </h2>

            <div className="flex items-center space-x-2">
              {/* Reprocess Raw Files Button */}
              {!isStarted && !isReprocessing && (
                <button
                  onClick={handleReprocessRawFiles}
                  disabled={loadingDownloadedTiles}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  title="Reprocess all raw GeoTIFF files"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Reprocess Raw Files</span>
                </button>
              )}

              {/* Delete buttons when tiles are selected */}
              {!loadingDownloadedTiles && selectedTilesForDeletion.size > 0 && (
                <>
                  <button
                    onClick={handleDeleteSelectedRawFiles}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
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
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-marine-600 dark:border-marine-400 mb-4"></div>
              <p className="text-slate-600 dark:text-slate-400">Loading downloaded tiles...</p>
            </div>
          ) : downloadedTilesMetadata.size === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 dark:text-slate-400">No tiles downloaded yet. Select tiles from the chart selector to begin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedTilesForDeletion.size === downloadedTilesMetadata.size && downloadedTilesMetadata.size > 0}
                        onChange={toggleAllTilesSelection}
                        className="w-4 h-4 text-marine-600 bg-slate-100 border-slate-300 rounded focus:ring-marine-500 dark:focus:ring-marine-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-600 dark:border-slate-500 cursor-pointer"
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
                      className="border-b border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedTilesForDeletion.has(tile.tileId)}
                          onChange={() => toggleTileSelection(tile.tileId)}
                          className="w-4 h-4 text-marine-600 bg-slate-100 border-slate-300 rounded focus:ring-marine-500 dark:focus:ring-marine-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-600 dark:border-slate-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {tile.tileId}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-marine-100 text-marine-800 dark:bg-marine-900 dark:text-marine-200">
                          {tile.version || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {tile.downloadedDate ? new Date(tile.downloadedDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {tile.publishedDate ? new Date(tile.publishedDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {tile.tileSchemeVersion || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        {tile.rawFile && tile.rawFile.exists ? (
                          <div className="flex items-center space-x-2">
                            <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              {tile.rawFile.sizeMB} MB
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          {tile.rawFile && tile.rawFile.exists && (
                            <button
                              onClick={() => handleDeleteRawFile(tile.tileId)}
                              disabled={isDeleting}
                              className="text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete raw GeoTIFF file"
                            >
                              Del Raw
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTile(tile.tileId)}
                            disabled={isDeleting}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Overall Progress */}
        {isStarted && jobProgress && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Download Progress
              </h2>
              {jobProgress.connected !== undefined && (
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${jobProgress.connected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {jobProgress.connected ? 'Connected' : 'Polling'}
                  </span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  {completedCount} of {selectedTiles.length} tiles complete
                  {failedCount > 0 && ` (${failedCount} failed)`}
                </span>
                <span className="text-slate-900 dark:text-slate-100 font-medium">
                  {jobProgress.progress || 0}%
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-marine-600 transition-all duration-300"
                  style={{ width: `${jobProgress.progress || 0}%` }}
                />
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Downloaded</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {formatBytes(totalDownloadedBytes)} / {formatBytes(totalExpectedBytes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Speed</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {combinedSpeedMBps.toFixed(1)} MB/s
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Active Downloads</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {downloadingCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Time Remaining</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {jobProgress.estimatedTimeLeft || '--'}
                </p>
              </div>
            </div>

            {/* Status Message */}
            {jobProgress.message && (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                {jobProgress.message}
              </p>
            )}
          </div>
        )}

        {/* Start Button (before download starts) */}
        {!isStarted && (
          <div className="flex justify-center">
            <button
              onClick={handleStartDownload}
              disabled={loadingStorage || !storageInfo}
              className="px-8 py-4 bg-marine-600 text-white text-lg font-semibold rounded-lg hover:bg-marine-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              Start Download
            </button>
          </div>
        )}

        {/* Tile Progress Cards */}
        {isStarted && jobProgress.tiles && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
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
  // Status color mapping
  const statusColors = {
    waiting: 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600',
    downloading: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700',
    converting: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700',
    completed: 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700',
    failed: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
  }

  const statusIcons = {
    waiting: null,
    downloading: null,
    converting: null,
    completed: <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />,
    failed: <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
  }

  const statusLabels = {
    waiting: 'Waiting',
    downloading: 'Downloading',
    converting: 'Converting to tiles',
    completed: 'Completed',
    failed: 'Failed'
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
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            {tileId}
          </h3>
          <span className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300">
            {resolution}
          </span>
        </div>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {statusLabels[status]}
        </span>
      </div>

      {/* Progress Bar */}
      {(status === 'downloading' || status === 'converting') && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>{progress}%</span>
            {totalBytes > 0 && (
              <span>{formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</span>
            )}
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                status === 'converting' ? 'bg-yellow-600' : 'bg-blue-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Download Stats */}
      {status === 'downloading' && (speedMBps > 0 || estimatedSecondsLeft > 0) && (
        <div className="mt-2 flex items-center space-x-4 text-xs text-slate-600 dark:text-slate-400">
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
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Completed Info */}
      {status === 'completed' && totalBytes > 0 && (
        <p className="mt-2 text-sm text-green-600 dark:text-green-400">
          Downloaded {formatBytes(totalBytes)}
        </p>
      )}

      {/* Already Downloaded Info */}
      {downloadedMetadata && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
          <div className="flex items-center space-x-2 mb-1">
            <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Already Downloaded
            </span>
          </div>
          <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {downloadedMetadata.downloadedDate && (
              <div className="flex justify-between">
                <span>Downloaded on device:</span>
                <span className="font-medium">
                  {new Date(downloadedMetadata.downloadedDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {downloadedMetadata.publishedDate && (
              <div className="flex justify-between">
                <span>Published by NOAA:</span>
                <span className="font-medium">
                  {new Date(downloadedMetadata.publishedDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {downloadedMetadata.version && (
              <div className="flex justify-between">
                <span>Version:</span>
                <span className="font-medium text-marine-600 dark:text-marine-400">
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
