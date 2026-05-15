export function Glass({ children, style, radius = 14, pad = 0, className }) {
  return (
    <div className={className} style={{
      background: 'var(--bg-chrome)',
      backdropFilter: 'saturate(160%) blur(22px)',
      WebkitBackdropFilter: 'saturate(160%) blur(22px)',
      border: '0.5px solid var(--bg-hairline-strong)',
      borderRadius: radius,
      padding: pad,
      boxShadow: '0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.04)',
      ...style,
    }}>{children}</div>
  )
}
