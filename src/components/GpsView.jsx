import { useState, useEffect, useCallback } from 'react'

const API_BASE = 'http://localhost:3002'

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

  const formatDecimal = (value) => {
    if (value === null || value === undefined) return '--'
    return value.toFixed(6)
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
      <div className="max-w-2xl mx-auto space-y-6">
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

          {/* Heading */}
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase tracking-wide mb-1">
              Heading
            </div>
            <div className="text-2xl font-mono text-terminal-green text-glow">
              {gpsData?.heading !== null ? `${gpsData.heading.toFixed(1)}°` : '--'}
            </div>
            <div className="text-sm text-terminal-green-dim font-mono mt-1">
              {gpsData?.heading !== null ? getCompassDirection(gpsData.heading) : '--'}
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

export default GpsView
