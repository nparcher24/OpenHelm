import { Icon } from '../../ui/primitives'

const ORIENTATION_VISUALS = {
  north: {
    label: 'North-up',
    icon: 'arrow_up_wide',
    active: false,
    accent: null,
    glow: '0 6px 18px rgba(0,0,0,0.4)',
  },
  heading: {
    label: 'Heading-up',
    icon: 'arrow_up_wide',
    active: true,
    accent: 'var(--beacon)',
    glow: '0 6px 18px rgba(74,144,226,0.35)',
  },
  track: {
    label: 'Track-up',
    icon: 'arrow_up_wide',
    active: true,
    accent: 'var(--tint-teal)',
    glow: '0 6px 18px rgba(78,184,208,0.35)',
  },
}

export function FollowControls({ centerOn, setCenterOn, orientationMode = 'north', onCycleOrientation }) {
  const v = ORIENTATION_VISUALS[orientationMode] || ORIENTATION_VISUALS.north
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 5,
                  display: 'flex', gap: 12 }}>
      <button onClick={() => setCenterOn(!centerOn)} style={{
        height: 80, padding: '0 28px', borderRadius: 16,
        background: centerOn ? 'var(--signal)' : 'var(--bg-chrome)',
        backdropFilter: centerOn ? 'none' : 'var(--blur-chrome)',
        WebkitBackdropFilter: centerOn ? 'none' : 'var(--blur-chrome)',
        border: centerOn ? '0.5px solid transparent' : '0.5px solid var(--bg-hairline-strong)',
        color: centerOn ? '#fff' : 'var(--fg1)',
        fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 12,
        boxShadow: centerOn ? '0 6px 18px rgba(232,80,45,0.35)' : '0 6px 18px rgba(0,0,0,0.4)',
        transition: 'all 180ms var(--ease-standard)',
        cursor: 'pointer',
      }}>
        <Icon name="crosshair" size={28} stroke={2}/>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                         textTransform: 'uppercase', opacity: centerOn ? 0.85 : 0.6 }}>
            {centerOn ? 'Locked' : 'Center'}
          </span>
          <span>Follow boat</span>
        </div>
      </button>

      <button onClick={onCycleOrientation} style={{
        height: 80, padding: '0 28px', borderRadius: 16,
        background: v.active ? v.accent : 'var(--bg-chrome)',
        backdropFilter: v.active ? 'none' : 'var(--blur-chrome)',
        WebkitBackdropFilter: v.active ? 'none' : 'var(--blur-chrome)',
        border: v.active ? '0.5px solid transparent' : '0.5px solid var(--bg-hairline-strong)',
        color: v.active ? '#fff' : 'var(--fg1)',
        fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 12,
        boxShadow: v.glow,
        transition: 'all 180ms var(--ease-standard)',
        cursor: 'pointer',
      }}>
        <Icon name={v.icon} size={28} stroke={2}/>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                         textTransform: 'uppercase', opacity: v.active ? 0.85 : 0.6 }}>
            {v.label}
          </span>
          <span>Rotate map</span>
        </div>
      </button>
    </div>
  )
}
