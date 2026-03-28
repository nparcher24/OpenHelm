import { useEffect, useRef } from 'react'
import { buildHeadingTapeSVG, buildSpeedTapeSVG, buildDepthTapeSVG } from '../utils/hudTapes'

/**
 * HudOverlay — Fighter-jet style heads-up display with scrolling tapes
 * Uses raw SVG string injection (same pattern as headingLine.js)
 */

const GREEN = '#22c55e'
const BLACK_OUTLINE = 'rgba(0,0,0,0.8)'

function HudOverlay({ heading, speedMs, depthMeters, color = '#22c55e' }) {
  const headingTapeRef = useRef(null)
  const speedTapeRef = useRef(null)
  const depthTapeRef = useRef(null)

  const speedKts = speedMs != null ? parseFloat((speedMs * 1.94384).toFixed(1)) : null
  const depthFt = depthMeters != null ? parseFloat((Math.abs(depthMeters) * 3.28084).toFixed(1)) : null

  // Single effect that rebuilds all tapes after layout
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      // Use window dimensions directly — percentage-based container heights are unreliable
      const vpW = window.innerWidth
      const vpH = window.innerHeight
      const hdgWidth = Math.round(vpW * 0.667)
      const tapeHeight = Math.round(vpH * 0.667)

      if (headingTapeRef.current) {
        headingTapeRef.current.innerHTML = buildHeadingTapeSVG(heading ?? 0, hdgWidth, color)
      }
      if (speedTapeRef.current) {
        const spdH = speedTapeRef.current.parentElement?.offsetHeight || tapeHeight
        speedTapeRef.current.innerHTML = buildSpeedTapeSVG(speedKts, spdH, color)
      }
      if (depthTapeRef.current) {
        const dptH = depthTapeRef.current.parentElement?.offsetHeight || tapeHeight
        depthTapeRef.current.innerHTML = buildDepthTapeSVG(depthFt, dptH, color)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [heading, speedKts, depthFt, color])

  // Also rebuild on resize
  useEffect(() => {
    const onResize = () => {
      const vpW = window.innerWidth
      const vpH = window.innerHeight
      const hdgWidth = Math.round(vpW * 0.667)
      const tapeHeight = Math.round(vpH * 0.667)

      if (headingTapeRef.current) headingTapeRef.current.innerHTML = buildHeadingTapeSVG(heading ?? 0, hdgWidth, color)
      if (speedTapeRef.current) speedTapeRef.current.innerHTML = buildSpeedTapeSVG(speedKts, speedTapeRef.current.parentElement?.offsetHeight || tapeHeight, color)
      if (depthTapeRef.current) depthTapeRef.current.innerHTML = buildDepthTapeSVG(depthFt, depthTapeRef.current.parentElement?.offsetHeight || tapeHeight, color)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [heading, speedKts, depthFt, color])

  // Readout styles
  const readoutBox = {
    background: 'rgba(0,0,0,0.65)',
    border: `2px solid ${color}`,
    borderRadius: '5px',
    padding: '3px 14px',
    textAlign: 'center',
    minWidth: '90px'
  }
  const readoutVal = {
    color: color,
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'system-ui, sans-serif',
    textShadow: `0 0 4px ${BLACK_OUTLINE}, 0 1px 3px ${BLACK_OUTLINE}`
  }
  const readoutUnit = {
    color: color + 'b3', // ~70% opacity via hex alpha
    fontSize: '16px',
    fontWeight: '600',
    fontFamily: 'system-ui, sans-serif',
    marginLeft: '4px'
  }

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 20, overflow: 'visible' }}>

      {/* ── HEADING TAPE — top center, 2/3 width ── */}
      <div style={{ position: 'absolute', top: '12px', left: '16.67%', width: '66.67%', height: '70px' }}>
        {/* SVG tape container — explicit height so it has dimensions */}
        <div ref={headingTapeRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '55px', overflow: 'visible' }} />
        {/* Digital readout below tape */}
        <div style={{ position: 'absolute', left: '50%', top: '58px', transform: 'translateX(-50%)', ...readoutBox }}>
          <span style={readoutVal}>
            {heading != null ? String(Math.round(heading)).padStart(3, '0') + '°' : '---°'}
          </span>
        </div>
      </div>

      {/* ── SPEED TAPE — left, 2/3 height ── */}
      <div style={{ position: 'absolute', left: '8px', top: '16.67%', height: '66.67%', width: '140px' }}>
        {/* SVG tape container — fills parent height */}
        <div ref={speedTapeRef} style={{ position: 'absolute', top: 0, left: 0, width: '140px', height: '100%', overflow: 'visible' }} />
        {/* Digital readout at vertical center */}
        <div style={{ position: 'absolute', top: '50%', left: '4px', transform: 'translateY(-50%)', ...readoutBox, minWidth: '70px', textAlign: 'left' }}>
          <span style={readoutVal}>{speedKts != null ? speedKts.toFixed(1) : '--.-'}</span>
          <span style={readoutUnit}>kts</span>
        </div>
      </div>

      {/* ── DEPTH TAPE — right, 2/3 height ── */}
      <div style={{ position: 'absolute', right: '8px', top: '16.67%', height: '66.67%', width: '140px' }}>
        {/* SVG tape container — fills parent height */}
        <div ref={depthTapeRef} style={{ position: 'absolute', top: 0, right: 0, width: '140px', height: '100%', overflow: 'visible' }} />
        {/* Digital readout at vertical center */}
        <div style={{ position: 'absolute', top: '50%', right: '4px', transform: 'translateY(-50%)', ...readoutBox, minWidth: '70px', textAlign: 'right' }}>
          <span style={readoutVal}>{depthFt != null ? depthFt.toFixed(1) : '--.-'}</span>
          <span style={readoutUnit}>ft</span>
        </div>
      </div>
    </div>
  )
}

export default HudOverlay
