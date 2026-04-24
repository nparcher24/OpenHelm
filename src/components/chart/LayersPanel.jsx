import { Glass, Toggle } from '../../ui/primitives'

const DEFS = [
  { id: 'bluetopo',  label: 'BlueTopo depth' },
  { id: 'enc',       label: 'NOAA ENC' },
  { id: 's57',       label: 'S-57 features' },
  { id: 'waypoints', label: 'Waypoints' },
  { id: 'weather',   label: 'Weather' },
  { id: 'trail',     label: 'Track' },
]

export function LayersPanel({ open, layers, onChange }) {
  if (!open) return null
  return (
    <Glass radius={14} style={{
      position: 'absolute', top: 48, right: 0, width: 240, zIndex: 20,
      animation: 'oh-slide 220ms var(--ease-out)',
    }}>
      <div style={{ padding: '12px 14px 10px', borderBottom: '0.5px solid var(--bg-hairline)',
                    fontSize: 13, fontWeight: 600 }}>Layers</div>
      <div>
        {DEFS.map((L, i) => (
          <div key={L.id} style={{
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: i === DEFS.length - 1 ? 'none' : '0.5px solid var(--bg-hairline)',
          }}>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--fg1)' }}>{L.label}</div>
            <Toggle on={!!layers?.[L.id]} onChange={(v) => onChange?.(L.id, v)}/>
          </div>
        ))}
      </div>
    </Glass>
  )
}
