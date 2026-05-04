import { Glass, Toggle } from '../../ui/primitives'

const DEFS = [
  { id: 'bluetopo',  label: 'BlueTopo depth' },
  { id: 'enc',       label: 'NOAA ENC' },
  { id: 's57',       label: 'S-57 features' },
  { id: 'satellite', label: 'Satellite imagery' },
  { id: 'waypoints', label: 'Waypoints' },
  { id: 'weather',   label: 'Weather' },
  { id: 'trail',     label: 'Track' },
]

export function LayersPanel({ open, layers, onChange }) {
  if (!open) return null
  return (
    <Glass radius={18} style={{
      position: 'absolute', top: 96, right: 0, width: 380, zIndex: 1000,
      background: 'var(--bg-elev)',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      animation: 'oh-slide 220ms var(--ease-out)',
    }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: '0.5px solid var(--bg-hairline)',
                    fontSize: 22, fontWeight: 600 }}>Layers</div>
      <div>
        {DEFS.map((L, i) => (
          <div key={L.id} style={{
            padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 14,
            borderBottom: i === DEFS.length - 1 ? 'none' : '0.5px solid var(--bg-hairline)',
          }}>
            <div style={{ flex: 1, fontSize: 22, color: 'var(--fg1)' }}>{L.label}</div>
            <Toggle on={!!layers?.[L.id]} onChange={(v) => onChange?.(L.id, v)}/>
          </div>
        ))}
      </div>
    </Glass>
  )
}
