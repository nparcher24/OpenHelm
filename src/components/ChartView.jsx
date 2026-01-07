import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

function ChartView() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [currentZoom, setCurrentZoom] = useState(10)
  const [debugInfo, setDebugInfo] = useState({
    sources: [],
    layers: [],
    tilesLoading: 0,
    lastTileEvent: '',
    center: [-75.978, 36.853]
  })
  const [showDebug, setShowDebug] = useState(true)

  // Virginia Beach coordinates
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
      bearing: 0
    })

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    // Add scale control
    map.current.addControl(new maplibregl.ScaleControl({
      maxWidth: 100,
      unit: 'nautical'
    }), 'bottom-right')

    // Add attribution with proper styling
    map.current.addControl(new maplibregl.AttributionControl({
      customAttribution: 'CUSP NOAA NGS Coastline'
    }), 'bottom-left')

    map.current.on('load', () => {
      setMapLoaded(true)

      // Get initial debug info
      updateDebugInfo()

      // Add Virginia Beach marker
      const marker = new maplibregl.Marker({
        color: '#0ea5e9'
      })
        .setLngLat(center)
        .setPopup(new maplibregl.Popup().setHTML('<strong>Virginia Beach, VA</strong><br>Marine Navigation Area'))
        .addTo(map.current)
    })

    // Track zoom level changes
    map.current.on('zoom', () => {
      setCurrentZoom(map.current.getZoom().toFixed(1))
      updateDebugInfo()
    })

    // Track move events
    map.current.on('moveend', () => {
      updateDebugInfo()
    })

    // Track tile loading
    map.current.on('dataloading', (e) => {
      if (e.dataType === 'source') {
        setDebugInfo(prev => ({
          ...prev,
          tilesLoading: prev.tilesLoading + 1,
          lastTileEvent: `Loading: ${e.sourceId}`
        }))
      }
    })

    map.current.on('data', (e) => {
      if (e.dataType === 'source' && e.isSourceLoaded) {
        setDebugInfo(prev => ({
          ...prev,
          tilesLoading: Math.max(0, prev.tilesLoading - 1),
          lastTileEvent: `Loaded: ${e.sourceId}`
        }))
        updateDebugInfo()
      }
    })

    map.current.on('error', (e) => {
      console.error('Map error:', e)
      setDebugInfo(prev => ({
        ...prev,
        lastTileEvent: `ERROR: ${e.error?.message || 'Unknown error'}`
      }))
    })

    function updateDebugInfo() {
      if (!map.current) return

      const style = map.current.getStyle()
      if (!style) return

      // Get sources info
      const sources = Object.entries(style.sources || {}).map(([id, source]) => {
        const isLoaded = map.current.isSourceLoaded(id)
        return {
          id,
          type: source.type,
          minzoom: source.minzoom || 0,
          maxzoom: source.maxzoom || 22,
          loaded: isLoaded
        }
      })

      // Get layers info with visibility
      const currentZoom = map.current.getZoom()
      const layers = (style.layers || [])
        .filter(l => l.source) // Only layers with sources
        .map(layer => {
          const minzoom = layer.minzoom || 0
          const maxzoom = layer.maxzoom || 24
          const inZoomRange = currentZoom >= minzoom && currentZoom < maxzoom
          const visibility = map.current.getLayoutProperty(layer.id, 'visibility')
          return {
            id: layer.id,
            source: layer.source,
            type: layer.type,
            minzoom,
            maxzoom,
            inZoomRange,
            visible: visibility !== 'none' && inZoomRange
          }
        })

      const mapCenter = map.current.getCenter()

      setDebugInfo(prev => ({
        ...prev,
        sources,
        layers,
        center: [mapCenter.lng.toFixed(3), mapCenter.lat.toFixed(3)]
      }))
    }

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  return (
    <div className="relative h-full w-full bg-terminal-bg">
      {/* Map Container */}
      <div
        ref={mapContainer}
        className="h-full w-full"
        style={{ position: 'relative' }}
      />

      {/* Loading Indicator */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-terminal-green border-t-transparent rounded-full animate-spin mx-auto shadow-glow-green"></div>
            <p className="text-terminal-green-dim">Loading nautical chart...</p>
          </div>
        </div>
      )}

      {/* Map Info Overlay */}
      <div className="absolute top-4 left-4 bg-terminal-surface rounded-lg shadow-glow-green-sm p-3 max-w-xs z-20 border border-terminal-border">
        <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide text-sm">Chart Information</h3>
        <div className="text-sm space-y-1 text-terminal-green-dim font-mono">
          <div><span className="text-terminal-green">Area:</span> {parseFloat(currentZoom) < 9 ? 'CONUS' : 'Chesapeake Bay'}</div>
          <div><span className="text-terminal-green">Zoom:</span> {currentZoom} <span className="text-terminal-green-dim">(max: 16)</span></div>
          <div><span className="text-terminal-green">Source:</span> GSHHS Full Res</div>
          <div className={`inline-flex items-center px-2 py-1 rounded text-xs mt-2 ${
            mapLoaded
              ? 'bg-terminal-green/10 text-terminal-green border border-terminal-green/30'
              : 'bg-terminal-amber/10 text-terminal-amber border border-terminal-amber/30'
          }`}>
            {mapLoaded ? '[OK] Connected' : '[..] Loading...'}
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="absolute top-4 right-16 bg-terminal-surface/95 rounded-lg shadow-glow-green-sm p-3 z-20 border border-terminal-border max-w-md max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-terminal-amber uppercase tracking-wide text-sm">Debug Info</h3>
            <button
              onClick={() => setShowDebug(false)}
              className="text-terminal-green-dim hover:text-terminal-green text-xs"
            >
              [X]
            </button>
          </div>

          <div className="text-xs font-mono space-y-3">
            {/* Zoom & Position */}
            <div className="border-b border-terminal-border pb-2">
              <div className="text-terminal-amber mb-1">Position:</div>
              <div className="text-terminal-green-dim">
                <div>Zoom: <span className="text-terminal-green">{currentZoom}</span></div>
                <div>Center: <span className="text-terminal-green">{debugInfo.center[0]}, {debugInfo.center[1]}</span></div>
                <div>Tiles Loading: <span className={debugInfo.tilesLoading > 0 ? 'text-terminal-amber' : 'text-terminal-green'}>{debugInfo.tilesLoading}</span></div>
                <div>Last Event: <span className="text-terminal-green">{debugInfo.lastTileEvent || 'none'}</span></div>
              </div>
            </div>

            {/* Sources */}
            <div className="border-b border-terminal-border pb-2">
              <div className="text-terminal-amber mb-1">Sources ({debugInfo.sources.length}):</div>
              {debugInfo.sources.map(src => (
                <div key={src.id} className="text-terminal-green-dim ml-2">
                  <span className={src.loaded ? 'text-terminal-green' : 'text-terminal-amber'}>
                    {src.loaded ? '[OK]' : '[..]'}
                  </span>
                  {' '}<span className="text-terminal-green">{src.id}</span>
                  <span className="text-terminal-green-dim"> z{src.minzoom}-{src.maxzoom}</span>
                </div>
              ))}
            </div>

            {/* Layers */}
            <div>
              <div className="text-terminal-amber mb-1">Layers ({debugInfo.layers.length}):</div>
              {debugInfo.layers.map(layer => (
                <div key={layer.id} className="text-terminal-green-dim ml-2 flex items-center gap-1">
                  <span className={layer.visible ? 'text-terminal-green' : 'text-red-500'}>
                    {layer.visible ? '[ON]' : '[OFF]'}
                  </span>
                  <span className={layer.inZoomRange ? 'text-terminal-green' : 'text-terminal-green-dim'}>
                    {layer.id}
                  </span>
                  <span className="text-terminal-green-dim text-[10px]">
                    (z{layer.minzoom}-{layer.maxzoom})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Show Debug Button (when hidden) */}
      {!showDebug && (
        <button
          onClick={() => setShowDebug(true)}
          className="absolute top-4 right-16 bg-terminal-surface hover:bg-terminal-green/10 border border-terminal-border rounded-lg px-2 py-1 z-20 text-terminal-amber text-xs font-mono"
        >
          [DEBUG]
        </button>
      )}

      {/* Touch-friendly zoom controls for marine use */}
      <div className="absolute bottom-20 right-4 flex flex-col space-y-2 z-20">
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
    </div>
  )
}

export default ChartView
