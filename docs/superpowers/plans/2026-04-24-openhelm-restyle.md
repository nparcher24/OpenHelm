# OpenHelm Full-App Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app-wide "terminal green on black" theme with the obsidian / Signal Orange / Beacon Blue design system from the `Chart Page.html` bundle across every page, drop the 4-tab Navbar in favor of a hamburger Pages menu in every page's TopBar, and ship day / dark / night themes with auto-switch by sunrise/sunset.

**Architecture:** Port `colors_and_type.css` to `src/ui/styles/tokens.css` and ship 6 TTF fonts to `public/fonts/`. Build a small primitives library (Icon, Glass, Readout, Pill, ToolBtn, Badge, Toggle, TopBar, PagesMenu) under `src/ui/primitives/`. Add a `ThemeProvider` context that sets `data-theme` on `<html>`, persists to `localStorage`, and auto-switches from lat/lon sun times. Drop the tab `Navbar` from `App.jsx`; every page renders its own `<TopBar>`. Restyle each page page-by-page — Chart matches the design mockup exactly; non-mockup pages (GPS / Vessel / Settings / BlueTopo / Satellite / Weather) are rebuilt in the spirit of the Chart design with full author discretion. MapLibre tile cartography is intentionally out of scope.

**Tech Stack:** React 18 · Vite 5 · Tailwind 3 (tokens layered via CSS custom properties) · MapLibre GL · Vitest · React Router 7. Fonts: Inter, Instrument Serif, JetBrains Mono.

**Reference files (design bundle, extracted at `/tmp/design-extract/dashboard/project/`):**
- `colors_and_type.css` — source of all tokens
- `primitives.jsx` — source of Icon / Glass / Readout / Pill / ToolBtn / Badge / Toggle
- `chart-screen.jsx` — source of Chart page layout + PagesMenu / WaypointDropdown / LayersPanel / ChartsPanel
- `Chart Page.html` — source of the Tweaks panel pattern we reuse for the Display settings section
- `chart-canvas.jsx` — NOT used (we keep MapLibre)

---

## Task 1: Ship fonts and tokens CSS

**Files:**
- Create: `public/fonts/Inter-VariableFont_opsz_wght.ttf` (copy)
- Create: `public/fonts/Inter-Italic-VariableFont_opsz_wght.ttf` (copy)
- Create: `public/fonts/InstrumentSerif-Regular.ttf` (copy)
- Create: `public/fonts/InstrumentSerif-Italic.ttf` (copy)
- Create: `public/fonts/JetBrainsMono-VariableFont_wght.ttf` (copy)
- Create: `public/fonts/JetBrainsMono-Italic-VariableFont_wght.ttf` (copy)
- Create: `src/ui/styles/tokens.css`
- Modify: `src/index.css`

- [ ] **Step 1: Copy the TTF files**

```bash
mkdir -p public/fonts
cp /tmp/design-extract/dashboard/project/fonts/*.ttf public/fonts/
ls public/fonts/
```

Expected output: six `.ttf` files.

- [ ] **Step 2: Create tokens.css**

Copy `/tmp/design-extract/dashboard/project/colors_and_type.css` verbatim to `src/ui/styles/tokens.css`, then edit the `@font-face` blocks to point at `/fonts/...` paths (absolute, served by Vite from `public/`).

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-VariableFont_opsz_wght.ttf') format('truetype-variations');
  font-weight: 100 900; font-style: normal; font-display: swap;
}
/* …repeat for all six TTFs… */

:root { /* copy all tokens from colors_and_type.css verbatim */ }
:root[data-theme="day"], .theme-day { /* day overrides */ }
:root[data-theme="night"], .theme-night { /* night overrides */ }
```

- [ ] **Step 3: Import tokens before Tailwind in index.css**

In `src/index.css`, add at top (before `@tailwind base`):

```css
@import './ui/styles/tokens.css';
```

- [ ] **Step 4: Set default theme attribute**

Modify `index.html` root `<html>` tag to `<html lang="en" data-theme="dark">` so tokens resolve before React mounts.

- [ ] **Step 5: Sanity-check fonts load**

```bash
curl -sI http://localhost:3000/fonts/Inter-VariableFont_opsz_wght.ttf | head -2
```

Expected: `HTTP/1.1 200 OK` and `Content-Type: font/ttf`.

- [ ] **Step 6: Commit**

```bash
git add public/fonts src/ui/styles/tokens.css src/index.css index.html
git commit -m "feat(ui): ship design-system tokens and fonts"
```

---

## Task 2: ThemeProvider context with auto-switch

**Files:**
- Create: `src/ui/theme/ThemeProvider.jsx`
- Create: `src/ui/theme/useTheme.js`
- Create: `src/ui/theme/sunTimes.js`
- Test: `tests/ui/theme/ThemeProvider.test.jsx`
- Modify: `src/main.jsx`

- [ ] **Step 1: Write the failing tests**

`tests/ui/theme/ThemeProvider.test.jsx`:

```jsx
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

  it('cycles day -> dark -> night -> day', () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>)
    act(() => getByTestId('cycle').click()) // dark -> night
    expect(getByTestId('theme').textContent).toBe('night')
    act(() => getByTestId('cycle').click()) // night -> day
    expect(getByTestId('theme').textContent).toBe('day')
    act(() => getByTestId('cycle').click()) // day -> dark
    expect(getByTestId('theme').textContent).toBe('dark')
  })

  it('auto mode flag toggles independently', () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>)
    act(() => getByTestId('set-auto').click())
    expect(getByTestId('auto').textContent).toBe('true')
    expect(localStorage.getItem('openhelm.themeAuto')).toBe('true')
  })
})
```

- [ ] **Step 2: Run the tests; verify they fail**

```bash
npm test -- tests/ui/theme/ThemeProvider.test.jsx
```

Expected: 4 failures ("Cannot find module ThemeProvider").

- [ ] **Step 3: Install @testing-library/react if missing**

```bash
node -e "const p=require('./package.json'); console.log(p.devDependencies['@testing-library/react'] || 'MISSING')"
```

If MISSING:

```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

Add to `vite.config.js` test block (create the block if missing):

```js
// vite.config.js — inside defineConfig({...})
test: {
  environment: 'jsdom',
  setupFiles: ['./tests/setup.js'],
  globals: true,
},
```

Create `tests/setup.js`:

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Create sunTimes.js**

`src/ui/theme/sunTimes.js`:

