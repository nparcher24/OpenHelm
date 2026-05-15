const SIZES = { xs: 28, sm: 36, md: 52, lg: 72, xl: 96 }

export function Readout({ label, value, unit, tint, size = 'md', sub, live }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg3)',
          }}>{label}</span>
          {live && <span style={{
            width: 5, height: 5, borderRadius: 999,
            background: tint || 'var(--signal)',
            boxShadow: `0 0 6px ${tint || 'var(--signal)'}`,
          }}/>}
        </div>
      )}
      <div style={{
        fontSize: SIZES[size] ?? SIZES.md, fontWeight: 500, lineHeight: 1,
        letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums',
        color: tint || 'var(--fg1)',
        display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span>{value}</span>
        {unit && <span style={{
          fontSize: '0.34em', fontWeight: 500, opacity: 0.55, letterSpacing: '0',
        }}>{unit}</span>}
      </div>
      {sub && <div style={{
        fontSize: 11, color: 'var(--fg2)', marginTop: 2,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
      }}>{sub}</div>}
    </div>
  )
}
