export function TopMetric({ label, value, unit, tint, live }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                       textTransform: 'uppercase', color: 'var(--fg3)' }}>{label}</span>
        {live && <span style={{ width: 4, height: 4, borderRadius: 999,
          background: tint || 'var(--signal)', boxShadow: `0 0 4px ${tint || 'var(--signal)'}` }}/>}
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 3, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
      }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: tint || 'var(--fg1)' }}>{value ?? '—'}</span>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--fg3)' }}>{unit}</span>
      </div>
    </div>
  )
}
