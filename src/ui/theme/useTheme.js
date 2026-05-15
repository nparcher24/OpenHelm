import { createContext, useContext } from 'react'
export const ThemeCtx = createContext(null)
export const useTheme = () => {
  const v = useContext(ThemeCtx)
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>')
  return v
}