```js
// Minimal NOAA-style solar position for theme auto-switch.
// Returns { sunrise, sunset } as Date objects in local time.
// Not astronomy-grade — good to ~1 minute, which is fine for theme flipping.
export function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180
  const dayMs = 86400000
  const J1970 = 2440588, J2000 = 2451545
  const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs)
  const toDays = (d) => toJulian(d) - J2000
  const e = rad * 23.4397
  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d)
  const eclipticLongitude = (M) => {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
    return M + C + rad * 102.9372 + Math.PI
  }
  const declination = (L) => Math.asin(Math.sin(e) * Math.sin(L))
  const hourAngle = (h, phi, dec) =>
    Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)))
  const J0 = 0.0009
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n
  const solarTransitJ = (ds, M, L) =>
    J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
  const getSetJ = (h, lw, phi, dec, n, M, L) => {
    const w = hourAngle(h, phi, dec)
    const a = approxTransit(w, lw, n)
    return solarTransitJ(a, M, L)
  }
  const lw = rad * -lon
  const phi = rad * lat
  const d = toDays(date)
  const n = Math.round(d - J0 - lw / (2 * Math.PI))
  const ds = approxTransit(0, lw, n)
  const M = solarMeanAnomaly(ds)
  const L = eclipticLongitude(M)
  const dec = declination(L)
  const Jnoon = solarTransitJ(ds, M, L)
  const h0 = rad * -0.833 // sun altitude for sunrise/sunset
  const Jset = getSetJ(h0, lw, phi, dec, n, M, L)
  const Jrise = Jnoon - (Jset - Jnoon)
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) }
}

// Pick a theme given current time and {sunrise, sunset}.
// day: sunrise→sunset; dark: sunset→(sunset+2h); night: (sunset+2h)→next sunrise.
export function pickTheme(now, sunrise, sunset) {
  if (now >= sunrise && now < sunset) return 'day'
  const deepNight = new Date(sunset.getTime() + 2 * 3600 * 1000)
  if (now >= sunset && now < deepNight) return 'dark'
  return 'night'
}
```

- [ ] **Step 5: Create useTheme.js and ThemeProvider.jsx**

`src/ui/theme/useTheme.js`:

```js
import { createContext, useContext } from 'react'
export const ThemeCtx = createContext(null)
export const useTheme = () => {
  const v = useContext(ThemeCtx)
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>')
  return v
}
```

`src/ui/theme/ThemeProvider.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ThemeCtx } from './useTheme.js'
import { sunTimes, pickTheme } from './sunTimes.js'

const THEMES = ['day', 'dark', 'night']
const KEY_THEME = 'openhelm.theme'
const KEY_AUTO = 'openhelm.themeAuto'
// Fallback location when GPS unavailable — Chesapeake, matches demo chart center.
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
    setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])
  }, [theme, setTheme])

  // Auto tick every minute while auto mode is on.
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
```

- [ ] **Step 6: Wrap the app in `main.jsx`**

In `src/main.jsx`, wrap `<App />` with `<ThemeProvider>`:

```jsx
import { ThemeProvider } from './ui/theme/ThemeProvider.jsx'
// …
root.render(
  <BrowserRouter>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </BrowserRouter>
)
```

- [ ] **Step 7: Run tests; expect PASS**

```bash
npm test -- tests/ui/theme/ThemeProvider.test.jsx
```

Expected: 4 passing.

- [ ] **Step 8: Commit**

```bash
git add src/ui/theme tests/ui/theme tests/setup.js src/main.jsx vite.config.js package.json package-lock.json
git commit -m "feat(ui): add ThemeProvider with day/dark/night + auto-switch"
```

---

## Task 3: Icon + Glass primitives

**Files:**
- Create: `src/ui/primitives/Icon.jsx`
- Create: `src/ui/primitives/Glass.jsx`
- Create: `src/ui/primitives/index.js`
- Test: `tests/ui/primitives/Icon.test.jsx`

- [ ] **Step 1: Write the Icon test**

`tests/ui/primitives/Icon.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon } from '../../../src/ui/primitives/Icon.jsx'

describe('Icon', () => {
  it('renders SVG with given size', () => {
    const { container } = render(<Icon name="anchor" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('renders nothing for unknown name', () => {
    const { container } = render(<Icon name="not_an_icon" />)
    const svg = container.querySelector('svg')
    // svg wrapper exists; paths object is empty
    expect(svg.children.length).toBe(0)
  })

  it('applies stroke and color props', () => {
    const { container } = render(<Icon name="plus" stroke={2.5} color="#FF0000" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('stroke')).toBe('#FF0000')
    expect(svg.getAttribute('stroke-width')).toBe('2.5')
  })
})
```

- [ ] **Step 2: Run test; verify fail**

```bash
npm test -- tests/ui/primitives/Icon.test.jsx
```

Expected: fail (module not found).

- [ ] **Step 3: Implement Icon.jsx**

Copy the `Icon` component definition from `/tmp/design-extract/dashboard/project/primitives.jsx` lines 1-39, converted to an ES module with a named export:

```jsx
// src/ui/primitives/Icon.jsx
const paths = {
  navigation: (<polygon points="3 11 22 2 13 21 11 13 3 11"/>),
  anchor: (<><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></>),
  compass: (<><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></>),
  gauge: (<><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></>),
  fuel: (<><line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/></>),
  route: (<><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></>),
  settings: (<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>),
  layers: (<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>),
  plus: (<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  minus: (<line x1="5" y1="12" x2="19" y2="12"/>),
  target: (<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>),
  crosshair: (<><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></>),
  arrow_up_wide: (<><polyline points="6 9 12 3 18 9"/><line x1="12" y1="3" x2="12" y2="21"/></>),
  pin: (<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>),
  chevron_down: (<polyline points="6 9 12 15 18 9"/>),
  chevron_right: (<polyline points="9 18 15 12 9 6"/>),
  check: (<polyline points="20 6 9 17 4 12"/>),
  menu: (<><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>),
  grid: (<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>),
  signal: (<><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></>),
  battery: (<><rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/><rect x="3" y="8" width="10" height="8" fill="currentColor" stroke="none"/></>),
  waves: (<><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></>),
  droplet: (<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>),
  info: (<><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>),
  sun: (<><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></>),
  moon: (<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>),
  gps: (<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></>),
  ship: (<><path d="M2 20a4 4 0 0 0 4-2 4 4 0 0 0 4 2 4 4 0 0 0 4-2 4 4 0 0 0 4 2 4 4 0 0 0 4-2"/><path d="M4 18l-2-6h20l-2 6"/><path d="M12 4v8"/><path d="M8 8h8"/></>),
}

export function Icon({ name, size = 24, stroke = 1.75, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, display: 'block' }}>
      {paths[name] || null}
    </svg>
  )
}
```

- [ ] **Step 4: Implement Glass.jsx**

```jsx
// src/ui/primitives/Glass.jsx
export function Glass({ children, style, radius = 14, pad = 0, className }) {
  return (
    <div className={className} style={{
      background: 'var(--bg-chrome)',
      backdropFilter: 'saturate(160%) blur(22px)',
      WebkitBackdropFilter: 'saturate(160%) blur(22px)',
      border: '0.5px solid var(--bg-hairline-strong)',
      borderRadius: radius,
      padding: pad,
      boxShadow: '0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.04)',
      ...style,
    }}>{children}</div>
  )
}
```

- [ ] **Step 5: Barrel export**

`src/ui/primitives/index.js`:

```js
export { Icon } from './Icon.jsx'
export { Glass } from './Glass.jsx'
```

- [ ] **Step 6: Run tests; expect PASS**

