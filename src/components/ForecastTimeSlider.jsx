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
  const ageColor = ageHours == null ? '' : ageHours < 6 ? 'text-green-400' : ageHours < 24 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-terminal-bg/90 backdrop-blur-sm border-t border-terminal-border px-4 py-2 z-20">
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={() => setPlaying(p => !p)}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-terminal-border text-terminal-green hover:bg-terminal-green/10 transition-colors touch-manipulation flex-shrink-0"
        >
          {playing ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* Time display */}
        <div className="text-sm text-terminal-green font-mono min-w-[140px] flex-shrink-0">
          {timeStr}
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          className="flex-1 h-10 flex items-center cursor-pointer touch-manipulation relative"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Track background */}
          <div className="w-full h-2 bg-terminal-border rounded-full relative">
            {/* Progress fill */}
            <div
              className="absolute top-0 left-0 h-full bg-terminal-green/40 rounded-full"
              style={{ width: `${posRatio * 100}%` }}
            />

            {/* "Now" marker */}
            {nowRatio > 0 && nowRatio < 1 && (
              <div
                className="absolute top-0 w-0.5 h-full bg-yellow-400"
                style={{ left: `${nowRatio * 100}%` }}
              />
            )}

            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-terminal-green rounded-full shadow-glow-green-sm border-2 border-terminal-bg"
              style={{ left: `calc(${posRatio * 100}% - 8px)` }}
            />
          </div>
        </div>

        {/* Data age indicator */}
        {ageHours != null && (
          <div className={`text-xs flex-shrink-0 ${ageColor}`}>
            {ageHours < 1 ? '<1h' : ageHours < 24 ? `${ageHours}h` : `${Math.round(ageHours / 24)}d`}
          </div>
        )}
      </div>
    </div>
  )
}

export default ForecastTimeSlider
