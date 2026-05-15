import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ThemeProvider } from '../../../src/ui/theme/ThemeProvider.jsx'
import { useTheme } from '../../../src/ui/theme/useTheme.js'

function Probe() {
  const { theme, setTheme, cycle, auto, setAuto } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="auto">{String(auto)}</span>
      <button data-testid="cycle" onClick={cycle} />
      <button data-testid="set-night" onClick={() => setTheme('night')} />
      <button data-testid="set-auto" onClick={() => setAuto(true)} />
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to dark and writes data-theme on html', () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(getByTestId('theme').textContent).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('persists to localStorage', () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>)
    act(() => getByTestId('set-night').click())
    expect(localStorage.getItem('openhelm.theme')).toBe('night')
    expect(document.documentElement.getAttribute('data-theme')).toBe('night')
  })

  it('cycles dark -> night -> day -> dark', () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(getByTestId('theme').textContent).toBe('dark')
    act(() => getByTestId('cycle').click())
    expect(getByTestId('theme').textContent).toBe('night')
    act(() => getByTestId('cycle').click())
    expect(getByTestId('theme').textContent).toBe('day')
    act(() => getByTestId('cycle').click())
    expect(getByTestId('theme').textContent).toBe('dark')
  })

  it('auto mode flag toggles independently', () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>)
    act(() => getByTestId('set-auto').click())
    expect(getByTestId('auto').textContent).toBe('true')
    expect(localStorage.getItem('openhelm.themeAuto')).toBe('true')
  })
})
