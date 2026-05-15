# Breadcrumb / Track Recording — Implementation Plan

## Goal

Continuously record the vessel's position on every run, persist it durably, and let the user opt in to displaying any subset of those tracks on the chart — filtered by date, or scoped to "the current trip only." Recording is always-on; display is opt-in and defaults to off.

## Requirements (from the user, restated)

| # | Requirement | Interpretation |
|---|-------------|----------------|
| 1 | Display can be turned on/off | A visibility toggle on the chart top bar, independent of recording. |
| 2 | Defaults to off | First-run and per-session default for the *display* toggle is off. Recording state is unaffected. |
| 3 | Records all tracks even when not shown | Recording runs in the API server as a background service tied to the GPS arbiter, not to any UI state. |
| 4 | Top-bar menu item, in line with the theme | A new chart top-bar button matching the existing `LayersPanel` / waypoints / S-57 filter pattern (84×84, radius 18, `var(--bg-chrome)` etc.). |
| 5 | Filter tracks by date | Date-range filter inside the tracks panel (single date or from/to). Affects what is fetched and rendered. |
| 6 | "Current trip" toggle | Quick button that snaps the visible set to the trip currently being recorded. |

## Non-goals (for v1)

- Editing/splitting/merging recorded tracks.
- Cloud sync or multi-device replication.
- GPX/KML export — likely a v2 add-on; data model should not preclude it.
- Custom per-track styling. v1 is one consistent style with optional color-by-speed.

---

## Architecture overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         api-server (Node)                          │
│                                                                    │
│  gpsArbiter.getActiveGps()  ───► trackRecorderService              │
│                                  - sample @ 1 Hz                   │
│                                  - distance/time gate              │
│                                  - write to SQLite (tracks db)     │
│                                  - manage current trip lifecycle   │
│                                                                    │
│                                  ▲                                 │
│                                  │ HTTP / WS                       │
│                                  ▼                                 │
│  /api/tracks  ── routes ──► trackRecorderService                   │
└────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                      Frontend (React + MapLibre)                   │
│                                                                    │
│  ChartTopBar  ──► TrackPanel (date filter, trip-only toggle)       │
│                       │                                            │
│                       ▼                                            │
│  ChartView ── GeoJSON source `tracks` ── line layer `trail-line`   │
│                                                                    │
│  LayersPanel `trail` toggle controls layer visibility (already     │
│  scaffolded; wire it through).                                     │
└────────────────────────────────────────────────────────────────────┘
```

Recording lives in `api-server/services/trackRecorderService.js` and starts when the API server starts. Display lives in ChartView and is purely a query against the recorder's HTTP/WebSocket API.

---

## Data model

### SQLite — new file `data/tracks.db`

A separate database from `data/enc_charts.db` because the access pattern is different (high-frequency append, range scans by time) and we don't want to bloat or risk the chart catalogue. Reuse `databaseService.js`'s init pattern but factor a small `openDatabase(path)` helper or create a sibling `trackDatabaseService.js`.

#### Table: `trips`

```sql
CREATE TABLE IF NOT EXISTS trips (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      INTEGER NOT NULL,        -- epoch ms
  ended_at        INTEGER,                 -- null while active
  point_count     INTEGER NOT NULL DEFAULT 0,
  distance_m      REAL    NOT NULL DEFAULT 0,
  start_lat       REAL,
  start_lon       REAL,
  end_lat         REAL,
  end_lon         REAL,
  source          TEXT,                    -- 'witmotion' | 'n2k' (dominant)
  label           TEXT                     -- optional, user-editable later
);

CREATE INDEX IF NOT EXISTS idx_trips_started_at ON trips(started_at);
CREATE INDEX IF NOT EXISTS idx_trips_ended_at   ON trips(ended_at);
```

#### Table: `track_points`

```sql
CREATE TABLE IF NOT EXISTS track_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  ts          INTEGER NOT NULL,            -- epoch ms
  lat         REAL    NOT NULL,
  lon         REAL    NOT NULL,
  cog         REAL,                        -- degrees true
  sog         REAL,                        -- m/s
  heading     REAL,                        -- degrees mag (snapshot)
  source      TEXT                         -- 'witmotion' | 'n2k'
);

