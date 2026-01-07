import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getDownloadedTileMetadata, getTileUrl } from '../services/blueTopoTileService'
import { SettingsIcon } from './Icons'

function TopoView() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [tilesLoaded, setTilesLoaded] = useState(false)
  const [tileCount, setTileCount] = useState(0)
  const [error, setError] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Virginia Beach coordinates (same as ChartView)
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

    // Add scale control with nautical units
    map.current.addControl(new maplibregl.ScaleControl({
      maxWidth: 100,
      unit: 'nautical'
    }), 'bottom-right')

    // Add attribution
    map.current.addControl(new maplibregl.AttributionControl({
      customAttribution: 'BlueTopo NOAA | OpenFreeMap'
    }), 'bottom-left')

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
    <div className="relative h-full w-full bg-slate-100 dark:bg-slate-900">
      {/* Map Container */}
      <div
        ref={mapContainer}
        className="h-full w-full"
        style={{ position: 'relative' }}
      />

      {/* Loading Indicator */}
      {(!mapLoaded || !tilesLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-800 z-10">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-marine-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-600 dark:text-slate-300">
              {!mapLoaded ? 'Loading map...' : 'Loading BlueTopo tiles...'}
            </p>
          </div>
        </div>
      )}

      {/* Map Info Overlay */}
      <div className="absolute top-4 left-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-3 max-w-xs z-20 border border-slate-200 dark:border-slate-600">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">BlueTopo Bathymetry</h3>
        <div className="text-sm space-y-1 text-slate-600 dark:text-slate-300">
          <div><strong>Source:</strong> NOAA BlueTopo</div>
          <div><strong>Coverage:</strong> {tileCount} tiles loaded</div>
          <div><strong>Resolution:</strong> 2m - 16m</div>
          {error && (
            <div className="text-red-500 text-xs mt-2">{error}</div>
          )}
          <div className={`inline-flex items-center px-2 py-1 rounded text-xs mt-2 ${
            tilesLoaded && tileCount > 0
              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
              : tilesLoaded && tileCount === 0
              ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
              : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
          }`}>
            {!tilesLoaded ? '● Loading...' : tileCount > 0 ? '● Data Loaded' : '● No Tiles'}
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

      {/* Settings Menu (bottom left) */}
      <div className="absolute bottom-4 left-4 z-20">
        {/* Popup Menu */}
        {menuOpen && (
          <>
            {/* Backdrop to close menu */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />

            {/* Menu Content */}
            <div className="absolute bottom-14 left-0 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-600 overflow-hidden z-40 min-w-[200px]">
              <button
                onClick={clearCacheAndReload}
                className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center space-x-3 text-slate-700 dark:text-slate-200"
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
          className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-3 shadow-lg touch-manipulation transition-colors"
          aria-label="Map settings"
        >
          <SettingsIcon className="w-6 h-6 text-slate-700 dark:text-slate-200" />
        </button>
      </div>
    </div>
  )
}

export default TopoView
