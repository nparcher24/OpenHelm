import { useTheme } from '../theme/useTheme.js'
import { Icon } from './Icon.jsx'

const ICON = { day: 'sun', dark: 'moon', night: 'info' }

export function ThemeCycleButton({ size = 84, iconSize = 42, radius = 18 }) {
  const { theme, cycle } = useTheme()
  return (
    <button onClick={cycle} title={`Theme: ${theme}`} style={{
      width: size, height: size, borderRadius: radius,
      background: 'transparent', color: 'var(--fg1)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: 0, cursor: 'pointer',
    }}>
      <Icon name={ICON[theme] || 'info'} size={iconSize} />
    </button>
  )
}