CREATE INDEX IF NOT EXISTS idx_track_points_trip_ts ON track_points(trip_id, ts);
CREATE INDEX IF NOT EXISTS idx_track_points_ts      ON track_points(ts);
```

Notes:
- `track_points.id` is monotonic — useful for "give me everything after ID X" cursored fetches.
- `ON DELETE CASCADE` keeps cleanup simple if a user purges a trip.
- We deliberately do not store every WitMotion 5 Hz frame; the recorder gates samples (see below).

### Disk budget (sanity-check)

At a 1 Hz sample, ~50 bytes/row stored: 1 day continuous = 86 400 rows ≈ **~4 MB/day**, ~1.5 GB/year. The GMKtec has plenty of disk; index size is the larger concern. We'll add a settings-controlled retention later (out of scope for v1, but the `idx_trips_started_at` makes "delete older than N days" trivial).

---

## Recording service

### File: `api-server/services/trackRecorderService.js`

Owns:
- A `currentTripId` (or `null` between trips).
- A recent-points buffer (last point lat/lon/ts) to compute distance gating without hitting SQLite.
- A 1 Hz timer that calls `gpsArbiter.getActiveGps()` and decides whether to insert a row.

### Sample-acceptance rules (the gate)

For each tick:
1. Snapshot via `getActiveGps()`. If `source === 'none'` or no fix → skip and end the active trip if it has been more than `TRIP_END_GAP_MS` (60 s default) since the last accepted sample.
2. Validity guards: `latitude`/`longitude` non-null, `|lat| ≤ 90`, `|lon| ≤ 180`, drop obvious zero-island (lat=0 AND lon=0).
3. If no `currentTripId`: open a new trip (`INSERT INTO trips`) and set the start position.
4. Distance gate: if previous point exists, only insert when haversine distance from previous ≥ `MIN_DISTANCE_M` (default 5 m) **or** `MAX_TIME_M` (default 30 s) has elapsed. The dual gate guarantees we record both motion *and* stationary anchor sit-ins (so a moored boat is still represented).
5. Speed sanity: drop samples that imply > 60 kn since the previous point — almost certainly a GPS glitch.
6. On insert, update `trips` row: `point_count`, `distance_m`, `end_lat`, `end_lon`, `ended_at` (kept rolling; finalized at trip end).

### Trip lifecycle

| Event | Action |
|-------|--------|
| First valid sample | Open new trip. |
| `TRIP_END_GAP_MS` (60 s) of no fix or no movement | Close current trip (`ended_at = last_sample_ts`); `currentTripId = null`. |
| API server restart with active trip in DB (no `ended_at`) | Close it on boot using its last `track_points.ts`. Don't resume — a restart usually means we lost continuity. |
| Manual `POST /api/tracks/trips/end` | Close immediately. |

### Lifecycle hooks
- Init from `api-server/server.js` after the GPS arbiter is ready, similar to other services.
- Graceful shutdown: flush + close DB on `SIGINT`/`SIGTERM`.

### Concurrency / write performance
- Use `BEGIN IMMEDIATE` + commit every N inserts (or every tick), since at 1 Hz the cost of one `INSERT` is negligible and we'd rather have crash-durable points.
- Single writer — only this service writes the tables.

### Dominant-source tracking
On trip close, set `trips.source` to whichever of `witmotion` / `n2k` produced the majority of points. Useful for diagnostics ("was this trip recorded off the helm or off the USB GPS?").

---

## API routes

New file: `api-server/routes/tracks.js`. Register in `server.js` as `app.use('/api/tracks', trackRoutes)`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/tracks/trips` | List trips. Query params: `from` (epoch ms), `to` (epoch ms), `limit` (default 100, max 1000). Returns trip metadata (no points). |
| `GET`  | `/api/tracks/trips/:id` | Get one trip's metadata. |
| `GET`  | `/api/tracks/trips/:id/points` | Return points for a trip as GeoJSON `LineString` (or `MultiLineString` if we ever support gap splitting). Query `simplify` (Douglas-Peucker tolerance, meters; default chosen by current zoom — see "decimation" below). |
| `GET`  | `/api/tracks/current` | Returns current trip's metadata + an opaque cursor `lastPointId`. Used by the frontend for "current trip" mode. |
| `GET`  | `/api/tracks/current/points` | GeoJSON for the active trip. Optional `since=<lastPointId>` for incremental tail fetches. |
| `POST` | `/api/tracks/trips/end` | Force-close the current trip. |
| `DELETE` | `/api/tracks/trips/:id` | Delete a trip (cascades points). v1 is enough; bulk delete can wait. |

