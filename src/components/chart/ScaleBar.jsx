export function ScaleBar({ nm = 0.5, width = 110 }) {
  return (
    <div style={{
      padding: '8px 14px', borderRadius: 10,
      background: 'var(--bg-chrome)', backdropFilter: 'var(--blur-chrome)',
      WebkitBackdropFilter: 'var(--blur-chrome)',
      border: '0.5px solid var(--bg-hairline-strong)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg2)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <div style={{ position: 'relative', width, height: 8 }}>
        <div style={{ position: 'absolute', left: 0, top: 3, height: 2, width: '100%', background: 'var(--fg2)' }}/>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 8, background: 'var(--fg2)' }}/>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: 8, background: 'var(--fg2)' }}/>
        <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: 8, background: 'var(--fg2)' }}/>
      </div>
      <span>{nm} nm</span>
    </div>
  )
}
