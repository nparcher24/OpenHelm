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
import { getLatestDrift } from '../services/driftService'
import { computeDriftCorrected } from '../utils/driftCalc'
import { getWeatherRegions, getRegionData, getTimestamps, getGridAtTime, buildStationGeoJSON } from '../services/weatherDataService'
import ForecastTimeSlider from './ForecastTimeSlider'
import WeatherStationPopup from './WeatherStationPopup'
import { createHeadingLineSVGString } from '../utils/headingLine'
import DepthCrosshairs from './DepthCrosshairs'
import DepthInfoCard from './DepthInfoCard'
import WaypointMenu from './WaypointMenu'
import WaypointEditModal from './WaypointEditModal'
import { S57_SUBLAYER_GROUPS } from './S57SubLayerMenu'
import S57FeatureCard from './S57FeatureCard'
import { createMarkerSVG } from '../utils/waypointIcons'
import useVesselData from '../hooks/useVesselData'
import {
  ChartTopBar,
  CompassRose,
  FollowControls,
  ScaleBar,
  ChartZoomStack,
} from './chart'

// Boat marker + heading-line accent. CSS vars resolve inside SVG attributes
// in modern Chromium, so they cascade through theme changes automatically.
const ACCENT_FIX    = 'var(--signal)'
const ACCENT_NO_FIX = 'var(--tint-red)'

