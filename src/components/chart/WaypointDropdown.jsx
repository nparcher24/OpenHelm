import { Glass, Icon } from '../../ui/primitives'

function formatDMS(value, isLat) {
  const abs = Math.abs(value)
  const deg = Math.floor(abs)
  const min = (abs - deg) * 60
  const dir = value >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W')
  const pad = (n, w) => String(n).padStart(w, '0')
  return `${pad(deg, isLat ? 2 : 3)}°${min.toFixed(1).padStart(4, '0')}′${dir}`
}

export function WaypointDropdown({ open, waypoints = [], onSelect, onClose, onAdd }) {
  if (!open) return null
  return (
    <Glass radius={18} style={{
      position: 'absolute', top: 96, left: 0, width: 520, maxHeight: 640,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1000,
      background: 'var(--bg-elev)',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      animation: 'oh-slide 220ms var(--ease-out)',
    }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: '0.5px solid var(--bg-hairline)',
                    display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Waypoints</div>
        <span style={{ fontSize: 18, color: 'var(--fg3)' }}>{waypoints.length}</span>
        {onAdd && (
          <button onClick={onAdd} style={{ width: 40, height: 40, borderRadius: 12,
                   background: 'var(--fill-2)', border: 0, cursor: 'pointer',
                   display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                   color: 'var(--fg1)' }}>
            <Icon name="plus" size={22}/>
          </button>
        )}
      </div>
      <div style={{ overflow: 'auto' }}>
        {waypoints.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg3)', fontSize: 18 }}>
            No waypoints. Long-press the map to add one.
          </div>
        )}
        {waypoints.map((w, i) => {
          const coords = (w.lat != null && w.lon != null)
            ? `${formatDMS(w.lat, true)} ${formatDMS(w.lon, false)}`
            : w.coords || ''
          const tag = w.tag
          return (
            <button key={w.id ?? i} onClick={() => { onSelect?.(w); onClose?.() }} style={{
              width: '100%', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
              borderBottom: i === waypoints.length - 1 ? 'none' : '0.5px solid var(--bg-hairline)',
              transition: 'background 120ms', border: 0, cursor: 'pointer',
              background: 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--fill-1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: tag === 'Passed' ? 'var(--fill-2)' : tag === 'Next' ? 'var(--signal)'
                          : 'var(--signal-soft)',
                color: tag === 'Passed' ? 'var(--fg3)' : tag === 'Next' ? '#fff' : 'var(--signal)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="pin" size={22}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg1)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name || 'Waypoint'}</div>
                <div style={{ fontSize: 16, color: 'var(--fg3)', fontFamily: 'var(--font-mono)',
                              fontVariantNumeric: 'tabular-nums' }}>{coords}</div>
              </div>
              {(w.distance != null || w.bearing != null) && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {w.distance != null && (
                    <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                                  color: 'var(--fg1)', letterSpacing: '-0.01em' }}>
                      {typeof w.distance === 'number' ? `${w.distance.toFixed(1)} nm` : w.distance}
                    </div>
                  )}
                  {w.bearing != null && (
                    <div style={{ fontSize: 15, color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>
                      {typeof w.bearing === 'number' ? `${String(Math.round(w.bearing)).padStart(3, '0')}°` : w.bearing}
                    </div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </Glass>
  )
}
