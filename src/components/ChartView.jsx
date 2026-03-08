import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getDownloadedTileMetadata, getTileUrl, getDepthAtLocation } from '../services/blueTopoTileService'
import { getDownloadedRegions as getDownloadedENCRegions } from '../services/encDownloadService'
import { getDownloadedRegions as getDownloadedS57Regions } from '../services/s57DownloadService'
import { createNauticalStyle, S57_LAYER_PREFIX } from '../styles/nauticalChartStyle'
import { getAllWaypoints, createWaypoint } from '../services/waypointService'
import { SettingsIcon, BoatIcon } from './Icons'
import DepthCrosshairs from './DepthCrosshairs'
import DepthInfoCard from './DepthInfoCard'
import WaypointMenu from './WaypointMenu'
import WaypointEditModal from './WaypointEditModal'
import WaypointDropdown from './WaypointDropdown'
import LayersMenu from './LayersMenu'
import S57SubLayerMenu, { S57_SUBLAYER_GROUPS } from './S57SubLayerMenu'
import { createMarkerSVG } from '../utils/waypointIcons'
import { MapPinIcon } from '@heroicons/react/24/outline'

function ChartView() {
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
  const HOLD_DURATION = 1000
  const MOVE_THRESHOLD = 15

  // Live depth/position display during crosshairs hold
  const [liveDepthData, setLiveDepthData] = useState(null)

  // GPS tracking state
  // trackingMode: null = not tracking, 'center' = boat centered, 'offset' = boat 1/3 from bottom
  const [trackingMode, setTrackingMode] = useState('center')  // Start tracking by default
  const [northUp, setNorthUp] = useState(false)  // true = north up, false = heading up
  const initialGpsCenterDone = useRef(false)  // Track if we've done initial GPS center
  const [gpsData, setGpsData] = useState(null)
  const boatMarkerRef = useRef(null)
  const trackingModeRef = useRef(null)
  const northUpRef = useRef(false)
  const bearingFrozenRef = useRef(false)  // True when bearing is frozen after pan decouple

  // Waypoint state
  const [waypoints, setWaypoints] = useState([])
  const [waypointMenuOpen, setWaypointMenuOpen] = useState(false)
  const [waypointMenuPosition, setWaypointMenuPosition] = useState(null)
  const [waypointDropdownOpen, setWaypointDropdownOpen] = useState(false)
  const [waypointEditModalOpen, setWaypointEditModalOpen] = useState(false)
  const [waypointEditPosition, setWaypointEditPosition] = useState(null)
  const waypointMarkersRef = useRef(new Map())

  // Layer visibility state - load from localStorage or default to true
  const [topoLayersVisible, setTopoLayersVisible] = useState(() => {
    const saved = localStorage.getItem('chartview_bluetopo_visible')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [encLayersVisible, setEncLayersVisible] = useState(() => {
    const saved = localStorage.getItem('chartview_enc_visible')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [encRegionCount, setEncRegionCount] = useState(0)
  const [s57LayersVisible, setS57LayersVisible] = useState(() => {
    const saved = localStorage.getItem('chartview_s57_visible')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [s57RegionCount, setS57RegionCount] = useState(0)
  const [s57LayersLoaded, setS57LayersLoaded] = useState(0)
  const [s57SubLayerMenuOpen, setS57SubLayerMenuOpen] = useState(false)
  const [s57SubLayerVisibility, setS57SubLayerVisibility] = useState(() => {
    try {
      const saved = localStorage.getItem('chartview_s57_sublayers')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [layersMenuOpen, setLayersMenuOpen] = useState(false)

  // Save layer visibility to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('chartview_bluetopo_visible', JSON.stringify(topoLayersVisible))
  }, [topoLayersVisible])

  useEffect(() => {
    localStorage.setItem('chartview_enc_visible', JSON.stringify(encLayersVisible))
  }, [encLayersVisible])

  useEffect(() => {
    localStorage.setItem('chartview_s57_visible', JSON.stringify(s57LayersVisible))
  }, [s57LayersVisible])

  useEffect(() => {
    localStorage.setItem('chartview_s57_sublayers', JSON.stringify(s57SubLayerVisibility))
  }, [s57SubLayerVisibility])

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

  useEffect(() => {
    northUpRef.current = northUp
  }, [northUp])

  // Query live depth when crosshairs appear
  useEffect(() => {
    if (!map.current || !touchState?.showingCrosshairs) {
      setLiveDepthData(null)
      return
    }

    const adjustedY = Math.max(touchState.currentY - 100, 50)
    const point = map.current.unproject([touchState.currentX, adjustedY])

    // Immediately update lat/lon so position tracks finger in real time
    setLiveDepthData(prev => ({
      lat: point.lat,
      lon: point.lng,
      depth: prev?.depth ?? null
    }))

    // Debounce the depth query to avoid too many API calls
    const timeoutId = setTimeout(async () => {
      try {
        const result = await getDepthAtLocation(point.lng, point.lat)
        setLiveDepthData(prev => prev ? {
          ...prev,
          depth: result.success ? result.depth : null
        } : null)
      } catch (error) {
        setLiveDepthData(prev => prev ? {
          ...prev,
          depth: null
        } : null)
      }
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [touchState?.showingCrosshairs, touchState?.currentX, touchState?.currentY])

  // Default position offshore Virginia Beach when GPS has no satellite fix
  const DEFAULT_NO_FIX_POSITION = { latitude: 36.85, longitude: -75.97 }

  // Helper to validate coordinates for MapLibre
  const isValidCoordinate = (lat, lng) => {
    return typeof lat === 'number' && typeof lng === 'number' &&
           !isNaN(lat) && !isNaN(lng) &&
           lat >= -90 && lat <= 90 &&
           lng >= -180 && lng <= 180
  }

  // Detect GPS reporting 0,0 (no satellite fix)
  const hasGpsFix = (lat, lng) => {
    return !(lat === 0 && lng === 0)
  }

  // GPS via WebSocket - always active to show boat position
  const wsRef = useRef(null)
  useEffect(() => {
    let mounted = true
    let reconnectTimeout = null

    const connect = () => {
      if (!mounted) return
      const ws = new WebSocket('ws://localhost:3002')
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) return
        ws.send(JSON.stringify({ type: 'subscribe-gps' }))
      }

      ws.onmessage = (event) => {
        if (!mounted) return
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'gps' && isValidCoordinate(message.data.latitude, message.data.longitude)) {
            setGpsData(prev => {
              if (prev?.latitude === message.data.latitude &&
                  prev?.longitude === message.data.longitude &&
                  prev?.heading === message.data.heading) {
                return prev
              }
              return message.data
            })
          }
        } catch (err) {
          // Parse error, ignore
        }
      }

      ws.onclose = () => {
        if (!mounted) return
        reconnectTimeout = setTimeout(connect, 1000)
      }

      ws.onerror = () => {
        // Error handling done in onclose
      }
    }

    // Fetch initial data via HTTP, then switch to WebSocket
    fetch('http://localhost:3002/api/gps')
      .then(res => res.json())
      .then(data => {
        if (mounted && isValidCoordinate(data.latitude, data.longitude)) {
          setGpsData(data)
        }
      })
      .catch(() => {})

    connect()

    return () => {
      mounted = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  // Initial center on GPS position when first available
  useEffect(() => {
    if (!mapLoaded || !gpsData || !map.current || initialGpsCenterDone.current) return
    if (!isValidCoordinate(gpsData.latitude, gpsData.longitude)) return

    initialGpsCenterDone.current = true

    const fix = hasGpsFix(gpsData.latitude, gpsData.longitude)
    const centerLat = fix ? gpsData.latitude : DEFAULT_NO_FIX_POSITION.latitude
    const centerLng = fix ? gpsData.longitude : DEFAULT_NO_FIX_POSITION.longitude

    // Fly to GPS position at default zoom with heading-up bearing
    map.current.flyTo({
      center: [centerLng, centerLat],
      zoom: defaultZoom,
      bearing: northUp ? 0 : (gpsData.heading || 0),
      duration: 1000
    })
  }, [mapLoaded, gpsData, northUp])

  // Load waypoints when map is ready
  const loadWaypoints = async () => {
    try {
      const result = await getAllWaypoints()
      setWaypoints(result.waypoints || [])
    } catch (err) {
      console.error('Failed to load waypoints:', err)
    }
  }

  useEffect(() => {
    if (!mapLoaded) return
    loadWaypoints()
  }, [mapLoaded])

  // Render waypoint markers on map
  useEffect(() => {
    if (!mapLoaded || !map.current) return

    // Clear existing markers
    waypointMarkersRef.current.forEach(marker => marker.remove())
    waypointMarkersRef.current.clear()

    // Add markers for each waypoint
    waypoints.forEach(waypoint => {
      // Skip waypoints with invalid coordinates
      if (!isValidCoordinate(waypoint.latitude, waypoint.longitude)) return

      const el = document.createElement('div')
      el.className = 'waypoint-marker'
      el.innerHTML = createMarkerSVG(waypoint.icon, waypoint.color, 32)
      el.style.cursor = 'pointer'

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat([waypoint.longitude, waypoint.latitude])
        .addTo(map.current)

      // Click to show popup with waypoint info
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        // Create popup
        new maplibregl.Popup({ closeOnClick: true, className: 'waypoint-popup' })
          .setLngLat([waypoint.longitude, waypoint.latitude])
          .setHTML(`
            <div style="font-family: monospace; padding: 8px;">
              <div style="font-weight: bold; color: #22c55e; margin-bottom: 4px;">${waypoint.name}</div>
              ${waypoint.description ? `<div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">${waypoint.description}</div>` : ''}
              <div style="color: #9ca3af; font-size: 11px;">
                ${Math.abs(waypoint.latitude).toFixed(4)}°${waypoint.latitude >= 0 ? 'N' : 'S'} /
                ${Math.abs(waypoint.longitude).toFixed(4)}°${waypoint.longitude >= 0 ? 'E' : 'W'}
              </div>
            </div>
          `)
          .addTo(map.current)
      })

      waypointMarkersRef.current.set(waypoint.id, marker)
    })
  }, [mapLoaded, waypoints])

  // Boat marker - always visible at GPS position
  // Only depends on position + heading fields, not entire gpsData object
  useEffect(() => {
    if (!mapLoaded || !gpsData || !map.current) return
    if (!isValidCoordinate(gpsData.latitude, gpsData.longitude)) return

    const fix = hasGpsFix(gpsData.latitude, gpsData.longitude)
    const displayLat = fix ? gpsData.latitude : DEFAULT_NO_FIX_POSITION.latitude
    const displayLng = fix ? gpsData.longitude : DEFAULT_NO_FIX_POSITION.longitude
    const fillColor = fix ? '#22c55e' : '#ef4444'
    const strokeDarkColor = fix ? '#0a3d1f' : '#7f1d1d'
    const glowColor = fix ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'

    // Create or update marker
    if (!boatMarkerRef.current) {
      // Create custom marker element
      const el = document.createElement('div')
      el.className = 'boat-marker'
      el.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="${fillColor}" stroke="${fillColor}" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3 L7 9 L7 17 L9 21 L15 21 L17 17 L17 9 Z" />
          <path stroke="${strokeDarkColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M9 11 L15 11" />
          <path stroke="${strokeDarkColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M10 6 L12 4 L14 6" />
        </svg>
      `
      el.style.cssText = `filter: drop-shadow(0 0 4px ${glowColor});`

      boatMarkerRef.current = new maplibregl.Marker({
        element: el,
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      })
        .setLngLat([displayLng, displayLat])
        .addTo(map.current)
    } else {
      boatMarkerRef.current.setLngLat([displayLng, displayLat])
      // Update color when fix status changes
      const el = boatMarkerRef.current.getElement()
      const svg = el.querySelector('svg')
      if (svg) {
        svg.setAttribute('fill', fillColor)
        svg.setAttribute('stroke', fillColor)
        const paths = svg.querySelectorAll('path')
        if (paths[1]) paths[1].setAttribute('stroke', strokeDarkColor)
        if (paths[2]) paths[2].setAttribute('stroke', strokeDarkColor)
      }
      el.style.filter = `drop-shadow(0 0 4px ${glowColor})`
    }

    // Rotate marker to heading
    if (gpsData.heading !== undefined) {
      boatMarkerRef.current.setRotation(gpsData.heading)
    }
  }, [mapLoaded, gpsData?.latitude, gpsData?.longitude, gpsData?.heading])

  // Update map bearing when north-up toggle changes (only when NOT tracking - tracking handles its own bearing)
  useEffect(() => {
    if (!map.current || !mapLoaded || trackingMode) return

    if (northUp) {
      // Bearing frozen by pan decouple - don't snap to 0, just leave map as-is
      if (bearingFrozenRef.current) return
      map.current.easeTo({ bearing: 0, duration: 200 })
      return
    }

    // Heading-up mode: follow GPS heading
    bearingFrozenRef.current = false
    map.current.easeTo({
      bearing: gpsData?.heading || 0,
      duration: 200
    })
  }, [northUp, gpsData?.heading, mapLoaded, trackingMode])

  // Tracking mode - follow boat position with bearing rotation
  // Only depends on position + heading fields, not entire gpsData object
  useEffect(() => {
    if (!trackingMode || !gpsData || !map.current) return
    if (!isValidCoordinate(gpsData.latitude, gpsData.longitude)) return

    const fix = hasGpsFix(gpsData.latitude, gpsData.longitude)
    const trackLat = fix ? gpsData.latitude : DEFAULT_NO_FIX_POSITION.latitude
    const trackLng = fix ? gpsData.longitude : DEFAULT_NO_FIX_POSITION.longitude
    const mapHeight = map.current.getContainer().clientHeight
    const bearing = northUp ? 0 : (gpsData.heading || 0)

    if (trackingMode === 'center') {
      // Mode 1: Boat centered in middle of screen
      map.current.easeTo({
        center: [trackLng, trackLat],
        bearing: bearing,
        padding: { bottom: 0, top: 0, left: 0, right: 0 },
        duration: 200  // Match 5 Hz update interval for smooth motion
      })
    } else if (trackingMode === 'offset') {
      // Mode 2: Boat 1/3 from bottom, centered laterally
      // To place center at 2/3 from top, we need top padding of 1/3 height
      map.current.easeTo({
        center: [trackLng, trackLat],
        bearing: bearing,
        padding: { top: mapHeight / 3, bottom: 0, left: 0, right: 0 },
        duration: 200  // Match 5 Hz update interval for smooth motion
      })
    }
  }, [trackingMode, gpsData?.latitude, gpsData?.longitude, gpsData?.heading, northUp])

  // Decouple from tracking on user pan
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const handleMoveStart = (e) => {
      // Only decouple if user-initiated (has originalEvent)
      if (e.originalEvent) {
        if (trackingModeRef.current) {
          setTrackingMode(null)
        }
        // Also exit heading-follow mode, freezing the current bearing
        if (!northUpRef.current) {
          bearingFrozenRef.current = true
          setNorthUp(true)
        }
      }
    }

    map.current.on('movestart', handleMoveStart)
    return () => {
      if (map.current) {
        map.current.off('movestart', handleMoveStart)
      }
    }
  }, [mapLoaded])

  // Virginia Beach coordinates (fallback if GPS not available)
  const center = [-75.978, 36.853]
  const defaultZoom = 15  // Zoomed in for detailed navigation

  useEffect(() => {
    if (map.current) return // Initialize map only once

    // Inline style with GSHHS source configured for unlimited overzooming
    const inlineStyle = {
      version: 8,
      name: "GSHHS Base Layer",
      sources: {
        gshhs: {
          type: "vector",
          tiles: ["http://localhost:3001/gshhs_base/{z}/{x}/{y}"],
          maxzoom: 13  // Tiles exist up to zoom 13, overzoom beyond
        }
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#000000" }
        },
        // DISABLED FOR TESTING
        // {
        //   id: "land-fill",
        //   type: "fill",
        //   source: "gshhs",
        //   "source-layer": "land",
        //   paint: {
        //     "fill-color": "#0f3d2a",
        //     "fill-opacity": 1
        //   }
        // },
        {
          id: "coastline-outline",
          type: "line",
          source: "gshhs",
          "source-layer": "coastline",
          minzoom: 4,
          paint: {
            "line-color": "#FFFFFF",
            "line-width": [
              "interpolate",
              ["exponential", 1.5],
              ["zoom"],
              4, 0.3,
              6, 0.5,
              10, 1,
              14, 1.5,
              18, 2
            ]
          }
        }
      ]
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: inlineStyle,
      center: center,
      zoom: defaultZoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxZoom: 22,  // Allow zooming to level 22
      fadeDuration: 0,  // Tiles appear instantly instead of fading in
      maxTileCacheSize: 200,  // Cache more tiles for smoother panning
      refreshExpiredTiles: false  // Don't re-request tiles that are already loaded
    })

    // Enable native single-finger pan and two-finger pinch-to-zoom
    map.current.dragPan.enable()
    map.current.touchZoomRotate.enable()

    map.current.on('load', async () => {
      setMapLoaded(true)

      // Handle base layer errors gracefully
      map.current.on('error', (e) => {
        if (e.error?.message?.includes('gshhs_base') || e.error?.message?.includes('localhost:3001')) {
          console.warn('GSHHS base layer not available:', e.error.message)
          // Map will show blue background only, user can download via Settings → Coastline
        }
      })

      // Load S-57 vector layers first (bottom)
      await loadS57Layers()

      // Load ENC raster layers (middle, above S-57)
      await loadENCLayers()

      // Load BlueTopo tiles after ENC (they go on top)
      await loadBlueTopoTiles()
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Load S-57 vector chart layers (GeoJSON direct)
  const loadS57Layers = async () => {
    try {
      const result = await getDownloadedS57Regions()
      if (!map.current) return

      if (!result.success || !result.regions || result.regions.length === 0) {
        console.log('[ChartView] No S-57 vector regions downloaded')
        setS57RegionCount(0)
        return
      }

      const regions = result.regions
      setS57RegionCount(regions.length)
      console.log(`[ChartView] Loading ${regions.length} S-57 vector regions`)

      const apiBaseUrl = `http://${window.location.hostname}:3002`

      for (const region of regions) {
        if (!map.current) return

        // Skip if already loaded
        const testSourceId = `${S57_LAYER_PREFIX}${region.regionId}-DEPARE`
        if (map.current.getSource(testSourceId)) {
          console.log(`[ChartView] S-57 region ${region.regionId} already loaded, skipping`)
          continue
        }

        // Get available layers for this region
        const availableLayers = region.layers || []
        if (availableLayers.length === 0) {
          console.log(`[ChartView] No layers for S-57 region ${region.regionId}`)
          continue
        }

        // Create sources and layers from the nautical style
        const { sources, layers } = createNauticalStyle(region.regionId, availableLayers, apiBaseUrl)

        // Add all sources
        for (const [sourceId, sourceConfig] of Object.entries(sources)) {
          if (!map.current.getSource(sourceId)) {
            map.current.addSource(sourceId, sourceConfig)
          }
        }

        // Add all layers (visibility effect will apply correct state after load)
        for (const layer of layers) {
          map.current.addLayer(layer)
        }

        console.log(`[ChartView] Added ${layers.length} S-57 layers for ${region.regionId} (${availableLayers.length} GeoJSON sources)`)
      }

      console.log(`[ChartView] Loaded S-57 vector regions successfully`)
      setS57LayersLoaded(n => n + 1)
    } catch (err) {
      console.error('Error loading S-57 layers:', err)
    }
  }

  // Load BlueTopo tile sources
  const loadBlueTopoTiles = async () => {
    try {
      const result = await getDownloadedTileMetadata()

      // Check if map still exists after async fetch
      if (!map.current) {
        return
      }

      if (!result.success || !result.tiles || result.tiles.length === 0) {
        setTilesLoaded(true)
        setTileCount(0)
        return
      }

      const tiles = result.tiles
      setTileCount(tiles.length)

      // Add each tile as a separate raster source and layer
      let added = 0
      for (const tile of tiles) {
        // Check map still exists before each operation
        if (!map.current) return

        const sourceId = `bluetopo-${tile.tileId}`
        const layerId = `bluetopo-layer-${tile.tileId}`

        // Skip if source already exists (from previous mount)
        if (map.current.getSource(sourceId)) {
          added++
          continue
        }

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

        // Add raster layer (respect saved visibility)
        map.current.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': topoLayersVisible ? 0.85 : 0,
            'raster-fade-duration': 0
          }
        })
        added++
      }

      console.log(`[ChartView] Loaded ${added} BlueTopo tiles`)
      setTilesLoaded(true)
    } catch (err) {
      console.error('Error loading BlueTopo tiles:', err)
      setError(err.message)
      setTilesLoaded(true)
    }
  }

  // Load ENC (nautical chart) layers from Martin tileserver
  const loadENCLayers = async () => {
    try {
      const result = await getDownloadedENCRegions()

      // Check if map still exists after async fetch
      if (!map.current) return

      if (!result.success || !result.regions || result.regions.length === 0) {
        console.log('[ChartView] No ENC regions downloaded')
        setEncRegionCount(0)
        return
      }

      const regions = result.regions
      setEncRegionCount(regions.length)
      console.log(`[ChartView] Loading ${regions.length} ENC regions`)

      // Find the first bluetopo layer to insert ENC layers before it
      const style = map.current.getStyle()
      let firstBluetopoLayerId = null
      if (style && style.layers) {
        for (const layer of style.layers) {
          if (layer.id.startsWith('bluetopo-layer-')) {
            firstBluetopoLayerId = layer.id
            break
          }
        }
      }

      // Add each ENC region as a raster source and layer
      for (const region of regions) {
        if (!map.current) return

        const sourceId = `enc-${region.regionId}`
        const layerId = `enc-layer-${region.regionId}`

        // Skip if source already exists
        if (map.current.getSource(sourceId)) {
          console.log(`[ChartView] ENC source ${sourceId} already exists, skipping`)
          continue
        }

        // ENC MBTiles are served by Martin at /regionId/{z}/{x}/{y}
        // Martin auto-discovers .mbtiles files and serves them (no file extension needed)
        const tileUrl = `http://localhost:3001/${region.regionId}/{z}/{x}/{y}`

        console.log(`[ChartView] Adding ENC source: ${sourceId} with URL pattern: ${tileUrl}`)

        // Add raster source for this ENC region
        map.current.addSource(sourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          minzoom: 3,
          maxzoom: 18
        })

        // Add raster layer - insert BEFORE BlueTopo layers so ENC is underneath
        const layerConfig = {
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': encLayersVisible ? 1.0 : 0,
            'raster-fade-duration': 0
          }
        }

        if (firstBluetopoLayerId) {
          map.current.addLayer(layerConfig, firstBluetopoLayerId)
          console.log(`[ChartView] Added ENC layer ${layerId} before ${firstBluetopoLayerId}`)
        } else {
          map.current.addLayer(layerConfig)
          console.log(`[ChartView] Added ENC layer ${layerId}`)
        }
      }

      console.log(`[ChartView] Loaded ${regions.length} ENC regions successfully`)

    } catch (err) {
      console.error('Error loading ENC layers:', err)
      // Don't set error state - ENC is optional
    }
  }

  // Touch event handlers for depth measurement
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const canvas = map.current.getCanvasContainer()

    const handleTouchStart = (e) => {
      // Two-finger touch: cancel hold, let MapLibre handle pinch-to-zoom
      if (e.touches.length === 2) {
        cancelHold()
        setTouchState(null)
        return
      }

      // Single-finger touch: start hold timer for crosshairs
      if (e.touches.length !== 1) {
        cancelHold()
        return
      }

      // Do NOT preventDefault/stopPropagation — let MapLibre handle panning

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
        // Hold timer fired — finger stayed still, activate crosshairs
        map.current.dragPan.disable()
        map.current.stop()
        setTouchState(prev => prev ? { ...prev, showingCrosshairs: true } : null)
      }, HOLD_DURATION)
    }

    const handleTouchMove = (e) => {
      if (!touchStateRef.current || e.touches.length !== 1) {
        cancelHold()
        return
      }

      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      if (touchStateRef.current.showingCrosshairs) {
        // Crosshairs active — block MapLibre and move crosshairs
        e.preventDefault()
        e.stopPropagation()
        setTouchState(prev => prev ? { ...prev, currentX: x, currentY: y } : null)
      } else {
        // Crosshairs not yet active — check if finger moved too far (it's a pan)
        const dx = x - touchStateRef.current.startX
        const dy = y - touchStateRef.current.startY
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > MOVE_THRESHOLD) {
          // User is panning, cancel the hold timer and stop tracking touch
          cancelHold()
          setTouchState(null)
        }
      }
    }

    const handleTouchEnd = (e) => {
      const currentTouchState = touchStateRef.current
      if (!currentTouchState) return

      if (currentTouchState.showingCrosshairs) {
        // Crosshairs were showing — show waypoint menu
        e.preventDefault()
        e.stopPropagation()

        const adjustedY = Math.max(currentTouchState.currentY - 100, 50)
        const point = map.current.unproject([currentTouchState.currentX, adjustedY])

        setWaypointMenuPosition({
          screenX: currentTouchState.currentX,
          screenY: adjustedY,
          lat: point.lat,
          lng: point.lng
        })
        setWaypointMenuOpen(true)

        // Re-enable panning
        map.current.dragPan.enable()
      }

      cancelHold()
      setTouchState(null)
    }

    const handleTouchCancel = (e) => {
      if (touchStateRef.current) {
        if (touchStateRef.current.showingCrosshairs) {
          // Re-enable panning if crosshairs were active
          map.current.dragPan.enable()
        }
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

  // Waypoint menu handlers
  const handleWaypointMenuClose = () => {
    setWaypointMenuOpen(false)
    setWaypointMenuPosition(null)
  }

  const handleAddWaypointFromMenu = ({ lat, lng }) => {
    setWaypointMenuOpen(false)
    setWaypointEditPosition({ lat, lng })
    setWaypointEditModalOpen(true)
  }

  const handleMeasureDepthFromMenu = ({ screenX, screenY }) => {
    setWaypointMenuOpen(false)
    setWaypointMenuPosition(null)
    performDepthMeasurement(screenX, screenY + 100) // Re-add the offset since performDepthMeasurement subtracts it
  }

  const handleSaveWaypoint = async (data) => {
    try {
      await createWaypoint(data)
      setWaypointEditModalOpen(false)
      setWaypointEditPosition(null)
      await loadWaypoints() // Refresh markers
    } catch (err) {
      throw err // Let modal handle error display
    }
  }

  const handleWaypointSelect = (waypoint) => {
    setWaypointDropdownOpen(false)
    if (!isValidCoordinate(waypoint.latitude, waypoint.longitude)) return
    map.current.flyTo({
      center: [waypoint.longitude, waypoint.latitude],
      zoom: 14,
      duration: 1000
    })
  }

  // Layer configuration
  const layers = [
    {
      id: 's57',
      name: 'Vector Charts (S-57)',
      description: `Depth shading, soundings, nav aids${s57RegionCount > 0 ? ` (${s57RegionCount} regions)` : ''}`,
      visible: s57LayersVisible
    },
    {
      id: 'enc',
      name: 'Raster Charts (NCDS)',
      description: `NOAA NCDS raster charts${encRegionCount > 0 ? ` (${encRegionCount} regions)` : ''}`,
      visible: encLayersVisible
    },
    {
      id: 'bluetopo',
      name: 'BlueTopo Bathymetry',
      description: 'NOAA bathymetric tiles (2m-16m resolution)',
      visible: topoLayersVisible
    }
  ]

  // Toggle individual layer visibility
  const handleToggleLayer = useCallback((layerId) => {
    if (layerId === 'bluetopo') {
      setTopoLayersVisible(v => !v)
    } else if (layerId === 'enc') {
      setEncLayersVisible(v => !v)
    } else if (layerId === 's57') {
      setS57LayersVisible(v => !v)
    }
  }, [])

  // Toggle individual S-57 sublayer visibility
  const handleToggleSublayer = useCallback((sublayerId) => {
    setS57SubLayerVisibility(prev => ({
      ...prev,
      [sublayerId]: prev[sublayerId] === false ? true : false
    }))
  }, [])

  // Toggle all sublayers in a group
  const handleToggleGroup = useCallback((groupId, visible) => {
    const group = S57_SUBLAYER_GROUPS.find(g => g.id === groupId)
    if (!group) return
    setS57SubLayerVisibility(prev => {
      const next = { ...prev }
      group.sublayers.forEach(sl => { next[sl.id] = visible })
      return next
    })
  }, [])

  // Memoized button handlers to prevent unnecessary re-renders
  const handleZoomIn = useCallback(() => map.current?.zoomIn(), [])
  const handleZoomOut = useCallback(() => map.current?.zoomOut(), [])
  const handleToggleNorthUp = useCallback(() => {
    bearingFrozenRef.current = false  // Manual toggle always resets frozen state
    setNorthUp(n => !n)
  }, [])
  const handleCycleTrackingMode = useCallback(() => {
    setTrackingMode(mode => {
      if (!mode) return 'center'
      if (mode === 'center') return 'offset'
      return null
    })
  }, [])

  // Update layer visibility when state changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const opacity = topoLayersVisible ? 0.85 : 0

    // Toggle all BlueTopo layers
    const styleLayers = map.current.getStyle()?.layers || []
    styleLayers.forEach(layer => {
      if (layer.id.startsWith('bluetopo-layer-')) {
        map.current.setPaintProperty(layer.id, 'raster-opacity', opacity)
      }
    })
  }, [topoLayersVisible, mapLoaded])

  // Update ENC layer visibility when state changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const opacity = encLayersVisible ? 1.0 : 0

    // Toggle all ENC layers
    const styleLayers = map.current.getStyle()?.layers || []
    styleLayers.forEach(layer => {
      if (layer.id.startsWith('enc-layer-')) {
        map.current.setPaintProperty(layer.id, 'raster-opacity', opacity)
      }
    })
  }, [encLayersVisible, mapLoaded])

  // Update S-57 vector layer visibility when state changes (master + sublayer)
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const styleLayers = map.current.getStyle()?.layers || []
    styleLayers.forEach(layer => {
      if (!layer.id.startsWith(S57_LAYER_PREFIX)) return

      // If master S-57 toggle is off, hide everything
      if (!s57LayersVisible) {
        map.current.setLayoutProperty(layer.id, 'visibility', 'none')
        return
      }

      // Check sublayer visibility by matching layer id suffix against patterns
      let vis = 'visible'
      for (const group of S57_SUBLAYER_GROUPS) {
        for (const sl of group.sublayers) {
          if (s57SubLayerVisibility[sl.id] === false) {
            for (const pat of sl.patterns) {
              if (layer.id.endsWith(pat)) {
                vis = 'none'
                break
              }
            }
          }
          if (vis === 'none') break
        }
        if (vis === 'none') break
      }
      map.current.setLayoutProperty(layer.id, 'visibility', vis)
    })
  }, [s57LayersVisible, s57SubLayerVisibility, s57LayersLoaded, mapLoaded])

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

      {/* Waypoint Menu (appears after long-press release) */}
      {waypointMenuOpen && waypointMenuPosition && (
        <WaypointMenu
          position={waypointMenuPosition}
          onAddWaypoint={handleAddWaypointFromMenu}
          onMeasureDepth={handleMeasureDepthFromMenu}
          onClose={handleWaypointMenuClose}
        />
      )}

      {/* Waypoint Edit Modal */}
      {waypointEditModalOpen && waypointEditPosition && (
        <WaypointEditModal
          waypoint={null}
          initialPosition={waypointEditPosition}
          onSave={handleSaveWaypoint}
          onClose={() => {
            setWaypointEditModalOpen(false)
            setWaypointEditPosition(null)
          }}
        />
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

      {/* Bottom-left control stack: sublayer filter (conditional) + layers button */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col space-y-2">
        {/* S-57 Sublayer Filter Button - only shows when vector charts are visible */}
        {s57LayersVisible && s57RegionCount > 0 && (
          <div className="relative">
            <button
              onClick={() => { setS57SubLayerMenuOpen(v => !v); setLayersMenuOpen(false) }}
              className={`bg-terminal-surface hover:bg-terminal-green/10 border rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all ${
                s57SubLayerMenuOpen
                  ? 'border-terminal-green bg-terminal-green/20'
                  : 'border-terminal-border hover:border-terminal-green'
              }`}
              aria-label="Vector chart filter"
              title="Filter vector chart layers"
            >
              <svg className="w-6 h-6 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
            </button>

            {s57SubLayerMenuOpen && (
              <S57SubLayerMenu
                sublayerVisibility={s57SubLayerVisibility}
                onToggleSublayer={handleToggleSublayer}
                onToggleGroup={handleToggleGroup}
                onClose={() => setS57SubLayerMenuOpen(false)}
              />
            )}
          </div>
        )}

        {/* Layers Button */}
        <div className="relative">
          <button
            onClick={() => { setLayersMenuOpen(v => !v); setS57SubLayerMenuOpen(false) }}
            className={`bg-terminal-surface hover:bg-terminal-green/10 border rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all ${
              layersMenuOpen
                ? 'border-terminal-green bg-terminal-green/20'
                : 'border-terminal-border hover:border-terminal-green'
            }`}
            aria-label="Map layers"
            title="Map layers"
          >
            <svg className="w-6 h-6 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 7 L12 3 L21 7 L12 11 L3 7 Z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12 L12 16 L21 12" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 17 L12 21 L21 17" />
            </svg>
          </button>

          {layersMenuOpen && (
            <LayersMenu
              layers={layers}
              onToggleLayer={handleToggleLayer}
              onClose={() => setLayersMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Touch-friendly zoom controls for marine use */}
      <div className="absolute bottom-4 right-4 flex flex-col space-y-2 z-20">
        <button
          onClick={handleZoomIn}
          className="bg-terminal-surface hover:bg-terminal-green/10 border border-terminal-border hover:border-terminal-green rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all"
          aria-label="Zoom in"
        >
          <svg className="w-6 h-6 text-terminal-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
        <button
          onClick={handleZoomOut}
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
          onClick={handleToggleNorthUp}
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
          onClick={handleCycleTrackingMode}
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

        {/* Waypoints Dropdown */}
        <div className="relative">
          <button
            onClick={() => setWaypointDropdownOpen(!waypointDropdownOpen)}
            className={`bg-terminal-surface hover:bg-terminal-green/10 border rounded-lg p-3 shadow-glow-green-sm touch-manipulation transition-all ${
              waypointDropdownOpen
                ? 'border-terminal-green bg-terminal-green/20'
                : 'border-terminal-border hover:border-terminal-green'
            }`}
            aria-label="Waypoints"
            title="Waypoints"
          >
            <MapPinIcon className="w-6 h-6 text-terminal-green" />
            {waypoints.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-terminal-green text-terminal-bg text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {waypoints.length}
              </span>
            )}
          </button>

          {waypointDropdownOpen && (
            <WaypointDropdown
              waypoints={waypoints}
              onSelect={handleWaypointSelect}
              onClose={() => setWaypointDropdownOpen(false)}
            />
          )}
        </div>

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

export default ChartView
