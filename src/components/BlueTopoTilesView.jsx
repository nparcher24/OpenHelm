import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

function BlueTopoTilesView() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [tiles, setTiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTile, setSelectedTile] = useState(null)
  const [stats, setStats] = useState({ total: 0, resolutions: {} })

  // Center on continental US (covers most of the BlueTopo coverage)
  const center = [-95, 37]
  const zoom = 4

  // Load tiles from CSV
  useEffect(() => {
    fetch('/bluetopo_tiles_global.csv')
      .then(response => response.text())
      .then(csvText => {
        // Split by newlines (handle both \n and \r\n)
        const lines = csvText.split(/\r?\n/).filter(line => line.trim())

        const parsedTiles = lines.slice(1).map(line => {
          // Split by comma
          const parts = line.split(',').map(p => p.trim())

          // CSV format: tile,url,resolution,utm,date,minx,miny,maxx,maxy
          // Date field contains spaces like "2025-02-26 14:27:54"
          return {
            tile: parts[0],
            url: parts[1],
            resolution: parts[2] || 'Unknown',
            utm: parts[3],
            date: parts[4],
            minx: parseFloat(parts[5]),
            miny: parseFloat(parts[6]),
            maxx: parseFloat(parts[7]),
            maxy: parseFloat(parts[8])
          }
        }).filter(tile => {
          // Filter out tiles with invalid coordinates
          const valid = !isNaN(tile.minx) && !isNaN(tile.miny) &&
                        !isNaN(tile.maxx) && !isNaN(tile.maxy)
          if (!valid) {
            console.warn('Invalid tile coordinates:', tile)
          }
          return valid
        })

        console.log('Loaded tiles:', parsedTiles.length)
        if (parsedTiles.length > 0) {
          console.log('Sample tile:', parsedTiles[0])
        }

        setTiles(parsedTiles)

        // Calculate stats
        const resolutions = {}
        parsedTiles.forEach(tile => {
          resolutions[tile.resolution] = (resolutions[tile.resolution] || 0) + 1
        })
        setStats({ total: parsedTiles.length, resolutions })
        setLoading(false)
      })
      .catch(error => {
        console.error('Error loading tiles:', error)
        setLoading(false)
      })
  }, [])

  // Initialize map
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

    map.current.on('load', () => {
      setMapLoaded(true)
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Add tiles to map when both map and tiles are loaded
  useEffect(() => {
    if (!mapLoaded || !map.current || tiles.length === 0) return

    // Create GeoJSON from tiles
    const geojson = {
      type: 'FeatureCollection',
      features: tiles.map(tile => ({
        type: 'Feature',
        properties: {
          tile: tile.tile,
          resolution: tile.resolution,
          date: tile.date,
          utm: tile.utm,
          url: tile.url
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [tile.minx, tile.miny],
            [tile.maxx, tile.miny],
            [tile.maxx, tile.maxy],
            [tile.minx, tile.maxy],
            [tile.minx, tile.miny]
          ]]
        }
      }))
    }

    // Add source
    if (!map.current.getSource('tiles')) {
      map.current.addSource('tiles', {
        type: 'geojson',
        data: geojson
      })

      // Add fill layer with color coding by resolution
      map.current.addLayer({
        id: 'tiles-fill',
        type: 'fill',
        source: 'tiles',
        paint: {
          'fill-color': [
            'match',
            ['get', 'resolution'],
            '2m', '#ef4444',  // Red - highest detail
            '4m', '#3b82f6',  // Blue - high detail
            '8m', '#22c55e',  // Green - medium detail
            '16m', '#eab308', // Yellow - standard detail
            '#94a3b8'         // Gray - unknown
          ],
          'fill-opacity': 0.3
        }
      })

      // Add outline layer
      map.current.addLayer({
        id: 'tiles-outline',
        type: 'line',
        source: 'tiles',
        paint: {
          'line-color': '#1e293b',
          'line-width': 1,
          'line-opacity': 0.6
        }
      })

      // Add hover effect
      map.current.on('mouseenter', 'tiles-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer'
      })

      map.current.on('mouseleave', 'tiles-fill', () => {
        map.current.getCanvas().style.cursor = ''
      })

      // Add click handler
      map.current.on('click', 'tiles-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0]
          setSelectedTile(feature.properties)

          // Create popup
          const popup = new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 8px; min-width: 200px;">
                <h3 style="font-weight: bold; margin-bottom: 8px; color: #1e293b;">${feature.properties.tile}</h3>
                <div style="font-size: 14px; color: #475569;">
                  <div><strong>Resolution:</strong> ${feature.properties.resolution}</div>
                  <div><strong>Date:</strong> ${new Date(feature.properties.date).toLocaleDateString()}</div>
                  <div><strong>UTM Zone:</strong> ${feature.properties.utm}</div>
                </div>
              </div>
            `)
            .addTo(map.current)
        }
      })
    }

    // Fit map to tiles bounds
    const bounds = new maplibregl.LngLatBounds()
    tiles.forEach(tile => {
      bounds.extend([tile.minx, tile.miny])
      bounds.extend([tile.maxx, tile.maxy])
    })
    map.current.fitBounds(bounds, { padding: 50 })

  }, [mapLoaded, tiles])

  return (
    <div className="relative h-full w-full bg-slate-100 dark:bg-slate-900">
      {/* Map Container */}
      <div
        ref={mapContainer}
        className="h-full w-full"
        style={{ position: 'relative' }}
      />

      {/* Loading Indicator */}
      {(loading || !mapLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-800 z-10">
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-4 border-marine-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-600 dark:text-slate-300">
              {loading ? 'Loading tile data...' : 'Loading map...'}
            </p>
          </div>
        </div>
      )}

      {/* Tile Statistics Panel */}
      {!loading && (
        <div className="absolute top-4 left-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-4 max-w-sm z-20 border border-slate-200 dark:border-slate-600">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">BlueTopo Tiles - Global Coverage</h3>
          <div className="text-sm space-y-2 text-slate-600 dark:text-slate-300">
            <div><strong>Total Tiles:</strong> {stats.total}</div>
            <div className="space-y-1">
              <div><strong>Resolution:</strong></div>
              {Object.entries(stats.resolutions).map(([res, count]) => (
                <div key={res} className="flex items-center space-x-2 ml-4">
                  <div className={`w-3 h-3 rounded ${
                    res === '2m' ? 'bg-red-500' :
                    res === '4m' ? 'bg-blue-500' :
                    res === '8m' ? 'bg-green-500' :
                    res === '16m' ? 'bg-yellow-500' :
                    'bg-gray-400'
                  }`}></div>
                  <span>{res}: {count} tiles</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
              Click on any tile to view details
            </div>
          </div>
        </div>
      )}

      {/* Selected Tile Info Panel */}
      {selectedTile && (
        <div className="absolute bottom-4 left-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-4 max-w-md z-20 border border-slate-200 dark:border-slate-600">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              Tile: {selectedTile.tile}
            </h3>
            <button
              onClick={() => setSelectedTile(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="text-sm space-y-2 text-slate-600 dark:text-slate-300">
            <div><strong>Resolution:</strong> {selectedTile.resolution}</div>
            <div><strong>Delivery Date:</strong> {new Date(selectedTile.date).toLocaleDateString()}</div>
            <div><strong>UTM Zone:</strong> {selectedTile.utm}</div>
            <div className="pt-2">
              <a
                href={selectedTile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-marine-600 dark:text-marine-400 hover:underline text-xs break-all"
              >
                Download URL →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BlueTopoTilesView
