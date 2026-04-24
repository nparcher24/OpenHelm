import { Glass, Icon } from '../../ui/primitives'

export const CHART_SOURCES = [
  { id: 'nautical',  label: 'Nautical',    sub: 'NOAA ENC + S-57',         icon: 'waves' },
  { id: 'satellite', label: 'Satellite',   sub: 'Downloaded imagery',      icon: 'grid' },
  { id: 'topo',      label: 'Topographic', sub: 'BlueTopo bathymetry',     icon: 'layers' },
  { id: 'hybrid',    label: 'Hybrid',      sub: 'Satellite + chart marks', icon: 'target' },
]

export function ChartsPanel({ open, active, onPick, onClose }) {
  if (!open) return null
  return (
    <Glass radius={14} style={{
      position: 'absolute', top: 56, right: 0, width: 280, padding: 6, zIndex: 20,
      animation: 'oh-slide 220ms var(--ease-out)',
    }}>
      <div style={{ padding: '8px 10px 6px', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'var(--fg3)' }}>Chart source</div>
      {CHART_SOURCES.map(c => {
        const sel = c.id === active
        return (
          <button key={c.id} onClick={() => { onPick?.(c.id); onClose?.() }} style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            background: sel ? 'var(--signal-soft)' : 'transparent',
            color: sel ? 'var(--signal-hi)' : 'var(--fg1)',
            transition: 'background 140ms', border: 0, cursor: 'pointer',
          }}
          onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--fill-1)' }}
          onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: sel ? 'var(--signal)' : 'var(--fill-2)',
              color: sel ? '#fff' : 'var(--fg2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name={c.icon} size={16}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>{c.label}</div>
              <div style={{ fontSize: 10, color: sel ? 'var(--signal-hi)' : 'var(--fg3)',
                            opacity: sel ? 0.8 : 1, marginTop: 1 }}>{c.sub}</div>
            </div>
            {sel && <Icon name="check" size={16} stroke={2.2}/>}
          </button>
        )
      })}
    </Glass>
  )
}
