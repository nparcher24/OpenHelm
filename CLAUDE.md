# OpenHelm - Marine Navigation Application

High-performance touchscreen marine navigation app for the GMKtec M6 Ultra with offline map display, GPS integration, and sunlight-readable UI.

## Dev + Deploy Workflow (IMPORTANT)

**This machine (`air-segment`, GMKtec M6 Ultra) is BOTH the dev workstation AND the kiosk target.** There is no remote deploy — the kiosk runs locally as `openhelm-kiosk.service`.

**After every code change, deploy with:**
```bash
./scripts/deploy.sh        # npm run build + sudo systemctl restart openhelm-kiosk
```
Passwordless sudo for that exact unit is configured, so the script runs end-to-end without prompting.

**For active dev, prefer HMR over rebuild-per-change:**
```bash
./scripts/dev-mode.sh      # swap vite preview → vite dev (HMR) on :3000
./scripts/prod-mode.sh     # restore static preview from dist/
```
Kiosk Chromium points at `http://localhost:3000`, so once `vite dev` owns the port it hot-reloads on save with no service restart.

Do not report a task complete based on local `npm run dev` output alone — verify the kiosk is actually showing the new build (see Post-Implementation Verification below). See also `CLAUDE.local.md` for machine-specific notes.

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
- **Runtime**: Chromium kiosk browser (X11 / matchbox-window-manager on GMKtec)
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
├── start-openhelm.sh           # Dev mode startup script (local workstation)
├── start-dev.sh                # Dev mode helper
└── martin-config.yaml          # Martin tileserver config
```

## Startup Commands (Local Dev)

```bash
# Development mode on this workstation
./start-dev.sh                  # Launch dev with HMR
npm start                       # or ./start-openhelm.sh (dev mode)

# Individual services
npm run dev                  # Vite dev server (port 3000)
npm run tiles                # Martin tileserver (port 3001)
node api-server/server.js    # API server (port 3002)

# Stop all services
npm run stop

# Build for deploy
npm run build                # Produces dist/ for deployment to GMKtec
```

## Deployment Target — GMKtec M6 Ultra ("air-segment")

The sole deployment target. Headless Linux server running Chromium in kiosk mode.

- **Hardware**: AMD Ryzen AI 9 HX 370, 25GB RAM
- **OS**: Ubuntu 22.04 LTS Server, HWE kernel 6.8
- **Display**: X11 (startx + matchbox-window-manager, no desktop environment)
- **Kiosk**: systemd service `openhelm-kiosk.service`
- **Boot splash**: Plymouth theme with OpenHelm logo
- **Martin**: Built from source via cargo (`~/.cargo/bin/martin`)
- **Chromium**: Snap package (`/snap/bin/chromium`)

**SSH Access:**
```
ssh hic@air-segment.local        # mDNS (preferred)
ssh hic@192.168.4.92             # Static IP (configured via netplan)
Password (sudo): archer3
```

**Key auth**: Not configured yet — use `sshpass -p 'archer3'` or password login.

**Managing the kiosk service:**
```bash
sudo systemctl status openhelm-kiosk   # Check status
sudo systemctl stop openhelm-kiosk     # Stop kiosk
sudo systemctl start openhelm-kiosk    # Start kiosk
sudo systemctl restart openhelm-kiosk  # Restart (use after deploy)
sudo systemctl disable openhelm-kiosk  # Disable on boot
sudo systemctl enable openhelm-kiosk   # Re-enable on boot
```

**Fallback access**: If the kiosk is misbehaving, SSH always works. The service has restart limits (3 failures in 60s → stops). Ctrl+Alt+F2 on the physical keyboard gives a login prompt on tty2.

**Remote debug**: `curl http://air-segment.local:9222/json/list` (Chromium DevTools Protocol).

**Logs (on target):**
```bash
tail -f ~/OpenHelm/openhelm.log    # Startup + chromium logs
tail -f ~/OpenHelm/api.log         # API server
tail -f ~/OpenHelm/martin.log      # Tile server
sudo journalctl -u openhelm-kiosk  # systemd service logs
```

## Post-Implementation Verification (REQUIRED)

After completing any feature or code change, you MUST verify the app still works before considering the task done:

1. **Check for runtime errors** via Chrome DevTools Protocol:
   ```bash
   # Get the page ID then check for JS exceptions
   curl -s http://localhost:9222/json/list | head -5
   ```
   Use a Node script to connect to `ws://localhost:9222/devtools/page/{ID}`, enable `Runtime.enable`, and check for `Runtime.exceptionThrown` events. Also verify `document.querySelector("#root").innerHTML` is non-empty.

2. **Common gotchas that cause blank/white screens**:
   - **Boot race condition (white screen)**: Chromium can launch before the frontend server is ready, resulting in an empty page that never retries. If still blank after boot, reload the page via CDP:
     ```bash
     PAGE_ID=$(curl -s http://localhost:9222/json/list | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
     node -e "const ws=new(require('ws'))('ws://localhost:9222/devtools/page/$PAGE_ID');ws.on('open',()=>{ws.send(JSON.stringify({id:1,method:'Page.reload',params:{ignoreCache:true}}));setTimeout(()=>process.exit(0),2000)})"
     ```
   - **Diagnosing blank screen**: Check if `#root` has content via CDP. Empty `<html><head></head><body></body></html>` = server wasn't ready (race condition). Empty `#root` div present but no children = JS crash (check WebGL/MapLibre).
   - **Chromium GPU/WebGL failure**: Chromium 145+ removed `--use-gl=egl`; only ANGLE backends work. Do NOT pass explicit `--use-gl` or `--use-angle` flags — let Chromium auto-detect. If WebGL fails, MapLibre crashes React entirely (empty `#root`). Diagnose with CDP: evaluate `document.createElement('canvas').getContext('webgl')` to test WebGL availability.
   - `!== null` does NOT catch `undefined`. Use `!= null` (loose equality) when checking fields that may not exist yet in API responses.
   - API server must be restarted for backend changes to take effect. Frontend-only changes hot-reload via Vite HMR.
   - Three.js objects in react-three-fiber: prefer `<primitive object={...}>` with imperative refs over declarative `<arrowHelper args={...}/>` when updating per-frame.

