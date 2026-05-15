export function TopMetric({ label, value, unit, tint, live }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.12em',
                       textTransform: 'uppercase', color: 'var(--fg3)' }}>{label}</span>
        {live && <span style={{ width: 8, height: 8, borderRadius: 999,
          background: tint || 'var(--signal)', boxShadow: `0 0 6px ${tint || 'var(--signal)'}` }}/>}
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
      }}>
        <span style={{ fontSize: 45, fontWeight: 600, color: tint || 'var(--fg1)' }}>{value ?? '—'}</span>
        <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--fg3)' }}>{unit}</span>
      </div>
    </div>
  )
}
