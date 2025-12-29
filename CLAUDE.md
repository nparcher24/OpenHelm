# OpenHelm - Marine Navigation Application

## Project Overview

OpenHelm is a high-performance touchscreen marine navigation application designed for Raspberry Pi 5. It provides offline map display capabilities with smooth interaction and fast rendering for marine environments.

## Key Features

- **Multi-format Map Support**: Nautical charts, NOAA BlueTopo, Sea Temperature imagery, and land maps
- **Tile-based Architecture**: Optimized tile serving with Martin Tileserver
- **GPS/AHRS Integration**: Plugin receiver interface for position and heading data  
- **Offline Operation**: All maps and data available without internet connectivity
- **Touch-optimized UI**: Responsive interface designed for marine touchscreen use
- **Auto-dismiss Welcome Screen**: 3-second branded splash screen with Parritec logo
- **Sunlight-readable Interface**: High contrast modes for direct sunlight operation

## Technical Stack

### Core Technologies
- **Frontend**: React with TailwindCSS for responsive UI
- **Maps**: Leaflet with MapLibre GL JS for high-performance rendering
- **Tile Server**: Martin Tileserver (optimized configuration)
- **Runtime**: Chromium frameless browser
- **Platform**: Raspberry Pi 5 with auto-start on boot
- **Icons**: Heroicons (open source SVG icon library)

### UI/UX Design Decisions
- **Theme System**: Automatic light/dark mode based on browser preference
- **Sunlight Readability**: Enhanced contrast and font rendering for marine conditions
- **Touch Optimization**: Minimum 44px touch targets, disabled text selection
- **Marine Color Palette**: Custom blue tones optimized for nautical environments
- **Navigation**: Top navbar with Chart, Topo, GPS, and Settings sections

### Performance Priorities
- Smooth map panning and zooming
- Fast tile loading and caching
- Optimized memory usage for Pi hardware
- Minimal UI latency for touch interactions
- Efficient data structures for map overlays

## Map Data Sources
- **Nautical Charts**: Standard marine navigation charts
- **NOAA BlueTopo**: Topographical data in native format
- **Sea Temperature**: NOAA thermal imagery tiles
- **Land Maps**: Terrestrial navigation backup

## Hardware Requirements
- Raspberry Pi 5
- GPS/AHRS plugin receiver
- Marine-grade touchscreen display
- High-speed SD card for map data storage

## Development Guidelines
- Performance-first approach to all implementations
- Minimize bundle size and memory footprint  
- Optimize for touch interaction patterns
- Ensure reliable offline operation
- Follow marine UI/UX best practices
- Support both light and dark themes for varying lighting conditions

## Application Logging

The application uses a custom logging system that writes to `openhelm.log` in the project root. This log captures frontend application events, API calls, and debugging information.

**Viewing logs in real-time:**
```bash
tail -f openhelm.log
```

**Important:** After reading the log file, clear it to ensure future logs start with a clean file:
```bash
> openhelm.log  # Clear the log file
```

This keeps the log focused on current session activity and prevents the file from growing too large during development.

## MapLibre GL Interaction Patterns

**Lasso Selection Implementation:**
- Disable ALL map interactions in lasso mode: `dragPan`, `scrollZoom`, `boxZoom`, `doubleClickZoom`, `touchZoomRotate`, `dragRotate`, `keyboard`, `touchPitch`
- Add `e.stopPropagation()` to lasso event handlers to prevent map event bubbling
- Use feature states for visual selection: `map.setFeatureState({source, id}, {selected: true})`
- Point-in-polygon: Ray casting algorithm tests tile centers against drawn polygon
- Prevent unwanted auto-zoom: Use flag (e.g., `hasInitiallyFit`) to ensure `fitBounds()` only runs once on initial load

**Tile Management:**
- BlueTopo tiles: Stored as PNG directory tiles in `/tiles/bluetopo/{tile_id}/z/x/y.png`
- Metadata: GeoPackage at project root contains official NOAA tile scheme data
- Martin auto-discovers tiles from `/tiles/` directory, no database needed
- Downloaded tiles endpoint: Combines filesystem scan with GeoPackage query via `ogrinfo`

**Job Progress Pattern:**
- `useJobProgress` hook handles WebSocket + HTTP polling fallback
- Backend: Store job state in `global.activeJobs`, broadcast via `global.broadcastProgress()`
- Frontend: Single source of truth for download/conversion progress tracking

## Backend API Server

OpenHelm includes a local Express.js API server (port 3002) that handles external data fetching to avoid CORS issues and provide caching. The API server runs alongside the frontend and tile server.

**Architecture:**
```
Frontend (3000) → API Server (3002) → External APIs (NOAA, etc.)
```