GeoJSON shape for points:

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[lon,lat], ...] },
  "properties": {
    "tripId": 42,
    "startedAt": 1714826134000,
    "endedAt": 1714829971000,
    "distanceM": 12345.6,
    "pointCount": 1837
  }
}
```

When color-by-speed lands, switch to a `FeatureCollection` of small `LineString` segments with `sog` on each, so MapLibre can paint by data-driven style.

### WebSocket extension

Add a `subscribe-track` message to the existing API server WebSocket. Backend pushes `{type: 'track-point', tripId, lat, lon, ts, sog, cog}` whenever a new point is recorded. Frontend uses this to extend the current-trip line in real time without re-fetching. Reuse the broadcast pattern already used by `subscribe-vessel` / `subscribe-gps`.

---

## Frontend

### State persistence (localStorage)

| Key | Purpose | Default |
|-----|---------|---------|
| `chartview_track_visible` | Master display toggle. | `false` |
| `chartview_track_mode` | `"current"` \| `"date"` \| `"trip"` | `"current"` |
| `chartview_track_date_from` | epoch ms (date filter start of day) | midnight today |
| `chartview_track_date_to` | epoch ms (date filter end of day) | end of today |
| `chartview_track_selected_trips` | array of trip IDs (when mode = `"trip"`) | `[]` |
| `chartview_track_color_mode` | `"solid"` \| `"speed"` | `"solid"` |

The existing `LayersPanel` already has a `trail` entry — wire it through `chartview_track_visible` so both controls (the top-bar Tracks button *and* the layers toggle) flip the same flag.

### New components

#### `src/components/chart/TracksButton.jsx`
A top-bar button that follows the same pattern as the existing waypoints / layers buttons (84×84, radius 18, `var(--fill-1)` when open). Icon: `route` or `path` from the existing `Icon` registry — fall back to a custom inline SVG (simple polyline) if none fits. Opens `<TracksPanel/>`.

#### `src/components/chart/TracksPanel.jsx`
A `Glass`-styled dropdown matching `LayersPanel`'s vibe. Sections:

```
┌─ Tracks ─────────────────────────────┐
│ Show on chart            [ Toggle ]  │  ← chartview_track_visible
│ ─────────────────────────────────── │
│ View                                 │
│  ( ) Current trip only               │  ← mode = 'current'
│  ( ) By date                         │  ← mode = 'date'
│      [ From  2026-05-01 ▾ ]          │
│      [ To    2026-05-04 ▾ ]          │
│  ( ) Pick trips                      │  ← mode = 'trip'
│      <scrollable trip list, multi-   │
│       select, newest first>          │
│ ─────────────────────────────────── │
│ Color                                │
│  (•) Solid    ( ) By speed           │
│ ─────────────────────────────────── │
│ Recording: ● active · Trip #42       │  ← live status
│ 12.4 nm · 1h 23m · 5 m sample        │
│              [ End trip ]            │  ← POST /api/tracks/trips/end
└──────────────────────────────────────┘
```

Constraints:
- Touch-target minimum 44 px (CLAUDE.md design constraints).
- Theme via CSS custom properties — no hard-coded colors. Match the look of `LayersPanel`, `WaypointDropdown`, and `S57SubLayerMenu`.
- Date pickers: prefer a native `<input type="date">` styled to match — it's touch-friendly on Chromium and avoids a calendar dependency.

#### `src/hooks/useTracks.js`
Encapsulates: fetch trips list (with date filter), fetch points for the visible set, manage current-trip WebSocket subscription, return GeoJSON ready to feed MapLibre.

```js
const {
  trips,            // list for the panel's trip selector
  visibleGeoJSON,   // FeatureCollection for the line layer
  currentTrip,      // {id, startedAt, distanceM, pointCount} or null
  recording,        // boolean
  endCurrentTrip,   // () => Promise
  refreshTrips,     // () => void
} = useTracks({ visible, mode, dateFrom, dateTo, selectedTripIds })
```

Internally:
- When `visible === false`: do nothing (no fetches, no WS subscription). This is the "default to off" gate — turning the layer off should also stop hammering the API.
- When `mode === 'current'`: subscribe to `subscribe-track`, append incoming points to the in-memory line.
- When `mode === 'date'` or `'trip'`: GET `/trips` with the date range, then GET each `/trips/:id/points` (parallel, capped concurrency of 4). Cache results keyed by `tripId + simplifyTolerance` to avoid refetching when the user pans.

### MapLibre layer

In `ChartView.jsx`, add alongside the other layers (BlueTopo, ENC, weather):

```js
map.current.addSource('tracks', { type: 'geojson', data: emptyFC })
map.current.addLayer({
  id: 'tracks-line',
  type: 'line',
  source: 'tracks',
  layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': 'var(--accent)' || '#ff8a3d',  // resolved at runtime; see note
    'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 4],
    'line-opacity': 0.85,
  },
})
map.current.addLayer({
  id: 'tracks-line-current',
  type: 'line',
  source: 'tracks-current',
  layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': '#ff8a3d',     // brighter to distinguish from history
    'line-width': 4,
    'line-opacity': 0.95,
  },
})
```

Two sources because the current trip updates per WebSocket frame and we don't want to re-marshal all of history on every tick.

When the master toggle flips:
```js
const vis = visible ? 'visible' : 'none'
map.current.setLayoutProperty('tracks-line', 'visibility', vis)
map.current.setLayoutProperty('tracks-line-current', 'visibility', vis)
```

**Note on theming**: MapLibre `paint` doesn't read CSS custom properties at runtime. Resolve `--accent` from `getComputedStyle(document.documentElement)` once on theme change and call `map.setPaintProperty('tracks-line', 'line-color', resolvedColor)`. Hook into the existing theme cycle.

### Color-by-speed (optional polish)

Use a data-driven style on each segment's `sog`:

```js
'line-color': [
  'interpolate', ['linear'], ['get', 'sog'],
  0,   '#3aa0ff',   // moored / slow → cool
  2.5, '#34c759',   // moderate
  5,   '#ffcc00',   // fast cruise
  10,  '#ff3b30',   // sprint
]
```

For history mode this requires the API to return one Feature per segment, which is heavier — gate it behind `colorMode === 'speed'` and fetch only when active.

### Performance: decimation

Long history (months of trips) at 1 Hz is too dense for MapLibre at low zoom. Two-pronged:
- **Server-side**: `simplify` query param applies a Douglas–Peucker pass before serializing. Default tolerance is a function of bounding-box span: ~10 m at high zoom, ~100 m at low zoom. Use `@turf/simplify` (already in node_modules if not, accept the dep — `turf` is small).
- **Client-side**: When the user pans/zooms, the frontend re-requests with a different tolerance only if zoom delta > 2 levels. Otherwise reuse cached features.

For "current trip" mode no simplification is applied — the line is short and we want every wiggle.

---

## Wiring into existing code

### `ChartTopBar.jsx`
Add `TracksButton` between the layers toggle and the S-57 filter (so it's near the other view-controls). Pass it the same `closeAll` family so opening it dismisses other dropdowns:

```jsx
<div style={{ position: 'relative' }}>
  <button onClick={() => { const v = !tracksOpen; closeAll(); setTracksOpen(v) }} style={{...}}>
    <Icon name="route" size={42}/>
  </button>
  <TracksPanel open={tracksOpen} {...trackProps}/>
