import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

function BlueTopoTileSelector({ isOpen, onClose, onSelectTiles }) {
  const navigate = useNavigate()
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [tiles, setTiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTiles, setSelectedTiles] = useState(new Set())
  const [stats, setStats] = useState({ total: 0, resolutions: {} })
  const [isDrawing, setIsDrawing] = useState(false)
  const [lassoMode, setLassoMode] = useState(false)
  const [lassoPoints, setLassoPoints] = useState([])
  const lassoLayerId = 'lasso-layer'
  const lassoLineId = 'lasso-line'

  // Center on continental US (covers most of the BlueTopo coverage)
  const center = [-95, 37]
  const zoom = 4

  // Load tiles from CSV
  useEffect(() => {
    if (!isOpen) return

    fetch('/bluetopo_tiles_global.csv')
      .then(response => response.text())
      .then(csvText => {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim())

        const parsedTiles = lines.slice(1).map(line => {
          const parts = line.split(',').map(p => p.trim())

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
          const valid = !isNaN(tile.minx) && !isNaN(tile.miny) &&
                        !isNaN(tile.maxx) && !isNaN(tile.maxy)
          return valid
        })

        setTiles(parsedTiles)

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
  }, [isOpen])

  // Initialize map
  useEffect(() => {
    if (!isOpen || !mapContainer.current) return
    if (map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: center,
      zoom: zoom,
      pitch: 0,
      bearing: 0
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
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
        setMapLoaded(false)
      }
    }
  }, [isOpen])

  // Add tiles to map when both map and tiles are loaded
  useEffect(() => {
    if (!mapLoaded || !map.current || tiles.length === 0) return

    const geojson = {
      type: 'FeatureCollection',
      features: tiles.map((tile, index) => ({
        type: 'Feature',
        id: index,
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

    if (!map.current.getSource('tiles')) {
      map.current.addSource('tiles', {
        type: 'geojson',
        data: geojson
      })

      // Add fill layer
      map.current.addLayer({
        id: 'tiles-fill',
        type: 'fill',
        source: 'tiles',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#22c55e', // Green when selected
            [
              'match',
              ['get', 'resolution'],
              '2m', '#ef4444',
              '4m', '#3b82f6',
              '8m', '#22c55e',
              '16m', '#eab308',
              '#94a3b8'
            ]
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.7,
            0.3
          ]
        }
      })

      // Add outline layer
      map.current.addLayer({
        id: 'tiles-outline',
        type: 'line',
        source: 'tiles',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#16a34a',
            '#1e293b'
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            2,
            1
          ],
          'line-opacity': 0.6
        }
      })

      // Handle click to toggle selection
      map.current.on('click', 'tiles-fill', (e) => {
        if (isDrawing || lassoMode) return

        if (e.features && e.features.length > 0) {
          const feature = e.features[0]
          const tileId = feature.properties.tile
          const featureId = feature.id

          setSelectedTiles(prev => {
            const newSet = new Set(prev)
            if (newSet.has(tileId)) {
              newSet.delete(tileId)
              map.current.setFeatureState(
                { source: 'tiles', id: featureId },
                { selected: false }
              )
            } else {
              newSet.add(tileId)
              map.current.setFeatureState(
                { source: 'tiles', id: featureId },
                { selected: true }
              )
            }
            return newSet
          })
        }
      })

      map.current.on('mouseenter', 'tiles-fill', () => {
        if (!isDrawing && !lassoMode) {
          map.current.getCanvas().style.cursor = 'pointer'
        }
      })

      map.current.on('mouseleave', 'tiles-fill', () => {
        if (!isDrawing && !lassoMode) {
          map.current.getCanvas().style.cursor = ''
        }
      })
    }

  }, [mapLoaded, tiles, isDrawing, lassoMode])

  // Fit map to tiles bounds only once when tiles are first loaded
  useEffect(() => {
    if (!mapLoaded || !map.current || tiles.length === 0) return

    // Only fit bounds if we haven't done it yet
    const bounds = new maplibregl.LngLatBounds()
    tiles.forEach(tile => {
      bounds.extend([tile.minx, tile.miny])
      bounds.extend([tile.maxx, tile.maxy])
    })
    map.current.fitBounds(bounds, { padding: 50 })

  }, [mapLoaded, tiles])

  // Update lasso line visualization
  useEffect(() => {
    if (!map.current || !mapLoaded || lassoPoints.length === 0) return

    // Convert screen points to map coordinates
    const mapPoints = lassoPoints.map(point => {
      const lngLat = map.current.unproject(point)
      return [lngLat.lng, lngLat.lat]
    })

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: mapPoints
      }
    }

    if (!map.current.getSource(lassoLineId)) {
      map.current.addSource(lassoLineId, {
        type: 'geojson',
        data: geojson
      })

      map.current.addLayer({
        id: lassoLineId,
        type: 'line',
        source: lassoLineId,
        paint: {
          'line-color': '#22c55e',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      })
    } else {
      map.current.getSource(lassoLineId).setData(geojson)
    }
  }, [lassoPoints, mapLoaded])

  // Lasso selection functionality
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const canvas = map.current.getCanvasContainer()

    const handlePointerDown = (e) => {
      if (lassoMode) {
        e.preventDefault()
        setIsDrawing(true)
        setLassoPoints([])
        canvas.style.cursor = 'crosshair'

        // Get the correct position for both mouse and touch
        const rect = canvas.getBoundingClientRect()
        const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
        const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
        setLassoPoints([[x, y]])
      }
    }

    const handlePointerMove = (e) => {
      if (isDrawing && lassoMode) {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
        const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
        setLassoPoints(prev => [...prev, [x, y]])
      }
    }

    const handlePointerUp = (e) => {
      if (isDrawing && lassoMode) {
        e.preventDefault()
        setIsDrawing(false)
        canvas.style.cursor = lassoMode ? 'crosshair' : ''

        // Convert screen coordinates to map coordinates
        if (lassoPoints.length > 2) {
          const polygon = lassoPoints.map(point => {
            const lngLat = map.current.unproject(point)
            return [lngLat.lng, lngLat.lat]
          })
          // Close the polygon
          polygon.push(polygon[0])

          selectTilesInPolygon(polygon)
        }

        // Clear the lasso line
        setLassoPoints([])
        if (map.current.getSource(lassoLineId)) {
          map.current.getSource(lassoLineId).setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [] }
          })
        }
      }
    }

    // Add both mouse and touch event listeners
    canvas.addEventListener('mousedown', handlePointerDown)
    canvas.addEventListener('mousemove', handlePointerMove)
    canvas.addEventListener('mouseup', handlePointerUp)
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false })
    canvas.addEventListener('touchmove', handlePointerMove, { passive: false })
    canvas.addEventListener('touchend', handlePointerUp, { passive: false })

    return () => {
      canvas.removeEventListener('mousedown', handlePointerDown)
      canvas.removeEventListener('mousemove', handlePointerMove)
      canvas.removeEventListener('mouseup', handlePointerUp)
      canvas.removeEventListener('touchstart', handlePointerDown)
      canvas.removeEventListener('touchmove', handlePointerMove)
      canvas.removeEventListener('touchend', handlePointerUp)
    }
  }, [mapLoaded, isDrawing, lassoPoints, lassoMode])

  // Update cursor and disable map panning when lasso mode changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const canvas = map.current.getCanvasContainer()
    canvas.style.cursor = lassoMode ? 'crosshair' : ''

    // Disable map panning when lasso mode is active
    if (lassoMode) {
      map.current.dragPan.disable()
      map.current.touchZoomRotate.disableRotation()
    } else {
      map.current.dragPan.enable()
      map.current.touchZoomRotate.enableRotation()
    }
  }, [lassoMode, mapLoaded])

  const selectTilesInPolygon = (polygon) => {
    // Simple point-in-polygon test for tile centers
    tiles.forEach((tile, index) => {
      const centerX = (tile.minx + tile.maxx) / 2
      const centerY = (tile.miny + tile.maxy) / 2

      if (isPointInPolygon([centerX, centerY], polygon)) {
        setSelectedTiles(prev => {
          const newSet = new Set(prev)
          newSet.add(tile.tile)
          map.current.setFeatureState(
            { source: 'tiles', id: index },
            { selected: true }
          )
          return newSet
        })
      }
    })
  }

  // Point in polygon algorithm (ray casting)
  const isPointInPolygon = (point, polygon) => {
    const [x, y] = point
    let inside = false

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i]
      const [xj, yj] = polygon[j]

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)

      if (intersect) inside = !inside
    }

    return inside
  }

  const handleDone = () => {
    const selectedTileData = tiles.filter(tile => selectedTiles.has(tile.tile))
    console.log('Selected tiles for download:', selectedTileData)

    // Close modal
    onClose()

    // Navigate to downloader page with selected tiles
    navigate('/bluetopo-downloader', {
      state: { tiles: selectedTileData }
    })
  }

  const handleClearSelection = () => {
    // Clear feature states for all selected tiles
    tiles.forEach((tile, index) => {
      if (selectedTiles.has(tile.tile)) {
        map.current.setFeatureState(
          { source: 'tiles', id: index },
          { selected: false }
        )
      }
    })
    setSelectedTiles(new Set())
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[90vh] m-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-600">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Select BlueTopo Tiles
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Global coverage - Click tiles or use lasso mode to select regions
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          {/* Lasso Mode Indicator Border */}
          {lassoMode && (
            <div className="absolute inset-0 pointer-events-none z-30 border-4 border-green-500 animate-pulse" />
          )}

          <div
            ref={mapContainer}
            className="h-full w-full"
            style={{ position: 'relative' }}
          />

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

          {/* Selection Info Panel */}
          {!loading && (
            <div className="absolute top-4 left-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-4 max-w-xs z-20 border border-slate-200 dark:border-slate-600">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Selection Tools</h3>

              {/* Lasso Mode Button */}
              <button
                onClick={() => setLassoMode(!lassoMode)}
                className={`w-full mb-3 px-4 py-3 rounded-lg font-medium transition-colors touch-manipulation ${
                  lassoMode
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  <span>{lassoMode ? 'Lasso Mode Active' : 'Enable Lasso Mode'}</span>
                </div>
              </button>

              <div className="text-sm space-y-2 text-slate-600 dark:text-slate-300">
                <div><strong>Selected:</strong> {selectedTiles.size} / {stats.total} tiles</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                  {lassoMode ? (
                    <>
                      <div className="flex items-center space-x-1 text-green-600 dark:text-green-400 font-medium mb-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Lasso mode enabled</span>
                      </div>
                      • Draw on map to select tiles<br/>
                      • Drag to create selection area<br/>
                      • Click button to exit lasso mode
                    </>
                  ) : (
                    <>
                      • Click tiles to select individually<br/>
                      • Enable lasso mode for area selection
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {selectedTiles.size} tile{selectedTiles.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleClearSelection}
              className="px-4 py-2 text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
              disabled={selectedTiles.size === 0}
            >
              Clear Selection
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              className="px-6 py-2 bg-marine-600 hover:bg-marine-700 text-white rounded-lg font-medium transition-colors"
              disabled={selectedTiles.size === 0}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BlueTopoTileSelector
