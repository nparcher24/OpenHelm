import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

function ChartView() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Virginia Beach coordinates
  const center = [-75.978, 36.853]
  const zoom = 10

  useEffect(() => {
    if (map.current) return // Initialize map only once

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
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
      customAttribution: 'OpenFreeMap © OpenMapTiles © OpenStreetMap'
    }), 'bottom-left')

    map.current.on('load', () => {
      setMapLoaded(true)
      
      // Add Virginia Beach marker
      const marker = new maplibregl.Marker({
        color: '#0ea5e9'
      })
        .setLngLat(center)
        .setPopup(new maplibregl.Popup().setHTML('<strong>Virginia Beach, VA</strong><br>Marine Navigation Area'))
        .addTo(map.current)
    })

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
          <div><span className="text-terminal-green">Area:</span> Virginia Beach, VA</div>
          <div><span className="text-terminal-green">Coverage:</span> VA, NC, MD</div>
          <div><span className="text-terminal-green">Source:</span> OpenStreetMap</div>
          <div className={`inline-flex items-center px-2 py-1 rounded text-xs mt-2 ${
            mapLoaded
              ? 'bg-terminal-green/10 text-terminal-green border border-terminal-green/30'
              : 'bg-terminal-amber/10 text-terminal-amber border border-terminal-amber/30'
          }`}>
            {mapLoaded ? '[OK] Connected' : '[..] Loading...'}
          </div>
        </div>
      </div>

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