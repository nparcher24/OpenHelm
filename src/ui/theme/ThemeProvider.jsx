import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ThemeCtx } from './useTheme.js'
import { sunTimes, pickTheme } from './sunTimes.js'

const THEMES = ['day', 'dark', 'night']
const KEY_THEME = 'openhelm.theme'
const KEY_AUTO = 'openhelm.themeAuto'
// Fallback location until we wire GPS; matches the Chesapeake design demo.
const DEFAULT_LAT = 38.9
const DEFAULT_LON = -76.4

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_THEME) : null
    return THEMES.includes(v) ? v : 'dark'
  })
  const [auto, setAutoState] = useState(() => {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY_AUTO) === 'true'
  })
  const lastAutoRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = useCallback((t) => {
    if (!THEMES.includes(t)) return
    setThemeState(t)
    try { localStorage.setItem(KEY_THEME, t) } catch {}
  }, [])

  const setAuto = useCallback((v) => {
    setAutoState(Boolean(v))
    try { localStorage.setItem(KEY_AUTO, String(Boolean(v))) } catch {}
  }, [])

  const cycle = useCallback(() => {
    setThemeState(prev => {
      const next = THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]
      try { localStorage.setItem(KEY_THEME, next) } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    if (!auto) return
    const tick = () => {
      const now = new Date()
      const { sunrise, sunset } = sunTimes(now, DEFAULT_LAT, DEFAULT_LON)
      const next = pickTheme(now, sunrise, sunset)
      if (next !== lastAutoRef.current) {
        lastAutoRef.current = next
        setTheme(next)
      }
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [auto, setTheme])

  const value = useMemo(() => ({ theme, setTheme, cycle, auto, setAuto }),
                        [theme, setTheme, cycle, auto, setAuto])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}