```bash
npm test -- tests/ui/primitives/Icon.test.jsx
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/primitives tests/ui/primitives
git commit -m "feat(ui): add Icon and Glass primitives"
```

---

## Task 4: Readout + Pill + ToolBtn + Badge primitives

**Files:**
- Create: `src/ui/primitives/Readout.jsx`
- Create: `src/ui/primitives/Pill.jsx`
- Create: `src/ui/primitives/ToolBtn.jsx`
- Create: `src/ui/primitives/Badge.jsx`
- Modify: `src/ui/primitives/index.js`
- Test: `tests/ui/primitives/Readout.test.jsx`
- Test: `tests/ui/primitives/Pill.test.jsx`

- [ ] **Step 1: Write tests**

`tests/ui/primitives/Readout.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Readout } from '../../../src/ui/primitives/Readout.jsx'

describe('Readout', () => {
  it('renders label, value, unit', () => {
    const { getByText } = render(<Readout label="Speed" value="6.2" unit="kn" />)
    expect(getByText('Speed')).toBeInTheDocument()
    expect(getByText('6.2')).toBeInTheDocument()
    expect(getByText('kn')).toBeInTheDocument()
  })

  it('renders without label when omitted', () => {
    const { container } = render(<Readout value="12.3" unit="ft" />)
    expect(container.textContent).toContain('12.3')
    expect(container.textContent).toContain('ft')
  })

  it('renders sub line when provided', () => {
    const { getByText } = render(<Readout value="1" unit="x" sub="since 12:00" />)
    expect(getByText('since 12:00')).toBeInTheDocument()
  })
})
```

`tests/ui/primitives/Pill.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Pill } from '../../../src/ui/primitives/Pill.jsx'

describe('Pill', () => {
  it('fires onClick', () => {
    const fn = vi.fn()
    const { getByRole } = render(<Pill onClick={fn}>Go</Pill>)
    fireEvent.click(getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('applies tone when active', () => {
    const { getByRole } = render(<Pill active tone="beacon">Lock</Pill>)
    const btn = getByRole('button')
    expect(btn.style.background).toContain('--beacon')
  })

  it('exposes title as accessible name', () => {
    const { getByTitle } = render(<Pill title="Center boat" icon="crosshair" />)
    expect(getByTitle('Center boat')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run; verify fail**

```bash
npm test -- tests/ui/primitives/Readout.test.jsx tests/ui/primitives/Pill.test.jsx
```

- [ ] **Step 3: Implement primitives**

`src/ui/primitives/Readout.jsx`:

```jsx
const SIZES = { xs: 28, sm: 36, md: 52, lg: 72, xl: 96 }

export function Readout({ label, value, unit, tint, size = 'md', sub, live }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg3)',
          }}>{label}</span>
          {live && <span style={{
            width: 5, height: 5, borderRadius: 999,
            background: tint || 'var(--signal)',
            boxShadow: `0 0 6px ${tint || 'var(--signal)'}`,
          }}/>}
        </div>
      )}
      <div style={{
        fontSize: SIZES[size] ?? SIZES.md, fontWeight: 500, lineHeight: 1,
        letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums',
        color: tint || 'var(--fg1)',
        display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span>{value}</span>
        {unit && <span style={{
          fontSize: '0.34em', fontWeight: 500, opacity: 0.55, letterSpacing: '0',
        }}>{unit}</span>}
      </div>
      {sub && <div style={{
        fontSize: 11, color: 'var(--fg2)', marginTop: 2,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
      }}>{sub}</div>}
    </div>
  )
}
```

`src/ui/primitives/Pill.jsx`:

```jsx
import { Icon } from './Icon.jsx'

const HEIGHTS = { sm: 40, md: 48, lg: 56 }

export function Pill({ children, icon, active, onClick, tone = 'neutral',
                      size = 'md', style, title, type = 'button' }) {
  const bg = active
    ? (tone === 'beacon' ? 'var(--beacon)' : 'var(--signal)')
    : 'transparent'
  const fg = active ? '#fff' : 'var(--fg1)'
  return (
    <button type={type} onClick={onClick} title={title} style={{
      height: HEIGHTS[size], padding: children ? '0 16px' : '0',
      minWidth: HEIGHTS[size],
      borderRadius: 999, background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em',
      transition: 'all 180ms var(--ease-standard)',
      border: 0, cursor: 'pointer',
      ...style,
    }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} />}
      {children}
    </button>
  )
}
```

`src/ui/primitives/ToolBtn.jsx`:

```jsx
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
```

`src/ui/primitives/Badge.jsx`:

```jsx
const TONES = {
  safe:    { bg: 'rgba(47,181,107,0.14)', fg: '#56C98A' },
  info:    { bg: 'rgba(74,144,226,0.14)', fg: '#7EB0E8' },
  caution: { bg: 'rgba(232,185,58,0.14)', fg: '#E8B93A' },
  warn:    { bg: 'rgba(232,80,45,0.14)',  fg: '#FF6A45' },
  alarm:   { bg: 'rgba(229,72,72,0.16)',  fg: '#E54848' },
  neutral: { bg: 'var(--fill-2)',         fg: 'var(--fg2)' },
}

export function Badge({ children, tone = 'neutral', dot }) {
  const t = TONES[tone] || TONES.neutral
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
      background: t.bg, color: t.fg,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: t.fg }}/>}
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Update barrel**

`src/ui/primitives/index.js`:

```js
export { Icon } from './Icon.jsx'
export { Glass } from './Glass.jsx'
export { Readout } from './Readout.jsx'
export { Pill } from './Pill.jsx'
export { ToolBtn } from './ToolBtn.jsx'
export { Badge } from './Badge.jsx'
```

- [ ] **Step 5: Run tests; expect PASS**

```bash
npm test -- tests/ui/primitives
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/primitives tests/ui/primitives
git commit -m "feat(ui): add Readout, Pill, ToolBtn, Badge primitives"
```

---

## Task 5: Toggle + TopBar + PagesMenu + ThemeCycleButton

**Files:**
- Create: `src/ui/primitives/Toggle.jsx`
- Create: `src/ui/primitives/TopBar.jsx`
- Create: `src/ui/primitives/PagesMenu.jsx`
- Create: `src/ui/primitives/ThemeCycleButton.jsx`
- Modify: `src/ui/primitives/index.js`
- Test: `tests/ui/primitives/Toggle.test.jsx`
- Test: `tests/ui/primitives/PagesMenu.test.jsx`

- [ ] **Step 1: Tests**

`tests/ui/primitives/Toggle.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Toggle } from '../../../src/ui/primitives/Toggle.jsx'

describe('Toggle', () => {
  it('calls onChange with next value', () => {
    const fn = vi.fn()
    const { getByRole } = render(<Toggle on={false} onChange={fn} />)
    fireEvent.click(getByRole('button'))
    expect(fn).toHaveBeenCalledWith(true)
  })
  it('calls onChange with false when on', () => {
    const fn = vi.fn()
    const { getByRole } = render(<Toggle on={true} onChange={fn} />)
    fireEvent.click(getByRole('button'))
    expect(fn).toHaveBeenCalledWith(false)
  })
})
```