3. **If errors are found**: fix them and re-verify before reporting completion.

## Design Constraints

- **Touch targets**: Minimum 44px for marine touchscreen use
- **Themes**: Auto light/dark mode via browser preference
- **Offline-first**: All maps and data must work without internet
- **Performance**: Optimize for GMKtec M6 Ultra hardware (memory, rendering)
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
- `POST /api/system/shutdown` - Kill all OpenHelm processes
- `POST /api/system/exit-kiosk` - Exit kiosk, restore desktop (services keep running)

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

## NMEA 2000 USB Adapter Sub-Project (`n2k_adapter/`)

> **Standing instruction (READ ON EVERY SESSION):** Whenever you uncover information about the N2K adapter, the boat's bus, or the host system that future sessions would need, update both this section AND `n2k_adapter/CLAUDE.md`. That includes: PGNs actually observed on this boat, wiring deviations or quirks, kernel/driver/firmware version requirements, custom udev rules, systemd units, boot configs, and performance issues or buffer tuning beyond the `txqueuelen` note. Memory beats re-discovery.

**Goal:** Pull live NMEA 2000 data off the boat's bus into OpenHelm via a USB-to-CAN adapter, so the existing vessel data pipeline (engine RPM, fuel, depth, etc.) has a real source instead of running in demo mode.

### Hardware

- **Adapter:** DSD TECH SH-C30G isolated USB-to-CAN. CANable 1.0 Pro clone, STM32F072 MCU. Ships with **candleLight** firmware by default (which is what we want).
- **Bus:** NMEA 2000 — CAN 2.0B at **250 kbps**, J1939-based higher-layer protocol. Frames are extended (29-bit) IDs.
- **Connection:** SH-C30G screw terminals wired to a sacrificed N2K Micro-C drop cable.
  - White (CAN_H) → CAN_H
  - Blue  (CAN_L) → CAN_L
  - Mesh shield   → GND
  - Red (NET-S, +12V) → **capped, unused**
  - Black (NET-C, 0V) → **capped, unused**
  - Adapter is USB-powered, **not bus-powered**. Keeping NET-S/NET-C disconnected avoids ground-loop and back-feed risk against the boat's 12V supply.
- **Termination:** The boat's N2K backbone already has 120 Ω terminators at both ends. The SH-C30G's onboard 120 Ω switch must remain **OFF** — adding a third terminator will impedance-mismatch the bus.

### Target Deployment

Final integration runs on **Linux** (the Pi or M6 Ultra), via SocketCAN. The adapter exposes `can0` once plugged in.

macOS is **dev-only** — no native SocketCAN, no `gs_usb` kernel driver. On macOS the adapter can be enumerated and basic USB descriptors inspected, but live frame capture and decoding requires Linux (or a slcan userspace tool, which we are explicitly avoiding — see below).

### Software Stack

OpenHelm is **Node-first**. There is already a working `api-server/services/nmea2000Service.js` that uses `@canboat/canboatjs`'s `SimpleCan` against `can0`. The intent is for the SH-C30G to **drop in as the `can0` provider** — the existing service should keep working unchanged once the OS-level interface is up.

- **Primary stack (Node):** `@canboat/canboatjs` (already a dependency) → `SimpleCan` reads from `can0` via SocketCAN, `FromPgn` decodes PGNs.
- **Optional alt stack (Python):** `python-can` + `canboat` CLI tools (`candump`, `analyzer`). Useful for ad-hoc bus sniffing, PGN discovery, and bench testing — not the production path.
- **Avoid `slcan`:** the slcan userspace driver drops fast-packet frames under load. Use the `gs_usb` kernel driver (which is what candleLight firmware speaks) so the device shows up as a native SocketCAN interface.

### Critical Linux Config Notes

```bash
# Bring up the interface (one-shot)
sudo ip link set can0 up type can bitrate 250000

# REQUIRED tuning — default txqueuelen of 10 drops N2K fast-packet frames
sudo ip link set can0 txqueuelen 1000
```

- Use **candleLight** firmware (factory default). Do **not** flash slcan.
- Verify enumeration: `dmesg | grep -i 'gs_usb\|candle'` after plug-in.
- Verify interface: `ip -details link show can0` should show `bitrate 250000` and `qlen 1000`.
- Confirm traffic: `candump can0` (from `can-utils`) before involving canboatjs.

### Current Status (2026-04-26)

- Hardware received and wired to a sacrificed Micro-C cable per the pinout above.
- Adapter currently plugged into macOS for initial USB inspection only.
- **Not yet** tested against the live bus.
- Bench verification (loopback / two-adapter test) and live bus capture both **pending**.
- Next session continues on the Linux deployment target.

### Where the Sub-Project Lives

All N2K-adapter-specific scaffolding (sub-project memory, README, setup files, code, tests) lives under `n2k_adapter/`. See `n2k_adapter/CLAUDE.md` for the granular running log.
