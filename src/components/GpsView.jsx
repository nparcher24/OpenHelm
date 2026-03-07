import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react'

const WS_URL = 'ws://localhost:3002'
const API_BASE = 'http://localhost:3002'

// Lazy load the 3D component for better initial load
const AttitudeIndicator3D = lazy(() => import('./AttitudeIndicator3D'))

// Pressure history for trend calculation
const PRESSURE_HISTORY_SIZE = 10
const PRESSURE_TREND_THRESHOLD = 0.5 // hPa change to indicate rising/falling
const PRESSURE_TREND_WINDOW = 5 * 60 * 1000 // 5 minutes in ms

function GpsView() {
  const [gpsData, setGpsData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dataAge, setDataAge] = useState(null)
  const [pressureHistory, setPressureHistory] = useState([])
  const [showDebug, setShowDebug] = useState(false)
  const [updateHz, setUpdateHz] = useState(null)
  const wsRef = useRef(null)
  const ageIntervalRef = useRef(null)
  const msgTimestampsRef = useRef([]) // Circular buffer for Hz calculation

  // Update data age display every 1000ms (1 Hz is sufficient for "data age" display)
  useEffect(() => {
    ageIntervalRef.current = setInterval(() => {
      if (gpsData?.timestamp) {
        setDataAge(Date.now() - gpsData.timestamp)
      }
    }, 1000)

    return () => {
      if (ageIntervalRef.current) {
        clearInterval(ageIntervalRef.current)
      }
    }
  }, [gpsData?.timestamp])

  // Track pressure history for trend calculation
  const updatePressureHistory = useCallback((pressure) => {
    if (pressure === null || pressure === undefined) return

    setPressureHistory(prev => {
      const now = Date.now()
      const newEntry = { value: pressure, time: now }
      const updated = [...prev, newEntry]
      // Keep only readings within the trend window
      const filtered = updated.filter(entry => now - entry.time < PRESSURE_TREND_WINDOW)
      // Also limit to max size
      if (filtered.length > PRESSURE_HISTORY_SIZE) {
        return filtered.slice(-PRESSURE_HISTORY_SIZE)
      }
      return filtered
    })
  }, [])

  useEffect(() => {
    let mounted = true
    let reconnectTimeout = null

    // Connect to WebSocket for real-time GPS updates
    const connect = () => {
      if (!mounted) return

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) return
        console.log('GPS WebSocket connected')
        // Subscribe to GPS stream
        ws.send(JSON.stringify({ type: 'subscribe-gps' }))
      }

      ws.onmessage = (event) => {
        if (!mounted) return
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'gps') {
            setGpsData(prev => {
              // Skip re-render if key fields unchanged
              if (prev?.latitude === message.data.latitude &&
                  prev?.longitude === message.data.longitude &&
                  prev?.heading === message.data.heading &&
                  prev?.sog === message.data.sog &&
                  prev?.waveHeight === message.data.waveHeight &&
                  prev?.ax === message.data.ax &&
                  prev?.az === message.data.az) {
                return prev
              }
              return message.data
            })
            setError(message.data.error || null)
            setLoading(false)
            // Track pressure for trend
            updatePressureHistory(message.data.pressure)
            // Track message timestamps for Hz calculation
            const now = Date.now()
            const buf = msgTimestampsRef.current
            buf.push(now)
            // Keep only timestamps within last 2 seconds
            const cutoff = now - 2000
            while (buf.length > 0 && buf[0] < cutoff) buf.shift()
            if (buf.length >= 2) {
              const span = (buf[buf.length - 1] - buf[0]) / 1000
              setUpdateHz(span > 0 ? ((buf.length - 1) / span) : null)
            }
          }
        } catch (err) {
          console.error('GPS WebSocket parse error:', err)
        }
      }

      ws.onerror = () => {
        // Error handling done in onclose
      }

      ws.onclose = () => {
        if (!mounted) return
        console.log('GPS WebSocket closed, reconnecting...')
        reconnectTimeout = setTimeout(connect, 1000)
      }
    }

    // Fetch initial data via HTTP first
    fetch(`${API_BASE}/api/gps`)
      .then(res => res.json())
      .then(data => {
        if (!mounted) return
        setGpsData(data)
        setError(data.error || null)
        setLoading(false)
        updatePressureHistory(data.pressure)
      })
      .catch(err => {
        if (!mounted) return
        setError(err.message)
        setLoading(false)
      })

    // Then connect WebSocket for real-time updates
    connect()

    return () => {
      mounted = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [updatePressureHistory])

  const formatCoord = (value, isLat) => {
    if (value === null || value === undefined) return '--'
    const abs = Math.abs(value)
    const deg = Math.floor(abs)
    const min = ((abs - deg) * 60).toFixed(5)
    const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W')
    return `${deg}° ${min}' ${dir}`
  }

  const formatDecimal = (value, decimals = 8) => {
    if (value === null || value === undefined) return '--'
    return value.toFixed(decimals)
  }

  // Calculate pressure trend from history
  const getPressureTrend = () => {
    if (pressureHistory.length < 2) return { trend: 'steady', arrow: '→' }
    const oldest = pressureHistory[0]
    const newest = pressureHistory[pressureHistory.length - 1]
    const diff = newest.value - oldest.value
    if (diff > PRESSURE_TREND_THRESHOLD) return { trend: 'rising', arrow: '↑' }
    if (diff < -PRESSURE_TREND_THRESHOLD) return { trend: 'falling', arrow: '↓' }
    return { trend: 'steady', arrow: '→' }
  }

  // Calculate drift angle (difference between heading and COG)
  const getDriftAngle = () => {
    if (gpsData?.heading === null || gpsData?.cog === null) return null
    let drift = gpsData.heading - gpsData.cog
    // Normalize to -180 to +180
    while (drift > 180) drift -= 360
    while (drift < -180) drift += 360
    return drift
  }

  // Format data age display
  const formatAge = (ageMs) => {
    if (ageMs === null) return '--'
    if (ageMs > 2000) return 'STALE'
    return `${(ageMs / 1000).toFixed(1)}s`
  }

  const isStale = dataAge !== null && dataAge > 2000

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
        <div className="flex items-center gap-4">
          <span className={`text-sm font-mono ${isStale ? 'text-terminal-red font-bold' : 'text-terminal-green-dim'}`}>
            Data: {formatAge(dataAge)}
          </span>
          <span className="text-sm font-mono text-terminal-green-dim">
            {updateHz !== null ? `${updateHz.toFixed(1)} Hz` : '-- Hz'}
          </span>
          <span className="text-terminal-green-dim text-xs">
            {hasDevice ? gpsData.device : 'No device'}
          </span>
        </div>
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
                  ax={gpsData?.ax || 0}
                  ay={gpsData?.ay || 0}
                  az={gpsData?.az || 0}
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

          {/* Course Over Ground */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase">Course Over Ground</div>
            <div className="text-lg font-mono text-terminal-green text-glow">
              {gpsData?.cog !== null ? `${gpsData.cog.toFixed(0)}° ${getCompassDirection(gpsData.cog)}` : '--'}
            </div>
            {/* Drift angle */}
            {(() => {
              const drift = getDriftAngle()
              if (drift === null) return null
              const absDrift = Math.abs(drift)
              const dir = drift > 0 ? 'port' : drift < 0 ? 'stbd' : ''
              return (
                <div className="text-xs text-terminal-green-dim font-mono">
                  Drift: {absDrift.toFixed(0)}° {dir}
                </div>
              )
            })()}
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
                    transition: 'transform 0.2s ease-out',
                    willChange: 'transform',
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

          {/* Environment */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase mb-1">Environment</div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-terminal-green-dim">Pressure</span>
              <span className="text-sm font-mono text-terminal-green">
                {gpsData?.pressure !== null ? (
                  <>
                    {gpsData.pressure.toFixed(1)} hPa{' '}
                    <span className={
                      getPressureTrend().trend === 'rising' ? 'text-green-400' :
                      getPressureTrend().trend === 'falling' ? 'text-red-400' :
                      'text-terminal-green-dim'
                    }>
                      {getPressureTrend().arrow}
                    </span>
                  </>
                ) : '--'}
              </span>
            </div>
          </div>

          {/* Sea State */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase mb-1">Sea State</div>
            {gpsData?.seaStateDesc === 'Collecting data...' ? (
              <div className="text-xs text-terminal-green-dim font-mono animate-pulse">
                Collecting data...
              </div>
            ) : gpsData?.waveHeight != null ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-terminal-green-dim">Wave Ht</span>
                  <span className="text-sm font-mono text-terminal-green">
                    {gpsData.waveHeight.toFixed(2)} m / {(gpsData.waveHeight * 3.28084).toFixed(1)} ft
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-terminal-green-dim">Period</span>
                  <span className="text-sm font-mono text-terminal-green">
                    {gpsData?.wavePeriod != null ? `${gpsData.wavePeriod.toFixed(1)} s` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-terminal-green-dim">State</span>
                  <span className={`text-sm font-mono font-bold ${
                    gpsData.seaState <= 2 ? 'text-green-400' :
                    gpsData.seaState <= 4 ? 'text-yellow-400' :
                    gpsData.seaState <= 6 ? 'text-orange-400' :
                    'text-red-400'
                  }`}>
                    {gpsData.seaState} — {gpsData.seaStateDesc}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-terminal-green-dim font-mono">--</div>
            )}
          </div>

          {/* Motion Data */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <div className="text-xs text-terminal-green-dim uppercase mb-1">Motion</div>
            {/* Rate of Turn */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-terminal-green-dim">Rate of Turn</span>
              <span className="text-sm font-mono text-terminal-green">
                {gpsData?.wz !== null ? (
                  <>
                    {Math.abs(gpsData.wz).toFixed(1)}°/s{' '}
                    <span className="text-terminal-green-dim">
                      {gpsData.wz > 0.5 ? 'port' : gpsData.wz < -0.5 ? 'stbd' : ''}
                    </span>
                  </>
                ) : '--'}
              </span>
            </div>
            {/* Accelerations */}
            <div className="grid grid-cols-3 gap-1 text-center text-xs">
              <div>
                <span className="text-terminal-green-dim">aX</span>
                <span className="font-mono text-terminal-green ml-1">
                  {gpsData?.ax !== null ? `${gpsData.ax.toFixed(2)}g` : '--'}
                </span>
              </div>
              <div>
                <span className="text-terminal-green-dim">aY</span>
                <span className="font-mono text-terminal-green ml-1">
                  {gpsData?.ay !== null ? `${gpsData.ay.toFixed(2)}g` : '--'}
                </span>
              </div>
              <div>
                <span className="text-terminal-green-dim">aZ</span>
                <span className="font-mono text-terminal-green ml-1">
                  {gpsData?.az !== null ? `${gpsData.az.toFixed(2)}g` : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Debug Section (Collapsible) */}
          <div className="bg-terminal-surface p-2 rounded-lg border border-terminal-border">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="w-full flex items-center justify-between text-xs text-terminal-green-dim uppercase"
            >
              <span>Debug</span>
              <span>{showDebug ? '▼' : '▶'}</span>
            </button>
            {showDebug && (
              <div className="mt-2 space-y-1">
                {/* Magnetometer */}
                <div className="text-xs text-terminal-green-dim">Magnetometer</div>
                <div className="grid grid-cols-3 gap-1 text-center text-xs">
                  <div>
                    <span className="text-terminal-green-dim">hX</span>
                    <span className="font-mono text-terminal-green ml-1">
                      {gpsData?.hx !== null ? gpsData.hx : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-terminal-green-dim">hY</span>
                    <span className="font-mono text-terminal-green ml-1">
                      {gpsData?.hy !== null ? gpsData.hy : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-terminal-green-dim">hZ</span>
                    <span className="font-mono text-terminal-green ml-1">
                      {gpsData?.hz !== null ? gpsData.hz : '--'}
                    </span>
                  </div>
                </div>
                {/* Angular velocities */}
                <div className="text-xs text-terminal-green-dim mt-2">Angular Velocity</div>
                <div className="grid grid-cols-3 gap-1 text-center text-xs">
                  <div>
                    <span className="text-terminal-green-dim">wX</span>
                    <span className="font-mono text-terminal-green ml-1">
                      {gpsData?.wx !== null ? `${gpsData.wx.toFixed(1)}` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-terminal-green-dim">wY</span>
                    <span className="font-mono text-terminal-green ml-1">
                      {gpsData?.wy !== null ? `${gpsData.wy.toFixed(1)}` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-terminal-green-dim">wZ</span>
                    <span className="font-mono text-terminal-green ml-1">
                      {gpsData?.wz !== null ? `${gpsData.wz.toFixed(1)}` : '--'}
                    </span>
                  </div>
                </div>
              </div>
            )}
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
