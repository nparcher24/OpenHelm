import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { TopBar, Glass } from '../ui/primitives'

function SatelliteRegionSelector() {
  const location = useLocation()
  const navigate = useNavigate()
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Drawing state
  const [drawMode, setDrawMode] = useState(false)
  const [bounds, setBounds] = useState(null) // [west, south, east, north]
  const drawStartRef = useRef(null)

  // Get any existing bounds passed from settings
  const existingBounds = location.state?.existingBounds || null

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap'
          }
        },
        layers: [{
          id: 'osm',
          type: 'raster',
          source: 'osm'
        }]
      },
      center: [-76.3, 36.9],
      zoom: 6,
      attributionControl: false
    })

    map.current.on('load', () => {
      setMapLoaded(true)

      // Add bounding box layers
      map.current.addSource('bbox', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      map.current.addLayer({
        id: 'bbox-fill',
        type: 'fill',
        source: 'bbox',
        paint: {
          'fill-color': '#00ff88',
          'fill-opacity': 0.15
        }
      })
      map.current.addLayer({
        id: 'bbox-outline',
        type: 'line',
        source: 'bbox',
        paint: {
          'line-color': '#00ff88',
          'line-width': 2
        }
      })

      // If we have existing bounds, display and zoom to them
      if (existingBounds) {
        setBounds(existingBounds)
        updateBboxOnMap(existingBounds)
        map.current.fitBounds(
          [[existingBounds[0], existingBounds[1]], [existingBounds[2], existingBounds[3]]],
          { padding: 80, duration: 0 }
        )
      }
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  function updateBboxOnMap(b) {
    if (!map.current) return
    const source = map.current.getSource('bbox')
    if (!source) return

    if (b) {
      const [w, s, e, n] = b
      source.setData({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
        }
      })
    } else {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }

  // Toggle draw mode
  const toggleDrawMode = useCallback(() => {
    if (!map.current) return

    const newMode = !drawMode
    setDrawMode(newMode)

    if (newMode) {
      map.current.dragPan.disable()
      map.current.scrollZoom.disable()
      map.current.boxZoom.disable()
      map.current.doubleClickZoom.disable()
      map.current.touchZoomRotate.disable()
      map.current.dragRotate.disable()
      map.current.keyboard.disable()
      map.current.touchPitch.disable()
      map.current.getCanvas().style.cursor = 'crosshair'
    } else {
      map.current.dragPan.enable()
      map.current.scrollZoom.enable()
      map.current.boxZoom.enable()
      map.current.doubleClickZoom.enable()
      map.current.touchZoomRotate.enable()
      map.current.dragRotate.enable()
      map.current.keyboard.enable()
      map.current.touchPitch.enable()
      map.current.getCanvas().style.cursor = ''
    }
  }, [drawMode])

  // Drawing handlers
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    function handleDown(e) {
      if (!drawMode) return
      e.preventDefault()
      drawStartRef.current = e.lngLat
    }

    function handleMove(e) {
      if (!drawMode || !drawStartRef.current) return
      e.preventDefault()

      const start = drawStartRef.current
      const end = e.lngLat
      const w = Math.min(start.lng, end.lng)
      const e2 = Math.max(start.lng, end.lng)
      const s = Math.min(start.lat, end.lat)
      const n = Math.max(start.lat, end.lat)

      updateBboxOnMap([w, s, e2, n])
    }

    function handleUp(e) {
      if (!drawMode || !drawStartRef.current) return
      e.preventDefault()

      const start = drawStartRef.current
      const end = e.lngLat
      drawStartRef.current = null

      const w = Math.min(start.lng, end.lng)
      const e2 = Math.max(start.lng, end.lng)
      const s = Math.min(start.lat, end.lat)
      const n = Math.max(start.lat, end.lat)

      // Require minimum area
      if (Math.abs(e2 - w) < 0.01 || Math.abs(n - s) < 0.01) return

      const newBounds = [
        parseFloat(w.toFixed(4)),
        parseFloat(s.toFixed(4)),
        parseFloat(e2.toFixed(4)),
        parseFloat(n.toFixed(4))
      ]
      setBounds(newBounds)
      updateBboxOnMap(newBounds)

      // Exit draw mode
      setDrawMode(false)
      map.current.dragPan.enable()
      map.current.scrollZoom.enable()
      map.current.boxZoom.enable()
      map.current.doubleClickZoom.enable()
      map.current.touchZoomRotate.enable()
      map.current.dragRotate.enable()
      map.current.keyboard.enable()
      map.current.touchPitch.enable()
      map.current.getCanvas().style.cursor = ''
    }

    map.current.on('mousedown', handleDown)
    map.current.on('mousemove', handleMove)
    map.current.on('mouseup', handleUp)
    map.current.on('touchstart', handleDown)
    map.current.on('touchmove', handleMove)
    map.current.on('touchend', handleUp)

    return () => {
      if (!map.current) return
      map.current.off('mousedown', handleDown)
      map.current.off('mousemove', handleMove)
      map.current.off('mouseup', handleUp)
      map.current.off('touchstart', handleDown)
      map.current.off('touchmove', handleMove)
      map.current.off('touchend', handleUp)
    }
  }, [drawMode, mapLoaded])

  // Confirm selection and navigate back
  function handleConfirm() {
    const returnTo = location.state?.returnTo || '/settings?section=satellite'
    navigate(returnTo, {
      state: { satelliteBounds: bounds }
    })
  }

  // Go back without selecting
  function handleBack() {
    const returnTo = location.state?.returnTo || '/settings?section=satellite'
    navigate(returnTo)
  }

  return (
    <div className="h-screen w-screen relative" style={{ background: 'var(--bg)', color: 'var(--fg1)' }}>
      <TopBar title="Satellite region" />
      {/* Full-screen map */}
      <div ref={mapContainer} className="absolute inset-0" style={{ top: 114 }} />

      {/* Back Button */}
      <button
        onClick={handleBack}
        className="absolute z-30 rounded-2xl touch-manipulation"
        style={{ top: 130, left: 20, padding: 16, background: 'var(--bg-elev)', border: '0.5px solid var(--bg-hairline-strong)' }}
        title="Back"
      >
        <svg style={{ color: 'var(--fg1)', width: 32, height: 32 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>

      {/* Controls overlay */}
      <div className="absolute z-30 flex flex-col gap-3" style={{ top: 130, right: 20 }}>
        {/* Draw mode button */}
        <button
          onClick={toggleDrawMode}
          className="rounded-xl font-semibold transition-all touch-manipulation"
          style={drawMode
            ? { background: 'rgba(47,181,107,0.15)', border: '0.5px solid var(--signal)', color: 'var(--signal)', padding: '16px 22px', fontSize: 18, minHeight: 56 }
            : { background: 'var(--bg-elev)', border: '0.5px solid var(--bg-hairline-strong)', color: 'var(--fg2)', padding: '16px 22px', fontSize: 18, minHeight: 56 }
          }
        >
          {drawMode ? 'Drawing... (drag to select)' : 'Draw Region'}
        </button>

        {/* Clear selection */}
        {bounds && !drawMode && (
          <button
            onClick={() => { setBounds(null); updateBboxOnMap(null) }}
            className="rounded-xl transition-all touch-manipulation"
            style={{ background: 'var(--bg-elev)', border: '0.5px solid var(--bg-hairline-strong)', color: 'var(--fg2)', padding: '16px 22px', fontSize: 18, minHeight: 56 }}
          >
            Clear Selection
          </button>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 backdrop-blur" style={{ background: 'var(--bg-chrome)', borderTop: '0.5px solid var(--bg-hairline)', padding: '16px 20px' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            {bounds ? (
              <div className="font-mono" style={{ color: 'var(--fg1)', fontSize: 17 }}>
                {bounds[0].toFixed(4)}°W, {bounds[1].toFixed(4)}°S → {bounds[2].toFixed(4)}°E, {bounds[3].toFixed(4)}°N
              </div>
            ) : (
              <div style={{ color: 'var(--fg2)', fontSize: 17 }}>
                {drawMode
                  ? 'Click/touch and drag to draw a rectangle'
                  : 'Tap "Draw Region" then drag to select an area'}
              </div>
            )}
          </div>

          {bounds && (
            <button
              onClick={handleConfirm}
              className="rounded-xl font-semibold transition-all touch-manipulation"
              style={{ background: 'var(--signal)', color: '#fff', padding: '16px 28px', fontSize: 18, minHeight: 56 }}
            >
              Use This Region
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SatelliteRegionSelector
