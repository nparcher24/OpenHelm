import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react'

import { API_BASE, WS_BASE as WS_URL } from '../utils/apiConfig.js'
import { fitDriftLinearRegression } from '../utils/driftCalc'
import { saveDriftCalculation } from '../services/driftService'
import { TopBar, Glass, Readout, Pill, Badge, Toggle } from '../ui/primitives'

// Lazy load the 3D component for better initial load
const AttitudeIndicator3D = lazy(() => import('./AttitudeIndicator3D'))

// Drift calibration window length in milliseconds.
const DRIFT_SAMPLE_WINDOW_MS = 20000

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
  const [showCalibration, setShowCalibration] = useState(false)
  const [offsetInput, setOffsetInput] = useState('')
  const [calibrationStatus, setCalibrationStatus] = useState(null) // 'saving' | 'saved' | 'error'
  const [autoCalPreview, setAutoCalPreview] = useState(null) // number or null
  const [updateHz, setUpdateHz] = useState(null)
  // Drift measurement UI state
  const [driftPhase, setDriftPhase] = useState('idle') // 'idle' | 'sampling' | 'saving' | 'done' | 'error'
  const [driftCountdown, setDriftCountdown] = useState(0)
  const [driftResult, setDriftResult] = useState(null)
  const [driftError, setDriftError] = useState(null)
  // Refs — sample collection is high-frequency and must not trigger renders.
  const driftSamplesRef = useRef([])
  const driftStartTimeRef = useRef(0)
  const driftTickRef = useRef(null)
  // Flipped to true on unmount so in-flight async work inside the drift
  // interval skips its final setState calls.
  const driftCancelledRef = useRef(false)
  const lastDriftSampleTsRef = useRef(0)
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
              // Skip re-render if key fields unchanged. `source` is included so
              // the topbar source badge re-renders when the arbiter flips
              // WitMotion → N2K → none even if everything else looks the same.
              if (prev?.latitude === message.data.latitude &&
                  prev?.longitude === message.data.longitude &&
                  prev?.heading === message.data.heading &&
                  prev?.sog === message.data.sog &&
                  prev?.waveHeight === message.data.waveHeight &&
                  prev?.ax === message.data.ax &&
                  prev?.az === message.data.az &&
                  prev?.source === message.data.source) {
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

  // While sampling, push each fresh GPS fix into the drift sample ref.
  // Using an effect gated by the phase avoids piping the sample collection
  // through component state (which would re-render on every fix).
  useEffect(() => {
    if (driftPhase !== 'sampling') return
    if (!gpsData || gpsData.latitude == null || gpsData.longitude == null) return
    const ts = gpsData.timestamp || Date.now()
    // Dedup on timestamp — the GPS service broadcasts many messages per fix
    // and we only want one sample per distinct reading.
    if (ts === lastDriftSampleTsRef.current) return
    lastDriftSampleTsRef.current = ts
    driftSamplesRef.current.push({
      t: ts,
      lat: gpsData.latitude,
      lng: gpsData.longitude
    })
  }, [gpsData?.timestamp, gpsData?.latitude, gpsData?.longitude, driftPhase])

  // Kick off a 20 s drift calibration. Runs a setInterval that ticks the
  // visible countdown each second and, on the final tick, fits the samples
  // and POSTs the result.
  const startDriftCalculation = useCallback(() => {
    // Reset state
    driftSamplesRef.current = []
    lastDriftSampleTsRef.current = 0
    driftStartTimeRef.current = Date.now()
    setDriftError(null)
    setDriftResult(null)
    setDriftCountdown(Math.round(DRIFT_SAMPLE_WINDOW_MS / 1000))
    setDriftPhase('sampling')

    // Seed with the current fix so we always have at least one sample even
    // if the WebSocket goes quiet briefly.
    if (gpsData?.latitude != null && gpsData?.longitude != null) {
      const seedTs = gpsData.timestamp || Date.now()
      lastDriftSampleTsRef.current = seedTs
      driftSamplesRef.current.push({
        t: seedTs,
        lat: gpsData.latitude,
        lng: gpsData.longitude
      })
    }

    if (driftTickRef.current) clearInterval(driftTickRef.current)
    driftTickRef.current = setInterval(async () => {
      const elapsed = Date.now() - driftStartTimeRef.current
      const remaining = Math.max(
        0,
        Math.ceil((DRIFT_SAMPLE_WINDOW_MS - elapsed) / 1000)
      )
      setDriftCountdown(remaining)

      if (elapsed >= DRIFT_SAMPLE_WINDOW_MS) {
        clearInterval(driftTickRef.current)
        driftTickRef.current = null

        const samples = driftSamplesRef.current
        const fit = fitDriftLinearRegression(samples)
        if (driftCancelledRef.current) return
        if (!fit) {
          setDriftPhase('error')
          setDriftError(
            `Not enough samples (${samples.length}). Need at least 3 distinct GPS fixes.`
          )
          return
        }

        setDriftPhase('saving')
        try {
          const res = await saveDriftCalculation({
            latitude: fit.latitude,
            longitude: fit.longitude,
            driftSpeedMps: fit.driftSpeedMps,
            driftBearingDeg: fit.driftBearingDeg,
            durationS: fit.durationS,
            sampleCount: fit.sampleCount
          })
          if (driftCancelledRef.current) return
          setDriftResult(res.drift || fit)
          setDriftPhase('done')
        } catch (err) {
          if (driftCancelledRef.current) return
          setDriftPhase('error')
          setDriftError(err.message || 'Failed to save drift')
        }
      }
    }, 250)
  }, [gpsData?.latitude, gpsData?.longitude, gpsData?.timestamp])

  const resetDriftCalculation = useCallback(() => {
    if (driftTickRef.current) {
      clearInterval(driftTickRef.current)
      driftTickRef.current = null
    }
    driftSamplesRef.current = []
    lastDriftSampleTsRef.current = 0
    setDriftCountdown(0)
    setDriftResult(null)
    setDriftError(null)
    setDriftPhase('idle')
  }, [])

  // Clear the drift interval AND flip the cancel flag on unmount so any
  // in-flight save() skips its final setState calls.
  useEffect(() => {
    return () => {
      driftCancelledRef.current = true
      if (driftTickRef.current) {
        clearInterval(driftTickRef.current)
        driftTickRef.current = null
      }
    }
  }, [])

  // Calculate drift angle (difference between heading and COG)
  const getDriftAngle = () => {
    if (gpsData?.heading === null || gpsData?.cog === null) return null
    let drift = gpsData.heading - gpsData.cog
    // Normalize to -180 to +180
    while (drift > 180) drift -= 360
    while (drift < -180) drift += 360
    return drift
  }

  // Save heading offset to backend
  const saveOffset = useCallback(async (offset) => {
    setCalibrationStatus('saving')
    try {
      const res = await fetch(`${API_BASE}/api/gps/heading-offset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset })
      })
      if (!res.ok) throw new Error('Failed to save')
      setCalibrationStatus('saved')
      setAutoCalPreview(null)
      setTimeout(() => setCalibrationStatus(null), 1500)
    } catch {
      setCalibrationStatus('error')
      setTimeout(() => setCalibrationStatus(null), 2000)
    }
  }, [])

  // Speed threshold: 5 mph = 2.2352 m/s
  const speedAboveThreshold = gpsData?.groundSpeed != null && gpsData.groundSpeed > 2.2352
  const canAutoCal = speedAboveThreshold && gpsData?.cog != null && gpsData?.heading != null

  // Format data age display
  const formatAge = (ageMs) => {
    if (ageMs === null) return '--'
    if (ageMs > 2000) return 'STALE'
    return `${(ageMs / 1000).toFixed(1)}s`
  }

  const isStale = dataAge !== null && dataAge > 2000

  if (loading || !gpsData) {
    return (
      <div className="h-full w-full" style={{ position: 'relative', background: 'var(--bg)' }}>
        <TopBar title="GPS" />
        <div style={{ paddingTop: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{
            width: 56, height: 56,
            border: '4px solid var(--signal-soft)',
            borderTopColor: 'var(--signal)',
            borderRadius: '50%', margin: '0 auto 20px',
            animation: 'oh-spin 900ms linear infinite',
          }}/>
          <div style={{ color: 'var(--fg2)', fontSize: 22 }}>
            {error ? error : 'Waiting for GPS…'}
          </div>
        </div>
      </div>
    )
  }

  const hasFix = gpsData?.fix
  const hasDevice = gpsData?.device

  const SECTION_LABEL = { fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)' }
  const ROW_LABEL = { color: 'var(--fg3)', fontSize: 20 }
  const ROW_VALUE = { fontFamily: 'var(--font-mono)', fontSize: 24, color: 'var(--fg1)' }

  return (
    <div className="h-full w-full" style={{ position: 'relative', background: 'var(--bg)', color: 'var(--fg1)', overflow: 'hidden' }}>
      <TopBar
        title="GPS"
        center={
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Badge tone={hasFix ? 'safe' : 'warn'} dot>{hasFix ? 'GPS FIX' : 'NO FIX'}</Badge>
            <Badge
              tone={gpsData?.source === 'witmotion' ? 'neutral'
                  : gpsData?.source === 'n2k' ? 'warn'
                  : 'alarm'}
            >
              {gpsData?.source === 'witmotion' ? 'WitMotion'
               : gpsData?.source === 'n2k' ? `NMEA 2000${gpsData?.n2kSrc != null ? ` · 0x${gpsData.n2kSrc.toString(16).toUpperCase().padStart(2, '0')}` : ''}`
               : 'No Source'}
            </Badge>
            <Badge tone={isStale ? 'warn' : 'neutral'}>{formatAge(dataAge)}</Badge>
            <span style={{ color: 'var(--fg3)', fontSize: 18, fontFamily: 'var(--font-mono)' }}>
              {gpsData?.satellites || 0} sat
            </span>
          </div>
        }
        right={
          <span style={{ color: 'var(--fg3)', fontSize: 20, fontFamily: 'var(--font-mono)' }}>
            {updateHz !== null ? `${updateHz.toFixed(1)} Hz` : '-- Hz'}
          </span>
        }
      />

      <div style={{
        position: 'absolute', top: 130, left: 20, right: 20, bottom: 20,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, 1.05fr)',
        gap: 16,
      }}>

        {error && (
          <Glass radius={12} style={{ gridColumn: '1 / -1', padding: 18, border: '0.5px solid var(--tint-red)', color: 'var(--tint-red)', fontSize: 20 }}>
            {error}
          </Glass>
        )}

        {/* LEFT — Attitude */}
        <Glass radius={14} style={{ padding: 22, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ ...SECTION_LABEL, textAlign: 'center', marginBottom: 12 }}>Attitude</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Suspense fallback={
              <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--fg2)', fontSize: 22 }}>Loading 3D…</span>
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
          <div style={{ display: 'flex', justifyContent: 'center', gap: 36, marginTop: 16, fontSize: 22, fontWeight: 700 }}>
            <span style={{ color: '#f87171' }}>X</span>
            <span style={{ color: '#4ade80' }}>Y</span>
            <span style={{ color: '#60a5fa' }}>Z</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16, textAlign: 'center' }}>
            <Readout label="Roll" value={formatDecimal(gpsData?.roll, 1)} unit="°" size="md" />
            <Readout label="Pitch" value={formatDecimal(gpsData?.pitch, 1)} unit="°" size="md" />
            <Readout label="Hdg" value={formatDecimal(gpsData?.heading, 1)} unit="°" size="md" />
          </div>
        </Glass>

        {/* MIDDLE — Position & Speed (large readouts) */}
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr 1fr 1fr 1fr', gap: 12, minHeight: 0 }}>
          <Glass radius={14} style={{ padding: 22, display: 'flex', alignItems: 'center' }}>
            <Readout label="Latitude" value={formatCoord(gpsData?.latitude, true)} size="md" live={hasFix} />
          </Glass>
          <Glass radius={14} style={{ padding: 22, display: 'flex', alignItems: 'center' }}>
            <Readout label="Longitude" value={formatCoord(gpsData?.longitude, false)} size="md" live={hasFix} />
          </Glass>
          <Glass radius={14} style={{ padding: 22, display: 'flex', alignItems: 'center' }}>
            <Readout
              label="Ground Speed"
              value={gpsData?.groundSpeed != null ? (gpsData.groundSpeed * 1.94384).toFixed(1) : '--'}
              unit="kts"
              sub={gpsData?.groundSpeed != null ? `${(gpsData.groundSpeed * 3.6).toFixed(1)} km/h` : ''}
              size="md"
            />
          </Glass>
          <Glass radius={14} style={{ padding: 22, display: 'flex', alignItems: 'center' }}>
            <Readout
              label="Course Over Ground"
              value={gpsData?.cog != null ? `${gpsData.cog.toFixed(0)}°` : '--'}
              unit={gpsData?.cog != null ? getCompassDirection(gpsData.cog) : ''}
              sub={(() => {
                const drift = getDriftAngle()
                if (drift === null) return ''
                const absDrift = Math.abs(drift)
                const dir = drift > 0 ? 'port' : drift < 0 ? 'stbd' : ''
                return `Drift: ${absDrift.toFixed(0)}° ${dir}`
              })()}
              size="md"
            />
          </Glass>
          <Glass radius={14} style={{ padding: 22, display: 'flex', alignItems: 'center' }}>
            <Readout
              label="Altitude"
              value={gpsData?.altitude != null ? gpsData.altitude.toFixed(1) : '--'}
              unit="m"
              sub={gpsData?.altitude != null ? `${(gpsData.altitude * 3.28084).toFixed(0)} ft` : ''}
              size="md"
            />
          </Glass>
        </div>

        {/* RIGHT — Compass + Quality + Environment + Motion + collapsibles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'auto' }}>
          {/* Compass */}
          <Glass radius={14} style={{ padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Compass</div>
            <div style={{ position: 'relative', width: 240, height: 240 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--signal)', opacity: 0.7 }} />
              <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', color: 'var(--signal)', fontWeight: 700, fontSize: 22 }}>N</div>
              <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', color: 'var(--fg3)', fontSize: 22 }}>S</div>
              <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg3)', fontSize: 22 }}>W</div>
              <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg3)', fontSize: 22 }}>E</div>
              {gpsData?.heading != null && (
                <div
                  style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: 4, height: 96,
                    background: 'var(--signal)',
                    transformOrigin: 'bottom center',
                    transform: `translate(-50%, -100%) rotate(${gpsData.heading}deg)`,
                    transition: 'transform 0.2s ease-out',
                    willChange: 'transform',
                  }}
                />
              )}
              <div style={{ position: 'absolute', top: '50%', left: '50%', width: 14, height: 14, background: 'var(--signal)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
            </div>
            <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 34, fontWeight: 600, color: 'var(--fg1)', letterSpacing: '-0.02em' }}>
              {gpsData?.heading != null ? `${gpsData.heading.toFixed(0)}° ${getCompassDirection(gpsData.heading)}` : '--'}
            </div>
          </Glass>

          {/* GPS Quality */}
          <Glass radius={14} style={{ padding: 22 }}>
            <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>GPS Quality</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
              {[
                ['Sats', gpsData?.satellites || 0, 'var(--fg1)'],
                ['PDOP', formatDecimal(gpsData?.pdop, 1), getDopTokenColor(gpsData?.pdop)],
                ['HDOP', formatDecimal(gpsData?.hdop, 1), getDopTokenColor(gpsData?.hdop)],
                ['VDOP', formatDecimal(gpsData?.vdop, 1), getDopTokenColor(gpsData?.vdop)],
              ].map(([k, v, c]) => (
                <div key={k}>
                  <div style={{ fontSize: 16, color: 'var(--fg3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.08em', fontWeight: 700 }}>{k}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </Glass>

          {/* Environment + Sea State combined */}
          <Glass radius={14} style={{ padding: 22 }}>
            <div style={{ ...SECTION_LABEL, marginBottom: 12 }}>Environment</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={ROW_LABEL}>Pressure</span>
              <span style={ROW_VALUE}>
                {gpsData?.pressure != null ? (
                  <>
                    {gpsData.pressure.toFixed(1)} hPa{' '}
                    <span style={{
                      color: getPressureTrend().trend === 'rising' ? 'var(--tint-green)' :
                             getPressureTrend().trend === 'falling' ? 'var(--tint-red)' :
                             'var(--fg3)'
                    }}>{getPressureTrend().arrow}</span>
                  </>
                ) : '--'}
              </span>
            </div>
            {gpsData?.seaStateDesc === 'Collecting data...' ? (
              <div style={{ color: 'var(--fg3)', fontSize: 18 }}>Sea state — collecting data…</div>
            ) : gpsData?.waveHeight != null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={ROW_LABEL}>Wave Ht</span>
                  <span style={ROW_VALUE}>
                    {gpsData.waveHeight.toFixed(2)} m / {(gpsData.waveHeight * 3.28084).toFixed(1)} ft
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={ROW_LABEL}>Period</span>
                  <span style={ROW_VALUE}>
                    {gpsData?.wavePeriod != null ? `${gpsData.wavePeriod.toFixed(1)} s` : '--'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={ROW_LABEL}>State</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700,
                    color: gpsData.seaState <= 2 ? 'var(--tint-green)' :
                           gpsData.seaState <= 4 ? 'var(--tint-yellow)' :
                           gpsData.seaState <= 6 ? 'var(--tint-orange)' :
                           'var(--tint-red)'
                  }}>{gpsData.seaState} — {gpsData.seaStateDesc}</span>
                </div>
              </div>
            ) : null}
          </Glass>

          {/* Motion */}
          <Glass radius={14} style={{ padding: 22 }}>
            <div style={{ ...SECTION_LABEL, marginBottom: 12 }}>Motion</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={ROW_LABEL}>Rate of Turn</span>
              <span style={ROW_VALUE}>
                {gpsData?.wz != null ? (
                  <>
                    {Math.abs(gpsData.wz).toFixed(1)}°/s{' '}
                    <span style={{ color: 'var(--fg3)' }}>
                      {gpsData.wz > 0.5 ? 'port' : gpsData.wz < -0.5 ? 'stbd' : ''}
                    </span>
                  </>
                ) : '--'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
              {['ax', 'ay', 'az'].map(k => (
                <div key={k}>
                  <div style={{ fontSize: 16, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>{k.toUpperCase()}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--fg1)' }}>
                    {gpsData?.[k] != null ? `${gpsData[k].toFixed(2)}g` : '--'}
                  </div>
                </div>
              ))}
            </div>
          </Glass>

          {/* Heading Calibration (collapsible) */}
          <Glass radius={14} style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showCalibration ? 14 : 0 }}>
              <span style={SECTION_LABEL}>
                Heading Cal{gpsData?.headingOffset ? ` (${gpsData.headingOffset > 0 ? '+' : ''}${gpsData.headingOffset.toFixed(1)}°)` : ''}
              </span>
              <Toggle on={showCalibration} onChange={setShowCalibration} />
            </div>
            {showCalibration && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={ROW_LABEL}>Current Offset</span>
                  <span style={ROW_VALUE}>
                    {gpsData?.headingOffset != null
                      ? `${gpsData.headingOffset > 0 ? '+' : ''}${gpsData.headingOffset.toFixed(1)}°`
                      : '0.0°'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    step="0.1"
                    value={offsetInput}
                    onChange={(e) => setOffsetInput(e.target.value)}
                    placeholder="0.0"
                    style={{
                      flex: 1, background: 'var(--bg)', border: '0.5px solid var(--bg-hairline-strong)',
                      borderRadius: 10, padding: '14px 18px', fontSize: 22,
                      fontFamily: 'var(--font-mono)', color: 'var(--fg1)', outline: 'none', minHeight: 60,
                    }}
                  />
                  <Pill
                    onClick={() => { const val = parseFloat(offsetInput); if (isFinite(val)) saveOffset(val) }}
                    style={{ minHeight: 60, opacity: isFinite(parseFloat(offsetInput)) ? 1 : 0.35 }}
                  >Set</Pill>
                  <Pill
                    onClick={() => { setOffsetInput('0'); saveOffset(0) }}
                    style={{ minHeight: 60 }}
                  >Reset</Pill>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {autoCalPreview != null ? (
                    <>
                      <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--fg1)', textAlign: 'center' }}>
                        Apply {autoCalPreview > 0 ? '+' : ''}{autoCalPreview.toFixed(1)}° correction?
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <Pill onClick={() => saveOffset(autoCalPreview)} style={{ flex: 1, minHeight: 60, background: 'var(--signal)', color: '#fff' }}>Confirm</Pill>
                        <Pill onClick={() => setAutoCalPreview(null)} style={{ flex: 1, minHeight: 60 }}>Cancel</Pill>
                      </div>
                    </>
                  ) : (
                    <Pill
                      onClick={() => {
                        if (!canAutoCal) return
                        const currentOffset = gpsData.headingOffset || 0
                        let correction = gpsData.cog - gpsData.heading + currentOffset
                        while (correction > 180) correction -= 360
                        while (correction < -180) correction += 360
                        setAutoCalPreview(parseFloat(correction.toFixed(1)))
                      }}
                      style={{ minHeight: 60, width: '100%', opacity: canAutoCal ? 1 : 0.35 }}
                    >Auto Calibrate</Pill>
                  )}
                  {!speedAboveThreshold && (
                    <div style={{ color: 'var(--fg3)', fontSize: 18, textAlign: 'center' }}>
                      Need &gt;5 mph for auto-cal
                    </div>
                  )}
                </div>
                {calibrationStatus === 'saved' && <Badge tone="safe" style={{ alignSelf: 'center' }}>Saved</Badge>}
                {calibrationStatus === 'saving' && <span style={{ color: 'var(--fg3)', fontSize: 18, textAlign: 'center' }}>Saving…</span>}
                {calibrationStatus === 'error' && <Badge tone="alarm" style={{ alignSelf: 'center' }}>Save failed</Badge>}
              </div>
            )}
          </Glass>

          {/* Drift Calibration */}
          <Glass radius={14} style={{ padding: 22 }}>
            <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Drift Calibration</div>
            {driftPhase === 'idle' && (
              <Pill
                onClick={startDriftCalculation}
                style={{ width: '100%', minHeight: 60, opacity: (!hasFix || gpsData?.latitude == null) ? 0.35 : 1 }}
              >Calculate Drift</Pill>
            )}
            {driftPhase === 'sampling' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Pill style={{ width: '100%', minHeight: 60, opacity: 0.6 }}>
                  Sampling… {driftCountdown}s
                </Pill>
                <div style={{ color: 'var(--fg3)', fontSize: 18, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  {driftSamplesRef.current.length} samples collected
                </div>
              </div>
            )}
            {driftPhase === 'saving' && (
              <div style={{ color: 'var(--fg3)', fontSize: 20, textAlign: 'center', padding: '10px 0' }}>Saving…</div>
            )}
            {driftPhase === 'done' && driftResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 20, fontFamily: 'var(--font-mono)' }}>
                  <div style={{ color: 'var(--fg3)' }}>Speed</div>
                  <div style={{ color: 'var(--fg1)', textAlign: 'right' }}>
                    {(driftResult.driftSpeedMps ?? driftResult.drift_speed_mps ?? 0).toFixed(2)} m/s
                    {' '}({((driftResult.driftSpeedMps ?? driftResult.drift_speed_mps ?? 0) * 1.94384).toFixed(2)} kn)
                  </div>
                  <div style={{ color: 'var(--fg3)' }}>Bearing</div>
                  <div style={{ color: 'var(--fg1)', textAlign: 'right' }}>
                    {(driftResult.driftBearingDeg ?? driftResult.drift_bearing_deg ?? 0).toFixed(0)}°
                  </div>
                  <div style={{ color: 'var(--fg3)' }}>Samples</div>
                  <div style={{ color: 'var(--fg1)', textAlign: 'right' }}>
                    {driftResult.sampleCount ?? driftResult.sample_count ?? 0}
                  </div>
                </div>
                <Pill onClick={resetDriftCalculation} style={{ width: '100%', minHeight: 60 }}>Recalculate</Pill>
              </div>
            )}
            {driftPhase === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Glass radius={8} style={{ padding: 14, border: '0.5px solid var(--tint-red)', color: 'var(--tint-red)', fontSize: 16 }}>
                  {driftError || 'Drift measurement failed'}
                </Glass>
                <Pill onClick={resetDriftCalculation} style={{ width: '100%', minHeight: 60 }}>Try Again</Pill>
              </div>
            )}
          </Glass>

          {/* Debug (collapsible) */}
          <Glass radius={14} style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showDebug ? 14 : 0 }}>
              <span style={SECTION_LABEL}>Debug</span>
              <Toggle on={showDebug} onChange={setShowDebug} />
            </div>
            {showDebug && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ ...SECTION_LABEL, fontSize: 16 }}>Magnetometer</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center', fontSize: 20 }}>
                  {['hx', 'hy', 'hz'].map(k => (
                    <div key={k}>
                      <span style={{ color: 'var(--fg3)' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg1)', marginLeft: 6 }}>
                        {gpsData?.[k] != null ? gpsData[k] : '--'}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ ...SECTION_LABEL, fontSize: 16, marginTop: 6 }}>Angular Velocity</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center', fontSize: 20 }}>
                  {['wx', 'wy', 'wz'].map(k => (
                    <div key={k}>
                      <span style={{ color: 'var(--fg3)' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg1)', marginLeft: 6 }}>
                        {gpsData?.[k] != null ? gpsData[k].toFixed(1) : '--'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Glass>
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

function getDopTokenColor(dop) {
  if (dop === null || dop === undefined) return 'var(--fg3)'
  if (dop <= 2) return 'var(--tint-green)'
  if (dop <= 5) return 'var(--tint-yellow)'
  if (dop <= 10) return 'var(--tint-orange)'
  return 'var(--tint-red)'
}

export default GpsView
