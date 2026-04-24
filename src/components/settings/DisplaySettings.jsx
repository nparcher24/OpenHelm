import { useTheme } from '../../ui/theme/useTheme'
import { Glass, Toggle, Pill } from '../../ui/primitives'

const THEME_LABELS = { day: 'Light', dark: 'Dark', night: 'Red-night' }

export function DisplaySettings() {
  const { theme, setTheme, auto, setAuto } = useTheme()
  return (
    <Glass radius={14} style={{ padding: 24, display: 'grid', gap: 20 }}>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--fg3)',
          marginBottom: 10,
        }}>Theme</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['day', 'dark', 'night'].map(t => (
            <Pill
              key={t}
              active={theme === t && !auto}
              onClick={() => { setAuto(false); setTheme(t) }}
              tone={t === 'day' ? 'beacon' : 'signal'}
              style={{ minWidth: 96 }}
            >
              {THEME_LABELS[t]}
            </Pill>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg3)', marginTop: 8 }}>
          Currently active:{' '}
          <span style={{ color: 'var(--fg1)', fontWeight: 600 }}>
            {THEME_LABELS[theme]}
          </span>
          {auto ? ' (auto)' : ''}
        </div>
      </div>

      <div style={{ height: 0.5, background: 'var(--bg-hairline)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg1)' }}>
            Auto-switch by daylight
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg3)', marginTop: 2 }}>
            Day during daylight · Dark after sunset · Red-night 2h later
          </div>
        </div>
        <Toggle on={auto} onChange={setAuto} />
      </div>
    </Glass>
  )
}
