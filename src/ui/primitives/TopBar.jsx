import { useState } from 'react'
import { Icon } from './Icon.jsx'
import { PagesMenu } from './PagesMenu.jsx'
import { ThemeCycleButton } from './ThemeCycleButton.jsx'

export function TopBar({ title, center, right, height = 56 }) {
  const [pagesOpen, setPagesOpen] = useState(false)
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
        background: 'var(--bg-chrome)',
        backdropFilter: 'var(--blur-chrome)',
        WebkitBackdropFilter: 'var(--blur-chrome)',
        borderBottom: '0.5px solid var(--bg-hairline)',
        zIndex: 10,
      }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPagesOpen(v => !v)} style={{
            width: 40, height: 40, borderRadius: 10,
            background: pagesOpen ? 'var(--fill-1)' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg1)', border: 0, cursor: 'pointer',
          }}>
            <Icon name="menu" size={20} />
          </button>
          <PagesMenu open={pagesOpen} onClose={() => setPagesOpen(false)} />
        </div>
        {title && <span style={{
          fontSize: 15, fontWeight: 600, color: 'var(--fg1)', letterSpacing: '-0.01em',
        }}>{title}</span>}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
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
