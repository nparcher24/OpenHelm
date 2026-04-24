export function ScaleBar({ nm = 0.5, width = 80 }) {
  return (
    <div style={{
      padding: '6px 10px', borderRadius: 8,
      background: 'var(--bg-chrome)', backdropFilter: 'var(--blur-chrome)',
      WebkitBackdropFilter: 'var(--blur-chrome)',
      border: '0.5px solid var(--bg-hairline-strong)',
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg2)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <div style={{ position: 'relative', width, height: 6 }}>
        <div style={{ position: 'absolute', left: 0, top: 2, height: 2, width: '100%', background: 'var(--fg2)' }}/>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 6, background: 'var(--fg2)' }}/>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: 6, background: 'var(--fg2)' }}/>
        <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: 6, background: 'var(--fg2)' }}/>
      </div>
      <span>{nm} nm</span>
    </div>
  )
}
