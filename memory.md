# OpenHelm Memory

**Purpose**: Session-to-session memory of architectural decisions, gotchas, and recent work. Keep under 400 tokens (~120 lines). Prune aggressively.

---

## Recently Completed (Last 3-5 Features)

- **BlueTopo Bathymetry Map** (Jan 2026): Added `/topo` route with MapLibre displaying bathymetric tiles from Martin tileserver. Tiles stored at `/tiles/bluetopo/{tile_id}/z/x/y.png`.
- **Lasso Selection on Tile View** (Jan 2026): Implemented full map interaction disable during lasso mode - required disabling ALL MapLibre interactions (`dragPan`, `scrollZoom`, `boxZoom`, `doubleClickZoom`, `touchZoomRotate`, `dragRotate`, `keyboard`, `touchPitch`) plus `stopPropagation()` on handlers.
- **Job Progress Pattern** (Jan 2026): Backend uses `global.activeJobs` state + `global.broadcastProgress()` for WebSocket updates. Frontend `useJobProgress` hook handles both WebSocket and HTTP polling fallback.

---

## Known Issues/Gotchas

- **Boot blank/white screen** (Feb 2026): Two distinct failure modes. (1) **White screen, empty HTML** = Chromium launched before Vite preview was ready (race condition). Fixed in `start-openhelm-prod.sh` with curl polling loop (up to 30s). Quick fix: CDP `Page.reload`. (2) **Black screen, empty `#root`** = JS crash, usually WebGL/MapLibre. Chromium 145+ auto-detects ANGLE; don't pass explicit `--use-gl`/`--use-angle` flags. GPU flags in `/etc/chromium.d/01-openhelm-gpu`. Diagnose both via `curl -s http://localhost:9222/json/list` + CDP eval.
- **MapLibre fitBounds auto-zoom**: Without `hasInitiallyFit` flag, map re-zooms on every state change. Use flag to ensure `fitBounds()` runs only once per mount.
- **Martin tile discovery**: Martin auto-discovers tiles from `/tiles/` directory structure. No manual config needed for new tile sources if structure matches `{source}/{z}/{x}/{y}.png`.
- **Lasso stopPropagation**: Must call `e.stopPropagation()` on ALL lasso mouse/touch handlers or MapLibre still intercepts events even when interactions disabled.
- **BlueTopo DB locking**: SQLite `bluetopo.db` can lock if multiple simultaneous writes. Use `PRAGMA journal_mode=WAL` in future if concurrent writes needed.

---

## Architecture Decisions

- **Tile Server Choice**: Martin over Tileserver-GL because Martin is faster on Pi 5, simpler config, and better handles large GeoPackage files.
- **Job Progress**: WebSocket-first with HTTP polling fallback (not polling-only) because real-time feedback is critical for large tile downloads (5min+).
- **API Proxy Pattern**: Frontend never calls external APIs directly - all go through Express API server (port 3002) for caching, error handling, and offline capability.

---

## Active Concerns

- **Tile download bandwidth**: BlueTopo downloads can be large (100s of MB). Need to test on actual Pi 5 with real network conditions.
- **Memory usage during tile render**: MapLibre can use significant RAM with many tile sources. Monitor on Pi 5 hardware.
