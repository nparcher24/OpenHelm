import { useEffect, useState } from 'react'
import { Icon, PagesMenu, ThemeCycleButton } from '../../ui/primitives'
import { TopMetric } from './TopMetric.jsx'
import { WaypointDropdown } from './WaypointDropdown.jsx'
import { LayersPanel } from './LayersPanel.jsx'
import { ChartsPanel } from './ChartsPanel.jsx'

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{
      fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600,
      fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: 'var(--fg1)',
    }}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
  )
}

function Divider() {
  return <div style={{ width: 0.5, height: 32, background: 'var(--bg-hairline)' }}/>
}

export function ChartTopBar({
  speed, depth, heading,
  waypoints, onSelectWaypoint, onAddWaypoint,
  layers, onLayerChange,
  chartSource, onChartSourceChange,
}) {
  const [pagesOpen, setPagesOpen] = useState(false)
  const [waypointsOpen, setWaypointsOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [chartsOpen, setChartsOpen] = useState(false)

  const closeAll = () => {
    setPagesOpen(false)
    setWaypointsOpen(false)
    setLayersOpen(false)
    setChartsOpen(false)
  }
  const anyOpen = pagesOpen || waypointsOpen || layersOpen || chartsOpen

  return (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 56,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
        background: 'var(--bg-chrome)',
        backdropFilter: 'var(--blur-chrome)',
        WebkitBackdropFilter: 'var(--blur-chrome)',
        borderBottom: '0.5px solid var(--bg-hairline)',
        zIndex: 10,
      }}>
        {/* Pages menu */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const v = !pagesOpen; closeAll(); setPagesOpen(v) }} style={{
            width: 40, height: 40, borderRadius: 10,
            background: pagesOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg1)', border: 0, cursor: 'pointer',
          }}>
            <Icon name="menu" size={20}/>
          </button>
          <PagesMenu open={pagesOpen} onClose={() => setPagesOpen(false)}/>
        </div>

        {/* Waypoints dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const v = !waypointsOpen; closeAll(); setWaypointsOpen(v) }} style={{
            height: 40, padding: '0 14px', borderRadius: 10,
            background: waypointsOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 14, fontWeight: 600, color: 'var(--fg1)',
            border: 0, cursor: 'pointer',
          }}>
            <Icon name="pin" size={18}/>
            Waypoints
            <Icon name="chevron_down" size={14} color="var(--fg3)"/>
          </button>
          <WaypointDropdown open={waypointsOpen} waypoints={waypoints || []}
                            onSelect={onSelectWaypoint} onAdd={onAddWaypoint}
                            onClose={() => setWaypointsOpen(false)}/>
        </div>

        <div style={{ flex: 1 }}/>

        {/* Live metrics */}
        <TopMetric label="Speed" value={speed != null ? Number(speed).toFixed(1) : '—'} unit="kn" live/>
        <Divider/>
        <TopMetric label="Depth" value={depth != null ? Number(depth).toFixed(1) : '—'} unit="ft" tint="var(--tint-teal)" live/>
        <Divider/>
        <TopMetric label="HDG" value={heading != null ? String(Math.round(heading)).padStart(3, '0') : '—'} unit="°M"/>
        <Divider/>
        <Clock/>
        <Divider/>

        {/* Chart source selector */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const v = !chartsOpen; closeAll(); setChartsOpen(v) }} style={{
            width: 40, height: 40, borderRadius: 10,
            background: chartsOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg1)', border: 0, cursor: 'pointer',
          }} title="Chart source">
            <Icon name="grid" size={20}/>
          </button>
          <ChartsPanel open={chartsOpen} active={chartSource}
                       onPick={onChartSourceChange} onClose={() => setChartsOpen(false)}/>
        </div>

        {/* Layers toggle */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { const v = !layersOpen; closeAll(); setLayersOpen(v) }} style={{
            width: 40, height: 40, borderRadius: 10,
            background: layersOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg1)', border: 0, cursor: 'pointer',
          }} title="Layers">
            <Icon name="layers" size={20}/>
          </button>
          <LayersPanel open={layersOpen} layers={layers} onChange={onLayerChange}/>
        </div>

        <ThemeCycleButton/>
      </div>

      {/* Click-to-close scrim — behind dropdowns (zIndex 4), above map (zIndex 0) */}
      {anyOpen && <div onClick={closeAll} style={{ position: 'absolute', inset: 0, zIndex: 4 }}/>}
    </>
  )
}
