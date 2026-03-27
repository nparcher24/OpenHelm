import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useJobProgress } from '../hooks/useJobProgress'
import {
  getStorageInfo,
  getRegions,
  estimateDownloadSize,
  startDownload,
  getDownloadJobStatus,
  cancelDownload,
  deleteRegion
} from '../services/weatherDownloadService'

const DATA_TYPES = [
  { id: 'tides', label: 'Tide Predictions', desc: 'NOAA CO-OPS tide stations' },
  { id: 'currents', label: 'Current Predictions', desc: 'NOAA CO-OPS current stations' },
  { id: 'wind', label: 'Wind/Met Observations', desc: 'CO-OPS + NDBC buoys' },
  { id: 'wind_grid', label: 'Wind Grid Forecast', desc: 'Open-Meteo 0.25° grid' },
  { id: 'marine_grid', label: 'Marine/Wave Forecast', desc: 'Open-Meteo wave/swell grid' }
]

function dataAge(downloadedAt) {
  const hours = (Date.now() - new Date(downloadedAt).getTime()) / (1000 * 60 * 60)
  if (hours < 6) return { color: 'text-green-400', label: `${Math.round(hours)}h ago` }
  if (hours < 24) return { color: 'text-yellow-400', label: `${Math.round(hours)}h ago` }
  const days = Math.round(hours / 24)
  return { color: 'text-red-400', label: `${days}d ago` }
}