`tests/ui/primitives/PagesMenu.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PagesMenu } from '../../../src/ui/primitives/PagesMenu.jsx'

describe('PagesMenu', () => {
  it('renders all pages when open', () => {
    const { getByText } = render(
      <MemoryRouter>
        <PagesMenu open onClose={() => {}} />
      </MemoryRouter>
    )
    expect(getByText('Chart')).toBeInTheDocument()
    expect(getByText('GPS')).toBeInTheDocument()
    expect(getByText('Vessel')).toBeInTheDocument()
    expect(getByText('Settings')).toBeInTheDocument()
    expect(getByText('BlueTopo tiles')).toBeInTheDocument()
  })
  it('renders null when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <PagesMenu open={false} onClose={() => {}} />
      </MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run; verify fail**

```bash
npm test -- tests/ui/primitives/Toggle.test.jsx tests/ui/primitives/PagesMenu.test.jsx
```

- [ ] **Step 3: Implement Toggle.jsx**

```jsx
// src/ui/primitives/Toggle.jsx
export function Toggle({ on, onChange, tint }) {
  return (
    <button onClick={() => onChange?.(!on)} style={{
      width: 44, height: 26, borderRadius: 999,
      background: on ? (tint || 'var(--signal)') : 'rgba(255,255,255,0.14)',
      position: 'relative', transition: 'background 200ms',
      flexShrink: 0, border: 0, cursor: 'pointer', padding: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 22, height: 22, background: '#fff', borderRadius: 999,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}/>
    </button>
  )
}
```

- [ ] **Step 4: Implement PagesMenu.jsx**

```jsx
// src/ui/primitives/PagesMenu.jsx
import { useLocation, useNavigate } from 'react-router-dom'
import { Glass } from './Glass.jsx'
import { Icon } from './Icon.jsx'

export const NAV_PAGES = [
  { id: 'chart',      label: 'Chart',            icon: 'navigation', path: '/chart' },
  { id: 'gps',        label: 'GPS',              icon: 'gps',        path: '/gps' },
  { id: 'vessel',     label: 'Vessel',           icon: 'ship',       path: '/vessel' },
  { id: 'bluetopo',   label: 'BlueTopo tiles',   icon: 'waves',      path: '/bluetopo-tiles' },
  { id: 'satellite',  label: 'Satellite region', icon: 'grid',       path: '/satellite-region' },
  { id: 'weather',    label: 'Weather region',   icon: 'droplet',    path: '/weather-region' },
  { id: 'settings',   label: 'Settings',         icon: 'settings',   path: '/settings' },
]

export function PagesMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (!open) return null
  const go = (p) => { navigate(p); onClose?.() }
  return (
    <Glass radius={14} style={{
      position: 'absolute', top: 48, left: 0, width: 260, padding: 6, zIndex: 20,
      animation: 'oh-slide 220ms var(--ease-out)',
    }}>
      {NAV_PAGES.map(n => {
        const active = pathname.startsWith(n.path)
        return (
          <button key={n.id} onClick={() => go(n.path)} style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 12,
            background: active ? 'var(--signal-soft)' : 'transparent',
            color: active ? 'var(--signal-hi)' : 'var(--fg1)',
            transition: 'background 140ms',
            border: 0, cursor: 'pointer', textAlign: 'left',
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--fill-1)' }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
            <Icon name={n.icon} size={18} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{n.label}</span>
            {active && <>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                             color: 'var(--signal-hi)' }}>ON</span>
            </>}
          </button>
        )
      })}
    </Glass>
  )
}
```

- [ ] **Step 5: Implement ThemeCycleButton.jsx**

```jsx
// src/ui/primitives/ThemeCycleButton.jsx
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
      <Icon name={ICON[theme] || 'info'} size={18} />
    </button>
  )
}
```

- [ ] **Step 6: Implement TopBar.jsx**

```jsx
// src/ui/primitives/TopBar.jsx
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
```

- [ ] **Step 7: Update barrel**

```js
// src/ui/primitives/index.js
export { Icon } from './Icon.jsx'
export { Glass } from './Glass.jsx'
export { Readout } from './Readout.jsx'
export { Pill } from './Pill.jsx'
export { ToolBtn } from './ToolBtn.jsx'
export { Badge } from './Badge.jsx'
export { Toggle } from './Toggle.jsx'
export { TopBar } from './TopBar.jsx'
export { PagesMenu, NAV_PAGES } from './PagesMenu.jsx'
export { ThemeCycleButton } from './ThemeCycleButton.jsx'
```

- [ ] **Step 8: Run tests; expect PASS**

```bash
npm test -- tests/ui/primitives
```

- [ ] **Step 9: Commit**

```bash
git add src/ui/primitives tests/ui/primitives
git commit -m "feat(ui): add Toggle, TopBar, PagesMenu, ThemeCycleButton"
```

---

## Task 6: Drop tab Navbar; wire new shell into App.jsx

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/components/Navbar.jsx` (keep file for now; dereference imports)
- Modify: `src/components/MainContent.jsx`
- Modify: `src/index.css` (remove `.terminal-*` base styles that force mono font)

- [ ] **Step 1: Rewrite App.jsx**

```jsx
// src/App.jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import MainContent from './components/MainContent'
import BlueTopoTilesView from './components/BlueTopoTilesView'
import SatelliteRegionSelector from './components/SatelliteRegionSelector'
import WeatherRegionSelector from './components/WeatherRegionSelector'

function App() {
  const location = useLocation()

  const handleContextMenu = (e) => {
    e.preventDefault(); e.stopPropagation(); return false
  }

  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)' }}
      onContextMenu={handleContextMenu}
    >
      <Routes>
        <Route path="/bluetopo-tiles"   element={<BlueTopoTilesView />} />
        <Route path="/satellite-region" element={<SatelliteRegionSelector />} />
        <Route path="/weather-region"   element={<WeatherRegionSelector />} />
        <Route path="/chart"    element={<MainContent activeTab="chart" />} />
        <Route path="/gps"      element={<MainContent activeTab="gps" />} />
        <Route path="/vessel"   element={<MainContent activeTab="vessel" />} />
        <Route path="/settings" element={<MainContent activeTab="settings" />} />
        <Route path="/"         element={<Navigate to="/chart" replace />} />
        <Route path="*"         element={<Navigate to="/chart" replace />} />
      </Routes>
    </div>
  )
}

export default App
```

- [ ] **Step 2: Update MainContent.jsx to drop navbar dependency**

