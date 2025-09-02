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