// Apple-Maps-style vessel marker: pointed kite silhouette with a soft radial
// halo and a subtle bow gloss. Re-rendered on fix-state change so gradient
// stops adopt the current accent color.
function buildBoatMarkerSVG(color) {
  return `
    <svg width="60" height="60" viewBox="0 0 60 60" style="overflow:visible; display:block;">
      <defs>
        <radialGradient id="bm-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="${color}" stop-opacity="0.34"/>
          <stop offset="55%" stop-color="${color}" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="bm-gloss" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stop-color="rgba(255,255,255,0.55)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#bm-halo)"/>
      <path d="M30 16 L38.5 38.5 L30 34 L21.5 38.5 Z"
            fill="${color}"
            stroke="rgba(0,0,0,0.42)" stroke-width="0.6" stroke-linejoin="round"/>
      <path d="M30 18.5 L34 28.5 L30 27 L26 28.5 Z" fill="url(#bm-gloss)"/>
      <circle cx="30" cy="29.5" r="1.4" fill="rgba(255,255,255,0.92)"/>
    </svg>
  `
}

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

  // Top-bar Depth metric source:
  //   1) NMEA 2000 water depth (PGN 128267) when a real bus is connected.
  //   2) BlueTopo bathymetry sampled at the vessel's GPS position.
  //   3) `null` (renders as `—`) when neither is available — e.g. on land or
  //      outside downloaded BlueTopo coverage.
  const { vesselData } = useVesselData()
  const [vesselBlueTopoDepthFt, setVesselBlueTopoDepthFt] = useState(null)

  // GPS tracking state
  // trackingMode: null = not tracking, 'center' = boat centered, 'offset' = boat 1/4 from bottom
  const [trackingMode, setTrackingMode] = useState('center')  // Start tracking by default
  // 'north' = north up, 'heading' = bow up, 'track' = ground-track (COG) up
  const [orientationMode, setOrientationMode] = useState('heading')
  const initialGpsCenterDone = useRef(false)  // Track if we've done initial GPS center
  const [gpsData, setGpsData] = useState(null)
  const boatMarkerRef = useRef(null)
  const headingLineRef = useRef(null)
  const trackingModeRef = useRef(null)
  const orientationModeRef = useRef('heading')
  const bearingFrozenRef = useRef(false)  // True when bearing is frozen after pan decouple

  // Waypoint state
  const [waypoints, setWaypoints] = useState([])
  const [waypointMenuOpen, setWaypointMenuOpen] = useState(false)
  const [waypointMenuPosition, setWaypointMenuPosition] = useState(null)
  const [waypointDropdownOpen, setWaypointDropdownOpen] = useState(false)
  const [waypointEditModalOpen, setWaypointEditModalOpen] = useState(false)
  const [waypointEditPosition, setWaypointEditPosition] = useState(null)
  // Latest drift calibration (from /api/drift/latest) and the per-waypoint
  // drift-corrected hold positions we derive from it.
  const [latestDrift, setLatestDrift] = useState(null)
  const [waypointDriftCorrections, setWaypointDriftCorrections] = useState({})
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

  // HUD was removed in the design restyle; Speed/Depth/HDG now live in ChartTopBar.

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
    orientationModeRef.current = orientationMode
  }, [orientationMode])

  // Compute the desired map bearing for the current orientation mode.
  // Track-up uses COG, falling back to heading when COG is unavailable
  // (e.g. boat is stopped or COG hasn't been reported yet).
  const bearingForMode = useCallback((mode, gps) => {
    if (mode === 'north') return 0
    if (mode === 'track') return gps?.cog ?? gps?.heading ?? 0
    return gps?.heading ?? 0
  }, [])

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

  // BlueTopo depth at the vessel's GPS position — fallback for the top-bar
  // Depth metric when NMEA 2000 sounder data isn't available. Throttled by
  // rounding the position to ~11 m (4 decimal places) so the effect doesn't
  // refire on every GPS jitter, and skipped entirely when a real NMEA bus is
  // already supplying depth.
  const nmeaDepthLive =
    vesselData?.isConnected && !vesselData?.isDemoMode && vesselData?.waterDepth != null
      ? vesselData.waterDepth
      : null
  const vlat = gpsData?.latitude
  const vlng = gpsData?.longitude
  const vlatKey = vlat != null ? Math.round(vlat * 1e4) / 1e4 : null
  const vlngKey = vlng != null ? Math.round(vlng * 1e4) / 1e4 : null
  useEffect(() => {
    if (nmeaDepthLive != null) {
      setVesselBlueTopoDepthFt(null)
      return
    }
    // Inline GPS-fix validation; the shared helpers (`isValidCoordinate`,
    // `hasGpsFix`) are defined further down in this component.
    const validCoord =
      typeof vlat === 'number' && typeof vlng === 'number' &&
      !Number.isNaN(vlat) && !Number.isNaN(vlng) &&
      vlat >= -90 && vlat <= 90 && vlng >= -180 && vlng <= 180
    const hasFix = !(vlat === 0 && vlng === 0)
    if (!validCoord || !hasFix) {
      setVesselBlueTopoDepthFt(null)
      return
    }
    let cancelled = false
    const timeoutId = setTimeout(async () => {
      try {
        const result = await getDepthAtLocation(vlng, vlat)
        if (cancelled) return
        // depthQueryService returns elevation in meters: negative below sea
        // level, ≥ 0 means on land / out of water → leave the metric blank.
        if (!result?.success || result.depth == null || result.depth >= 0) {
          setVesselBlueTopoDepthFt(null)
          return
        }
        setVesselBlueTopoDepthFt(Math.round(-result.depth * 3.28084 * 10) / 10)
      } catch {
        if (!cancelled) setVesselBlueTopoDepthFt(null)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timeoutId) }
  }, [nmeaDepthLive, vlatKey, vlngKey])

  const topBarDepthFt = nmeaDepthLive ?? vesselBlueTopoDepthFt

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

    // Fly to GPS position at default zoom with the orientation-appropriate bearing
    map.current.flyTo({
      center: [centerLng, centerLat],
      zoom: defaultZoom,
      bearing: bearingForMode(orientationMode, gpsData),
      duration: 1000
    })
  }, [mapLoaded, gpsData, orientationMode, bearingForMode])

  // Load waypoints when map is ready
  const loadWaypoints = async () => {
    try {
      const result = await getAllWaypoints()
      setWaypoints(result.waypoints || [])
    } catch (err) {
      console.error('Failed to load waypoints:', err)
    }
  }

  // Fetch the most recent drift calibration from the API. Called on mount
  // and whenever the user opens the dropdown or the Add Waypoint modal so
  // that a just-measured drift shows up without a full reload.
  const refreshLatestDrift = useCallback(async () => {
    try {
      const res = await getLatestDrift()
      setLatestDrift(res?.drift || null)
    } catch (err) {
      console.error('Failed to load latest drift:', err)
    }
  }, [])

  useEffect(() => {
    if (!mapLoaded) return
    loadWaypoints()
    refreshLatestDrift()
  }, [mapLoaded, refreshLatestDrift])

  // Pull latest drift whenever the dropdown or modal opens so the user
  // always sees the newest calibration.
  useEffect(() => {
    if (waypointDropdownOpen || waypointEditModalOpen) {
      refreshLatestDrift()
    }
  }, [waypointDropdownOpen, waypointEditModalOpen, refreshLatestDrift])

  // Pre-compute drift-corrected positions for every saved waypoint. Depth
  // lookups are fired in parallel via Promise.all to avoid a waterfall.
  useEffect(() => {
    // Fast path: no drift calibrated or no waypoints → clear corrections.
    if (!latestDrift || !waypoints || waypoints.length === 0) {
      setWaypointDriftCorrections({})
      return
    }
    // Normalize drift fields (API returns snake_case).
    const drift = {
      driftSpeedMps:
        latestDrift.driftSpeedMps ?? latestDrift.drift_speed_mps ?? 0,
      driftBearingDeg:
        latestDrift.driftBearingDeg ?? latestDrift.drift_bearing_deg ?? 0
    }

    let cancelled = false
    const computeAll = async () => {
      const results = await Promise.all(
        waypoints.map(async (wp) => {
          let depthM = null
          try {
            // getDepthAtLocation arg order is (lon, lat).
            const d = await getDepthAtLocation(wp.longitude, wp.latitude)
            if (d?.success && typeof d.depth === 'number' && d.depth > 0) {
              depthM = d.depth
            }
          } catch {
            // Fall through with depthM = null → computeDriftCorrected uses default.
          }
          const corrected = computeDriftCorrected(
            wp.latitude,
            wp.longitude,
            depthM,
            drift
          )
          return [wp.id, corrected]
        })
      )
      if (cancelled) return
      const corrections = {}
      for (const [id, corrected] of results) {
        if (corrected) corrections[id] = corrected
      }
      setWaypointDriftCorrections(corrections)
    }
    computeAll()

    return () => {
      cancelled = true
    }
  }, [waypoints, latestDrift])

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
    const accent = fix ? ACCENT_FIX : ACCENT_NO_FIX
    headingLineRef.current.innerHTML = createHeadingLineSVGString(map.current, displayLat, accent, gpsData?.heading, gpsData?.cog)
  }, [gpsData])

  useEffect(() => {
    if (!mapLoaded || !map.current) return

    const hasGps = gpsData && isValidCoordinate(gpsData.latitude, gpsData.longitude)
    const fix = hasGps && hasGpsFix(gpsData.latitude, gpsData.longitude)
    const displayLat = fix ? gpsData.latitude : DEFAULT_NO_FIX_POSITION.latitude
    const displayLng = fix ? gpsData.longitude : DEFAULT_NO_FIX_POSITION.longitude
    const accent = fix ? ACCENT_FIX : ACCENT_NO_FIX

    // Create or update marker
    if (!boatMarkerRef.current) {
      // Wrapper — small bounding box centered on the GPS point. The vessel SVG
      // and heading line are absolutely positioned siblings that share the
      // wrapper's center as their anchor. overflow:visible lets the halo and
      // heading line extend past the wrapper.
      const el = document.createElement('div')
      el.className = 'boat-marker'
      el.style.cssText = 'width:24px; height:24px; position:relative; overflow:visible; pointer-events:none;'

      // Heading line container — anchored to the center of the wrapper (GPS position)
      const lineContainer = document.createElement('div')
      lineContainer.className = 'heading-line-container'
      lineContainer.style.cssText = 'position:absolute; bottom:50%; left:50%; transform:translateX(-50%); pointer-events:none; overflow:visible;'
      headingLineRef.current = lineContainer
      el.appendChild(lineContainer)

      // Vessel: 60×60 SVG centered on the wrapper center via top/left + transform.
      const boatSvg = document.createElement('div')
      boatSvg.className = 'boat-icon'
      boatSvg.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); pointer-events:none;'
      boatSvg.innerHTML = buildBoatMarkerSVG(accent)
      el.appendChild(boatSvg)

      // Initial heading line render
      lineContainer.innerHTML = createHeadingLineSVGString(map.current, displayLat, accent, gpsData?.heading, gpsData?.cog)

      boatMarkerRef.current = new maplibregl.Marker({
        element: el,
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      })
        .setLngLat([displayLng, displayLat])
        .addTo(map.current)
    } else {
      boatMarkerRef.current.setLngLat([displayLng, displayLat])
      const boatIcon = boatMarkerRef.current.getElement().querySelector('.boat-icon')
      if (boatIcon) boatIcon.innerHTML = buildBoatMarkerSVG(accent)
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

  // Update map bearing when orientation mode changes (only when NOT tracking - tracking handles its own bearing)
  useEffect(() => {
    if (!map.current || !mapLoaded || trackingMode) return

    if (orientationMode === 'north') {
      // Bearing frozen by pan decouple - don't snap to 0, just leave map as-is
      if (bearingFrozenRef.current) return
      map.current.easeTo({ bearing: 0, duration: 200 })
      return
    }

    // Heading-up / track-up: slave bearing to live source
    bearingFrozenRef.current = false
    map.current.easeTo({
      bearing: bearingForMode(orientationMode, gpsData),
      duration: 200
    })
  }, [orientationMode, gpsData?.heading, gpsData?.cog, mapLoaded, trackingMode, bearingForMode])

  // Tracking mode - follow boat position with bearing rotation
  // Only depends on position + heading fields, not entire gpsData object
  useEffect(() => {
    if (!trackingMode || !gpsData || !map.current) return
    if (!isValidCoordinate(gpsData.latitude, gpsData.longitude)) return

    const fix = hasGpsFix(gpsData.latitude, gpsData.longitude)
    const trackLat = fix ? gpsData.latitude : DEFAULT_NO_FIX_POSITION.latitude
    const trackLng = fix ? gpsData.longitude : DEFAULT_NO_FIX_POSITION.longitude
    const mapHeight = map.current.getContainer().clientHeight
    const bearing = bearingForMode(orientationMode, gpsData)

    if (trackingMode === 'center') {
      // Mode 1: Boat centered in middle of screen
      map.current.easeTo({
        center: [trackLng, trackLat],
        bearing: bearing,
        padding: { bottom: 0, top: 0, left: 0, right: 0 },
        duration: 200  // Match 5 Hz update interval for smooth motion
      })
    } else if (trackingMode === 'offset') {
      // Mode 2: Boat 1/4 from bottom, centered laterally — see more chart ahead.
      // Top padding T pushes the visual center to (height + T) / 2 from the top.
      // For boat at y = 3h/4, solve T = h/2.
      map.current.easeTo({
        center: [trackLng, trackLat],
        bearing: bearing,
        padding: { top: mapHeight / 2, bottom: 0, left: 0, right: 0 },
        duration: 200  // Match 5 Hz update interval for smooth motion
      })
    }
  }, [trackingMode, gpsData?.latitude, gpsData?.longitude, gpsData?.heading, gpsData?.cog, orientationMode, bearingForMode])

  // Decouple from tracking on user pan
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const handleMoveStart = (e) => {
      // Only decouple if user-initiated (has originalEvent)
      if (e.originalEvent) {
        if (trackingModeRef.current) {
          setTrackingMode(null)
        }
        // Also exit any orientation lock (heading/track), freezing the current bearing
        if (orientationModeRef.current !== 'north') {
          bearingFrozenRef.current = true
          setOrientationMode('north')
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
  // Cycle: north → heading → track → north
  const handleCycleOrientation = useCallback(() => {
    bearingFrozenRef.current = false  // Manual cycle always resets frozen state
    setOrientationMode(m => (m === 'north' ? 'heading' : m === 'heading' ? 'track' : 'north'))
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
    <div className="relative h-full w-full" style={{ background: 'var(--bg)' }}>
      {/* Map Container — inset top to clear the 114px top bar */}
      <div
        ref={mapContainer}
        style={{
          position: 'absolute',
          top: 114,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--bg)',
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
          latestDrift={latestDrift}
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

      {/* NEW CHROME: Top bar */}
      <ChartTopBar
        speed={gpsData?.speed}
        depth={topBarDepthFt}
        heading={gpsData?.heading}
        waypoints={waypoints}
        onSelectWaypoint={(w) => {
          if (!map.current || w?.latitude == null || w?.longitude == null) return
          map.current.flyTo({ center: [w.longitude, w.latitude], zoom: Math.max(map.current.getZoom(), 14), duration: 1000 })
        }}
        onAddWaypoint={() => {
          const c = map.current?.getCenter?.()
          if (!c) return
          setWaypointEditPosition({ lat: c.lat, lng: c.lng })
          setWaypointEditModalOpen(true)
        }}
        layers={{
          bluetopo: topoLayersVisible,
          enc:      encLayersVisible,
          s57:      s57LayersVisible,
          satellite: satelliteLayersVisible,
          weather:  weatherLayersVisible,
        }}
        onLayerChange={(id, v) => {
          if (id === 'bluetopo') setTopoLayersVisible(v)
          else if (id === 'enc') setEncLayersVisible(v)
          else if (id === 's57') setS57LayersVisible(v)
          else if (id === 'satellite') setSatelliteLayersVisible(v)
          else if (id === 'weather') setWeatherLayersVisible(v)
        }}
        onWaypointsOpenChange={setWaypointDropdownOpen}
        s57FilterVisible={s57LayersVisible && s57RegionCount > 0}
        s57SubLayerVisibility={s57SubLayerVisibility}
        onToggleSublayer={handleToggleSublayer}
        onToggleGroup={handleToggleGroup}
      />

      {/* RIGHT: compass + zoom */}
      <div style={{
        position: 'absolute', top: 88, right: 14, zIndex: 5,
        display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end',
      }}>
        <CompassRose
          heading={orientationMode === 'track' ? (gpsData?.cog ?? gpsData?.heading ?? 0) : (gpsData?.heading ?? 0)}
          headingUp={orientationMode !== 'north'}
          size={96}
        />
        <ChartZoomStack
          onZoomIn={() => map.current?.zoomIn()}
          onZoomOut={() => map.current?.zoomOut()}
        />
      </div>

      {/* BOTTOM-LEFT: follow + orientation pills */}
      <FollowControls
        trackingMode={trackingMode}
        onCycleTrackingMode={handleCycleTrackingMode}
        orientationMode={orientationMode}
        onCycleOrientation={handleCycleOrientation}
      />

      {/* BOTTOM-RIGHT: scale bar */}
      <div style={{ position: 'absolute', bottom: 16, right: 14, zIndex: 5 }}>
        <ScaleBar/>
      </div>

      {/* Loading overlay */}
      {(!mapLoaded || !tilesLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center z-10"
             style={{ background: 'var(--bg)' }}>
          <div className="text-center space-y-4">
            <div style={{
              width: 32, height: 32,
              border: '3px solid var(--signal-soft)',
              borderTopColor: 'var(--signal)',
              borderRadius: '50%', margin: '0 auto',
              animation: 'oh-spin 900ms linear infinite',
            }}/>
            <p style={{ color: 'var(--fg2)' }}>
              {!mapLoaded ? 'Loading map…' : 'Loading chart data…'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChartView
