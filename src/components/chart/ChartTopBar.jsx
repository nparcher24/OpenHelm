import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Icon, PagesMenu, ThemeCycleButton } from '../../ui/primitives'
import { TopMetric } from './TopMetric.jsx'
import { WaypointDropdown } from './WaypointDropdown.jsx'
import { LayersPanel } from './LayersPanel.jsx'
import S57SubLayerMenu from '../S57SubLayerMenu'

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{
      fontFamily: 'var(--font-ui)', fontSize: 58, fontWeight: 600,
      fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: 'var(--fg1)',
    }}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
  )
}

function Divider() {
  return <div style={{ width: 0.5, height: 60, background: 'var(--bg-hairline)' }}/>
}

export const ChartTopBar = forwardRef(function ChartTopBar({
  speed, depth, heading, waterTemp, fuelLevel, batteryVoltage,
  waypoints, onSelectWaypoint, onAddWaypoint,
  layers, onLayerChange,
  onWaypointsOpenChange,
  s57FilterVisible, s57SubLayerVisibility, onToggleSublayer, onToggleGroup,
}, ref) {
  const [pagesOpen, setPagesOpen] = useState(false)
  const [waypointsOpen, setWaypointsOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [s57FilterOpen, setS57FilterOpen] = useState(false)
  const rootRef = useRef(null)

  // Notify parent when waypoints dropdown opens/closes so parent effects can fire
  // (e.g. refreshLatestDrift keyed on waypointDropdownOpen in ChartView).
  const setWaypointsOpenAndNotify = (v) => {
    setWaypointsOpen(v)
    onWaypointsOpenChange?.(v)
  }

  const closeAll = () => {
    setPagesOpen(false)
    setWaypointsOpenAndNotify(false)
    setLayersOpen(false)
    setS57FilterOpen(false)
  }

  useImperativeHandle(ref, () => ({ closeAll }))

  const anyOpen = pagesOpen || waypointsOpen || layersOpen || s57FilterOpen
  useEffect(() => {
    if (!anyOpen) return
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closeAll()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [anyOpen])

  return (
    <>
      <div ref={rootRef} style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 114,
        display: 'flex', alignItems: 'center', gap: 18, padding: '0 27px',
        background: 'var(--bg-chrome)',
        backdropFilter: 'var(--blur-chrome)',
        WebkitBackdropFilter: 'var(--blur-chrome)',
        borderBottom: '0.5px solid var(--bg-hairline)',
        zIndex: 100,
      }}>
        {/* Pages menu */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const v = !pagesOpen; closeAll(); setPagesOpen(v) }} style={{
            width: 84, height: 84, borderRadius: 18,
            background: pagesOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg1)', border: 0, cursor: 'pointer',
          }}>
            <Icon name="menu" size={42}/>
          </button>
          <PagesMenu open={pagesOpen} onClose={() => setPagesOpen(false)}/>
        </div>

        {/* Waypoints dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const v = !waypointsOpen; closeAll(); setWaypointsOpenAndNotify(v) }} style={{
            height: 84, padding: '0 27px', borderRadius: 18,
            background: waypointsOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', gap: 15,
            fontSize: 26, fontWeight: 600, color: 'var(--fg1)',
            border: 0, cursor: 'pointer',
          }}>
            <Icon name="pin" size={33}/>
            Waypoints
            <Icon name="chevron_down" size={27} color="var(--fg3)"/>
          </button>
          <WaypointDropdown open={waypointsOpen} waypoints={waypoints || []}
                            onSelect={onSelectWaypoint} onAdd={onAddWaypoint}
                            onClose={() => setWaypointsOpenAndNotify(false)}/>
        </div>

        <div style={{ flex: 1 }}/>

        {/* Live metrics */}
        <TopMetric label="Speed" value={speed != null ? Number(speed).toFixed(1) : '—'} unit="kn" live/>
        <Divider/>
        <TopMetric label="Depth" value={depth != null ? Number(depth).toFixed(1) : '—'} unit="ft" tint="var(--tint-teal)" live/>
        <Divider/>
        <TopMetric label="Water" value={waterTemp != null ? String(Math.round(waterTemp)) : '—'} unit="°F" tint="var(--tint-teal)" live={waterTemp != null}/>
        <Divider/>
        <TopMetric label="Fuel" value={fuelLevel != null ? String(Math.round(fuelLevel)) : '—'} unit="%" live={fuelLevel != null}/>
        <Divider/>
        <TopMetric label="Batt" value={batteryVoltage != null ? Number(batteryVoltage).toFixed(1) : '—'} unit="V" live={batteryVoltage != null}/>
        <Divider/>
        <TopMetric label="HDG" value={heading != null ? String(Math.round(heading)).padStart(3, '0') : '—'} unit="°M"/>
        <Divider/>
        <Clock/>
        <Divider/>

        {/* Layers toggle */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const v = !layersOpen; closeAll(); setLayersOpen(v) }} style={{
            width: 84, height: 84, borderRadius: 18,
            background: layersOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg1)', border: 0, cursor: 'pointer',
          }} title="Layers">
            <Icon name="layers" size={42}/>
          </button>
          <LayersPanel open={layersOpen} layers={layers} onChange={onLayerChange}/>
        </div>

        {/* Vector chart sublayer filter — only when S-57 layer is active */}
        {s57FilterVisible && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => { const v = !s57FilterOpen; closeAll(); setS57FilterOpen(v) }} style={{
              width: 84, height: 84, borderRadius: 18,
              background: s57FilterOpen ? 'var(--fill-1)' : 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fg1)', border: 0, cursor: 'pointer',
            }} title="Filter vector chart layers" aria-label="Vector chart filter">
              <svg width="42" height="42" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"/>
              </svg>
            </button>
            {s57FilterOpen && (
              <S57SubLayerMenu
                sublayerVisibility={s57SubLayerVisibility}
                onToggleSublayer={onToggleSublayer}
                onToggleGroup={onToggleGroup}
                onClose={() => setS57FilterOpen(false)}
              />
            )}
          </div>
        )}

        <ThemeCycleButton size={84} iconSize={42} radius={18}/>
      </div>
    </>
  )
})
