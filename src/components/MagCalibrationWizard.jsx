import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE } from '../utils/apiConfig.js'

const SECTOR_COUNT = 8
const MIN_DURATION_MS = 30000 // 30 seconds minimum
const POLL_INTERVAL_MS = 500

/**
 * SVG compass rose showing 8 sectors (45 deg each).
 * Sectors fill green as magnetometer data covers them during calibration.
 */
function SectorRose({ sectors, size = 240 }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 16
  const innerR = r * 0.3
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {/* Background circle */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />

      {/* Sector arcs */}
      {sectors.map((covered, i) => {
        // Sectors start from East (atan2 convention), rotate so 0=N
        const startAngle = (i * 45 - 90) * Math.PI / 180
        const endAngle = ((i + 1) * 45 - 90) * Math.PI / 180

        const x1 = cx + r * Math.cos(startAngle)
        const y1 = cy + r * Math.sin(startAngle)
        const x2 = cx + r * Math.cos(endAngle)
        const y2 = cy + r * Math.sin(endAngle)
        const ix1 = cx + innerR * Math.cos(startAngle)
        const iy1 = cy + innerR * Math.sin(startAngle)
        const ix2 = cx + innerR * Math.cos(endAngle)
        const iy2 = cy + innerR * Math.sin(endAngle)

        const path = [
          `M ${ix1} ${iy1}`,
          `L ${x1} ${y1}`,
          `A ${r} ${r} 0 0 1 ${x2} ${y2}`,
          `L ${ix2} ${iy2}`,
          `A ${innerR} ${innerR} 0 0 0 ${ix1} ${iy1}`,
          'Z'
        ].join(' ')

        return (
          <path
            key={i}
            d={path}
            fill={covered ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.05)'}
            stroke="rgba(34,197,94,0.3)"
            strokeWidth="1"
            className={covered ? 'transition-all duration-500' : ''}
          />
        )
      })}

      {/* Sector divider lines */}
      {Array.from({ length: SECTOR_COUNT }).map((_, i) => {
        const angle = (i * 45 - 90) * Math.PI / 180
        return (
          <line
            key={`line-${i}`}
            x1={cx + innerR * Math.cos(angle)}
            y1={cy + innerR * Math.sin(angle)}
            x2={cx + r * Math.cos(angle)}
            y2={cy + r * Math.sin(angle)}
            stroke="rgba(34,197,94,0.2)"
            strokeWidth="1"
          />
        )
      })}

      {/* Cardinal labels */}
      {cardinals.map((label, i) => {
        const angle = (i * 45 - 90) * Math.PI / 180
        const labelR = r + 12
        return (
          <text
            key={`label-${i}`}
            x={cx + labelR * Math.cos(angle)}
            y={cy + labelR * Math.sin(angle)}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-terminal-green text-xs font-mono"
            style={{ fontSize: i % 2 === 0 ? '11px' : '9px' }}
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function getQualityLabel(quality) {
  if (quality >= 0.875) return { text: 'Excellent', color: 'text-green-400' }
  if (quality >= 0.75) return { text: 'Good', color: 'text-yellow-400' }
  if (quality >= 0.5) return { text: 'Fair', color: 'text-amber-400' }
  return { text: 'Poor', color: 'text-red-400' }
}

export default function MagCalibrationWizard({ isOpen, onClose }) {
  const [step, setStep] = useState('instructions') // 'instructions' | 'calibrating' | 'complete' | 'error'
  const [elapsed, setElapsed] = useState(0)
  const [calStatus, setCalStatus] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [completeResult, setCompleteResult] = useState(null)
  const timerRef = useRef(null)
  const pollRef = useRef(null)
  const startTimeRef = useRef(null)
  const stepRef = useRef(step)
  stepRef.current = step

  // Cleanup on unmount — cancel calibration if still in progress
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (stepRef.current === 'calibrating') {
        fetch(`${API_BASE}/api/gps/mag-cal/cancel`, { method: 'POST' }).catch(() => {})
      }
    }
  }, [])

  const startPolling = useCallback(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/gps/mag-cal/status`)
        const data = await res.json()
        setCalStatus(data)

        if (data.state === 'error') {
          setStep('error')
          setError(data.error || 'Calibration failed')
          if (timerRef.current) clearInterval(timerRef.current)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {
        // Network error — keep polling, may recover
      }
    }, POLL_INTERVAL_MS)
  }, [])

  const handleBegin = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/gps/mag-cal/start`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to start calibration')
      }

      setStep('calibrating')
      startTimeRef.current = Date.now()
      setElapsed(0)

      // Local elapsed timer (updates every 100ms for smooth display)
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current)
      }, 100)

      startPolling()
    } catch (err) {
      setError(err.message)
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const handleFinish = async () => {
    setLoading(true)
    try {
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)

      const res = await fetch(`${API_BASE}/api/gps/mag-cal/stop`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to save calibration')
      }

      setCompleteResult(data)
      setStep('complete')
    } catch (err) {
      setError(err.message)
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)

    if (step === 'calibrating') {
      await fetch(`${API_BASE}/api/gps/mag-cal/cancel`, { method: 'POST' }).catch(() => {})
    }
    onClose()
  }

  const handleRetry = () => {
    setStep('instructions')
    setError(null)
    setCalStatus(null)
    setElapsed(0)
    setCompleteResult(null)
  }

  if (!isOpen) return null

  const sectors = calStatus?.sectors || [false, false, false, false, false, false, false, false]
  const quality = calStatus?.quality || 0
  const sampleCount = calStatus?.sampleCount || 0
  const canFinish = elapsed >= MIN_DURATION_MS && quality >= 0.75

  return (
    <div className="fixed inset-0 z-50 bg-terminal-bg/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-terminal-surface border border-terminal-border rounded-lg shadow-2xl overflow-hidden">

        {/* Instructions Step */}
        {step === 'instructions' && (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-terminal-green text-glow mb-4 uppercase tracking-wider text-center">
              Compass Calibration
            </h2>
            <div className="space-y-4 mb-6">
              <p className="text-terminal-green-dim text-sm">
                This procedure calibrates the magnetometer to compensate for your vessel's magnetic environment
                (hard iron and soft iron effects from the hull, engine, and electronics).
              </p>
              <div className="bg-terminal-bg/50 rounded-lg p-4 border border-terminal-border">
                <h3 className="text-terminal-green font-semibold text-sm uppercase tracking-wide mb-2">Procedure</h3>
                <p className="text-terminal-green-dim text-sm mb-3">
                  You will steer the boat in a slow, complete 360-degree circle while the sensor collects magnetic field data.
                </p>
                <ul className="space-y-2 text-sm text-terminal-green-dim">
                  <li className="flex items-start space-x-2">
                    <span className="text-terminal-green mt-0.5">1.</span>
                    <span>Maintain steady speed of <strong className="text-terminal-green">3-5 knots</strong></span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-terminal-green mt-0.5">2.</span>
                    <span>Steer <strong className="text-terminal-green">slowly and smoothly</strong> through a full 360-degree turn</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-terminal-green mt-0.5">3.</span>
                    <span>Keep the boat as <strong className="text-terminal-green">level as possible</strong></span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-terminal-green mt-0.5">4.</span>
                    <span>Ensure you are <strong className="text-terminal-green">away from large metal structures</strong> (bridges, docks, other vessels)</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-terminal-green mt-0.5">5.</span>
                    <span>The procedure takes approximately <strong className="text-terminal-green">60 seconds</strong></span>
                  </li>
                </ul>
              </div>
              <p className="text-amber-400/80 text-xs">
                Begin the turn before pressing "Begin Calibration" so the boat is already moving steadily.
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleBegin}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-terminal-green/20 hover:bg-terminal-green/40 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-border hover:border-terminal-green transition-colors touch-manipulation min-h-[44px] disabled:opacity-50"
              >
                {loading ? 'Starting...' : 'Begin Calibration'}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-terminal-surface hover:bg-terminal-green/10 text-terminal-green-dim font-bold rounded-lg uppercase tracking-wide border border-terminal-border transition-colors touch-manipulation min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Calibrating Step */}
        {step === 'calibrating' && (
          <div className="p-6">
            <h2 className="text-lg font-bold text-terminal-green text-glow mb-1 uppercase tracking-wider text-center">
              Calibrating
            </h2>
            <p className="text-terminal-green-dim text-sm text-center mb-4">
              Steer slowly through 360 degrees
            </p>

            {/* Timer */}
            <div className="text-center mb-4">
              <span className="text-4xl font-mono text-terminal-green text-glow">
                {formatElapsed(elapsed)}
              </span>
            </div>

            {/* Compass Rose */}
            <SectorRose sectors={sectors} size={220} />

            {/* Stats */}
            <div className="flex justify-between items-center mt-4 mb-2 px-4">
              <div className="text-sm font-mono">
                <span className="text-terminal-green-dim">Coverage: </span>
                <span className={quality >= 0.75 ? 'text-green-400' : quality >= 0.5 ? 'text-yellow-400' : 'text-terminal-green'}>
                  {sectors.filter(Boolean).length}/{SECTOR_COUNT} sectors
                </span>
              </div>
              <div className="text-sm font-mono">
                <span className="text-terminal-green-dim">Samples: </span>
                <span className="text-terminal-green">{sampleCount}</span>
              </div>
            </div>

            {/* Minimum time hint */}
            {elapsed < MIN_DURATION_MS && (
              <p className="text-terminal-green-dim text-xs text-center mb-3">
                Minimum {Math.ceil((MIN_DURATION_MS - elapsed) / 1000)}s remaining before finish is available
              </p>
            )}
            {elapsed >= MIN_DURATION_MS && quality < 0.75 && (
              <p className="text-amber-400/80 text-xs text-center mb-3">
                Continue turning — need at least 6/8 sectors covered
              </p>
            )}

            <div className="flex space-x-3 mt-4">
              <button
                onClick={handleFinish}
                disabled={!canFinish || loading}
                className={`flex-1 px-6 py-3 font-bold rounded-lg uppercase tracking-wide border transition-colors touch-manipulation min-h-[44px] ${
                  canFinish
                    ? 'bg-terminal-green/20 hover:bg-terminal-green/40 text-terminal-green border-terminal-green hover:border-terminal-green'
                    : 'bg-terminal-surface text-terminal-green-dim border-terminal-border opacity-50 cursor-not-allowed'
                }`}
              >
                {loading ? 'Saving...' : 'Finish Calibration'}
              </button>
              <button
                onClick={handleCancel}
                className="px-6 py-3 bg-terminal-surface hover:bg-red-600/10 text-red-400/70 hover:text-red-400 font-bold rounded-lg uppercase tracking-wide border border-terminal-border hover:border-red-500/30 transition-colors touch-manipulation min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="p-6 text-center">
            <h2 className="text-2xl font-bold text-terminal-green text-glow mb-4 uppercase tracking-wider">
              Calibration Complete
            </h2>

            {/* Quality result */}
            {completeResult && (
              <>
                <div className={`text-3xl font-bold mb-2 ${getQualityLabel(completeResult.quality).color}`}>
                  {getQualityLabel(completeResult.quality).text}
                </div>
                <p className="text-terminal-green-dim text-sm mb-4">
                  {completeResult.sampleCount} samples collected across{' '}
                  {completeResult.sectors?.filter(Boolean).length || 0}/8 sectors
                </p>

                {/* Final compass rose */}
                <SectorRose sectors={completeResult.sectors || sectors} size={180} />
              </>
            )}

            <div className="bg-terminal-bg/50 rounded-lg p-3 mt-4 mb-4 border border-terminal-border">
              <p className="text-terminal-green-dim text-xs">
                The magnetometer calibration has been saved to the device. Heading offset has been reset to 0
                and will auto-calibrate when traveling above 10 knots.
              </p>
            </div>

            {completeResult && completeResult.quality < 0.75 && (
              <p className="text-amber-400 text-sm mb-4">
                Coverage was below optimal. Consider recalibrating for better accuracy.
              </p>
            )}

            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-terminal-green/20 hover:bg-terminal-green/40 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-border hover:border-terminal-green transition-colors touch-manipulation min-h-[44px]"
            >
              Done
            </button>
          </div>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <div className="p-6 text-center">
            <h2 className="text-2xl font-bold text-red-400 mb-4 uppercase tracking-wider">
              Calibration Failed
            </h2>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
              <p className="text-red-400 text-sm">{error || 'An unknown error occurred'}</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleRetry}
                className="flex-1 px-6 py-3 bg-terminal-green/20 hover:bg-terminal-green/40 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-border hover:border-terminal-green transition-colors touch-manipulation min-h-[44px]"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-terminal-surface hover:bg-terminal-green/10 text-terminal-green-dim font-bold rounded-lg uppercase tracking-wide border border-terminal-border transition-colors touch-manipulation min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