</div>
```

Track props are lifted to `ChartView` so the GeoJSON producer (`useTracks`) and the layer code share state.

### `LayersPanel.jsx`
The `trail` entry already exists (line 10). Wire its `onChange` to flip `chartview_track_visible` so the master toggle has two equivalent surfaces.

### `ChartView.jsx`
- Add `chartview_track_visible` to the `layers` localStorage block (around lines 136-165 per the research report).
- Instantiate `useTracks` and add the two map sources/layers in the `map.on('load')` block where ENC/BlueTopo are registered.
- React to track-mode changes by calling `setData` on the `tracks` source.

### `api-server/server.js`
- Import and register `trackRoutes`.
- Initialize `trackDatabaseService` (or extend `databaseService` to manage two DBs) before starting the recorder.
- Start `trackRecorderService.start()` after GPS arbiter is healthy.
- Wire `subscribe-track` into the existing WebSocket multiplexer.

---

## Edge cases & risks

1. **GPS goes stale mid-trip** (boat passes under a bridge, etc.) → `TRIP_END_GAP_MS = 60 s` is generous enough that a typical bridge transit doesn't end the trip. Tune empirically.
2. **Source flips** (WitMotion drops out, N2K takes over) → the trip continues; the per-point `source` field captures the change for diagnostics.
3. **Time travel** (RTC drift, NTP correction mid-trip) → `ts` could go backwards. The recorder must guard against `ts < lastTs` and either skip or clamp; never fail. Log + skip is fine.
4. **Crash mid-trip** → DB has trip with `ended_at = NULL` and partial points. On boot, close it using `MAX(ts)` from its points and start a fresh one when GPS comes online.
5. **Privacy** → no plan to upload tracks anywhere, but document this in the panel ("Tracks are stored only on this device") so we don't surprise the user later.
6. **WebSocket reconnect** → if the frontend is in `current` mode and the WS drops, on reconnect re-fetch `/api/tracks/current/points` once, then resume incremental tail.
7. **Layer ordering** → the track line should sit *under* waypoint markers and the boat icon, *above* ENC/BlueTopo/weather. Verify in `addLayer` order or use `beforeId`.
8. **Theme switch while panel is open** → `--accent` resolution must re-run. Hook into the same theme-change side effect that the compass rose / metrics chips already use.
9. **Cold disk** → first write to `tracks.db` shouldn't block server startup. Initialize the DB asynchronously and have the recorder retry until it's open.
10. **Touch ergonomics on date picker** → native `<input type="date">` uses Chromium's overlay; verify on the kiosk. If it's tiny, swap for a custom 44-px-min picker before shipping.

---

## Implementation steps (suggested order)

Each step is independently verifiable on the kiosk via `./scripts/deploy.sh` per `CLAUDE.local.md`. Recommend committing per step.

1. **DB scaffolding** — add `trackDatabaseService.js`, create tables, verify with `sqlite3 data/tracks.db ".schema"`.
2. **Recorder skeleton** — service that subscribes to GPS arbiter at 1 Hz and logs (no DB writes yet). Confirm fixes are flowing.
3. **Persistence** — wire inserts, trip open/close, distance gate, time-travel guard. Drive a 5-minute walk around the boat and check `track_points` / `trips` rows.
4. **HTTP API** — `/trips`, `/trips/:id/points`, `/current`, `/current/points`. Hit with `curl` on the kiosk.
5. **WebSocket push** — `subscribe-track`. Verify with `wscat`.
6. **Map layers** — add the two sources/layers in ChartView, hard-code visible=true and watch a recorded trip render after deploy.
7. **Master toggle** — wire `chartview_track_visible` to LayersPanel `trail` entry; confirm default-off behaviour.
8. **TracksPanel + button** — wire mode/date filter/trip selector. Test current-trip mode with the WebSocket tail.
9. **Color-by-speed (optional)** — gate on `colorMode === 'speed'`, switch to FeatureCollection-of-segments.
10. **Decimation** — add `simplify` server-side; tune tolerances against a real history.
11. **End-trip button + status block** — in TracksPanel.
12. **Verification** — full kiosk run: record a trip, switch panels, switch themes, restart the service, confirm trip closes cleanly.

---

## Out-of-scope follow-ups (capture but defer)

- GPX/KML export (single-trip and bulk).
- Track labelling and notes (rename, color override per trip).
- Retention policy + a settings UI for it.
- Sharing / sync.
- Replay mode (scrub a slider to animate the boat icon along a past trip).
- Per-trip statistics page (max speed, avg speed, total distance, fuel-correlated efficiency).

---

## Open questions for the user before coding

1. **Sample rate**: 1 Hz with a 5 m / 30 s gate sound right? Or do you want denser (e.g., 5 Hz to match WitMotion native)?
2. **Trip-ending gap**: 60 s of no movement closes a trip. Too short for anchoring? Should anchoring count as part of the trip?
3. **Default view mode** when the user first opens the panel: "current trip only" or "by date — today"? I've defaulted to "current," but "today" might match how you think about the day's run.
4. **Color mode default**: solid vs. by-speed. Solid is easier to read at a glance; by-speed is more informative on long zoomed-out views.
5. **Trip naming**: auto-name (`May 4, 2026 — 14:23`) or leave blank until the user labels?
