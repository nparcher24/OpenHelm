import { Icon } from './Icon.jsx'

export function ToolBtn({ icon, children, active, onClick, size = 52, title, style }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: size, height: size, borderRadius: 12,
      background: active ? 'var(--signal-soft)' : 'transparent',
      color: active ? 'var(--signal-hi)' : 'var(--fg1)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 20, fontWeight: 500,
      transition: 'all 180ms var(--ease-standard)',
      boxShadow: active ? 'inset 0 0 0 0.5px rgba(232,80,45,0.4)' : 'none',
      border: 0, cursor: 'pointer',
      ...style,
    }}>
      {icon ? <Icon name={icon} size={22} /> : children}
    </button>
  )
}
