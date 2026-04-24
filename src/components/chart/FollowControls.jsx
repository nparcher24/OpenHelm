import { Icon } from '../../ui/primitives'

export function FollowControls({ centerOn, setCenterOn, headingLock, setHeadingLock }) {
  return (
    <div style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 5,
                  display: 'flex', gap: 10 }}>
      <button onClick={() => setCenterOn(!centerOn)} style={{
        height: 64, padding: '0 22px', borderRadius: 14,
        background: centerOn ? 'var(--signal)' : 'var(--bg-chrome)',
        backdropFilter: centerOn ? 'none' : 'var(--blur-chrome)',
        WebkitBackdropFilter: centerOn ? 'none' : 'var(--blur-chrome)',
        border: centerOn ? '0.5px solid transparent' : '0.5px solid var(--bg-hairline-strong)',
        color: centerOn ? '#fff' : 'var(--fg1)',
        fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 10,
        boxShadow: centerOn ? '0 6px 18px rgba(232,80,45,0.35)' : '0 6px 18px rgba(0,0,0,0.4)',
        transition: 'all 180ms var(--ease-standard)',
        cursor: 'pointer',
      }}>
        <Icon name="crosshair" size={22} stroke={2}/>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                         textTransform: 'uppercase', opacity: centerOn ? 0.85 : 0.6 }}>
            {centerOn ? 'Locked' : 'Center'}
          </span>
          <span>Follow boat</span>
        </div>
      </button>

      <button onClick={() => setHeadingLock(!headingLock)} style={{
        height: 64, padding: '0 22px', borderRadius: 14,
        background: headingLock ? 'var(--beacon)' : 'var(--bg-chrome)',
        backdropFilter: headingLock ? 'none' : 'var(--blur-chrome)',
        WebkitBackdropFilter: headingLock ? 'none' : 'var(--blur-chrome)',
        border: headingLock ? '0.5px solid transparent' : '0.5px solid var(--bg-hairline-strong)',
        color: headingLock ? '#fff' : 'var(--fg1)',
        fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', gap: 10,
        boxShadow: headingLock ? '0 6px 18px rgba(74,144,226,0.35)' : '0 6px 18px rgba(0,0,0,0.4)',
        transition: 'all 180ms var(--ease-standard)',
        cursor: 'pointer',
      }}>
        <Icon name="arrow_up_wide" size={22} stroke={2}/>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                         textTransform: 'uppercase', opacity: headingLock ? 0.85 : 0.6 }}>
            {headingLock ? 'Heading-up' : 'North-up'}
          </span>
          <span>Rotate map</span>
        </div>
      </button>
    </div>
  )
}