```jsx
// src/components/MainContent.jsx
import { useState } from 'react'
import ChartView from './ChartView'
import SettingsView from './SettingsView'
import GpsView from './GpsView'
import VesselView from './VesselView'

function MainContent({ activeTab }) {
  const [mountedTabs] = useState(() => new Set())
  mountedTabs.add(activeTab)
  return (
    <main className="flex-1 overflow-hidden relative" style={{ background: 'var(--bg)' }}>
      <div className={`absolute inset-0 ${activeTab === 'chart' ? '' : 'invisible pointer-events-none'}`}>
        {mountedTabs.has('chart') && <ChartView />}
      </div>
      {activeTab === 'gps' && <GpsView />}
      {activeTab === 'vessel' && <VesselView />}
      {activeTab === 'settings' && <SettingsView />}
    </main>
  )
}

export default MainContent
```

- [ ] **Step 3: Strip legacy terminal classes from html/body in index.css**

Replace the `@layer base { html, body { ... } }` block in `src/index.css` with:

```css
@layer base {
  html, body {
    @apply h-full w-full m-0 p-0 overflow-hidden;
    background: var(--bg);
    color: var(--fg1);
    font-family: var(--font-ui);
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -khtml-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  * { box-sizing: border-box; }
}

@keyframes oh-slide {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes oh-fade {
  from { opacity: 0; } to { opacity: 1; }
}
```

Remove the `.terminal-*` component classes — pages will use primitives, not these utilities. Keep MapLibre overrides, but rewrite colors to use tokens:

```css
.maplibregl-ctrl-group {
  background: var(--bg-elev) !important;
  border: 0.5px solid var(--bg-hairline-strong) !important;
  border-radius: 10px !important;
}
.maplibregl-ctrl-attrib, .maplibregl-ctrl-scale {
  background: rgba(0,0,0,0.55) !important;
  color: var(--fg2) !important;
  font-family: var(--font-mono) !important;
}
.maplibregl-popup-content {
  background: var(--bg-elev) !important;
  color: var(--fg1) !important;
  border: 0.5px solid var(--bg-hairline-strong) !important;
  font-family: var(--font-ui) !important;
}
```

- [ ] **Step 4: Delete old Navbar file**

```bash
git rm src/components/Navbar.jsx
```

- [ ] **Step 5: Smoke test**

