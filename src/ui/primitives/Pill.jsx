import { Icon } from './Icon.jsx'

const HEIGHTS = { sm: 40, md: 48, lg: 56 }

export function Pill({ children, icon, active, onClick, tone = 'neutral',
                      size = 'md', style, title, type = 'button' }) {
  const bg = active
    ? (tone === 'beacon' ? 'var(--beacon)' : 'var(--signal)')
    : 'transparent'
  const fg = active ? '#fff' : 'var(--fg1)'
  return (
    <button type={type} onClick={onClick} title={title} style={{
      height: HEIGHTS[size], padding: children ? '0 16px' : '0',
      minWidth: HEIGHTS[size],
      borderRadius: 999, background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em',
      transition: 'all 180ms var(--ease-standard)',
      border: 0, cursor: 'pointer',
      ...style,
    }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} />}
      {children}
    </button>
  )
}
