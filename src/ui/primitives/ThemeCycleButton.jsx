import { useTheme } from '../theme/useTheme.js'
import { Icon } from './Icon.jsx'

const ICON = { day: 'sun', dark: 'moon', night: 'info' }

export function ThemeCycleButton() {
  const { theme, cycle } = useTheme()
  return (
    <button onClick={cycle} title={`Theme: ${theme}`} style={{
      width: 40, height: 40, borderRadius: 10,
      background: 'transparent', color: 'var(--fg1)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: 0, cursor: 'pointer',
    }}>
      <Icon name={ICON[theme] || 'info'} size={25} />
    </button>
  )
}