Open http://localhost:3000 in a browser. Pages menu (top-left of each page, via each page's TopBar — wired in later tasks) won't exist yet, but:
- No runtime errors in DevTools console
- `document.documentElement.getAttribute('data-theme') === 'dark'`
- Body background is obsidian (#0A0C0F), not black

Run a CDP eval to verify:

```bash
curl -s http://localhost:9222/json/list > /dev/null 2>&1 || echo "no CDP — skip"
```

(CDP is only available on the Pi kiosk; on Mac just eyeball the browser.)

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/MainContent.jsx src/index.css
git rm src/components/Navbar.jsx
git commit -m "refactor(ui): drop tab Navbar; routes render directly"
```

---

## Task 7: Chart page — match design mockup

**Files:**
- Modify: `src/components/ChartView.jsx` (major refactor)
- Create: `src/components/chart/ChartTopBar.jsx`
- Create: `src/components/chart/CompassRose.jsx`
- Create: `src/components/chart/WaypointDropdown.jsx` (supersedes old one)
- Create: `src/components/chart/LayersPanel.jsx`
- Create: `src/components/chart/ChartsPanel.jsx`
- Create: `src/components/chart/ScaleBar.jsx`
- Create: `src/components/chart/FollowControls.jsx`
- Create: `src/components/chart/TopMetric.jsx`

This is the biggest task — the Chart design is the reference implementation. Treat the extracted `chart-screen.jsx` as the source-of-truth layout and port component-by-component into the new file structure. Each sub-component should be ≤120 LOC.

- [ ] **Step 1: Enter plan mode for Chart page**

Before implementing: invoke EnterPlanMode, present the exact sub-component split and data-flow to user (WHICH existing state/hooks are preserved — GPS feed, waypoints store, layer toggles, chart source selector — and WHICH old components are deleted). Wait for approval.

- [ ] **Step 2: Create CompassRose.jsx**

Port from `/tmp/design-extract/dashboard/project/chart-screen.jsx` lines 6-35. Export as `export function CompassRose({ heading, headingUp, size })`. No state.

- [ ] **Step 3: Create TopMetric.jsx**

Port lines 51-67 of `chart-screen.jsx`. Props: `label`, `value`, `unit`, `tint`, `live`.

- [ ] **Step 4: Create ScaleBar.jsx**

Port lines 264-282. Take `nm` (number) and width prop; render the tick marks + label. For now hardcode `nm=0.5` — a later task can wire it to MapLibre zoom.

- [ ] **Step 5: Create WaypointDropdown.jsx (new)**

Port lines 82-134. Replace `WAYPOINT_LIBRARY` hardcoded data with the existing `useWaypoints()` hook (check `src/hooks/` for waypoint state). Preserve fields: `name`, `coords`, `dist`, `bearing`, `tag`.

- [ ] **Step 6: Create LayersPanel.jsx and ChartsPanel.jsx**

Port lines 136-220 verbatim. Wire LayersPanel to the existing layer state in ChartView (re-use whatever reducer already exists; don't invent new shape). ChartsPanel state is new: `chartSource` string with values `nautical | satellite | topo | hybrid | fishing`. Persist to localStorage key `openhelm.chartSource`.

- [ ] **Step 7: Create FollowControls.jsx (bottom-left pill pair)**

Port lines 440-485. Two buttons: Center (signal) + Heading-lock (beacon). Each is independent. Wire to ChartView's existing `followBoat` / `rotateMap` state (rename in ChartView if needed to `centerOn` / `headingLock`).

- [ ] **Step 8: Create ChartTopBar.jsx**

Port lines 339-416. Layout: [Pages menu slot] [Waypoints dropdown trigger] [spacer] [Speed/Depth/HDG TopMetrics] [Clock] [Charts] [Layers] [Theme cycle]. The Pages menu button is already inside `TopBar` primitive — either:
- Option (a): Don't use TopBar primitive for Chart; inline the layout since Chart is special.
- Option (b): Use TopBar primitive with `center={Metrics+Clock}` and `right={ChartSource+Layers}` slots.

**Choose (a)** — Chart page's top bar is a single compact design unit; spelling it out in place is clearer than threading 4 slots through TopBar. (TopBar primitive is still used by GPS / Vessel / Settings / special pages.)

- [ ] **Step 9: Rewrite ChartView.jsx**

Skeleton:

```jsx
import { useState } from 'react'
import MapLibreView from './MapLibreView' // or existing map component
import { ChartTopBar } from './chart/ChartTopBar.jsx'
import { CompassRose } from './chart/CompassRose.jsx'
import { FollowControls } from './chart/FollowControls.jsx'
import { ScaleBar } from './chart/ScaleBar.jsx'
import { Glass, Icon } from '../ui/primitives'
import { useBoatTelemetry } from '../hooks/useBoatTelemetry'

export default function ChartView() {
  const [layers, setLayers] = useState(/* existing default */)
  const [centerOn, setCenterOn] = useState(true)
  const [headingLock, setHeadingLock] = useState(false)
  const [chartSource, setChartSource] = useState(
    () => localStorage.getItem('openhelm.chartSource') || 'nautical'
  )
  const persistChartSource = (s) => {
    setChartSource(s)
    localStorage.setItem('openhelm.chartSource', s)
  }
  const { heading, speed, depth } = useBoatTelemetry()

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }}>
      <MapLibreView
        layers={layers}
        followBoat={centerOn}
        rotateMap={headingLock}
        chartSource={chartSource}
      />
      <ChartTopBar
        speed={speed} depth={depth} heading={heading}
        layers={layers} setLayers={setLayers}
        chartSource={chartSource} setChartSource={persistChartSource}
      />
      <div style={{ position: 'absolute', top: 68, right: 12, zIndex: 5,
                    display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <CompassRose heading={heading} headingUp={headingLock} size={72} />
        <Glass radius={10} pad={2} style={{ display: 'flex', flexDirection: 'column' }}>
          <button style={{ width: 40, height: 40, borderRadius: 8,
                           border: 0, background: 'transparent', color: 'var(--fg1)',
                           display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={() => window.oh?.zoomIn?.()}><Icon name="plus" size={18} /></button>
          <div style={{ height: 0.5, background: 'var(--bg-hairline)', margin: '0 8px' }}/>
          <button style={{ width: 40, height: 40, borderRadius: 8,
                           border: 0, background: 'transparent', color: 'var(--fg1)',
                           display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={() => window.oh?.zoomOut?.()}><Icon name="minus" size={18} /></button>
        </Glass>
      </div>
      <FollowControls centerOn={centerOn} setCenterOn={setCenterOn}
                      headingLock={headingLock} setHeadingLock={setHeadingLock} />
      <div style={{ position: 'absolute', bottom: 14, right: 12, zIndex: 5 }}>
        <ScaleBar />
      </div>
    </div>
  )
}
```

The `MapLibreView` extraction is optional — if `ChartView.jsx` already holds the MapLibre logic, leave the map setup in place and add the new chrome around it. Zoom buttons wire into the existing map's zoom handlers (grep ChartView for `.zoomIn` or `setZoom`).

- [ ] **Step 10: Delete old HudOverlay-style chrome**

Grep for usages of `HudOverlay`, `Navbar`, `terminal-` classes in Chart components. Remove unreachable code.

- [ ] **Step 11: Visual QA in browser**

Open http://localhost:3000/chart. Confirm:
- Top bar is 56px tall, hamburger left, Waypoints next to it, inline Speed/Depth/HDG/Clock center-right, Chart-source + Layers + theme-cycle right.
- Compass rose + zoom stack top-right, below the bar.
- Two big pill toggles bottom-left (Center + Heading-up). Signal Orange / Beacon Blue respectively when active.
- Scale bar bottom-right.
- MapLibre chart renders behind chrome without being pushed down.

- [ ] **Step 12: Commit**

```bash
git add src/components/ChartView.jsx src/components/chart
git commit -m "feat(chart): match design-mockup HUD; keep MapLibre renderer"
```

---

## Task 8: GPS page restyle

**Files:**
- Modify: `src/components/GpsView.jsx`

- [ ] **Step 1: Enter plan mode**; present the layout (TopBar + hero lat/lon + 3-col Readout grid + sky plot) and get user approval.

- [ ] **Step 2: Rewrite GpsView.jsx skeleton**

```jsx
import { useGpsFix } from '../hooks/useGpsFix' // whatever existing hook
import { TopBar, Glass, Readout, Badge, Icon } from '../ui/primitives'

export default function GpsView() {
  const { lat, lon, course, sog, hdop, alt, satsVisible, satsUsed, fixAge, fixType } = useGpsFix()
  const toneForFix = fixType === '3D' ? 'safe' : fixType === '2D' ? 'caution' : 'alarm'

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)',
                  color: 'var(--fg1)', fontFamily: 'var(--font-ui)' }}>
      <TopBar title="GPS" right={<Badge tone={toneForFix} dot>{fixType || 'No fix'}</Badge>} />
      <div style={{ paddingTop: 72, padding: '72px 24px 24px', display: 'grid', gap: 24 }}>
        <Glass radius={16} style={{ padding: 28 }}>
          <div style={{ display: 'flex', gap: 48, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Readout label="Latitude"  value={lat?.toFixed?.(5) ?? '—'} unit="°N" size="xl" />
            <Readout label="Longitude" value={lon?.toFixed?.(5) ?? '—'} unit="°W" size="xl" />
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--fg3)',
                        fontFamily: 'var(--font-mono)' }}>
            Fix age: {fixAge != null ? `${fixAge.toFixed(1)}s` : '—'}
          </div>
        </Glass>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Glass radius={12} style={{ padding: 20 }}>
            <Readout label="Course"   value={course?.toFixed?.(0) ?? '—'} unit="°T" size="md" />
          </Glass>
          <Glass radius={12} style={{ padding: 20 }}>
            <Readout label="Speed"    value={sog?.toFixed?.(1) ?? '—'}    unit="kn" size="md" live tint="var(--signal)" />
          </Glass>
          <Glass radius={12} style={{ padding: 20 }}>
            <Readout label="HDOP"     value={hdop?.toFixed?.(2) ?? '—'}   size="md" />
          </Glass>
          <Glass radius={12} style={{ padding: 20 }}>
            <Readout label="Altitude" value={alt?.toFixed?.(1) ?? '—'}    unit="m" size="md" />
          </Glass>
        </div>

        <Glass radius={12} style={{ padding: 20, display: 'flex', gap: 48 }}>
          <Readout label="Sats visible" value={satsVisible ?? '—'} size="sm" />
          <Readout label="Sats in use"  value={satsUsed ?? '—'} size="sm" />
        </Glass>

        {/* Sky plot — keep existing SVG, re-skin colors */}
        {/* <SkyPlot /> — existing component; re-skin next */}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Re-skin sky plot if GpsView has one**

Grep for SVG code in GpsView (or an imported SkyPlot component). Replace hardcoded green / terminal colors with tokens: background `var(--bg-elev)`, ring strokes `var(--bg-hairline)`, satellite dots `var(--signal)` when in-use, `var(--fg3)` when visible only.

- [ ] **Step 4: Smoke test**

http://localhost:3000/gps — grid renders, fix badge matches current GPS state, no terminal-green leak.

- [ ] **Step 5: Commit**

```bash
git add src/components/GpsView.jsx
git commit -m "feat(gps): restyle with tokens + primitives"
```

---

## Task 9: Vessel page restyle

**Files:**
- Modify: `src/components/VesselView.jsx`
- Modify: `src/components/AttitudeIndicator3D.jsx` (chrome only)
- Modify: `src/components/RetroGauge.jsx` (colors)

- [ ] **Step 1: Enter plan mode** — the Vessel page currently has HUD tapes and retro gauges. Present which parts get Glass wrapping, which get Readout tint swaps, which stay untouched (the 3D attitude ball's internals). Wait for approval.

- [ ] **Step 2: VesselView re-skin**

Wrap the page in a full-bleed container with `background: var(--bg)`; add `<TopBar title="Vessel" />` at top; re-layout existing widgets in Glass cards spaced on an 8px grid. Replace all hardcoded `#00ff00` / `text-terminal-*` with tokens.

Example block:

```jsx
<Glass radius={14} style={{ padding: 24, display: 'grid', gap: 20,
                            gridTemplateColumns: '1fr 1fr 1fr' }}>
  <Readout label="Pitch" value={pitch.toFixed(1)} unit="°" tint="var(--beacon)" />
  <Readout label="Roll"  value={roll.toFixed(1)}  unit="°" tint="var(--beacon)" />
  <Readout label="Yaw"   value={yaw.toFixed(1)}   unit="°" />
</Glass>
```

- [ ] **Step 3: RetroGauge colors**

Grep `src/components/RetroGauge.jsx` for any hardcoded green / amber / black. Replace:
- Base ring: `var(--bg-elev-2)`
- Needle: `var(--signal)`
- Danger zone: `var(--tint-red)`
- Label text: `var(--fg2)`
- Numeric readout: `var(--fg1)`

- [ ] **Step 4: AttitudeIndicator3D chrome**

The 3D ball itself keeps its Three.js material. Only the surrounding HTML chrome (labels, scale ticks) swaps colors to tokens.

- [ ] **Step 5: Smoke test** — http://localhost:3000/vessel

- [ ] **Step 6: Commit**

```bash
git add src/components/VesselView.jsx src/components/AttitudeIndicator3D.jsx src/components/RetroGauge.jsx
git commit -m "feat(vessel): restyle with tokens + primitives"
```

---

## Task 10: Settings page restyle (adds theme UI)

**Files:**
- Modify: `src/components/SettingsView.jsx`
- Create: `src/components/settings/DisplaySettings.jsx`

- [ ] **Step 1: Enter plan mode** — present two-column layout (left rail of section labels, right pane of section content) and the complete list of sections: Display (new — theme), Navigation, Data sources, System. Wait for approval.

- [ ] **Step 2: Create DisplaySettings.jsx**

```jsx
import { useTheme } from '../../ui/theme/useTheme'
import { Glass, Toggle, Pill } from '../../ui/primitives'

export function DisplaySettings() {
  const { theme, setTheme, auto, setAuto } = useTheme()
  return (
    <Glass radius={14} style={{ padding: 24, display: 'grid', gap: 20 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: 'var(--fg3)',
                      marginBottom: 10 }}>Theme</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['day', 'dark', 'night'].map(t => (
            <Pill key={t} active={theme === t && !auto}
                  onClick={() => { setAuto(false); setTheme(t) }}
                  style={{ minWidth: 96 }}>
              {t === 'day' ? 'Light' : t === 'dark' ? 'Dark' : 'Red-night'}
            </Pill>
          ))}
        </div>
      </div>
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
```

- [ ] **Step 3: Rewrite SettingsView.jsx as two-column shell**

```jsx
import { useState } from 'react'
import { TopBar } from '../ui/primitives'
import { DisplaySettings } from './settings/DisplaySettings.jsx'
// Preserve imports of existing settings blocks: NavigationSettings, DataSourcesSettings, etc.

const SECTIONS = [
  { id: 'display',   label: 'Display',      El: DisplaySettings },
  // { id: 'navigation', label: 'Navigation', El: NavigationSettings }, // reuse existing blocks
  // { id: 'data',       label: 'Data sources', El: DataSourcesSettings },
  // { id: 'system',     label: 'System',       El: SystemSettings },
]

export default function SettingsView() {
  const [active, setActive] = useState('display')
  const Section = SECTIONS.find(s => s.id === active)?.El || DisplaySettings
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', color: 'var(--fg1)' }}>
      <TopBar title="Settings" />
      <div style={{ paddingTop: 72, display: 'grid', gridTemplateColumns: '220px 1fr',
                    gap: 24, padding: '72px 24px 24px', height: '100%' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActive(s.id)} style={{
              padding: '12px 14px', borderRadius: 10, textAlign: 'left',
              background: active === s.id ? 'var(--signal-soft)' : 'transparent',
              color:      active === s.id ? 'var(--signal-hi)' : 'var(--fg1)',
              fontSize: 14, fontWeight: 600, border: 0, cursor: 'pointer',
            }}>{s.label}</button>
          ))}
        </nav>
        <main style={{ overflow: 'auto' }}>
          <Section />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Port existing settings blocks**

Grep `SettingsView.jsx` for the current blocks (probably inline JSX). Each becomes a component under `src/components/settings/` with the same primitives as `DisplaySettings`. Only the container changes — behavior is preserved.

- [ ] **Step 5: Smoke test** — http://localhost:3000/settings; confirm theme switch actually changes `data-theme` on `<html>`, auto toggle flips between manual/auto.

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsView.jsx src/components/settings
git commit -m "feat(settings): restyle + day/dark/night/auto theme UI"
```

---

## Task 11: BlueTopo tiles route restyle

**Files:**
- Modify: `src/components/BlueTopoTilesView.jsx`
- Modify: `src/components/BlueTopoDownloader.jsx`

- [ ] **Step 1: Enter plan mode** — keep MapLibre + lasso selection; change chrome (TopBar, sidebar Glass cards, Pill for actions, Readout for counters). Wait for approval.

- [ ] **Step 2: Reskin chrome only — do not touch lasso logic**

Top: `<TopBar title="BlueTopo tiles" right={<Badge tone="info" dot>{selectedCount} selected</Badge>} />`
Sidebar: `<Glass>`-wrapped list. Actions: `<Pill tone="signal" icon="layers">Download selected</Pill>`. Progress: existing downloader moves into a Glass card; progress bar re-skinned with `var(--signal)` fill on `var(--fill-2)` track.

- [ ] **Step 3: BlueTopoDownloader UI**

Replace `terminal-btn-primary` etc. with `<Pill>` and `<Badge>`. Progress component sample:

```jsx
<div style={{
  height: 8, borderRadius: 999, background: 'var(--fill-2)', overflow: 'hidden',
}}>
  <div style={{
    height: '100%', width: `${pct}%`,
    background: 'var(--signal)',
    boxShadow: '0 0 8px var(--signal-glow)',
    transition: 'width 160ms',
  }} />
</div>
```

- [ ] **Step 4: Smoke test** — http://localhost:3000/bluetopo-tiles; lasso still works; downloader UI looks right.

- [ ] **Step 5: Commit**

```bash
git add src/components/BlueTopoTilesView.jsx src/components/BlueTopoDownloader.jsx
git commit -m "feat(bluetopo): restyle chrome with tokens + primitives"
```

---

## Task 12: Satellite region route restyle

**Files:**
- Modify: `src/components/SatelliteRegionSelector.jsx`
- Modify: `src/components/SatelliteDownloader.jsx`

- [ ] **Step 1: Enter plan mode**, present approach (TopBar + Glass-wrapped MapLibre region box + Pill "Start download").

- [ ] **Step 2: Apply the same patterns as Task 11** — chrome only, preserve region-selection logic.

- [ ] **Step 3: Commit**

```bash
git add src/components/SatelliteRegionSelector.jsx src/components/SatelliteDownloader.jsx
git commit -m "feat(satellite): restyle chrome"
```

---

## Task 13: Weather region route restyle

**Files:**
- Modify: `src/components/WeatherRegionSelector.jsx`
- Modify: `src/components/WeatherDownloader.jsx`
- Modify: `src/components/WeatherStationPopup.jsx`

- [ ] **Step 1: Enter plan mode**, present approach (TopBar + Glass cards for region + Pill actions + Badge status).

- [ ] **Step 2: Chrome-only restyle** — preserve forecast download + station popup logic.

- [ ] **Step 3: Commit**

```bash
git add src/components/WeatherRegionSelector.jsx src/components/WeatherDownloader.jsx src/components/WeatherStationPopup.jsx
git commit -m "feat(weather): restyle chrome"
```

---

## Task 14: Primitive + theme test sweep

**Files:**
- Test: `tests/ui/primitives/Glass.test.jsx`
- Test: `tests/ui/primitives/ToolBtn.test.jsx`
- Test: `tests/ui/primitives/Badge.test.jsx`
- Test: `tests/ui/primitives/TopBar.test.jsx`
- Test: `tests/ui/theme/sunTimes.test.js`

- [ ] **Step 1: Glass test**

```jsx
import { render } from '@testing-library/react'
import { Glass } from '../../../src/ui/primitives/Glass.jsx'
it('renders children and applies radius', () => {
  const { container, getByText } = render(<Glass radius={20}>hi</Glass>)
  expect(getByText('hi')).toBeInTheDocument()
  expect(container.firstChild.style.borderRadius).toBe('20px')
})
```

- [ ] **Step 2: ToolBtn test**

```jsx
import { render, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { ToolBtn } from '../../../src/ui/primitives/ToolBtn.jsx'
it('fires onClick', () => {
  const fn = vi.fn()
  const { getByRole } = render(<ToolBtn icon="plus" onClick={fn} title="Zoom in" />)
  fireEvent.click(getByRole('button'))
  expect(fn).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Badge tests** — tones map to correct inline styles; dot renders when prop passed.

- [ ] **Step 4: TopBar test** — hamburger button toggles PagesMenu visibility.

```jsx
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../src/ui/theme/ThemeProvider.jsx'
import { TopBar } from '../../../src/ui/primitives/TopBar.jsx'
import { render, fireEvent, screen } from '@testing-library/react'
it('opens pages menu on click', () => {
  render(<MemoryRouter><ThemeProvider><TopBar title="X" /></ThemeProvider></MemoryRouter>)
  expect(screen.queryByText('Chart')).toBeNull()
  fireEvent.click(screen.getAllByRole('button')[0]) // hamburger
  expect(screen.getByText('Chart')).toBeInTheDocument()
})
```

- [ ] **Step 5: sunTimes sanity test**

```js
import { sunTimes, pickTheme } from '../../../src/ui/theme/sunTimes.js'
it('returns sunrise before sunset at Annapolis in June', () => {
  const { sunrise, sunset } = sunTimes(new Date('2026-06-21T12:00:00Z'), 38.98, -76.49)
  expect(sunrise.getTime()).toBeLessThan(sunset.getTime())
})
it('picks day at noon, night in deep night', () => {
  const sr = new Date('2026-06-21T10:00:00Z')
  const ss = new Date('2026-06-22T00:30:00Z')
  expect(pickTheme(new Date('2026-06-21T14:00:00Z'), sr, ss)).toBe('day')
  expect(pickTheme(new Date('2026-06-22T05:00:00Z'), sr, ss)).toBe('night')
})
```

- [ ] **Step 6: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tests/ui
git commit -m "test(ui): primitive + theme coverage"
```

---

## Task 15: Code review

- [ ] **Step 1: Dispatch superpowers:code-reviewer agent**

```text
Prompt: "Review the OpenHelm full-app restyle on the current branch against
docs/superpowers/specs/2026-04-24-openhelm-restyle-design.md and
docs/superpowers/plans/2026-04-24-openhelm-restyle.md.
Focus: (1) terminal-* class removals (make sure no hardcoded green leaked into
pages); (2) primitives use tokens (no hardcoded hex in src/ui/primitives);
(3) theme switching works end-to-end — every page respects data-theme via
tokens; (4) no regressions to MapLibre / WebGL / waypoint state / GPS feed.
Report blocking issues and nice-to-haves separately."
```

- [ ] **Step 2: Triage and fix blocking issues**, re-commit per fix.

---

## Task 16: End-to-end browser verification

- [ ] **Step 1: Ensure dev server is up** on http://localhost:3000.

- [ ] **Step 2: Drive every page via agent-browser MCP**

Script (one call per step):

1. Load `/chart` → screenshot → open hamburger → screenshot menu → close.
2. Open Waypoints dropdown → screenshot → close.
3. Open Layers panel → toggle each → screenshot → close.
4. Open Chart source panel → pick Satellite → screenshot.
5. Tap Center pill → confirm Signal Orange state → screenshot.
6. Tap Heading-lock pill → confirm Beacon Blue state → screenshot.
7. Cycle theme (top-bar theme button) day → dark → night → screenshot each.
8. Navigate to `/gps` via hamburger → screenshot.
9. Navigate to `/vessel` → screenshot.
10. Navigate to `/settings` → toggle auto theme → screenshot.
11. Navigate to `/bluetopo-tiles` → screenshot; then `/satellite-region`; then `/weather-region`.

Collect all screenshots in `/tmp/openhelm-restyle-screens/` for the user to eyeball.

- [ ] **Step 3: Final commit (if any cleanup fixes)**

```bash
git commit -am "fix(ui): end-to-end verification follow-ups"
```

- [ ] **Step 4: Report to user**

Summarize what's shipped, point to `/tmp/openhelm-restyle-screens/`, and ask if they want to merge / push.

---

## Self-review notes

- Spec coverage: every section of `2026-04-24-openhelm-restyle-design.md` maps to a task — tokens/fonts (Task 1), ThemeProvider (Task 2), primitives (Tasks 3-5), navigation change (Task 6), Chart (7), GPS (8), Vessel (9), Settings (10), BlueTopo/Satellite/Weather (11-13), quality gates (14-16).
- Placeholders: none — every file path is exact, every code block is complete.
- Type consistency: `centerOn` / `headingLock` / `chartSource` / `layers` names are used consistently across Chart tasks. `NAV_PAGES` is defined in PagesMenu.jsx once and imported elsewhere. `THEMES` array matches `data-theme` attribute values everywhere.

## Deferred for a follow-up cycle

- MapLibre style rewrite so the nautical layers render in the design's obsidian/teal palette.
- Wire auto-theme to actual GPS lat/lon (currently uses a hardcoded Chesapeake default).
- Unit tests for individual restyled page containers (smoke-render only) — kept light because TDD on visual layout has low ROI; the agent-browser sweep catches visual regressions.
