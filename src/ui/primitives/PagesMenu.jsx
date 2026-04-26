import { useLocation, useNavigate } from 'react-router-dom'
import { Glass } from './Glass.jsx'
import { Icon } from './Icon.jsx'

export const NAV_PAGES = [
  { id: 'chart',      label: 'Chart',            icon: 'navigation', path: '/chart' },
  { id: 'gps',        label: 'GPS',              icon: 'gps',        path: '/gps' },
  { id: 'vessel',     label: 'Vessel',           icon: 'ship',       path: '/vessel' },
  { id: 'settings',   label: 'Settings',         icon: 'settings',   path: '/settings' },
]

export function PagesMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (!open) return null
  const go = (p) => { navigate(p); onClose?.() }
  return (
    <Glass radius={42} style={{
      position: 'absolute', top: 144, left: 0, width: 390, padding: 18, zIndex: 20,
      animation: 'oh-slide 220ms var(--ease-out)',
    }}>
      {NAV_PAGES.map(n => {
        const active = pathname.startsWith(n.path)
        return (
          <button key={n.id} onClick={() => go(n.path)} style={{
            width: '100%', padding: '30px 36px', borderRadius: 30,
            display: 'flex', alignItems: 'center', gap: 36,
            background: active ? 'var(--signal-soft)' : 'transparent',
            color: active ? 'var(--signal-hi)' : 'var(--fg1)',
            transition: 'background 140ms',
            border: 0, cursor: 'pointer', textAlign: 'left',
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--fill-1)' }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
            <Icon name={n.icon} size={54} />
            <span style={{ fontSize: 39, fontWeight: 600 }}>{n.label}</span>
            {active && <>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '0.1em',
                             color: 'var(--signal-hi)' }}>ON</span>
            </>}
          </button>
        )
      })}
    </Glass>
  )
}
