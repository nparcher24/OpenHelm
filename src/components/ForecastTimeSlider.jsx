import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * ForecastTimeSlider - horizontal timeline bar for scrubbing through forecast times.
 * Overlaid on ChartView between map and bottom controls.
 *
 * Props:
 * - timestamps: string[] - sorted ISO timestamps
 * - currentIndex: number - currently selected index
 * - onIndexChange: (index: number) => void
 * - visible: boolean
 * - downloadedAt: string - ISO timestamp of when data was downloaded
 */
function ForecastTimeSlider({ timestamps, currentIndex, onIndexChange, visible, downloadedAt }) {
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef(null)
  const playIntervalRef = useRef(null)

  // Auto-advance when playing (uses functional updater to avoid stale closure)
  useEffect(() => {
    if (!playing || !timestamps.length) return

    playIntervalRef.current = setInterval(() => {
      onIndexChange(prev => {
        const next = prev + 1
        if (next >= timestamps.length) {
          setPlaying(false)
          return prev // stay at last frame
        }
        return next
      })
    }, 1000) // 1 hour per second

    return () => clearInterval(playIntervalRef.current)
  }, [playing, timestamps.length, onIndexChange])

  // Stop playing when dragging
  useEffect(() => {
    if (dragging) setPlaying(false)
  }, [dragging])

  const getIndexFromPosition = useCallback((clientX) => {
    if (!trackRef.current || !timestamps.length) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * (timestamps.length - 1))
  }, [timestamps.length])

  const handlePointerDown = useCallback((e) => {
    setDragging(true)
    const idx = getIndexFromPosition(e.clientX)
    onIndexChange(idx)
    e.target.setPointerCapture(e.pointerId)
  }, [getIndexFromPosition, onIndexChange])

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return
    const idx = getIndexFromPosition(e.clientX)
    onIndexChange(idx)
  }, [dragging, getIndexFromPosition, onIndexChange])

  const handlePointerUp = useCallback(() => {
    setDragging(false)
  }, [])

  if (!visible || !timestamps.length) return null

  const currentTimestamp = timestamps[currentIndex] || timestamps[0]
  const date = new Date(currentTimestamp)
  const timeStr = date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  // Find "now" position on the timeline
  const now = Date.now()
  const startTime = new Date(timestamps[0]).getTime()
  const endTime = new Date(timestamps[timestamps.length - 1]).getTime()
  const nowRatio = Math.max(0, Math.min(1, (now - startTime) / (endTime - startTime)))

  // Current position ratio
  const posRatio = timestamps.length > 1 ? currentIndex / (timestamps.length - 1) : 0

  // Data age
  const ageHours = downloadedAt ? Math.round((now - new Date(downloadedAt).getTime()) / (1000 * 60 * 60)) : null
  const ageColor = ageHours == null
    ? 'var(--fg2)'
    : ageHours < 6 ? 'var(--signal)'
    : ageHours < 24 ? 'var(--tint-yellow)'
    : 'var(--tint-red)'

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'var(--bg-elev-2)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderTop: '0.5px solid var(--bg-hairline-strong)',
      padding: '8px 16px',
      zIndex: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Play/Pause */}
        <button
          onClick={() => setPlaying(p => !p)}
          style={{
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: '0.5px solid var(--bg-hairline-strong)',
            background: 'transparent', color: 'var(--fg1)', cursor: 'pointer',
            flexShrink: 0, touchAction: 'manipulation'
          }}
        >
          {playing ? (
            <svg style={{ width: 20, height: 20 }} fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg style={{ width: 20, height: 20 }} fill="currentColor" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* Time display */}
        <div style={{ fontSize: 14, color: 'var(--fg1)', fontFamily: 'monospace', minWidth: 140, flexShrink: 0 }}>
          {timeStr}
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          style={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'manipulation', position: 'relative' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Track background */}
          <div style={{ width: '100%', height: 8, background: 'var(--bg-hairline-strong)', borderRadius: 4, position: 'relative' }}>
            {/* Progress fill */}
            <div
              style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'rgba(0,200,100,0.35)', borderRadius: 4, width: `${posRatio * 100}%` }}
            />

            {/* "Now" marker */}
            {nowRatio > 0 && nowRatio < 1 && (
              <div
                style={{ position: 'absolute', top: 0, width: 2, height: '100%', background: 'var(--tint-yellow)', left: `${nowRatio * 100}%` }}
              />
            )}

            {/* Thumb */}
            <div
              style={{
                position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)',
                width: 16, height: 16, background: 'var(--signal)', borderRadius: '50%',
                border: '2px solid var(--bg)',
                left: `${posRatio * 100}%`
              }}
            />
          </div>
        </div>

        {/* Data age indicator */}
        {ageHours != null && (
          <div style={{ fontSize: 12, flexShrink: 0, color: ageColor }}>
            {ageHours < 1 ? '<1h' : ageHours < 24 ? `${ageHours}h` : `${Math.round(ageHours / 24)}d`}
          </div>
        )}
      </div>
    </div>
  )
}

export default ForecastTimeSlider
