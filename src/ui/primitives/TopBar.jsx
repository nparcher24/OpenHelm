import { useState } from 'react'
import { Icon } from './Icon.jsx'
import { PagesMenu } from './PagesMenu.jsx'
import { ThemeCycleButton } from './ThemeCycleButton.jsx'

export const TOPBAR_HEIGHT = 114

export function TopBar({ title, center, right, height = TOPBAR_HEIGHT }) {
  const [pagesOpen, setPagesOpen] = useState(false)
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height,
        display: 'flex', alignItems: 'center', gap: 18, padding: '0 27px',
        background: 'var(--bg-chrome)',
        backdropFilter: 'var(--blur-chrome)',
        WebkitBackdropFilter: 'var(--blur-chrome)',
        borderBottom: '0.5px solid var(--bg-hairline)',
        zIndex: 10,
      }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPagesOpen(v => !v)} style={{
            width: 84, height: 84, borderRadius: 18,
            background: pagesOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg1)', border: 0, cursor: 'pointer',
          }}>
            <Icon name="menu" size={42} />
          </button>
          <PagesMenu open={pagesOpen} onClose={() => setPagesOpen(false)} />
        </div>
        {title && <span style={{
          fontSize: 30, fontWeight: 600, color: 'var(--fg1)', letterSpacing: '-0.01em',
        }}>{title}</span>}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
          {center}
        </div>
        {right}
        <ThemeCycleButton />
      </div>
      {pagesOpen && <div onClick={() => setPagesOpen(false)} style={{
        position: 'absolute', inset: 0, zIndex: 4,
      }} />}
    </>
  )
}
