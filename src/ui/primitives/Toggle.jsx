export function Toggle({ on, onChange, tint }) {
  return (
    <button onClick={() => onChange?.(!on)} style={{
      width: 44, height: 26, borderRadius: 999,
      background: on ? (tint || 'var(--signal)') : 'rgba(255,255,255,0.14)',
      position: 'relative', transition: 'background 200ms',
      flexShrink: 0, border: 0, cursor: 'pointer', padding: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 22, height: 22, background: '#fff', borderRadius: 999,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}/>
    </button>
  )
}
