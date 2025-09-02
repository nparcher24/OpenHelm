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
    <div className="relative h-full w-full bg-slate-100 dark:bg-slate-900">
      {/* Map Container */}
      <div 
        ref={mapContainer}
        className="h-full w-full"
        style={{ position: 'relative' }}
      />
      
      {/* Loading Indicator */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-800 z-10">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-marine-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-600 dark:text-slate-300">Loading nautical chart...</p>
          </div>
        </div>
      )}

      {/* Map Info Overlay */}
      <div className="absolute top-4 left-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-3 max-w-xs z-20 border border-slate-200 dark:border-slate-600">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Chart Information</h3>
        <div className="text-sm space-y-1 text-slate-600 dark:text-slate-300">
          <div><strong>Area:</strong> Virginia Beach, VA</div>
          <div><strong>Coverage:</strong> VA, NC, MD</div>
          <div><strong>Source:</strong> OpenStreetMap</div>
          <div className={`inline-flex items-center px-2 py-1 rounded text-xs ${
            mapLoaded 
              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
              : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
          }`}>
            {mapLoaded ? '● Connected' : '● Loading...'}
          </div>
        </div>
      </div>

      {/* Touch-friendly zoom controls for marine use */}
      <div className="absolute bottom-20 right-4 flex flex-col space-y-2 z-20">
        <button
          onClick={() => map.current?.zoomIn()}
          className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-3 shadow-lg touch-manipulation transition-colors"
          aria-label="Zoom in"
        >
          <svg className="w-6 h-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
        <button
          onClick={() => map.current?.zoomOut()}
          className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-3 shadow-lg touch-manipulation transition-colors"
          aria-label="Zoom out"
        >
          <svg className="w-6 h-6 text-slate-700 dark:text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default ChartView