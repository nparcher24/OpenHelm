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
- **Runtime**: Chromium kiosk browser (Wayland/labwc)
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
├── start-openhelm.sh           # Dev mode startup script
├── start-openhelm-prod.sh      # Production kiosk startup script
├── start-dev.sh                # Switch from kiosk to dev mode
├── exit-kiosk.sh               # Exit kiosk, restore desktop (called by API)
└── martin-config.yaml          # Martin tileserver config
```

## Startup Commands

```bash
# Production kiosk (boots automatically via labwc autostart)
./start-openhelm-prod.sh        # Fullscreen kiosk, pre-built dist/
./start-openhelm-prod.sh --rebuild  # Force rebuild before launching

# Development mode (from SSH or after exiting kiosk)
./start-dev.sh                  # Kill prod, launch dev with HMR
npm start                       # or ./start-openhelm.sh (dev mode)

# Individual services
npm run dev                  # Vite dev server (port 3000)
npm run tiles                # Martin tileserver (port 3001)
node api-server/server.js    # API server (port 3002)

# Stop all services
npm run stop
```

## Kiosk Mode

The Pi boots directly into fullscreen OpenHelm via `~/.config/labwc/autostart` (overrides system autostart). No desktop, no taskbar.

- **Exit kiosk from UI**: Settings > System > Exit to Desktop (keeps backend services running)
- **Exit kiosk from SSH**: `./start-dev.sh` (kills prod, starts dev mode)
- **Re-enter kiosk**: `./start-openhelm-prod.sh` or reboot
- **Remote debug**: `curl http://localhost:9222/json/list`
- **Autostart config**: `~/.config/labwc/autostart`

### Autostart Troubleshooting

When OpenHelm doesn't start after reboot, diagnose with these steps:

**1. Check what's running:**
```bash
ps aux | grep -E "(chromium|node|vite|martin)" | grep -v grep
```
Expected: chromium, vite preview (:3000), node api-server (:3002), martin (:3001)

**2. Check which ports respond:**
```bash
for p in 3000 3001 3002 9222; do
  echo -n ":$p "; curl -s -o /dev/null -w "%{http_code}" http://localhost:$p 2>/dev/null; echo
done
```

**3. Read startup logs (most recent attempt is at the bottom):**
```bash
tail -60 /home/hic/OpenHelm/openhelm.log
```

**4. Common failure modes:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Frontend server did not start within Ns" | Cold boot slow, timeout too short | Increase `MAX_WAIT` in `start-openhelm-prod.sh` (currently 90s) |
| "Failed to connect to Wayland display" | Wrong `WAYLAND_DISPLAY` value | Check actual socket: `ls /run/user/1000/wayland-*` — script auto-detects but verify |
| "The platform failed to initialize" | Missing `XDG_RUNTIME_DIR` or wrong Wayland socket | Ensure `XDG_RUNTIME_DIR=/run/user/$(id -u)` is exported |
| Vite running but no Chromium | Startup script hit timeout and exited before Chromium launch | Manually start: see recovery commands below |
| All services running but blank screen | Chromium loaded before server ready (race condition) | Reload page via CDP (see Post-Implementation Verification) |

**5. Manual recovery (start services that are missing):**
```bash
cd /home/hic/OpenHelm

# Start whichever services are not running:
martin --config martin-config.yaml > martin.log 2>&1 &
node api-server/server.js > api.log 2>&1 &
npm run preview -- --host 0.0.0.0 --port 3000 > vite.log 2>&1 &

# Launch Chromium (from SSH, must set display env):
WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 chromium-browser \
  --kiosk --no-sandbox --no-first-run --disable-infobars \
  --enable-gpu-rasterization --ignore-gpu-blocklist \
  --disable-dev-shm-usage --remote-debugging-port=9222 \
  --touch-events=enabled --ozone-platform=wayland \
  http://localhost:3000 >> openhelm.log 2>&1 &
```

**6. Wayland display detection:**
- labwc creates the socket at `/run/user/1000/wayland-0` (not `wayland-1`)
- The autostart script inherits `WAYLAND_DISPLAY` from labwc, so detection works there
- SSH sessions do NOT have `WAYLAND_DISPLAY` or `XDG_RUNTIME_DIR` — must export both manually
- Verify: `ls /run/user/1000/wayland-*` to find the actual socket name

## Deployment Targets

OpenHelm runs on two machines. Both are headless Linux servers running Chromium in kiosk mode.

### Raspberry Pi 5 (Primary — on boat)

- **OS**: Raspberry Pi OS (Debian-based)
- **Display**: Wayland/labwc compositor
- **Kiosk**: `~/.config/labwc/autostart` → `start-openhelm-prod.sh`
- **SSH**: `ssh hic@<pi-ip>` (key auth)
- See "Kiosk Mode" section above for details

### GMKtec M6 Ultra (Secondary — air-segment)

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
ssh hic@192.168.4.87             # Static-ish IP (DHCP, may change)
Password (sudo): archer3
```

**Key auth**: Not configured yet — use `sshpass -p 'archer3'` or password login.

**Managing the kiosk service:**
```bash
sudo systemctl status openhelm-kiosk   # Check status
sudo systemctl stop openhelm-kiosk     # Stop kiosk
sudo systemctl start openhelm-kiosk    # Start kiosk
sudo systemctl restart openhelm-kiosk  # Restart
sudo systemctl disable openhelm-kiosk  # Disable on boot
sudo systemctl enable openhelm-kiosk   # Re-enable on boot
```

**Fallback access**: If the kiosk is misbehaving, SSH always works. The service has restart limits (3 failures in 60s → stops). Ctrl+Alt+F2 on the physical keyboard gives a login prompt on tty2.

**Logs:**
```bash
tail -f ~/OpenHelm/openhelm.log    # Startup + chromium logs
tail -f ~/OpenHelm/api.log         # API server
tail -f ~/OpenHelm/martin.log      # Tile server
sudo journalctl -u openhelm-kiosk  # systemd service logs
```

**Important differences from Pi setup:**
- Uses X11 (startx), not Wayland (labwc/cage)
- Kiosk via systemd service, NOT `.profile` or autostart file
- Chromium is a snap — use `/snap/bin/chromium` explicitly
- Martin built from source (Rust/cargo), not a prebuilt binary

## Post-Implementation Verification (REQUIRED)

After completing any feature or code change, you MUST verify the app still works before considering the task done:

1. **Check for runtime errors** via Chrome DevTools Protocol:
   ```bash
   # Get the page ID then check for JS exceptions
   curl -s http://localhost:9222/json/list | head -5
   ```
   Use a Node script to connect to `ws://localhost:9222/devtools/page/{ID}`, enable `Runtime.enable`, and check for `Runtime.exceptionThrown` events. Also verify `document.querySelector("#root").innerHTML` is non-empty.

2. **Common gotchas that cause blank/white screens**:
   - **Boot race condition (white screen)**: Chromium can launch before Vite preview server is ready, resulting in an empty page that never retries. `start-openhelm-prod.sh` polls `localhost:3000` before launching Chromium (up to 90s). If still blank after boot, the fix is a page reload via CDP:
     ```bash
     PAGE_ID=$(curl -s http://localhost:9222/json/list | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
     node -e "const ws=new(require('ws'))('ws://localhost:9222/devtools/page/$PAGE_ID');ws.on('open',()=>{ws.send(JSON.stringify({id:1,method:'Page.reload',params:{ignoreCache:true}}));setTimeout(()=>process.exit(0),2000)})"
     ```
   - **Diagnosing blank screen**: Check if `#root` has content via CDP. Empty `<html><head></head><body></body></html>` = server wasn't ready (race condition). Empty `#root` div present but no children = JS crash (check WebGL/MapLibre).
   - **Chromium GPU/WebGL failure**: Chromium 145+ removed `--use-gl=egl`; only ANGLE backends work. Do NOT pass explicit `--use-gl` or `--use-angle` flags — let Chromium auto-detect (it picks `--use-angle=gles` with `/dev/dri/card1`). If WebGL fails, MapLibre crashes React entirely (empty `#root`). Additional Chromium GPU flags live in `/etc/chromium.d/01-openhelm-gpu`. Diagnose with CDP: evaluate `document.createElement('canvas').getContext('webgl')` to test WebGL availability.
   - `!== null` does NOT catch `undefined`. Use `!= null` (loose equality) when checking fields that may not exist yet in API responses.
   - API server must be restarted for backend changes to take effect. Frontend-only changes hot-reload via Vite HMR.
   - Three.js objects in react-three-fiber: prefer `<primitive object={...}>` with imperative refs over declarative `<arrowHelper args={...}/>` when updating per-frame.

3. **If errors are found**: fix them and re-verify before reporting completion.

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
