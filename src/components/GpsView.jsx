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
    // Poll at 10Hz for smooth AHRS updates
    const interval = setInterval(fetchGpsData, 100)
    return () => clearInterval(interval)
  }, [fetchGpsData])

  // Format coordinates for display
  const formatCoord = (value, isLat) => {
    if (value === null || value === undefined) return '--'
    const abs = Math.abs(value)
    const deg = Math.floor(abs)
    const min = ((abs - deg) * 60).toFixed(4)
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
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-terminal-green text-glow uppercase tracking-wider">
            GPS Navigation
          </h1>
          <p className="text-terminal-green-dim text-sm mt-1">
            {hasDevice ? gpsData.device : 'No device connected'}
          </p>
        </div>

        {/* Status Banner */}
        <div className={`p-4 rounded-lg border ${hasFix
          ? 'bg-terminal-surface border-terminal-green'
          : 'bg-terminal-surface border-terminal-red'}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-4 h-4 rounded-full ${hasFix
                ? 'bg-terminal-green animate-pulse'
                : 'bg-terminal-red'}`}
              />
              <span className={`text-lg font-bold uppercase ${hasFix
                ? 'text-terminal-green'
                : 'text-terminal-red'}`}
              >
                {hasFix ? 'GPS FIX' : 'NO FIX'}
              </span>
            </div>
            <div className="text-terminal-green-dim">
              {gpsData?.satellites || 0} satellites
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-terminal-surface border border-terminal-red rounded-lg">
            <p className="text-terminal-red text-sm">{error}</p>
          </div>
        )}

        {/* 3D Attitude Indicator */}
        <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
          <div className="text-xs text-terminal-green-dim uppercase tracking-wide text-center mb-2">
            3D Attitude Indicator
          </div>
          <Suspense fallback={
            <div className="w-full h-64 bg-black rounded-lg border border-terminal-green flex items-center justify-center">
              <span className="text-terminal-green animate-pulse">Loading 3D...</span>
            </div>
          }>
            <AttitudeIndicator3D
              roll={gpsData?.roll || 0}
              pitch={gpsData?.pitch || 0}
              yaw={gpsData?.heading || 0}
            />
          </Suspense>
          <div className="flex justify-center gap-6 mt-2 text-xs">
            <span className="text-red-400">X: Forward (Device Y)</span>
            <span className="text-green-400">Y: Starboard (Device X)</span>
            <span className="text-blue-400">Z: Up</span>
          </div>
        </div>

        {/* Attitude Grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* Roll */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Roll
            </div>
            <div className="text-xl font-mono text-terminal-green text-glow">
              {formatDecimal(gpsData?.roll, 1)}°
            </div>
          </div>

          {/* Pitch */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Pitch
            </div>
            <div className="text-xl font-mono text-terminal-green text-glow">
              {formatDecimal(gpsData?.pitch, 1)}°
            </div>
          </div>

          {/* Heading/Yaw */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Heading
            </div>
            <div className="text-xl font-mono text-terminal-green text-glow">
              {formatDecimal(gpsData?.heading, 1)}°
            </div>
            <div className="text-xs text-terminal-green-dim mt-1">
              {gpsData?.heading !== null ? getCompassDirection(gpsData.heading) : '--'}
            </div>
          </div>
        </div>

        {/* Position Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Latitude */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Latitude
            </div>
            <div className="text-2xl font-mono text-terminal-green text-glow">
              {formatCoord(gpsData?.latitude, true)}
            </div>
            <div className="text-sm text-terminal-green-dim font-mono mt-1">
              {formatDecimal(gpsData?.latitude)}
            </div>
          </div>

          {/* Longitude */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Longitude
            </div>
            <div className="text-2xl font-mono text-terminal-green text-glow">
              {formatCoord(gpsData?.longitude, false)}
            </div>
            <div className="text-sm text-terminal-green-dim font-mono mt-1">
              {formatDecimal(gpsData?.longitude)}
            </div>
          </div>

          {/* Altitude */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Altitude
            </div>
            <div className="text-2xl font-mono text-terminal-green text-glow">
              {gpsData?.altitude !== null ? `${gpsData.altitude.toFixed(1)} m` : '--'}
            </div>
            <div className="text-sm text-terminal-green-dim font-mono mt-1">
              {gpsData?.altitude !== null ? `${(gpsData.altitude * 3.28084).toFixed(1)} ft` : '--'}
            </div>
          </div>

          {/* Ground Speed */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Ground Speed
            </div>
            <div className="text-2xl font-mono text-terminal-green text-glow">
              {gpsData?.groundSpeed !== null ? `${(gpsData.groundSpeed * 1.94384).toFixed(1)} kts` : '--'}
            </div>
            <div className="text-sm text-terminal-green-dim font-mono mt-1">
              {gpsData?.groundSpeed !== null ? `${(gpsData.groundSpeed * 3.6).toFixed(1)} km/h` : '--'}
            </div>
          </div>
        </div>

        {/* GPS Quality Grid */}
        <div className="grid grid-cols-4 gap-4">
          {/* Satellites */}
          <div className="bg-terminal-surface p-3 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Sats
            </div>
            <div className="text-lg font-mono text-terminal-green text-glow">
              {gpsData?.satellites || 0}
            </div>
          </div>

          {/* PDOP */}
          <div className="bg-terminal-surface p-3 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              PDOP
            </div>
            <div className={`text-lg font-mono text-glow ${getDopColor(gpsData?.pdop)}`}>
              {formatDecimal(gpsData?.pdop, 1)}
            </div>
          </div>

          {/* HDOP */}
          <div className="bg-terminal-surface p-3 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              HDOP
            </div>
            <div className={`text-lg font-mono text-glow ${getDopColor(gpsData?.hdop)}`}>
              {formatDecimal(gpsData?.hdop, 1)}
            </div>
          </div>

          {/* VDOP */}
          <div className="bg-terminal-surface p-3 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              VDOP
            </div>
            <div className={`text-lg font-mono text-glow ${getDopColor(gpsData?.vdop)}`}>
              {formatDecimal(gpsData?.vdop, 1)}
            </div>
          </div>
        </div>

        {/* Compass Rose */}
        {gpsData?.heading !== null && (
          <div className="bg-terminal-surface p-6 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide text-center mb-4">
              Compass
            </div>
            <div className="relative w-48 h-48 mx-auto">
              {/* Compass Circle */}
              <div className="absolute inset-0 rounded-full border-2 border-terminal-green" />

              {/* Cardinal Directions */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 text-terminal-green font-bold">N</div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-terminal-green-dim">S</div>
              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-terminal-green-dim">W</div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-green-dim">E</div>

              {/* Heading Arrow */}
              <div
                className="absolute top-1/2 left-1/2 w-1 h-20 bg-terminal-green origin-bottom"
                style={{
                  transform: `translate(-50%, -100%) rotate(${gpsData.heading}deg)`,
                  boxShadow: '0 0 10px rgba(0, 255, 0, 0.5)'
                }}
              />

              {/* Center Dot */}
              <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-terminal-green rounded-full -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>
        )}

        {/* Data Age */}
        {gpsData?.timestamp && (
          <div className="text-center text-xs text-terminal-green-dim">
            Data age: {gpsData.age ? `${(gpsData.age / 1000).toFixed(1)}s` : 'live'}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function to get compass direction from heading
function getCompassDirection(heading) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const index = Math.round(heading / 22.5) % 16
  return directions[index]
}

// Helper function to get color based on DOP value
function getDopColor(dop) {
  if (dop === null || dop === undefined) return 'text-terminal-green-dim'
  if (dop <= 2) return 'text-terminal-green' // Excellent
  if (dop <= 5) return 'text-yellow-400' // Good
  if (dop <= 10) return 'text-orange-400' // Moderate
  return 'text-terminal-red' // Poor
}

export default GpsView
