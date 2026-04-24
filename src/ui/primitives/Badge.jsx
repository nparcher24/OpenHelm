const TONES = {
  safe:    { bg: 'rgba(47,181,107,0.14)', fg: '#56C98A' },
  info:    { bg: 'rgba(74,144,226,0.14)', fg: '#7EB0E8' },
  caution: { bg: 'rgba(232,185,58,0.14)', fg: '#E8B93A' },
  warn:    { bg: 'rgba(232,80,45,0.14)',  fg: '#FF6A45' },
  alarm:   { bg: 'rgba(229,72,72,0.16)',  fg: '#E54848' },
  neutral: { bg: 'var(--fill-2)',         fg: 'var(--fg2)' },
}

export function Badge({ children, tone = 'neutral', dot }) {
  const t = TONES[tone] || TONES.neutral
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
      background: t.bg, color: t.fg,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: t.fg }}/>}
      {children}
    </span>
  )
}
