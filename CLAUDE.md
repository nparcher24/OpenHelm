# OpenHelm - Marine Navigation Application

High-performance touchscreen marine navigation app for Raspberry Pi 5 with offline map display, GPS integration, and sunlight-readable UI.

## Session Memory (IMPORTANT - Read First)

**`memory.md` contains session-to-session learnings**. Always review at conversation start.

**Update memory.md when:**
- Completing features (log key decisions/patterns)
- Discovering non-obvious behaviors or gotchas
- Finding edge cases or surprising API quirks
- Making architectural decisions (why X over Y)

**Prune memory.md aggressively:**
- Remove facts now obvious from reading code
- Remove temporary notes after issues fixed
- Remove duplicates of patterns documented here in CLAUDE.md
- Keep only: recent work, edge cases, active concerns, architecture decisions
- Target: Under 400 tokens (~120 lines max)

**Memory is git-tracked** - it evolves with the codebase and helps all contributors.

## Technical Stack

- **Frontend**: React 18 + TailwindCSS + React Router
- **Maps**: MapLibre GL JS (primary) + Leaflet
- **Tile Server**: Martin Tileserver on port 3001
- **API Server**: Express.js on port 3002
- **Runtime**: Chromium frameless browser
- **Icons**: Heroicons (`@heroicons/react`)

## Project Structure

```
/home/hic/OpenHelm/
├── src/
│   ├── App.jsx                 # Main app with routing
│   ├── components/
│   │   ├── BlueTopoTilesView.jsx    # Tile management UI
│   │   ├── BlueTopoDownloader.jsx   # Tile download with progress
│   │   ├── ChartView.jsx            # Nautical chart display
│   │   ├── SettingsView.jsx         # App settings
│   │   ├── RegionSelector.jsx       # Geographic region picker
│   │   └── Navbar.jsx               # Top navigation bar
│   ├── services/
│   │   ├── blueTopoService.js       # BlueTopo tile API client
│   │   ├── blueTopoDownloadService.js
│   │   └── encCatalogueService.js   # ENC chart catalogue
│   ├── hooks/                  # Custom React hooks (useJobProgress)
│   └── utils/                  # Utility functions
├── api-server/
│   ├── server.js               # Express server entry point
│   ├── routes/                 # API route handlers
│   └── services/               # Backend business logic
├── tiles/                      # Downloaded map tiles (Martin serves from here)
├── BlueTopo_Tile_Scheme_*.gpkg # NOAA tile metadata (GeoPackage)
├── start-openhelm.sh           # Main startup script
└── martin-config.yaml          # Martin tileserver config
```

## Startup Commands

```bash
# Full application (Martin + API + Vite + Chromium)
npm start                    # or ./start-openhelm.sh

# Individual services
npm run dev                  # Vite dev server (port 3000)
npm run tiles                # Martin tileserver (port 3001)
node api-server/server.js    # API server (port 3002)

# Stop all services
npm run stop
```

## Design Constraints

- **Touch targets**: Minimum 44px for marine touchscreen use
- **Themes**: Auto light/dark mode via browser preference
- **Offline-first**: All maps and data must work without internet
- **Performance**: Optimize for Pi 5 hardware (memory, rendering)
- **Navigation**: Top navbar with Chart, Topo, GPS, Settings sections

## Architecture Patterns

### MapLibre GL Interactions

**Lasso Selection:**
- Disable ALL map interactions in lasso mode: `dragPan`, `scrollZoom`, `boxZoom`, `doubleClickZoom`, `touchZoomRotate`, `dragRotate`, `keyboard`, `touchPitch`
- Add `e.stopPropagation()` to lasso handlers to prevent bubbling
- Use `map.setFeatureState({source, id}, {selected: true})` for visual selection
- Prevent auto-zoom: Use `hasInitiallyFit` flag so `fitBounds()` runs only once

**Tile Management:**
- BlueTopo tiles: `/tiles/bluetopo/{tile_id}/z/x/y.png`
- Metadata: GeoPackage at project root, query via `ogrinfo`
- Martin auto-discovers tiles from `/tiles/` directory

### Backend API Server

```
Frontend (3000) → API Server (3002) → External APIs (NOAA, etc.)
```

**Endpoints:**
- `GET /api/enc/catalogue` - ENC catalogue from NOAA (30min cache)
- `GET /api/enc/cache/status` - Cache status
- `DELETE /api/enc/cache` - Clear cache

**Adding new routes:**
1. Create `api-server/routes/newRoute.js`
2. Create `api-server/services/newService.js`
3. Register in `api-server/server.js`: `app.use('/api/new', newRoutes)`

### Job Progress Pattern

- Frontend: `useJobProgress` hook (WebSocket + HTTP polling fallback)
- Backend: `global.activeJobs` state, `global.broadcastProgress()` for updates

## Logging

```bash
tail -f openhelm.log    # Frontend logs
tail -f api.log         # API server logs

# Clear logs for fresh session
> openhelm.log && > api.log
```

## MCP Tools

### Context7 - Library Documentation

Use before implementing features with external libraries. Query specific functionality, not generic docs.

**Library IDs:**
| Library | Context7 ID |
|---------|-------------|
| React | `/facebook/react` |
| MapLibre GL JS | `/maplibre/maplibre-gl-js` |
| Leaflet | `/leaflet/leaflet` |
| TailwindCSS | `/tailwindlabs/tailwindcss` |
| Express.js | `/expressjs/express` |

### Brave Search - Marine Domain Research

Use for: NOAA APIs, chart datums (WGS84/NAD83), GPS protocols (NMEA 0183/2000), maritime standards (S-57/S-63), AIS protocols.

Tip: Use specific terms ("EPSG:3857" not "map projection"), include year for API docs.

### Iconify - Icon Discovery

Search across 200+ icon sets when Heroicons lacks needed icons:
- Marine: `"anchor compass buoy ship"`
- GPS: `"satellite location navigation"`
- Weather: `"wind waves temperature"`

Verify licensing before using non-Heroicons in production.
