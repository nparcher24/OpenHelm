# OpenHelm full-app restyle — design spec

_Date: 2026-04-24 · Source of truth: `claude.ai/design` bundle (`rdeF6lYOfB9RAkXPH3qjkA`)_

## Why

The current OpenHelm UI is a "terminal green on black, glowing monospace" tactical look. The new brand direction — Shield-AI-inspired marine utility, obsidian base + Signal Orange + Beacon Blue — replaces it across every page. The Chart page is fully designed; everything else inherits the same design system applied in the same spirit.

## Locked scope decisions

| Area | Decision |
|------|----------|
| Navigation | Drop the 4-tab top Navbar. Every page carries a top bar with a hamburger "Pages menu" (top-left) listing Chart / GPS / Vessel / Settings / BlueTopo tiles / Satellite region / Weather region. |
| Theme | Three modes: `day`, `dark`, `night`. Quick-cycle button in every top bar + full control (incl. auto-switch based on local sunrise/sunset) in Settings. |
| Non-mockup pages | Full design discretion — restyle in the spirit of the Chart design. |
| MapLibre cartography | Keep existing tile renderer untouched this cycle. Only HUD/chrome is restyled. MapLibre style follow-up is out of scope. |

## Architecture

### 1. Design tokens (`src/ui/styles/tokens.css`)

Port `/tmp/design-extract/dashboard/project/colors_and_type.css` verbatim into `src/ui/styles/tokens.css` with one change: font `url(...)` paths point at `/fonts/…` (served from `public/fonts/`). Apply via `<link>` in `index.html` or `@import` from `src/index.css`.

Keep the existing `tailwind.config.js` Tailwind setup — add an `oh` color extension pointing at the CSS variables (e.g. `oh-bg: 'var(--bg)'`) so Tailwind utilities and the raw CSS variables coexist. The legacy `terminal.*` palette is removed once the last consumer is gone; during migration it stays defined but unused.

### 2. Fonts

Copy the six TTFs from the bundle into `public/fonts/`:
- `Inter-VariableFont_opsz_wght.ttf`, `Inter-Italic-VariableFont_opsz_wght.ttf`
- `InstrumentSerif-Regular.ttf`, `InstrumentSerif-Italic.ttf`
- `JetBrainsMono-VariableFont_wght.ttf`, `JetBrainsMono-Italic-VariableFont_wght.ttf`

`@font-face` blocks live in `tokens.css` (copied from the design bundle, paths rewritten).

### 3. Primitives (`src/ui/primitives/`)

Port the design-bundle primitives to idiomatic React components:
- `Icon.jsx` — SVG icon set from `primitives.jsx` (navigation, anchor, compass, gauge, fuel, route, settings, layers, plus, minus, target, crosshair, arrow_up_wide, pin, chevron_down, chevron_right, check, menu, grid, signal, battery, waves, droplet, info, lock_north). Add a few extra OpenHelm-specific icons (wind, wave, weather) via the iconify MCP when needed.
- `Glass.jsx` — translucent panel with backdrop blur + hairline + shadow.
- `Readout.jsx` — label + big tabular number + unit + optional sub + live dot.
- `Pill.jsx` — touch-sized capsule button, signal/beacon tones, `sm/md/lg` sizes.
- `ToolBtn.jsx` — square icon tool button.
- `Badge.jsx` — safe/info/caution/warn/neutral tones.
- `Toggle.jsx` — rounded switch.
- `TopBar.jsx` — shared top bar scaffold used by every page (hosts the hamburger pages menu + theme quick-cycle button + per-page slot content).
- `PagesMenu.jsx` — hamburger dropdown used by TopBar.

All primitives live under `src/ui/primitives/` with a barrel `index.js`. They consume CSS variables from tokens.css exclusively; no per-primitive Tailwind classes.

### 4. Theme provider (`src/ui/theme/ThemeProvider.jsx`)

React Context holding `{ theme, setTheme, auto, setAuto }`. Applies `data-theme="day|dark|night"` to `document.documentElement` whenever theme changes. Stores preference in `localStorage` under `openhelm.theme`. Auto-switch: when `auto === true`, computes sunrise/sunset from a hardcoded-for-now lat/lon (boat position once GPS-backed) and flips day → dark at civil twilight, dark → night two hours after sunset (configurable threshold in Settings later).

### 5. Navigation change

`src/App.jsx` drops the `<Navbar />` component entirely. `MainContent` no longer receives `activeTab` — routes fire as normal. Each page component renders its own `<TopBar>` (slot pattern so the Chart page can stuff Waypoints/Clock/metrics into the top bar while the Settings page uses it as just a title bar).