**Current Endpoints:**
- `GET /api/enc/catalogue` - Fetch ENC catalogue from NOAA with 30min caching
- `GET /api/enc/cache/status` - View cache status and memory usage  
- `DELETE /api/enc/cache` - Clear the API cache

**Adding New Backend Functionality:**
1. Create route file in `api-server/routes/` (e.g., `weather.js`)
2. Create service file in `api-server/services/` (e.g., `weatherService.js`) 
3. Add route to `api-server/server.js`: `app.use('/api/weather', weatherRoutes)`
4. Update frontend service to use `http://localhost:3002/api/weather/...`

**Logs:** `tail -f api.log` to view API server logs

## Chrome DevTools MCP for UI Testing

OpenHelm development leverages Chrome DevTools MCP (Model Context Protocol) for automated browser testing, UI validation, and performance analysis. This provides AI-assisted debugging with full browser inspection capabilities.

### Opening OpenHelm in Chrome MCP

**Always open in fullscreen for accurate marine display testing:**
```javascript
// Create new page and resize to fullscreen
await mcp__chrome-devtools__new_page({ url: "http://localhost:3000", timeout: 10000 });
await mcp__chrome-devtools__resize_page({ width: 1920, height: 1080 });
```

**Standard workflow:**
1. Open page: `new_page({ url: "http://localhost:3000" })`
2. Set fullscreen: `resize_page({ width: 1920, height: 1080 })`
3. Take snapshot: `take_snapshot()` for DOM/accessibility tree
4. Take screenshot: `take_screenshot()` for visual confirmation

### Best Practices

**Snapshot vs Screenshot:**
- **Use `take_snapshot()`** for: DOM inspection, element identification (uid), accessibility testing, finding interactive elements
- **Use `take_screenshot()`** for: Visual regression testing, UI layout verification, documentation, presenting results to users

**Page Interaction Patterns:**
```javascript
// Navigation testing
await click({ uid: "1_3" });  // Click Topo button
await wait_for({ text: "BlueTopo", timeout: 5000 });

// Form interaction
await fill({ uid: "input_uid", value: "test value" });
await fill_form({ elements: [{uid: "1_2", value: "test"}] });

// Map interaction testing
await hover({ uid: "map_element" });
await drag({ from_uid: "1_5", to_uid: "1_10" });
```

**Performance Testing:**
```javascript
// Start performance trace with page reload
await performance_start_trace({ reload: true, autoStop: false });
// Interact with application...
await performance_stop_trace();
// Analyze specific insights
await performance_analyze_insight({ 
  insightSetId: "set_id", 
  insightName: "LCPBreakdown" 
});
```

**Network and Console Debugging:**
```javascript
// Monitor network requests
await list_network_requests({ 
  resourceTypes: ["fetch", "xhr"],
  pageSize: 50 
});
await get_network_request({ reqid: 123 });

// Check console for errors
await list_console_messages({ 
  types: ["error", "warn"],
  includePreservedMessages: false 
});
```

**Emulation for Marine Testing:**
```javascript
// Test offline scenarios
await emulate({ 
  networkConditions: "Offline",
  cpuThrottling: 4  // Simulate slower hardware
});

// Test GPS location features
await emulate({
  geolocation: { latitude: 36.8508, longitude: -75.9776 }  // Virginia Beach
});
```

### OpenHelm-Specific Testing Scenarios

**Touch Interface Validation:**
- Verify 44px minimum touch targets with `take_snapshot()` and element inspection
- Test touch gestures on map (pan, zoom, rotate)
- Validate button tap responsiveness across all pages

**Map Performance:**
- Record traces during map pan/zoom operations
- Monitor tile loading network requests
- Check Core Web Vitals (LCP, FID, CLS) for map rendering

**Theme Testing:**
- Test light/dark mode switching
- Verify sunlight-readable contrast ratios
- Screenshot comparison across themes

**Navigation Flow:**
- Automate testing of Chart → Topo → GPS → Settings navigation
- Verify data persistence across page changes
- Test back button and deep linking

### Security Considerations

Chrome DevTools MCP exposes full browser content to AI assistants. For OpenHelm development:
- Use isolated mode for sensitive testing: `--isolated` flag creates temporary profile
- Default user data directory is separate from personal Chrome profile
- Avoid testing with real GPS coordinates or personal marine data
- Clear browser data between sensitive test sessions

### References

- [Chrome DevTools MCP GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Official Chrome for Developers Blog](https://developer.chrome.com/blog/chrome-devtools-mcp)
- [Chrome DevTools MCP Complete Guide 2025](https://vladimirsiedykh.com/blog/chrome-devtools-mcp-ai-browser-debugging-complete-guide-2025)
- [Chrome DevTools MCP Tutorial](https://www.datacamp.com/tutorial/chrome-devtools-mcp)