function WeatherDownloader() {
  const location = useLocation()
  const navigate = useNavigate()

  // Storage state
  const [storageInfo, setStorageInfo] = useState(null)
  const [loadingStorage, setLoadingStorage] = useState(true)

  // Regions state
  const [regions, setRegions] = useState([])
  const [loadingRegions, setLoadingRegions] = useState(true)
  const [regionsExpanded, setRegionsExpanded] = useState(true)

  // Download form state
  const [regionName, setRegionName] = useState('')
  const [forecastDays, setForecastDays] = useState(7)
  const [selectedDataTypes, setSelectedDataTypes] = useState(['tides', 'currents', 'wind', 'wind_grid'])
  const [west, setWest] = useState(() => location.state?.weatherBounds?.[0]?.toString() || '')
  const [south, setSouth] = useState(() => location.state?.weatherBounds?.[1]?.toString() || '')
  const [east, setEast] = useState(() => location.state?.weatherBounds?.[2]?.toString() || '')
  const [north, setNorth] = useState(() => location.state?.weatherBounds?.[3]?.toString() || '')
  const [estimate, setEstimate] = useState(null)
  const [loadingEstimate, setLoadingEstimate] = useState(false)

  // Job state
  const [jobId, setJobId] = useState(null)
  const [isStarted, setIsStarted] = useState(false)
  const [error, setError] = useState(null)

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  // Job progress
  const jobProgress = useJobProgress(jobId, !!jobId, getDownloadJobStatus)

  // Load data on mount
  useEffect(() => {
    loadStorage()
    loadRegions()
  }, [])

  // Pre-fill form from most recent region (if no bounds passed from map selector)
  useEffect(() => {
    if (regions.length === 0) return
    const hasBoundsFromMap = location.state?.weatherBounds
    if (hasBoundsFromMap) return // map selector takes priority

    const last = regions[regions.length - 1]
    if (!west && !east && !south && !north) {
      setWest(String(last.bounds[0]))
      setSouth(String(last.bounds[1]))
      setEast(String(last.bounds[2]))
      setNorth(String(last.bounds[3]))
    }
    if (!regionName) {
      setRegionName(last.name)
    }
    if (last.forecastDays) setForecastDays(last.forecastDays)
    if (last.dataTypes) setSelectedDataTypes(last.dataTypes)
  }, [regions])

  async function loadStorage() {
    try {
      setLoadingStorage(true)
      const info = await getStorageInfo()
      setStorageInfo(info)
    } catch (err) {
      console.error('Failed to load storage:', err)
    } finally {
      setLoadingStorage(false)
    }
  }

  async function loadRegions() {
    try {
      setLoadingRegions(true)
      const result = await getRegions()
      setRegions(result.regions || [])
    } catch (err) {
      console.error('Failed to load regions:', err)
    } finally {
      setLoadingRegions(false)
    }
  }

  // Refresh on job complete
  useEffect(() => {
    if (jobProgress.status === 'completed' || jobProgress.status === 'completed_with_errors') {
      loadRegions()
      loadStorage()
    }
  }, [jobProgress.status])

  function getBounds() {
    const w = parseFloat(west)
    const s = parseFloat(south)
    const e = parseFloat(east)
    const n = parseFloat(north)
    if (isNaN(w) || isNaN(s) || isNaN(e) || isNaN(n)) return null
    if (w >= e || s >= n) return null
    return [w, s, e, n]
  }

  const bounds = getBounds()
  const boundsValid = bounds !== null

  // Fetch estimate when bounds or days change
  useEffect(() => {
    if (!bounds) {
      setEstimate(null)
      return
    }

    let cancelled = false
    async function fetchEstimate() {
      setLoadingEstimate(true)
      try {
        const result = await estimateDownloadSize(bounds, forecastDays)
        if (!cancelled) setEstimate(result)
      } catch (err) {
        console.error('Estimate failed:', err)
        if (!cancelled) setEstimate(null)
      } finally {
        if (!cancelled) setLoadingEstimate(false)
      }
    }

    fetchEstimate()
    return () => { cancelled = true }
  }, [west, south, east, north, forecastDays])

  function toggleDataType(typeId) {
    setSelectedDataTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    )
  }

  function prefillFromRegion(region) {
    setWest(String(region.bounds[0]))
    setSouth(String(region.bounds[1]))
    setEast(String(region.bounds[2]))
    setNorth(String(region.bounds[3]))
    if (region.forecastDays) setForecastDays(region.forecastDays)
    if (region.dataTypes) setSelectedDataTypes(region.dataTypes)
  }

  async function handleStartDownload() {
    if (!boundsValid) {
      setError('Invalid bounding box. West < East, South < North required.')
      return
    }
    if (!regionName.trim()) {
      setError('Please enter a region name.')
      return
    }
    if (selectedDataTypes.length === 0) {
      setError('Select at least one data type.')
      return
    }

    setError(null)
    try {
      const result = await startDownload(regionName.trim(), bounds, forecastDays, selectedDataTypes)
      setJobId(result.jobId)
      setIsStarted(true)
    } catch (err) {
      setError(`Download failed: ${err.message || String(err)}`)
    }
  }

  async function handleCancel() {
    if (!jobId) return
    try { await cancelDownload(jobId) } catch (err) { console.error('Cancel failed:', err) }
  }

  async function handleDeleteRegion(regionId) {
    try {
      await deleteRegion(regionId)
      setDeleteConfirmId(null)
      await loadRegions()
      await loadStorage()
    } catch (err) {
      setError(`Delete failed: ${err.message}`)
    }
  }

  async function handleRefreshRegion(region) {
    prefillFromRegion(region)
    setRegionName(region.name + ' (updated)')
  }

  function handleReset() {
    setJobId(null)
    setIsStarted(false)
    setError(null)
    setRegionName('')
    setWest('')
    setSouth('')
    setEast('')
    setNorth('')
    setEstimate(null)
  }

  const isDownloading = isStarted && jobProgress.isActive
  const isComplete = jobProgress.status === 'completed' || jobProgress.status === 'completed_with_errors'

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-terminal-green">Weather & Ocean Data</h2>
      <p className="text-sm text-terminal-green-dim">
        Download tide predictions, current forecasts, wind observations, and grid forecasts for offline use.
        Sources: NOAA CO-OPS, NDBC buoys, Open-Meteo.
      </p>

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm break-all">
          <span className="font-medium">Error: </span>{error}
          <button onClick={() => setError(null)} className="ml-2 underline text-red-300">dismiss</button>
        </div>
      )}

      {/* Storage Summary */}
      {storageInfo && (
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4">
          <h3 className="text-sm font-semibold text-terminal-green uppercase tracking-wide mb-3">Storage</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-terminal-green-dim">
              <span>Weather data: {storageInfo.weather?.totalSizeMB || 0} MB</span>
              <span>Free: {storageInfo.disk?.freeGB} GB / {storageInfo.disk?.totalGB} GB</span>
            </div>
            <div className="w-full bg-terminal-border rounded-full h-2">
              <div
                className="bg-terminal-green/60 h-2 rounded-full transition-all"
                style={{ width: `${storageInfo.disk?.usedPercent || 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Download Panel */}
      {!isStarted ? (
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4 space-y-4">
          <h3 className="text-sm font-semibold text-terminal-green uppercase tracking-wide">New Download</h3>

          {/* Region Name */}
          <div>
            <label className="block text-sm text-terminal-green-dim mb-1">Region Name</label>
            <input
              type="text"
              value={regionName}
              onChange={e => setRegionName(e.target.value)}
              placeholder="e.g., Chesapeake Bay"
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-green placeholder:text-terminal-green/30 focus:border-terminal-green focus:outline-none"
            />
          </div>

          {/* Bounding Box */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-terminal-green-dim">Bounding Box (decimal degrees)</label>
              <button
                onClick={() => navigate('/weather-region', {
                  state: {
                    returnTo: '/settings?section=weather',
                    existingBounds: getBounds()
                  }
                })}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-terminal-border text-terminal-green-dim hover:border-terminal-green hover:text-terminal-green transition-all touch-manipulation"
              >
                Select on Map
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-terminal-green/40 mb-1">West (lon)</label>
                <input type="number" step="0.01" value={west} onChange={e => setWest(e.target.value)} placeholder="-76.5"
                  className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-green placeholder:text-terminal-green/30 focus:border-terminal-green focus:outline-none font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-terminal-green/40 mb-1">East (lon)</label>
                <input type="number" step="0.01" value={east} onChange={e => setEast(e.target.value)} placeholder="-75.5"
                  className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-green placeholder:text-terminal-green/30 focus:border-terminal-green focus:outline-none font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-terminal-green/40 mb-1">South (lat)</label>
                <input type="number" step="0.01" value={south} onChange={e => setSouth(e.target.value)} placeholder="36.5"
                  className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-green placeholder:text-terminal-green/30 focus:border-terminal-green focus:outline-none font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-terminal-green/40 mb-1">North (lat)</label>
                <input type="number" step="0.01" value={north} onChange={e => setNorth(e.target.value)} placeholder="37.5"
                  className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-terminal-green placeholder:text-terminal-green/30 focus:border-terminal-green focus:outline-none font-mono text-sm" />
              </div>
            </div>
            {west && east && south && north && !boundsValid && (
              <p className="text-xs text-red-400 mt-1">Invalid bounds: West must be less than East, South less than North</p>
            )}
          </div>

          {/* Forecast Duration */}
          <div>
            <label className="block text-sm text-terminal-green-dim mb-1">Forecast Duration</label>
            <div className="flex gap-2">
              {[3, 7, 14].map(days => (
                <button
                  key={days}
                  onClick={() => setForecastDays(days)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all touch-manipulation ${
                    forecastDays === days
                      ? 'bg-terminal-green/20 border-terminal-green text-terminal-green'
                      : 'border-terminal-border text-terminal-green-dim hover:border-terminal-green/50'
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          {/* Data Types */}
          <div>
            <label className="block text-sm text-terminal-green-dim mb-2">Data Types</label>
            <div className="space-y-2">
              {DATA_TYPES.map(dt => (
                <label key={dt.id} className="flex items-start gap-3 cursor-pointer touch-manipulation">
                  <input
                    type="checkbox"
                    checked={selectedDataTypes.includes(dt.id)}
                    onChange={() => toggleDataType(dt.id)}
                    className="mt-0.5 accent-green-500"
                  />
                  <div>
                    <div className="text-sm text-terminal-green">{dt.label}</div>
                    <div className="text-xs text-terminal-green/40">{dt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Estimate */}
          {estimate && (
            <div className="text-sm text-terminal-green-dim space-y-1">
              <div>
                Stations: <span className="text-terminal-green font-medium">
                  {(estimate.stations?.tideCount || 0)} tide, {(estimate.stations?.currentCount || 0)} current, {(estimate.stations?.metCount || 0)} met
                </span>
              </div>
              <div>
                Grid points: <span className="text-terminal-green font-medium">{estimate.gridPoints}</span>
                {' · '}Est. API calls: <span className="text-terminal-green font-medium">{estimate.estimatedApiCalls}</span>
              </div>
              {!estimate.stationsCached && (
                <div className="text-xs text-yellow-400">Station cache not available — counts will be determined during download</div>
              )}
            </div>
          )}
          {loadingEstimate && (
            <div className="text-sm text-terminal-green/50">Calculating estimate...</div>
          )}

          {/* Download Button */}
          <button
            onClick={handleStartDownload}
            disabled={!boundsValid || !regionName.trim() || selectedDataTypes.length === 0 || loadingEstimate}
            className="w-full py-3 bg-terminal-green/20 hover:bg-terminal-green/30 border border-terminal-green text-terminal-green rounded-lg font-medium transition-all touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Download Weather Data
          </button>
        </div>
      ) : (
        /* Download Progress */
        <div className="bg-terminal-surface rounded-lg border border-terminal-border p-4 space-y-4">
          <h3 className="text-sm font-semibold text-terminal-green uppercase tracking-wide">
            {isComplete ? 'Download Complete' : 'Downloading...'}
          </h3>

          <div className="space-y-2">
            <div className="w-full bg-terminal-border rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-terminal-green/60'}`}
                style={{ width: `${jobProgress.progress || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-terminal-green-dim">
              <span>{jobProgress.message || 'Starting...'}</span>
              <span>{jobProgress.progress || 0}%</span>
            </div>
          </div>

          <div className="flex gap-2">
            {isDownloading && (
              <button onClick={handleCancel}
                className="px-4 py-2 border border-red-500/50 text-red-400 hover:bg-red-900/20 rounded-lg text-sm touch-manipulation">
                Cancel
              </button>
            )}
            {isComplete && (
              <button onClick={handleReset}
                className="px-4 py-2 bg-terminal-green/20 hover:bg-terminal-green/30 border border-terminal-green text-terminal-green rounded-lg text-sm font-medium touch-manipulation">
                Download Another Region
              </button>
            )}
          </div>
        </div>
      )}

      {/* Downloaded Regions List */}
      <div className="bg-terminal-surface rounded-lg border border-terminal-border overflow-hidden">
        <button onClick={() => setRegionsExpanded(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left touch-manipulation">
          <h3 className="text-sm font-semibold text-terminal-green uppercase tracking-wide">
            Downloaded Regions ({regions.length})
          </h3>
          <span className="text-terminal-green-dim text-lg">{regionsExpanded ? '▾' : '▸'}</span>
        </button>

        {regionsExpanded && (
          <div className="border-t border-terminal-border">
            {loadingRegions ? (
              <div className="p-4 text-sm text-terminal-green/50">Loading...</div>
            ) : regions.length === 0 ? (
              <div className="p-4 text-sm text-terminal-green/50">No regions downloaded yet</div>
            ) : (
              <div className="divide-y divide-terminal-border">
                {regions.map(region => {
                  const age = dataAge(region.downloadedAt)
                  return (
                    <div key={region.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-terminal-green truncate">{region.name}</span>
                          <span className={`text-xs ${age.color}`}>{age.label}</span>
                        </div>
                        <div className="text-xs text-terminal-green-dim mt-0.5">
                          {region.stationCount} stations &middot; {region.gridPoints || 0} grid pts &middot;{' '}
                          {region.forecastDays}d forecast &middot;{' '}
                          {new Date(region.downloadedAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-terminal-green/40 font-mono mt-0.5">
                          [{region.bounds.map(b => b.toFixed(2)).join(', ')}]
                        </div>
                      </div>

                      <div className="flex items-center gap-1 ml-2">
                        <button onClick={() => handleRefreshRegion(region)}
                          className="p-2 text-terminal-green-dim hover:text-terminal-green transition-colors touch-manipulation" title="Refresh">
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => prefillFromRegion(region)}
                          className="p-2 text-terminal-green-dim hover:text-terminal-green transition-colors touch-manipulation" title="Copy bounds">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>

                        {deleteConfirmId === region.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleDeleteRegion(region.id)}
                              className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-medium touch-manipulation">Delete</button>
                            <button onClick={() => setDeleteConfirmId(null)}
                              className="px-3 py-2 border border-terminal-border text-terminal-green-dim rounded text-xs touch-manipulation">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(region.id)}
                            className="p-2 text-terminal-green-dim hover:text-red-400 transition-colors touch-manipulation" title="Delete">
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default WeatherDownloader
