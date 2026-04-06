import { useEffect, useRef, useState, useCallback } from 'react'
import { API_BASE, WS_BASE, TILE_BASE } from '../utils/apiConfig.js'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getDownloadedTileMetadata, getTileUrl, getDepthAtLocation } from '../services/blueTopoTileService'
import { getSatelliteRegions, getSatelliteTileUrl } from '../services/satelliteTileService'
import { getDownloadedRegions as getDownloadedENCRegions } from '../services/encDownloadService'
import { getDownloadedRegions as getDownloadedS57Regions } from '../services/s57DownloadService'
import { createNauticalStyle, S57_LAYER_PREFIX } from '../styles/nauticalChartStyle'
import { getAllWaypoints, createWaypoint } from '../services/waypointService'
import { getWeatherRegions, getRegionData, getTimestamps, getGridAtTime, buildStationGeoJSON } from '../services/weatherDataService'
import ForecastTimeSlider from './ForecastTimeSlider'
import WeatherStationPopup from './WeatherStationPopup'
import { SettingsIcon, BoatIcon } from './Icons'
import { createHeadingLineSVGString } from '../utils/headingLine'
import DepthCrosshairs from './DepthCrosshairs'
import DepthInfoCard from './DepthInfoCard'
import WaypointMenu from './WaypointMenu'
import WaypointEditModal from './WaypointEditModal'
import WaypointDropdown from './WaypointDropdown'
import LayersMenu from './LayersMenu'
import S57SubLayerMenu, { S57_SUBLAYER_GROUPS } from './S57SubLayerMenu'
import S57FeatureCard from './S57FeatureCard'
import HudOverlay from './HudOverlay'
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
  const headingLineRef = useRef(null)
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
  const [selectedS57Feature, setSelectedS57Feature] = useState(null)
  const s57LayerIdsRef = useRef([])

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
  const [satelliteLayersVisible, setSatelliteLayersVisible] = useState(() => {
    const saved = localStorage.getItem('chartview_satellite_visible')
    return saved !== null ? JSON.parse(saved) : false
  })
  // Weather layer state
  const [weatherLayersVisible, setWeatherLayersVisible] = useState(() => {
    const saved = localStorage.getItem('chartview_weather_visible')
    return saved !== null ? JSON.parse(saved) : false
  })
  const [weatherRegions, setWeatherRegions] = useState([])
  const [weatherTimestamps, setWeatherTimestamps] = useState([])
  const [forecastTimeIndex, setForecastTimeIndex] = useState(0)
  const [selectedWeatherStation, setSelectedWeatherStation] = useState(null)
  const [activeWeatherRegionId, setActiveWeatherRegionId] = useState(null)
  const [weatherDownloadedAt, setWeatherDownloadedAt] = useState(null)
  const weatherLayersLoadedRef = useRef(false)

  // HUD overlay state
  const [hudVisible, setHudVisible] = useState(() => {
    const saved = localStorage.getItem('chartview_hud_visible')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [hudDepth, setHudDepth] = useState(null)
  const [hudColor, setHudColor] = useState(() => {
    return localStorage.getItem('chartview_hud_color') || '#22c55e'
  })

  const [layersMenuOpen, setLayersMenuOpen] = useState(false)

  // Save layer visibility to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('chartview_satellite_visible', JSON.stringify(satelliteLayersVisible))
  }, [satelliteLayersVisible])

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

  useEffect(() => {
    localStorage.setItem('chartview_weather_visible', JSON.stringify(weatherLayersVisible))
  }, [weatherLayersVisible])

  useEffect(() => {
    localStorage.setItem('chartview_hud_visible', JSON.stringify(hudVisible))
  }, [hudVisible])

  useEffect(() => {
    localStorage.setItem('chartview_hud_color', hudColor)
  }, [hudColor])

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

  // HUD depth query — poll BlueTopo depth at boat position
  useEffect(() => {
    if (!hudVisible || !gpsData) return
    const lat = gpsData.latitude
    const lon = gpsData.longitude
    if (lat == null || lon == null) return

    const timeoutId = setTimeout(async () => {
      try {
        const result = await getDepthAtLocation(lon, lat)
        setHudDepth(result.success ? result.depth : null)
      } catch {
        setHudDepth(null)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [hudVisible, gpsData?.latitude, gpsData?.longitude])

  // Default position just offshore Virginia Beach oceanfront (no GPS / no satellite fix)
  const DEFAULT_NO_FIX_POSITION = { latitude: 36.853, longitude: -75.960 }

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
      const ws = new WebSocket(WS_BASE)
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
    fetch(`${API_BASE}/api/gps`)
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

  // Boat marker - always visible, even without GPS
  // Shows at GPS position when available, map center when not
  // Includes heading line with distance tick marks
  const updateHeadingLine = useCallback(() => {
    if (!headingLineRef.current || !map.current) return
    const hasGps = gpsData && isValidCoordinate(gpsData.latitude, gpsData.longitude)
    const fix = hasGps && hasGpsFix(gpsData.latitude, gpsData.longitude)
    const displayLat = fix ? gpsData.latitude : DEFAULT_NO_FIX_POSITION.latitude
    headingLineRef.current.innerHTML = createHeadingLineSVGString(map.current, displayLat, hudColor, gpsData?.heading, gpsData?.cog)
  }, [gpsData, hudColor])

  useEffect(() => {
    if (!mapLoaded || !map.current) return

    const hasGps = gpsData && isValidCoordinate(gpsData.latitude, gpsData.longitude)
    const fix = hasGps && hasGpsFix(gpsData.latitude, gpsData.longitude)
    const displayLat = fix ? gpsData.latitude : DEFAULT_NO_FIX_POSITION.latitude
    const displayLng = fix ? gpsData.longitude : DEFAULT_NO_FIX_POSITION.longitude
    const fillColor = fix ? hudColor : '#ef4444'
    const glowColor = 'rgba(0, 0, 0, 0.6)'

    // Create or update marker
    if (!boatMarkerRef.current) {
      // Wrapper — 38x38 centered on the map point, overflow visible for heading line
      const el = document.createElement('div')
      el.className = 'boat-marker'
      el.style.cssText = 'width:38px; height:38px; position:relative; overflow:visible;'

      // Heading line container — anchored to the center of the boat icon (GPS position)
      const lineContainer = document.createElement('div')
      lineContainer.className = 'heading-line-container'
      lineContainer.style.cssText = 'position:absolute; bottom:50%; left:50%; transform:translateX(-50%); pointer-events:none; overflow:visible;'
      headingLineRef.current = lineContainer
      el.appendChild(lineContainer)

      // Boat icon — 38px (20% larger than 32), detailed boat shape
      const boatSvg = document.createElement('div')
      boatSvg.className = 'boat-icon'
      boatSvg.style.cssText = `position:relative; z-index:1; filter: drop-shadow(0 0 5px ${glowColor});`
      boatSvg.innerHTML = `
        <svg width="38" height="38" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Hull -->
          <path d="M16 2 L10 10 L9 22 L11 27 L16 29 L21 27 L23 22 L22 10 Z"
                fill="${fillColor}" stroke="${fillColor}" stroke-width="0.5" stroke-linejoin="round"/>
          <!-- Hull highlight (port side) -->
          <path d="M16 3 L11 10 L10 21 L12 26 L16 28"
                fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-linecap="round"/>
          <!-- Gunwale line -->
          <path d="M11.5 11 L20.5 11" stroke="rgba(0,0,0,0.25)" stroke-width="0.8" stroke-linecap="round"/>
          <!-- Cabin / wheelhouse -->
          <rect x="12.5" y="12" width="7" height="5" rx="1.2"
                fill="rgba(0,0,0,0.2)" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>
          <!-- Windshield -->
          <rect x="13.2" y="12.6" width="5.6" height="2" rx="0.6"
                fill="rgba(180,230,255,0.45)" stroke="rgba(255,255,255,0.3)" stroke-width="0.3"/>
          <!-- Bow detail -->
          <path d="M13 7 L16 3.5 L19 7" fill="none"
                stroke="rgba(255,255,255,0.35)" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Stern transom -->
          <path d="M12 25 L20 25" stroke="rgba(0,0,0,0.2)" stroke-width="0.8" stroke-linecap="round"/>
          <!-- Center keel line -->
          <path d="M16 4 L16 28" stroke="rgba(0,0,0,0.1)" stroke-width="0.4"/>
        </svg>
      `
      el.appendChild(boatSvg)

      // Initial heading line render
      lineContainer.innerHTML = createHeadingLineSVGString(map.current, displayLat, hudColor, gpsData?.heading, gpsData?.cog)

      boatMarkerRef.current = new maplibregl.Marker({
        element: el,
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      })
        .setLngLat([displayLng, displayLat])
        .addTo(map.current)
    } else {
      boatMarkerRef.current.setLngLat([displayLng, displayLat])
      // Update boat icon color when fix status changes
      const boatIcon = boatMarkerRef.current.getElement().querySelector('.boat-icon')
      if (boatIcon) {
        boatIcon.style.filter = `drop-shadow(0 0 5px ${glowColor})`
        const hull = boatIcon.querySelector('svg path')
        if (hull) {
          hull.setAttribute('fill', fillColor)
          hull.setAttribute('stroke', fillColor)
        }
      }
      // Update heading line
      updateHeadingLine()
    }

    // Rotate marker to heading
    if (gpsData?.heading !== undefined) {
      boatMarkerRef.current.setRotation(gpsData.heading)
    }
  }, [mapLoaded, gpsData?.latitude, gpsData?.longitude, gpsData?.heading, updateHeadingLine])

  // Recalculate heading line on zoom/resize
  useEffect(() => {
    if (!mapLoaded || !map.current) return

    const onZoom = () => updateHeadingLine()
    const onResize = () => updateHeadingLine()

    map.current.on('zoom', onZoom)
    map.current.on('resize', onResize)

    return () => {
      if (map.current) {
        map.current.off('zoom', onZoom)
        map.current.off('resize', onResize)
      }
    }
  }, [mapLoaded, updateHeadingLine])

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
          tiles: [`${TILE_BASE}/gshhs_base/{z}/{x}/{y}`],
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

    weatherLayersLoadedRef.current = false // Reset on map recreate
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
        if (e.error?.message?.includes('gshhs_base') || e.error?.message?.includes(':3001')) {
          console.warn('GSHHS base layer not available:', e.error.message)
          // Map will show blue background only, user can download via Settings → Coastline
        }
      })

      // Load satellite imagery first (base layer, below everything)
      await loadSatelliteLayer()

      // Load S-57 vector layers (above satellite)
      await loadS57Layers()

      // Load ENC raster layers (middle, above S-57)
      await loadENCLayers()

      // Load BlueTopo tiles after ENC (they go on top)
      await loadBlueTopoTiles()

      // Load weather layers (on top of everything)
      await loadWeatherLayers()
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Load satellite imagery as base layer
  const loadSatelliteLayer = async () => {
    try {
      const result = await getSatelliteRegions()
      if (!map.current) return
      if (!result.success || !result.regions || result.regions.length === 0) {
        console.log('[ChartView] No satellite regions downloaded')
        return
      }

      const sourceId = 'satellite-source'
      const layerId = 'satellite-layer'

      if (map.current.getSource(sourceId)) return

      map.current.addSource(sourceId, {
        type: 'raster',
        tiles: [getSatelliteTileUrl()],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16
      })

      map.current.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': satelliteLayersVisible ? 1.0 : 0,
          'raster-fade-duration': 0
        }
      })

      console.log(`[ChartView] Satellite layer added (${result.regions.length} regions)`)
    } catch (error) {
      console.error('[ChartView] Failed to load satellite layer:', error)
    }
  }

  // Load weather station markers and wind barb grid layers
  const loadWeatherLayers = async () => {
    try {
      const regions = await getWeatherRegions()
      setWeatherRegions(regions)
      if (!map.current || regions.length === 0) return

      // Use first region (most recent) - could be expanded to merge
      const region = regions[regions.length - 1]
      setActiveWeatherRegionId(region.id)
      setWeatherDownloadedAt(region.downloadedAt)

      // Load region metadata for station positions
      const metadata = await getRegionData(region.id)
      if (!metadata || !map.current) return

      // Build station GeoJSON and add source/layers
      const stationGeoJSON = buildStationGeoJSON(metadata)

      if (!map.current.getSource('weather-stations')) {
        map.current.addSource('weather-stations', {
          type: 'geojson',
          data: stationGeoJSON
        })

        // Station circle layer
        map.current.addLayer({
          id: 'weather-stations-circles',
          type: 'circle',
          source: 'weather-stations',
          layout: {
            'visibility': weatherLayersVisible ? 'visible' : 'none'
          },
          paint: {
            'circle-radius': 6,
            'circle-color': [
              'match', ['get', 'stationType'],
              'tide', '#60a5fa',
              'current', '#34d399',
              'met', '#fb923c',
              'ndbc', '#a78bfa',
              '#888888'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#000000',
            'circle-opacity': 0.9
          }
        })

        // Station label layer (visible at higher zoom)
        map.current.addLayer({
          id: 'weather-stations-labels',
          type: 'symbol',
          source: 'weather-stations',
          minzoom: 9,
          layout: {
            'visibility': weatherLayersVisible ? 'visible' : 'none',
            'text-field': ['get', 'name'],
            'text-size': 10,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-max-width': 10
          },
          paint: {
            'text-color': '#00ff88',
            'text-halo-color': '#000000',
            'text-halo-width': 1,
            'text-opacity': 0.8
          }
        })
      }

      // Load wind barb images (SVGs rendered to canvas for MapLibre)
      const barbSpeeds = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100]
      let barbsLoaded = 0
      for (const speed of barbSpeeds) {
        if (!map.current.hasImage(`wind-barb-${speed}`)) {
          try {
            const image = new Image()
            image.crossOrigin = 'anonymous'
            image.src = `/wind-barbs/barb-${speed}.svg`
            await new Promise((resolve, reject) => {
              image.onload = resolve
              image.onerror = reject
            })
            // Rasterize at 192x192 for crisp rendering at larger display sizes
            if (image.decode) await image.decode()
            const canvas = document.createElement('canvas')
            canvas.width = 192
            canvas.height = 192
            const ctx = canvas.getContext('2d')
            // Black drop shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
            ctx.shadowBlur = 4
            ctx.shadowOffsetX = 1
            ctx.shadowOffsetY = 1
            ctx.drawImage(image, 0, 0, 192, 192)
            const imageData = ctx.getImageData(0, 0, 192, 192)
            // Use Uint8Array for reliable MapLibre compatibility
            map.current.addImage(`wind-barb-${speed}`, {
              width: 192,
              height: 192,
              data: new Uint8Array(imageData.data.buffer)
            })
            barbsLoaded++
          } catch (err) {
            console.warn(`[ChartView] Failed to load wind barb ${speed}:`, err)
          }
        } else {
          barbsLoaded++
        }
      }
      console.log(`[ChartView] Wind barb images loaded: ${barbsLoaded}/${barbSpeeds.length}`)

      // Load wind grid timestamps
      const timestamps = await getTimestamps(region.id, 'wind')
      setWeatherTimestamps(timestamps)

      if (timestamps.length > 0) {
        // Find closest timestamp to now
        const now = Date.now()
        let closestIdx = 0
        let closestDiff = Infinity
        for (let i = 0; i < timestamps.length; i++) {
          const diff = Math.abs(new Date(timestamps[i]).getTime() - now)
          if (diff < closestDiff) {
            closestDiff = diff
            closestIdx = i
          }
        }
        setForecastTimeIndex(closestIdx)

        // Load initial wind grid GeoJSON
        const gridData = await getGridAtTime(region.id, 'wind', timestamps[closestIdx])
        if (gridData && map.current) {
          if (!map.current.getSource('weather-wind-grid')) {
            map.current.addSource('weather-wind-grid', {
              type: 'geojson',
              data: gridData
            })

            map.current.addLayer({
              id: 'weather-wind-barbs',
              type: 'symbol',
              source: 'weather-wind-grid',
              layout: {
                'visibility': weatherLayersVisible ? 'visible' : 'none',
                'icon-image': [
                  'step', ['get', 'speed'],
                  'wind-barb-0',
                  3, 'wind-barb-5',
                  8, 'wind-barb-10',
                  13, 'wind-barb-15',
                  18, 'wind-barb-20',
                  23, 'wind-barb-25',
                  28, 'wind-barb-30',
                  33, 'wind-barb-35',
                  38, 'wind-barb-40',
                  43, 'wind-barb-45',
                  48, 'wind-barb-50',
                  58, 'wind-barb-60',
                  68, 'wind-barb-70',
                  78, 'wind-barb-80',
                  88, 'wind-barb-90',
                  98, 'wind-barb-100'
                ],
                'icon-rotate': ['get', 'direction'],
                'icon-size': 0.25,
                'icon-allow-overlap': true,
                'icon-rotation-alignment': 'map'
              },
              paint: {
                'icon-opacity': 1
              }
            })
          }
        }
      }

      // Load current arrow images and layer
      const arrowSpeeds = [0, 25, 50, 75, 100, 150, 200, 300, 400, 500]
      let arrowsLoaded = 0
      for (const tag of arrowSpeeds) {
        const imgId = `current-arrow-${String(tag).padStart(3, '0')}`
        if (!map.current.hasImage(imgId)) {
          try {
            const image = new Image()
            image.crossOrigin = 'anonymous'
            image.src = `/current-arrows/arrow-${String(tag).padStart(3, '0')}.svg`
            await new Promise((resolve, reject) => {
              image.onload = resolve
              image.onerror = reject
            })
            if (image.decode) await image.decode()
            const canvas = document.createElement('canvas')
            canvas.width = 64
            canvas.height = 64
            const ctx = canvas.getContext('2d')
            ctx.drawImage(image, 0, 0, 64, 64)
            const imageData = ctx.getImageData(0, 0, 64, 64)
            map.current.addImage(imgId, {
              width: 64,
              height: 64,
              data: new Uint8Array(imageData.data.buffer)
            })
            arrowsLoaded++
          } catch (err) {
            console.warn(`[ChartView] Failed to load current arrow ${tag}:`, err)
          }
        } else {
          arrowsLoaded++
        }
      }
      console.log(`[ChartView] Current arrow images loaded: ${arrowsLoaded}/${arrowSpeeds.length}`)

      // Load current grid data (from marine download)
      if (timestamps.length > 0) {
        const currentData = await getGridAtTime(region.id, 'current', timestamps[closestIdx])
        if (currentData && map.current && !map.current.getSource('weather-current-grid')) {
          map.current.addSource('weather-current-grid', {
            type: 'geojson',
            data: currentData
          })

          map.current.addLayer({
            id: 'weather-current-arrows',
            type: 'symbol',
            source: 'weather-current-grid',
            layout: {
              'visibility': weatherLayersVisible ? 'visible' : 'none',
              'icon-image': [
                'step', ['*', ['get', 'speed'], 100],
                'current-arrow-000',
                13, 'current-arrow-025',
                38, 'current-arrow-050',
                63, 'current-arrow-075',
                88, 'current-arrow-100',
                125, 'current-arrow-150',
                175, 'current-arrow-200',
                250, 'current-arrow-300',
                350, 'current-arrow-400',
                450, 'current-arrow-500'
              ],
              'icon-rotate': ['get', 'direction'],
              'icon-size': 0.8,
              'icon-allow-overlap': true,
              'icon-rotation-alignment': 'map'
            },
            paint: {
              'icon-opacity': 0.9
            }
          })
        }
      }

      // Click handler for station markers (guard prevents duplicate listeners on reload)
      if (!weatherLayersLoadedRef.current) {
      map.current.on('click', 'weather-stations-circles', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties
          setSelectedWeatherStation({
            id: props.id,
            name: props.name,
            stationType: props.stationType,
            state: props.state
          })
        }
      })

      // Change cursor on hover
      map.current.on('mouseenter', 'weather-stations-circles', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer'
      })
      map.current.on('mouseleave', 'weather-stations-circles', () => {
        if (map.current) map.current.getCanvas().style.cursor = ''
      })
      } // end guard for duplicate listeners

      weatherLayersLoadedRef.current = true
      console.log(`[ChartView] Weather layers loaded: ${stationGeoJSON.features.length} stations, ${timestamps.length} timestamps`)
    } catch (error) {
      console.error('[ChartView] Failed to load weather layers:', error)
    }
  }

  // Load S-57 vector chart layers (vector tiles from Martin)
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

      for (const region of regions) {
        if (!map.current) return

        // Skip if already loaded (check for the single vector tile source)
        const sourceId = `${S57_LAYER_PREFIX}${region.regionId}`
        if (map.current.getSource(sourceId)) {
          console.log(`[ChartView] S-57 region ${region.regionId} already loaded, skipping`)
          continue
        }

        // Create sources and layers from the nautical style (vector tiles)
        const { sources, layers } = createNauticalStyle(region.regionId, region.layers || [], TILE_BASE)

        // Add the single vector tile source
        for (const [sid, sourceConfig] of Object.entries(sources)) {
          if (!map.current.getSource(sid)) {
            map.current.addSource(sid, sourceConfig)
          }
        }

        // Add all layers (missing source-layers in mbtiles are silently ignored by MapLibre)
        for (const layer of layers) {
          map.current.addLayer(layer)
        }

        console.log(`[ChartView] Added ${layers.length} S-57 layers for ${region.regionId} (vector tiles)`)
      }

      // Collect all S-57 layer IDs for queryRenderedFeatures
      const allS57Layers = (map.current.getStyle()?.layers || [])
        .filter(l => l.id.startsWith(S57_LAYER_PREFIX))
        .map(l => l.id)
      s57LayerIdsRef.current = allS57Layers

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
        const tileUrl = `${TILE_BASE}/${region.regionId}/{z}/{x}/{y}`

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

        // Query S-57 features at crosshairs with touch-friendly bounding box
        let nearbyFeatures = []
        if (s57LayerIdsRef.current.length > 0 && s57LayersVisible) {
          const bbox = [
            [currentTouchState.currentX - 20, adjustedY - 20],
            [currentTouchState.currentX + 20, adjustedY + 20]
          ]
          // Only query visible layers
          const visibleLayers = s57LayerIdsRef.current.filter(id => {
            try {
              return map.current.getLayoutProperty(id, 'visibility') !== 'none'
            } catch { return false }
          })
          if (visibleLayers.length > 0) {
            const raw = map.current.queryRenderedFeatures(bbox, { layers: visibleLayers })
            // Deduplicate by FIDN (feature ID number) and extract object class from layer id
            const seen = new Set()
            nearbyFeatures = raw.reduce((acc, f) => {
              const fidn = f.properties?.FIDN
              const key = fidn ? `${fidn}` : `${f.layer.id}-${f.id}`
              if (seen.has(key)) return acc
              seen.add(key)
              // Extract object class from layer id: s57-{regionId}-{layername}-{suffix}
              const layerId = f.layer.id
              const withoutPrefix = layerId.replace(S57_LAYER_PREFIX, '')
              // Remove regionId prefix (everything before first dash after prefix removal)
              const afterRegion = withoutPrefix.replace(/^[^-]+-/, '')
              // Object class is the part before the last dash (fill/outline suffix)
              const objectClass = afterRegion.replace(/-(fill|outline)$/, '').toUpperCase()
              acc.push({ objectClass, properties: f.properties, geometry: f.geometry })
              return acc
            }, [])
            // Filter out DEPARE and DEPCNT as they are area features that would always match
            nearbyFeatures = nearbyFeatures.filter(f => f.objectClass !== 'DEPARE' && f.objectClass !== 'DEPCNT')
          }
        }

        setWaypointMenuPosition({
          screenX: currentTouchState.currentX,
          screenY: adjustedY,
          lat: point.lat,
          lng: point.lng,
          nearbyFeatures
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

  const handleViewFeature = (feature) => {
    setWaypointMenuOpen(false)
    setWaypointMenuPosition(null)
    setSelectedS57Feature(feature)
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
    },
    {
      id: 'satellite',
      name: 'Satellite Imagery',
      description: 'USGS aerial imagery (1-2m)',
      visible: satelliteLayersVisible
    },
    {
      id: 'weather',
      name: 'Weather',
      description: `Wind, tides, currents${weatherRegions.length > 0 ? ` (${weatherRegions.length} regions)` : ''}`,
      visible: weatherLayersVisible
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
    } else if (layerId === 'satellite') {
      setSatelliteLayersVisible(v => !v)
    } else if (layerId === 'weather') {
      setWeatherLayersVisible(v => !v)
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

  // Update satellite layer visibility when state changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (map.current.getLayer('satellite-layer')) {
      map.current.setPaintProperty('satellite-layer', 'raster-opacity', satelliteLayersVisible ? 1.0 : 0)
    }
  }, [satelliteLayersVisible, mapLoaded])

  // Update weather layer visibility
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const vis = weatherLayersVisible ? 'visible' : 'none'
    const weatherLayers = ['weather-stations-circles', 'weather-stations-labels', 'weather-wind-barbs', 'weather-current-arrows']
    for (const layerId of weatherLayers) {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', vis)
      }
    }
  }, [weatherLayersVisible, mapLoaded])

  // Update wind grid when forecast time changes
  useEffect(() => {
    if (!map.current || !activeWeatherRegionId || !weatherTimestamps.length) return
    if (!map.current.getSource('weather-wind-grid')) return

    const timestamp = weatherTimestamps[forecastTimeIndex]
    if (!timestamp) return

    let cancelled = false
    async function updateGrid() {
      const [windData, currentData] = await Promise.all([
        getGridAtTime(activeWeatherRegionId, 'wind', timestamp),
        getGridAtTime(activeWeatherRegionId, 'current', timestamp)
      ])
      if (cancelled) return
      if (windData && map.current?.getSource('weather-wind-grid')) {
        map.current.getSource('weather-wind-grid').setData(windData)
      }
      if (currentData && map.current?.getSource('weather-current-grid')) {
        map.current.getSource('weather-current-grid').setData(currentData)
      }
    }
    updateGrid()
    return () => { cancelled = true }
  }, [forecastTimeIndex, activeWeatherRegionId, weatherTimestamps])

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

      {/* HUD Overlay */}
      {hudVisible && (
        <HudOverlay
          heading={gpsData?.heading}
          speedMs={gpsData?.groundSpeed}
          depthMeters={hudDepth}
          color={hudColor}
        />
      )}

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
          nearbyFeatures={waypointMenuPosition.nearbyFeatures}
          onAddWaypoint={handleAddWaypointFromMenu}
          onMeasureDepth={handleMeasureDepthFromMenu}
          onViewFeature={handleViewFeature}
          onClose={handleWaypointMenuClose}
        />
      )}

      {/* S-57 Feature Detail Card */}
      {selectedS57Feature && (
        <S57FeatureCard
          feature={selectedS57Feature}
          onClose={() => setSelectedS57Feature(null)}
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

      {/* Weather Station Popup */}
      {selectedWeatherStation && activeWeatherRegionId && (
        <WeatherStationPopup
          station={selectedWeatherStation}
          regionId={activeWeatherRegionId}
          forecastTime={weatherTimestamps[forecastTimeIndex]}
          onClose={() => setSelectedWeatherStation(null)}
        />
      )}

      {/* Forecast Time Slider */}
      <ForecastTimeSlider
        timestamps={weatherTimestamps}
        currentIndex={forecastTimeIndex}
        onIndexChange={setForecastTimeIndex}
        visible={weatherLayersVisible && weatherTimestamps.length > 0}
        downloadedAt={weatherDownloadedAt}
      />

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

      {/* Top-left control stack: layers button (top) + sublayer filter (below) */}
      <div className="absolute left-4 top-4 z-20 flex flex-col space-y-2">
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
                  onClick={() => { setHudVisible(v => !v); setMenuOpen(false) }}
                  className="w-full px-4 py-3 text-left hover:bg-terminal-green/10 transition-colors flex items-center space-x-3 text-terminal-green"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                  </svg>
                  <span className="text-sm font-medium">{hudVisible ? 'Hide' : 'Show'} HUD</span>
                </button>
                {/* HUD Color Picker */}
                <div className="px-4 py-3 border-t border-terminal-border">
                  <span className="text-xs text-terminal-green-dim uppercase tracking-wide">HUD Color</span>
                  <div className="flex space-x-2 mt-2">
                    {[
                      { color: '#22c55e', label: 'Green' },
                      { color: '#3b82f6', label: 'Blue' },
                      { color: '#f59e0b', label: 'Amber' },
                      { color: '#ef4444', label: 'Red' },
                      { color: '#ffffff', label: 'White' },
                      { color: '#06b6d4', label: 'Cyan' },
                    ].map(({ color, label }) => (
                      <button
                        key={color}
                        onClick={() => setHudColor(color)}
                        title={label}
                        className="touch-manipulation"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          backgroundColor: color,
                          border: hudColor === color ? '3px solid white' : '2px solid rgba(255,255,255,0.2)',
                          boxShadow: hudColor === color ? `0 0 8px ${color}` : 'none',
                          cursor: 'pointer'
                        }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={clearCacheAndReload}
                  className="w-full px-4 py-3 text-left hover:bg-terminal-green/10 transition-colors flex items-center space-x-3 text-terminal-green border-t border-terminal-border"
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