Special routes (`/bluetopo-tiles`, `/satellite-region`, `/weather-region`) get the same TopBar scaffold, reached via the pages menu.

### 6. Per-page treatment

**Chart page (`ChartView.jsx`)** — match the design pixel-for-pixel:
- Top bar: pages menu button, Waypoints dropdown, inline Speed/Depth/HDG metrics, clock, chart-source selector, layers button, theme quick-cycle button.
- Right stack (top-right, below bar): compass rose + zoom +/- in a Glass panel.
- Bottom-left: two 64px Pill buttons — Center (Signal Orange when active) + Heading-lock (Beacon Blue when active).
- Bottom-right: scale bar.
- Map stays MapLibre, just wrapped in the new chrome. The `HudOverlay`, `DepthCrosshairs`, and `DepthInfoCard` components get restyled into Glass panels with Readout primitives.
- Existing `WaypointDropdown`, `LayersMenu`, `WaypointMenu` are merged/replaced by the design's Waypoints dropdown + LayersPanel + ChartsPanel.

**GPS (`GpsView.jsx`)** — full-bleed dark canvas with:
- Top bar (title "GPS").
- Hero row: big Instrument-Serif readout of lat/lon + status Badge (Fix 3D / 2D / No fix).
- 3-column grid of Readout cards: Course, SOG, HDOP, Altitude, Sats visible, Sats in use, + last fix age.
- Satellite sky plot (existing SVG, re-skinned to Signal Orange / Beacon Blue dots on obsidian).

**Vessel (`VesselView.jsx`)** — keep existing AttitudeIndicator3D + retro gauges but:
- Chrome is Glass panels with hairline borders.
- Numeric readouts become Readout primitives (tabular nums, Signal Orange for limit warnings).
- HUD tapes re-tinted: pitch/roll/yaw use Beacon Blue, engine rpm/temps use Signal Orange.

**Settings (`SettingsView.jsx`)** — two-column:
- Left rail: sections list (Display, Navigation, Data sources, System).
- Right pane: section content built from Toggle/Badge/Pill primitives.
- Display section hosts the theme selector (day/dark/night/auto), brightness-sync toggle, and scale.

**BlueTopo tiles (`BlueTopoTilesView.jsx`)** — keep the MapLibre lasso-selection map; swap chrome to new TopBar, Glass panels for the tile-metadata sidebar, Pill buttons for actions, Readout primitives for counters (selected tiles, total MB).

**Satellite / Weather region selectors** — same treatment: TopBar + Glass cards for region list, Pill for "Download", Badge for status, Readout for progress.

### 7. Quality gates

- **Unit tests (Vitest)**: primitives (Icon renders by name, Readout formats numbers, Pill fires onClick, Toggle toggles state), ThemeProvider (persists + switches `data-theme`).
- **Code review**: superpowers:code-reviewer on the final branch before E2E.
- **End-to-end**: `agent-browser` MCP drives the app through every page, cycles themes, opens every dropdown, screenshots each page at 1440×1080.

## Build sequence

1. Design foundations (fonts + tokens + primitives + ThemeProvider + TopBar) — no visual change yet, just available.
2. Remove old Navbar; wire PagesMenu into TopBar.
3. Chart page match-to-mockup (this is the reference implementation).
4. GPS restyle.
5. Vessel restyle.
6. Settings restyle (adds theme config UI).
7. Special routes restyle (BlueTopo / Satellite / Weather).
8. Unit tests.
9. Code review.
10. End-to-end browser verification.

## Out of scope (noted for later)

- MapLibre cartography restyle (depth-shading polygons, obsidian land, teal water) — separate cycle.
- New pages from the design's NAV_PAGES list that don't exist today (Engine, Fuel, Autopilot, Trip, Anchor). They appear in the hamburger menu as disabled/"coming soon" items so the menu matches the design visually without creating orphan routes.
- Red-night palette compliance testing under actual low-light conditions on the Pi's screen — will need a physical check after shipping.

## Risks

- **Dark mode regression on non-Pi hardware**: the design is built for the Pi's matte panel; on a retina Mac in daylight `--fg3`/`--fg4` may feel too dim. Mitigated by day mode being a first-class theme.
- **Font load FOUT**: six TTFs are sizable; use `font-display: swap` (already in the design CSS) and preload Inter + JetBrains Mono.
- **Hamburger menu discoverability**: losing the tab bar is a muscle-memory change. Mitigation: the pages menu is a persistent 40px button in the top-left of every page — always visible, never hidden behind a tap.
