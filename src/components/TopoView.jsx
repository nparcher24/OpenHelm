import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getDownloadedTileMetadata, getTileUrl, getDepthAtLocation } from '../services/blueTopoTileService'
import { SettingsIcon, BoatIcon } from './Icons'
import DepthCrosshairs from './DepthCrosshairs'
import DepthInfoCard from './DepthInfoCard'

function TopoView() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [tilesLoaded, setTilesLoaded] = useState(false)
  const [tileCount, setTileCount] = useState(0)
  const [error, setError] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Depth measurement state
  const [touchState, setTouchState] = useState(null)
  const [activeMeasurement, setActiveMeasurement] = useState(null)
  const [loadingDepth, setLoadingDepth] = useState(false)
  const holdTimerRef = useRef(null)
  const touchStateRef = useRef(null)
  const activeMeasurementRef = useRef(null)
  const HOLD_DURATION = 300

  // Live depth/position display during crosshairs hold
  const [liveDepthData, setLiveDepthData] = useState(null)

  // Two-finger pan state
  const twoFingerPanRef = useRef(null)

  // GPS tracking state
  // trackingMode: null = not tracking, 'center' = boat centered, 'offset' = boat 1/3 from bottom
  const [trackingMode, setTrackingMode] = useState(null)
  const [northUp, setNorthUp] = useState(false)  // true = north up, false = heading up
  const [gpsData, setGpsData] = useState(null)
  const gpsIntervalRef = useRef(null)
  const boatMarkerRef = useRef(null)
  const trackingModeRef = useRef(null)

  // Keep refs in sync with state
  useEffect(() => {
    touchStateRef.current = touchState
  }, [touchState])

  useEffect(() => {
    activeMeasurementRef.current = activeMeasurement
  }, [activeMeasurement])

  useEffect(() => {
    trackingModeRef.current = trackingMode
  }, [trackingMode])

  // Query live depth when crosshairs appear
  useEffect(() => {
    if (!map.current || !touchState?.showingCrosshairs) {
      setLiveDepthData(null)
      return
    }

    // Debounce the depth query to avoid too many calls
    const timeoutId = setTimeout(async () => {
      const adjustedY = Math.max(touchState.currentY - 100, 50)
      const point = map.current.unproject([touchState.currentX, adjustedY])

      try {
        const result = await getDepthAtLocation(point.lng, point.lat)
        setLiveDepthData({
          lat: point.lat,
          lon: point.lng,
          depth: result.success ? result.depth : null
        })
      } catch (error) {
        setLiveDepthData({
          lat: point.lat,
          lon: point.lng,
          depth: null
        })
      }
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [touchState?.showingCrosshairs, touchState?.currentX, touchState?.currentY])

  // GPS polling - always active to show boat position
  useEffect(() => {
    const fetchGps = async () => {
      try {
        const res = await fetch('http://localhost:3002/api/gps')
        const data = await res.json()
        if (data.latitude && data.longitude) {
          setGpsData(data)
        }
      } catch (err) {
        // Silently fail - GPS may not be available
      }
    }
    fetchGps()
    gpsIntervalRef.current = setInterval(fetchGps, 500)
    return () => clearInterval(gpsIntervalRef.current)
  }, [])

  // Boat marker - always visible at GPS position
  useEffect(() => {
    if (!mapLoaded || !gpsData || !map.current) return

    // Create or update marker
    if (!boatMarkerRef.current) {
      // Create custom marker element
      const el = document.createElement('div')
      el.className = 'boat-marker'
      el.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3 L7 9 L7 17 L9 21 L15 21 L17 17 L17 9 Z" />
          <path stroke="#0a3d1f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M9 11 L15 11" />
          <path stroke="#0a3d1f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M10 6 L12 4 L14 6" />
        </svg>
      `
      el.style.cssText = 'filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.6));'

      boatMarkerRef.current = new maplibregl.Marker({
        element: el,
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      })
        .setLngLat([gpsData.longitude, gpsData.latitude])
        .addTo(map.current)
    } else {
      boatMarkerRef.current.setLngLat([gpsData.longitude, gpsData.latitude])
    }

    // Rotate marker to heading
    if (gpsData.heading !== undefined) {
      boatMarkerRef.current.setRotation(gpsData.heading)
    }
  }, [mapLoaded, gpsData])

  // Tracking mode - follow boat position with map rotation
  useEffect(() => {
    if (!trackingMode || !gpsData || !map.current) return

    const mapHeight = map.current.getContainer().clientHeight
    const bearing = northUp ? 0 : (gpsData.heading || 0)

    if (trackingMode === 'center') {
      // Mode 1: Boat centered in middle of screen
      map.current.easeTo({
        center: [gpsData.longitude, gpsData.latitude],
        bearing: bearing,
        padding: { bottom: 0, top: 0, left: 0, right: 0 },
        duration: 300
      })
    } else if (trackingMode === 'offset') {
      // Mode 2: Boat 1/3 from bottom, centered laterally
      // To place center at 2/3 from top, we need top padding of 1/3 height
      map.current.easeTo({
        center: [gpsData.longitude, gpsData.latitude],
        bearing: bearing,
        padding: { top: mapHeight / 3, bottom: 0, left: 0, right: 0 },
        duration: 300
      })
    }
  }, [trackingMode, gpsData, northUp])

  // Decouple from tracking on user pan
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const handleMoveStart = (e) => {
      // Only decouple if user-initiated (has originalEvent)
      if (e.originalEvent && trackingModeRef.current) {
        setTrackingMode(null)
      }
    }

    map.current.on('movestart', handleMoveStart)
    return () => {
      if (map.current) {
        map.current.off('movestart', handleMoveStart)
      }
    }
  }, [mapLoaded])

  // Virginia Beach coordinates (same as ChartView)
  const center = [-75.978, 36.853]
  const zoom = 10

  useEffect(() => {
    if (map.current) return // Initialize map only once

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: '/styles/cusp-base-style.json',
      center: center,
      zoom: zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    })

    // Disable single-finger pan, but keep two-finger zoom/rotate enabled
    // We'll manually implement two-finger panning in our touch handlers
    map.current.dragPan.disable()
    map.current.touchZoomRotate.enable()

    map.current.on('load', async () => {
      setMapLoaded(true)

      // Load BlueTopo tiles after map loads
      await loadBlueTopoTiles()
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Load BlueTopo tile sources
  const loadBlueTopoTiles = async () => {
    try {
      const result = await getDownloadedTileMetadata()

      if (!result.success || !result.tiles || result.tiles.length === 0) {
        setTilesLoaded(true)
        setTileCount(0)
        return
      }

      const tiles = result.tiles
      setTileCount(tiles.length)

      // Add each tile as a separate raster source and layer
      for (const tile of tiles) {
        const sourceId = `bluetopo-${tile.tileId}`
        const layerId = `bluetopo-layer-${tile.tileId}`

        // Add raster source for this tile
        map.current.addSource(sourceId, {
          type: 'raster',
          tiles: [getTileUrl(tile.tileId)],
          tileSize: 256,
          bounds: tile.bounds,
          minzoom: tile.minZoom,
          maxzoom: tile.maxZoom,
          scheme: 'tms' // TMS has inverted Y coordinates
        })

        // Add raster layer
        map.current.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': 0.85,
            'raster-fade-duration': 0
          }
        })
      }

      setTilesLoaded(true)
    } catch (err) {
      console.error('Error loading BlueTopo tiles:', err)
      setError(err.message)
      setTilesLoaded(true)
    }
  }

  // Touch event handlers for depth measurement
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const canvas = map.current.getCanvasContainer()

    const handleTouchStart = (e) => {
      // Handle two-finger pan initialization
      if (e.touches.length === 2) {
        cancelHold()
        const rect = canvas.getBoundingClientRect()
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const midX = (touch1.clientX + touch2.clientX) / 2 - rect.left
        const midY = (touch1.clientY + touch2.clientY) / 2 - rect.top

        twoFingerPanRef.current = { x: midX, y: midY }
        return
      }

      // Single-finger touch for crosshairs
      if (e.touches.length !== 1) {
        cancelHold()
        return
      }

      // Prevent MapLibre's dragPan from activating on single-finger touches
      e.preventDefault()
      e.stopPropagation()

      // Don't dismiss existing measurement - allow user to take a new measurement
      // The old measurement will be replaced when the new one completes

      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      setTouchState({
        startTime: Date.now(),
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        showingCrosshairs: false
      })

      holdTimerRef.current = setTimeout(() => {
        setTouchState(prev => prev ? { ...prev, showingCrosshairs: true } : null)
      }, HOLD_DURATION)
    }

    const handleTouchMove = (e) => {
      // Handle two-finger pan
      if (e.touches.length === 2 && twoFingerPanRef.current) {
        const rect = canvas.getBoundingClientRect()
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const midX = (touch1.clientX + touch2.clientX) / 2 - rect.left
        const midY = (touch1.clientY + touch2.clientY) / 2 - rect.top

        const deltaX = midX - twoFingerPanRef.current.x
        const deltaY = midY - twoFingerPanRef.current.y

        // Pan the map by the delta
        map.current.panBy([-deltaX, -deltaY], { animate: false })

        twoFingerPanRef.current = { x: midX, y: midY }
        return
      }

      // Single-finger crosshairs movement
      if (!touchStateRef.current || e.touches.length !== 1) {
        cancelHold()
        return
      }

      // Prevent MapLibre's dragPan from activating on single-finger touches
      e.preventDefault()
      e.stopPropagation()

      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      // Update position - crosshairs will follow the finger
      setTouchState(prev => prev ? { ...prev, currentX: x, currentY: y } : null)
    }

    const handleTouchEnd = (e) => {
      // Clear two-finger pan state when fingers are lifted
      if (e.touches.length < 2) {
        twoFingerPanRef.current = null
      }

      const currentTouchState = touchStateRef.current

      // Only prevent default/stop propagation if we have an active single-finger touch
      if (currentTouchState) {
        e.preventDefault()
        e.stopPropagation()

        const holdTime = Date.now() - currentTouchState.startTime

        // If crosshairs were showing, perform measurement
        if (holdTime >= HOLD_DURATION && currentTouchState.showingCrosshairs) {
          performDepthMeasurement(currentTouchState.currentX, currentTouchState.currentY)
        }

        cancelHold()
        setTouchState(null)
      }
    }

    const handleTouchCancel = (e) => {
      // Clear two-finger pan state
      twoFingerPanRef.current = null

      // Only prevent default/stop propagation if we have an active single-finger touch
      if (touchStateRef.current) {
        e.preventDefault()
        e.stopPropagation()
        cancelHold()
        setTouchState(null)
      }
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false })

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('touchcancel', handleTouchCancel)
      cancelHold()
    }
  }, [mapLoaded])

  // Prevent context menu on long press
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const canvas = map.current.getCanvasContainer()
    const mapElement = map.current.getContainer()

    const preventContextMenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Prevent context menu on both the canvas and the container
    canvas.addEventListener('contextmenu', preventContextMenu)
    mapElement.addEventListener('contextmenu', preventContextMenu)

    return () => {
      canvas.removeEventListener('contextmenu', preventContextMenu)
      mapElement.removeEventListener('contextmenu', preventContextMenu)
    }
  }, [mapLoaded])

  // Helper functions
  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const performDepthMeasurement = async (x, y) => {
    // Calculate the adjusted Y position (where the large crosshairs were)
    const adjustedY = Math.max(y - 100, 50)

    // Get the map coordinates at the crosshair position (not finger position)
    const point = map.current.unproject([x, adjustedY])
    setLoadingDepth(true)

    try {
      const result = await getDepthAtLocation(point.lng, point.lat)
      setActiveMeasurement({
        lat: point.lat,
        lon: point.lng,
        depth: result.depth,
        uncertainty: result.uncertainty,
        tileId: result.tileId,
        error: result.success ? null : result.message,
        screenX: x,
        screenY: adjustedY  // Use adjusted position, not finger position
      })
    } catch (error) {
      setActiveMeasurement({
        lat: point.lat,
        lon: point.lng,
        error: error.message,
        screenX: x,
        screenY: adjustedY  // Use adjusted position, not finger position
      })
    } finally {
      setLoadingDepth(false)
    }
  }

  const clearMeasurement = () => {
    setActiveMeasurement(null)
  }

  // Clear browser cache and reload
  const clearCacheAndReload = async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
        console.log('Cache cleared successfully')
      }
      // Force reload from server (bypass cache)
      window.location.reload(true)
    } catch (err) {
      console.error('Error clearing cache:', err)
      // Reload anyway
      window.location.reload(true)
    }
  }

  return (
    <div className="relative h-full w-full bg-terminal-bg">
      {/* Map Container */}
      <div
        ref={mapContainer}
        className="h-full w-full"
        style={{
          position: 'relative',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none'
        }}
      />

      {/* Crosshairs during hold */}
      {touchState?.showingCrosshairs && (
        <DepthCrosshairs
          showing={true}
          x={touchState.currentX}
          y={touchState.currentY}
          holdComplete={false}
          lat={liveDepthData?.lat}
          lon={liveDepthData?.lon}
          depth={liveDepthData?.depth}
        />
      )}

      {/* Crosshairs and info card after measurement */}
      {activeMeasurement && (
        <>
          <DepthCrosshairs
            showing={true}
            x={activeMeasurement.screenX}
            y={activeMeasurement.screenY}
            holdComplete={true}
          />
          <DepthInfoCard
            measurement={activeMeasurement}
            loading={loadingDepth}
            onClose={clearMeasurement}
          />
        </>
      )}

      {/* Loading Indicator */}
      {(!mapLoaded || !tilesLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-terminal-green border-t-transparent rounded-full animate-spin mx-auto shadow-glow-green"></div>
            <p className="text-terminal-green-dim">
              {!mapLoaded ? 'Loading map...' : 'Loading BlueTopo tiles...'}
            </p>
          </div>
        </div>
      )}

      {/* Map Info Overlay */}
      <div className="absolute top-4 left-4 bg-terminal-surface rounded-lg shadow-glow-green-sm p-3 max-w-xs z-20 border border-terminal-border">
        <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide text-sm">BlueTopo Bathymetry</h3>
        <div className="text-sm space-y-1 text-terminal-green-dim font-mono">
          <div><span className="text-terminal-green">Source:</span> NOAA BlueTopo</div>
          <div><span className="text-terminal-green">Coverage:</span> {tileCount} tiles loaded</div>
          <div><span className="text-terminal-green">Resolution:</span> 2m - 16m</div>
          {error && (
            <div className="text-terminal-red text-xs mt-2">{error}</div>
          )}
          <div className={`inline-flex items-center px-2 py-1 rounded text-xs mt-2 ${
            tilesLoaded && tileCount > 0
              ? 'bg-terminal-green/10 text-terminal-green border border-terminal-green/30'
              : tilesLoaded && tileCount === 0
              ? 'bg-terminal-amber/10 text-terminal-amber border border-terminal-amber/30'
              : 'bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/30'
          }`}>
            {!tilesLoaded ? '[..] Loading...' : tileCount > 0 ? '[OK] Data Loaded' : '[!] No Tiles'}
          </div>
        </div>
      </div>

      {/* Touch-friendly zoom controls for marine use */}
      <div className="absolute bottom-4 right-4 flex flex-col space-y-2 z-20">
        <button
          onClick={() => map.current?.zoomIn()}
          className="bg-terminal-surface hover:bg-terminal-green/10 border border-terminal-border hover:border-terminal-green rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all"
          aria-label="Zoom in"
        >
          <svg className="w-6 h-6 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
        <button
          onClick={() => map.current?.zoomOut()}
          className="bg-terminal-surface hover:bg-terminal-green/10 border border-terminal-border hover:border-terminal-green rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all"
          aria-label="Zoom out"
        >
          <svg className="w-6 h-6 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
          </svg>
        </button>
      </div>

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
        {/* North Up Toggle Button */}
        <button
          onClick={() => setNorthUp(!northUp)}
          className={`bg-terminal-surface hover:bg-terminal-green/10 border rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all ${
            northUp
              ? 'border-terminal-green bg-terminal-green/20'
              : 'border-terminal-border hover:border-terminal-green'
          }`}
          aria-label={northUp ? "North up (tap for heading up)" : "Heading up (tap for north up)"}
          title={northUp ? "North up - tap for heading up" : "Heading up - tap for north up"}
        >
          <svg className="w-6 h-6 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {/* Compass N arrow */}
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={northUp ? 2 : 1.5}
              fill={northUp ? "currentColor" : "none"}
              d="M12 3 L8 12 L12 9 L16 12 Z"
            />
            {/* N letter */}
            <text
              x="12"
              y="20"
              textAnchor="middle"
              fontSize="7"
              fontWeight="bold"
              fill="currentColor"
              stroke="none"
            >N</text>
          </svg>
        </button>

        {/* Center on Boat Button - cycles: off → center → offset → off */}
        <button
          onClick={() => {
            if (!trackingMode) {
              setTrackingMode('center')  // First press: center on screen
            } else if (trackingMode === 'center') {
              setTrackingMode('offset')  // Second press: 1/3 from bottom
            } else {
              setTrackingMode(null)      // Third press: decouple
            }
          }}
          className={`bg-terminal-surface hover:bg-terminal-green/10 border rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all ${
            trackingMode
              ? 'border-terminal-green bg-terminal-green/20'
              : 'border-terminal-border hover:border-terminal-green'
          }`}
          aria-label={
            !trackingMode ? "Center on boat" :
            trackingMode === 'center' ? "Following (centered)" :
            "Following (offset)"
          }
          title={
            !trackingMode ? "Center on boat" :
            trackingMode === 'center' ? "Centered - tap for offset" :
            "Offset - tap to decouple"
          }
        >
          {/* Unfilled icon when not tracking, filled when tracking */}
          {trackingMode ? (
            <svg className="w-6 h-6 text-terminal-green" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 3 L7 9 L7 17 L9 21 L15 21 L17 17 L17 9 Z" />
              <path stroke="#0a3d1f" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 11 L15 11" />
              <path stroke="#0a3d1f" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6 L12 4 L14 6" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3 L7 9 L7 17 L9 21 L15 21 L17 17 L17 9 Z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 11 L15 11" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6 L12 4 L14 6" />
            </svg>
          )}
        </button>

        {/* Settings Menu */}
        <div className="relative">
          {/* Popup Menu */}
          {menuOpen && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMenuOpen(false)}
              />

              {/* Menu Content */}
              <div className="absolute top-14 right-0 bg-terminal-surface rounded-lg shadow-glow-green border border-terminal-border overflow-hidden z-40 min-w-[200px]">
                <button
                  onClick={clearCacheAndReload}
                  className="w-full px-4 py-3 text-left hover:bg-terminal-green/10 transition-colors flex items-center space-x-3 text-terminal-green"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-sm font-medium">Clear Cache & Reload</span>
                </button>
              </div>
            </>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="bg-terminal-surface hover:bg-terminal-green/10 border border-terminal-border hover:border-terminal-green rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all"
            aria-label="Map settings"
          >
            <SettingsIcon className="w-6 h-6 text-terminal-green" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default TopoView
