import { useState, useEffect, useCallback, lazy, Suspense } from 'react'

const API_BASE = 'http://localhost:3002'

// Lazy load the 3D component for better initial load
const AttitudeIndicator3D = lazy(() => import('./AttitudeIndicator3D'))

function GpsView() {
  const [gpsData, setGpsData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchGpsData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/gps`)
      if (!response.ok) throw new Error('Failed to fetch GPS data')
      const data = await response.json()
      setGpsData(data)
      setError(data.error)
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGpsData()
    const interval = setInterval(fetchGpsData, 100)
    return () => clearInterval(interval)
  }, [fetchGpsData])

  const formatCoord = (value, isLat) => {
    if (value === null || value === undefined) return '--'
    const abs = Math.abs(value)
    const deg = Math.floor(abs)
    const min = ((abs - deg) * 60).toFixed(3)
    const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W')
    return `${deg}° ${min}' ${dir}`
  }

  const formatDecimal = (value, decimals = 6) => {
    if (value === null || value === undefined) return '--'
    return value.toFixed(decimals)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-terminal-green text-glow animate-pulse">
          INITIALIZING GPS...
        </div>
      </div>
    )
  }

  const hasFix = gpsData?.fix
  const hasDevice = gpsData?.device

  return (
    <div className="h-full p-3 flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${hasFix ? 'bg-terminal-green animate-pulse' : 'bg-terminal-red'}`} />
          <span className={`text-sm font-bold uppercase ${hasFix ? 'text-terminal-green' : 'text-terminal-red'}`}>
            {hasFix ? 'GPS FIX' : 'NO FIX'}
          </span>
          <span className="text-terminal-green-dim text-sm">
            {gpsData?.satellites || 0} sats
          </span>
        </div>
        <span className="text-terminal-green-dim text-xs">
          {hasDevice ? gpsData.device : 'No device'}
        </span>
      </div>

      {error && (
        <div className="p-2 bg-terminal-surface border border-terminal-red rounded text-terminal-red text-xs mb-2">
          {error}
        </div>
      )}

      {/* Main content - 3 columns */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left column - 3D Attitude Indicator */}
        <div className="w-1/3 flex flex-col">
          <div className="bg-terminal-surface rounded-lg border border-terminal-border flex-1 flex flex-col p-2">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide text-center mb-1">
              Attitude
            </div>
            <div className="flex-1 min-h-0">
              <Suspense fallback={
                <div className="w-full h-full bg-black rounded flex items-center justify-center">
                  <span className="text-terminal-green animate-pulse text-xs">Loading 3D...</span>
                </div>
              }>
                <AttitudeIndicator3D
                  roll={gpsData?.roll || 0}
                  pitch={gpsData?.pitch || 0}
                  yaw={gpsData?.heading || 0}
                />
              </Suspense>
            </div>
            <div className="flex justify-center gap-4 mt-1 text-xs">
              <span className="text-red-400">X</span>
              <span className="text-green-400">Y</span>
              <span className="text-blue-400">Z</span>
            </div>
            {/* Attitude values */}
            <div className="grid grid-cols-3 gap-1 mt-2 text-center">
              <div>
                <div className="text-xs text-terminal-green-dim">Roll</div>
                <div className="text-sm font-mono text-terminal-green">{formatDecimal(gpsData?.roll, 1)}°</div>
              </div>
              <div>
                <div className="text-xs text-terminal-green-dim">Pitch</div>
                <div className="text-sm font-mono text-terminal-green">{formatDecimal(gpsData?.pitch, 1)}°</div>
              </div>
              <div>
                <div className="text-xs text-terminal-green-dim">Hdg</div>
                <div className="text-sm font-mono text-terminal-green">{formatDecimal(gpsData?.heading, 1)}°</div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle column - Position & Speed */}
        <div className="w-1/3 flex flex-col gap-2">
          {/* Latitude */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase">Latitude</div>
            <div className="text-lg font-mono text-terminal-green text-glow">
              {formatCoord(gpsData?.latitude, true)}
            </div>
          </div>

          {/* Longitude */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase">Longitude</div>
            <div className="text-lg font-mono text-terminal-green text-glow">
              {formatCoord(gpsData?.longitude, false)}
            </div>
          </div>

          {/* Altitude */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase">Altitude</div>
            <div className="text-lg font-mono text-terminal-green text-glow">
              {gpsData?.altitude !== null ? `${gpsData.altitude.toFixed(1)} m` : '--'}
            </div>
            <div className="text-xs text-terminal-green-dim font-mono">
              {gpsData?.altitude !== null ? `${(gpsData.altitude * 3.28084).toFixed(0)} ft` : ''}
            </div>
          </div>

          {/* Ground Speed */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase">Ground Speed</div>
            <div className="text-lg font-mono text-terminal-green text-glow">
              {gpsData?.groundSpeed !== null ? `${(gpsData.groundSpeed * 1.94384).toFixed(1)} kts` : '--'}
            </div>
            <div className="text-xs text-terminal-green-dim font-mono">
              {gpsData?.groundSpeed !== null ? `${(gpsData.groundSpeed * 3.6).toFixed(1)} km/h` : ''}
            </div>
          </div>
        </div>

        {/* Right column - Compass & Quality */}
        <div className="w-1/3 flex flex-col gap-2">
          {/* Compass */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border flex-1 flex flex-col items-center justify-center">
            <div className="text-xs text-terminal-green-dim uppercase mb-1">Compass</div>
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full border-2 border-terminal-green" />
              <div className="absolute top-1 left-1/2 -translate-x-1/2 text-terminal-green font-bold text-xs">N</div>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-terminal-green-dim text-xs">S</div>
              <div className="absolute left-1 top-1/2 -translate-y-1/2 text-terminal-green-dim text-xs">W</div>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 text-terminal-green-dim text-xs">E</div>
              {gpsData?.heading !== null && (
                <div
                  className="absolute top-1/2 left-1/2 w-0.5 h-12 bg-terminal-green origin-bottom"
                  style={{
                    transform: `translate(-50%, -100%) rotate(${gpsData.heading}deg)`,
                    boxShadow: '0 0 8px rgba(0, 255, 0, 0.5)'
                  }}
                />
              )}
              <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-terminal-green rounded-full -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-lg font-mono text-terminal-green mt-1">
              {gpsData?.heading !== null ? `${gpsData.heading.toFixed(0)}° ${getCompassDirection(gpsData.heading)}` : '--'}
            </div>
          </div>

          {/* GPS Quality */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase mb-1">GPS Quality</div>
            <div className="grid grid-cols-4 gap-1 text-center">
              <div>
                <div className="text-xs text-terminal-green-dim">Sats</div>
                <div className="text-sm font-mono text-terminal-green">{gpsData?.satellites || 0}</div>
              </div>
              <div>
                <div className="text-xs text-terminal-green-dim">PDOP</div>
                <div className={`text-sm font-mono ${getDopColor(gpsData?.pdop)}`}>
                  {formatDecimal(gpsData?.pdop, 1)}
                </div>
              </div>
              <div>
                <div className="text-xs text-terminal-green-dim">HDOP</div>
                <div className={`text-sm font-mono ${getDopColor(gpsData?.hdop)}`}>
                  {formatDecimal(gpsData?.hdop, 1)}
                </div>
              </div>
              <div>
                <div className="text-xs text-terminal-green-dim">VDOP</div>
                <div className={`text-sm font-mono ${getDopColor(gpsData?.vdop)}`}>
                  {formatDecimal(gpsData?.vdop, 1)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getCompassDirection(heading) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const index = Math.round(heading / 22.5) % 16
  return directions[index]
}

function getDopColor(dop) {
  if (dop === null || dop === undefined) return 'text-terminal-green-dim'
  if (dop <= 2) return 'text-terminal-green'
  if (dop <= 5) return 'text-yellow-400'
  if (dop <= 10) return 'text-orange-400'
  return 'text-terminal-red'
}

export default GpsView
