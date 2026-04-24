import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE } from '../utils/apiConfig.js'
import { useLocation, useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getDownloadedTiles, getStorageInfo, quickEstimateMB } from "../services/blueTopoDownloadService";
import { TopBar, Glass, Badge } from '../ui/primitives';

function BlueTopoTilesView() {
    const location = useLocation();
    const navigate = useNavigate();
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [tiles, setTiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTile, setSelectedTile] = useState(null);
    const [stats, setStats] = useState({ total: 0, resolutions: {} });
    const [selectedTiles, setSelectedTiles] = useState(new Set());
    const [lassoMode, setLassoMode] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lassoPoints, setLassoPoints] = useState([]);
    const [hasInitiallyFit, setHasInitiallyFit] = useState(false);
    const lassoLineId = "lasso-line";
    const lastLassoUpdateRef = useRef(0);

    // Downloaded tiles state
    const [downloadedTileIds, setDownloadedTileIds] = useState(new Set());
    const [loadingDownloaded, setLoadingDownloaded] = useState(true);

    // Get highlighted tiles from navigation state
    const highlightedTiles = location.state?.highlightedTiles || [];

    // Center on continental US (covers most of the BlueTopo coverage)
    const center = [-95, 37];
    const zoom = 4;

    // Fetch downloaded tiles on mount
    useEffect(() => {
        async function fetchDownloadedTiles() {
            try {
                setLoadingDownloaded(true);
                const result = await getDownloadedTiles();
                if (result.success && result.tiles) {
                    const ids = new Set(result.tiles.map((t) => t.tileId));
                    setDownloadedTileIds(ids);
                    // Pre-select downloaded tiles
                    setSelectedTiles(ids);
                    console.log("[BlueTopoTilesView] Loaded downloaded tiles:", ids.size);
                }
            } catch (error) {
                console.error("[BlueTopoTilesView] Failed to load downloaded tiles:", error);
            } finally {
                setLoadingDownloaded(false);
            }
        }
        fetchDownloadedTiles();
    }, []);

    // Storage info state
    const [storageInfo, setStorageInfo] = useState(null);
    const [tileSourceStatus, setTileSourceStatus] = useState("loading"); // "loading" | "syncing" | "ready" | "error"

    // Load tiles from GeoPackage API (with NOAA refresh)
    useEffect(() => {
        // API_BASE imported from apiConfig.js

        async function loadTiles() {
            try {
                setTileSourceStatus("syncing");
                const response = await fetch(`${API_BASE}/api/bluetopo/tile-scheme/tiles?refresh=true`);
                if (!response.ok) throw new Error(`API error: ${response.statusText}`);

                const data = await response.json();
                const parsedTiles = (data.tiles || []).filter((tile) => {
                    const valid =
                        !isNaN(tile.minx) &&
                        !isNaN(tile.miny) &&
                        !isNaN(tile.maxx) &&
                        !isNaN(tile.maxy);
                    if (!valid) console.warn("Invalid tile coordinates:", tile);
                    return valid;
                });

                console.log("[BlueTopoTilesView] Loaded tiles from GeoPackage:", parsedTiles.length);
                if (parsedTiles.length > 0) console.log("Sample tile:", parsedTiles[0]);

                setTiles(parsedTiles);

                const resolutions = {};
                parsedTiles.forEach((tile) => {
                    resolutions[tile.resolution] = (resolutions[tile.resolution] || 0) + 1;
                });
                setStats({ total: parsedTiles.length, resolutions });
                setTileSourceStatus("ready");
                setLoading(false);
            } catch (error) {
                console.error("[BlueTopoTilesView] Error loading tiles:", error);
                setTileSourceStatus("error");
                setLoading(false);
            }
        }
        loadTiles();
    }, []);

    // Load storage info on mount
    useEffect(() => {
        getStorageInfo()
            .then(setStorageInfo)
            .catch((err) => console.error("[BlueTopoTilesView] Failed to load storage info:", err));
    }, []);

    // Initialize map
    useEffect(() => {
        if (map.current) return; // Initialize map only once

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: "https://tiles.openfreemap.org/styles/liberty",
            center: center,
            zoom: zoom,
            pitch: 0,
            bearing: 0,
        });

        // Add navigation controls
        map.current.addControl(new maplibregl.NavigationControl(), "top-right");

        // Add scale control
        map.current.addControl(
            new maplibregl.ScaleControl({
                maxWidth: 100,
                unit: "nautical",
            }),
            "bottom-right",
        );

        map.current.on("load", () => {
            setMapLoaded(true);
        });

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Add tiles to map when both map and tiles are loaded
    useEffect(() => {
        if (!mapLoaded || !map.current || tiles.length === 0 || loadingDownloaded) return;

        console.log("[BlueTopoTilesView] Highlighted tiles:", highlightedTiles);
        console.log("[BlueTopoTilesView] Downloaded tiles:", downloadedTileIds.size);

        // Create GeoJSON from tiles with feature IDs
        const geojson = {
            type: "FeatureCollection",
            features: tiles.map((tile, index) => ({
                type: "Feature",
                id: index,
                properties: {
                    tile: tile.tile,
                    resolution: tile.resolution,
                    date: tile.date,
                    utm: tile.utm,
                    url: tile.url,
                    isHighlighted: highlightedTiles.includes(tile.tile),
                    isDownloaded: downloadedTileIds.has(tile.tile),
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [tile.minx, tile.miny],
                            [tile.maxx, tile.miny],
                            [tile.maxx, tile.maxy],
                            [tile.minx, tile.maxy],
                            [tile.minx, tile.miny],
                        ],
                    ],
                },
            })),
        };

        // Add source
        if (!map.current.getSource("tiles")) {
            map.current.addSource("tiles", {
                type: "geojson",
                data: geojson,
            });

            // Add fill layer with color coding by resolution, downloaded, and selection state
            map.current.addLayer({
                id: "tiles-fill",
                type: "fill",
                source: "tiles",
                paint: {
                    "fill-color": [
                        "case",
                        // Selected + Downloaded = Cyan (already have, keeping)
                        ["all",
                            ["boolean", ["feature-state", "selected"], false],
                            ["get", "isDownloaded"]
                        ],
                        "#06b6d4",
                        // Selected + Not Downloaded = Green (new selection)
                        ["boolean", ["feature-state", "selected"], false],
                        "#22c55e",
                        // Not selected but downloaded = Dim cyan (have but removing)
                        ["get", "isDownloaded"],
                        "#164e63",
                        // Not selected, not downloaded = Resolution colors
                        [
                            "match",
                            ["get", "resolution"],
                            "2m",
                            "#ef4444", // Red - highest detail
                            "4m",
                            "#3b82f6", // Blue - high detail
                            "8m",
                            "#22c55e", // Green - medium detail
                            "16m",
                            "#eab308", // Yellow - standard detail
                            "#94a3b8", // Gray - unknown
                        ],
                    ],
                    "fill-opacity": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false],
                        0.7, // Higher opacity for selected
                        ["get", "isDownloaded"],
                        0.5, // Medium opacity for downloaded but not selected
                        ["get", "isHighlighted"],
                        0.7, // Higher opacity for highlighted tiles
                        0.3, // Normal opacity
                    ],
                },
            });

            // Add outline layer with selection state
            map.current.addLayer({
                id: "tiles-outline",
                type: "line",
                source: "tiles",
                paint: {
                    "line-color": [
                        "case",
                        // Selected + Downloaded = Cyan border
                        ["all",
                            ["boolean", ["feature-state", "selected"], false],
                            ["get", "isDownloaded"]
                        ],
                        "#06b6d4",
                        // Selected + Not Downloaded = Green border
                        ["boolean", ["feature-state", "selected"], false],
                        "#16a34a",
                        // Downloaded but not selected = Dim cyan border
                        ["get", "isDownloaded"],
                        "#0e7490",
                        ["get", "isHighlighted"],
                        "#fbbf24", // Gold for highlighted
                        "#1e293b", // Default dark
                    ],
                    "line-width": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false],
                        2, // Thicker for selected
                        ["get", "isDownloaded"],
                        2, // Thicker for downloaded
                        ["get", "isHighlighted"],
                        3, // Thickest for highlighted
                        1, // Normal width
                    ],
                    "line-opacity": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false],
                        1,
                        ["get", "isHighlighted"],
                        1,
                        0.6,
                    ],
                },
            });

            // Add hover effect
            map.current.on("mouseenter", "tiles-fill", () => {
                if (!isDrawing && !lassoMode) {
                    map.current.getCanvas().style.cursor = "pointer";
                }
            });

            map.current.on("mouseleave", "tiles-fill", () => {
                if (!isDrawing && !lassoMode) {
                    map.current.getCanvas().style.cursor = "";
                }
            });

            // Add click handler for tile selection
            map.current.on("click", "tiles-fill", (e) => {
                if (isDrawing || lassoMode) return;

                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    const tileId = feature.properties.tile;
                    const featureId = feature.id;

                    setSelectedTiles((prev) => {
                        const newSet = new Set(prev);
                        if (newSet.has(tileId)) {
                            newSet.delete(tileId);
                            map.current.setFeatureState(
                                { source: "tiles", id: featureId },
                                { selected: false },
                            );
                        } else {
                            newSet.add(tileId);
                            map.current.setFeatureState(
                                { source: "tiles", id: featureId },
                                { selected: true },
                            );
                        }
                        return newSet;
                    });

                    // Show popup
                    setSelectedTile(feature.properties);
                    const popup = new maplibregl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(
                            `
              <div style="padding: 8px; min-width: 200px;">
                <h3 style="font-weight: bold; margin-bottom: 8px; color: #1e293b;">${feature.properties.tile}</h3>
                <div style="font-size: 14px; color: #475569;">
                  <div><strong>Resolution:</strong> ${feature.properties.resolution}</div>
                  <div><strong>Date:</strong> ${new Date(feature.properties.date).toLocaleDateString()}</div>
                  <div><strong>UTM Zone:</strong> ${feature.properties.utm}</div>
                </div>
              </div>
            `,
                        )
                        .addTo(map.current);
                }
            });
        }

        // Set feature state for downloaded tiles (pre-selected)
        tiles.forEach((tile, index) => {
            if (downloadedTileIds.has(tile.tile)) {
                map.current.setFeatureState(
                    { source: "tiles", id: index },
                    { selected: true },
                );
            }
        });

        // Fit map to tiles bounds only once on initial load
        if (!hasInitiallyFit) {
            const bounds = new maplibregl.LngLatBounds();
            const tilesToFit =
                highlightedTiles.length > 0
                    ? tiles.filter((tile) =>
                          highlightedTiles.includes(tile.tile),
                      )
                    : tiles;

            if (tilesToFit.length > 0) {
                tilesToFit.forEach((tile) => {
                    bounds.extend([tile.minx, tile.miny]);
                    bounds.extend([tile.maxx, tile.maxy]);
                });
                map.current.fitBounds(bounds, { padding: 50 });
                setHasInitiallyFit(true);
            }
        }
    }, [mapLoaded, tiles, highlightedTiles, hasInitiallyFit, loadingDownloaded, downloadedTileIds]);

    // Update lasso line visualization
    useEffect(() => {
        if (!map.current || !mapLoaded || lassoPoints.length === 0) return;

        // Convert screen points to map coordinates
        const mapPoints = lassoPoints.map((point) => {
            const lngLat = map.current.unproject(point);
            return [lngLat.lng, lngLat.lat];
        });

        const geojson = {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: mapPoints,
            },
        };

        if (!map.current.getSource(lassoLineId)) {
            map.current.addSource(lassoLineId, {
                type: "geojson",
                data: geojson,
            });

            map.current.addLayer({
                id: lassoLineId,
                type: "line",
                source: lassoLineId,
                paint: {
                    "line-color": "#22c55e",
                    "line-width": 3,
                    "line-dasharray": [2, 2],
                },
            });
        } else {
            map.current.getSource(lassoLineId).setData(geojson);
        }
    }, [lassoPoints, mapLoaded]);

    // Lasso selection functionality
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const canvas = map.current.getCanvasContainer();

        const handlePointerDown = (e) => {
            if (lassoMode) {
                e.preventDefault();
                e.stopPropagation();
                setIsDrawing(true);
                setLassoPoints([]);
                canvas.style.cursor = "crosshair";

                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
                const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
                setLassoPoints([[x, y]]);
            }
        };

        const handlePointerMove = (e) => {
            if (isDrawing && lassoMode) {
                e.preventDefault();
                e.stopPropagation();

                // Throttle to 20 Hz (50ms) - smooth enough for drawing
                const now = Date.now();
                if (now - lastLassoUpdateRef.current < 50) return;
                lastLassoUpdateRef.current = now;

                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
                const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
                setLassoPoints((prev) => [...prev, [x, y]]);
            }
        };

        const handlePointerUp = (e) => {
            if (isDrawing && lassoMode) {
                e.preventDefault();
                e.stopPropagation();
                setIsDrawing(false);
                canvas.style.cursor = lassoMode ? "crosshair" : "";

                // Convert screen coordinates to map coordinates
                if (lassoPoints.length > 2) {
                    const polygon = lassoPoints.map((point) => {
                        const lngLat = map.current.unproject(point);
                        return [lngLat.lng, lngLat.lat];
                    });
                    polygon.push(polygon[0]);

                    selectTilesInPolygon(polygon);
                }

                // Clear the lasso line
                setLassoPoints([]);
                if (map.current.getSource(lassoLineId)) {
                    map.current.getSource(lassoLineId).setData({
                        type: "Feature",
                        geometry: { type: "LineString", coordinates: [] },
                    });
                }
            }
        };

        canvas.addEventListener("mousedown", handlePointerDown);
        canvas.addEventListener("mousemove", handlePointerMove);
        canvas.addEventListener("mouseup", handlePointerUp);
        canvas.addEventListener("touchstart", handlePointerDown, {
            passive: false,
        });
        canvas.addEventListener("touchmove", handlePointerMove, {
            passive: false,
        });
        canvas.addEventListener("touchend", handlePointerUp, {
            passive: false,
        });

        return () => {
            canvas.removeEventListener("mousedown", handlePointerDown);
            canvas.removeEventListener("mousemove", handlePointerMove);
            canvas.removeEventListener("mouseup", handlePointerUp);
            canvas.removeEventListener("touchstart", handlePointerDown);
            canvas.removeEventListener("touchmove", handlePointerMove);
            canvas.removeEventListener("touchend", handlePointerUp);
        };
    }, [mapLoaded, isDrawing, lassoPoints, lassoMode]);

    // Update cursor and disable ALL map interactions when lasso mode changes
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const canvas = map.current.getCanvasContainer();
        canvas.style.cursor = lassoMode ? "crosshair" : "";

        if (lassoMode) {
            // Disable all map interactions
            map.current.dragPan.disable();
            map.current.scrollZoom.disable();
            map.current.boxZoom.disable();
            map.current.doubleClickZoom.disable();
            map.current.touchZoomRotate.disable();
            map.current.dragRotate.disable();
            map.current.keyboard.disable();
            map.current.touchPitch.disable();
        } else {
            // Re-enable all map interactions
            map.current.dragPan.enable();
            map.current.scrollZoom.enable();
            map.current.boxZoom.enable();
            map.current.doubleClickZoom.enable();
            map.current.touchZoomRotate.enable();
            map.current.dragRotate.enable();
            map.current.keyboard.enable();
            map.current.touchPitch.enable();
        }
    }, [lassoMode, mapLoaded]);

    const selectTilesInPolygon = (polygon) => {
        tiles.forEach((tile, index) => {
            const centerX = (tile.minx + tile.maxx) / 2;
            const centerY = (tile.miny + tile.maxy) / 2;

            if (isPointInPolygon([centerX, centerY], polygon)) {
                setSelectedTiles((prev) => {
                    const newSet = new Set(prev);
                    newSet.add(tile.tile);
                    map.current.setFeatureState(
                        { source: "tiles", id: index },
                        { selected: true },
                    );
                    return newSet;
                });
            }
        });
    };

    const isPointInPolygon = (point, polygon) => {
        const [x, y] = point;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];

            const intersect =
                yi > y !== yj > y &&
                x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

            if (intersect) inside = !inside;
        }

        return inside;
    };

    const handleClearSelection = () => {
        tiles.forEach((tile, index) => {
            if (selectedTiles.has(tile.tile)) {
                map.current.setFeatureState(
                    { source: "tiles", id: index },
                    { selected: false },
                );
            }
        });
        setSelectedTiles(new Set());
    };

    const handleViewSelected = () => {
        // Only pass NEW tiles (selected but not already downloaded)
        const newTilesToDownload = tiles.filter((tile) =>
            selectedTiles.has(tile.tile) && !downloadedTileIds.has(tile.tile),
        );

        // Track which downloaded tiles were deselected (for potential removal)
        const tilesToRemove = Array.from(downloadedTileIds).filter(
            (tileId) => !selectedTiles.has(tileId)
        );

        const returnTo = location.state?.returnTo || "/settings?section=bluetopo";
        navigate(returnTo, {
            state: {
                tiles: newTilesToDownload,
                tilesToRemove: tilesToRemove,
                keptTiles: Array.from(downloadedTileIds).filter(id => selectedTiles.has(id))
            },
        });
    };

    return (
        <div className="relative h-full w-full" style={{ background: 'var(--bg)', color: 'var(--fg1)' }}>
            <TopBar title="BlueTopo tiles" right={
                <Badge tone="info" dot>{selectedTiles.size} selected</Badge>
            } />
            {/* Lasso Mode Indicator Border */}
            {lassoMode && (
                <div className="absolute inset-0 pointer-events-none z-30 border-4 animate-pulse" style={{ borderColor: 'var(--signal)' }} />
            )}

            {/* Map Container */}
            <div
                ref={mapContainer}
                className="h-full w-full"
                style={{ position: "relative", paddingTop: 56 }}
            />

            {/* Loading Indicator */}
            {(loading || !mapLoaded || loadingDownloaded) && (
                <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'var(--bg)' }}>
                    <div className="text-center space-y-4">
                        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--signal)', borderTopColor: 'transparent' }}></div>
                        <p style={{ color: 'var(--fg2)' }}>
                            {tileSourceStatus === "syncing"
                                ? "Syncing with NOAA..."
                                : loading
                                ? "Loading tile data..."
                                : loadingDownloaded
                                ? "Loading downloaded tiles..."
                                : "Loading map..."}
                        </p>
                    </div>
                </div>
            )}

            {/* Back Button */}
            <button
                onClick={() => navigate(location.state?.returnTo || "/settings?section=bluetopo")}
                className="absolute z-30 rounded-lg p-3 touch-manipulation"
                style={{ top: 64, left: 16, background: 'var(--bg-elev)', border: '0.5px solid var(--bg-hairline-strong)' }}
                title="Back"
            >
                <svg
                    className="w-6 h-6"
                    style={{ color: 'var(--fg1)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                </svg>
            </button>

            {/* Tile Statistics and Selection Tools Panel */}
            {!loading && !loadingDownloaded && (
                <Glass className="absolute z-20 p-4 max-w-sm" style={{ top: 116, left: 16 }} radius={12}>
                    <h3 className="font-semibold mb-3 uppercase tracking-wide text-sm" style={{ color: 'var(--fg1)' }}>
                        Selection Tools
                    </h3>

                    {/* Lasso Mode Button */}
                    <button
                        onClick={() => setLassoMode(!lassoMode)}
                        className="w-full mb-3 px-4 py-3 rounded-lg font-medium transition-all touch-manipulation"
                        style={lassoMode
                            ? { background: 'var(--signal)', color: '#fff' }
                            : { background: 'var(--bg)', border: '0.5px solid var(--bg-hairline-strong)', color: 'var(--fg1)' }
                        }
                    >
                        <div className="flex items-center justify-center space-x-2">
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                                />
                            </svg>
                            <span>
                                {lassoMode
                                    ? "[*] Lasso Active"
                                    : "Enable Lasso Mode"}
                            </span>
                        </div>
                    </button>

                    <div className="text-sm space-y-2 font-mono" style={{ color: 'var(--fg2)' }}>
                        {/* Selection counts */}
                        <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-cyan-500"></div>
                                <span>
                                    <span style={{ color: 'var(--tint-teal)' }}>Downloaded:</span>{" "}
                                    {Array.from(selectedTiles).filter(t => downloadedTileIds.has(t)).length} kept
                                </span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded" style={{ background: 'var(--signal)' }}></div>
                                <span>
                                    <span style={{ color: 'var(--fg1)' }}>New:</span>{" "}
                                    {Array.from(selectedTiles).filter(t => !downloadedTileIds.has(t)).length} to download
                                </span>
                            </div>
                            {downloadedTileIds.size > 0 && (
                                <div className="flex items-center space-x-2">
                                    <div className="w-3 h-3 rounded bg-cyan-900"></div>
                                    <span>
                                        <span style={{ color: 'var(--fg2)' }}>Deselected:</span>{" "}
                                        {Array.from(downloadedTileIds).filter(t => !selectedTiles.has(t)).length} to remove
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="pt-2" style={{ borderTop: '0.5px solid var(--bg-hairline-strong)' }}>
                            <span style={{ color: 'var(--fg1)' }}>Total Selected:</span> {selectedTiles.size} /{" "}
                            {stats.total} tiles
                        </div>
                        <div className="space-y-1">
                            <div>
                                <span style={{ color: 'var(--fg1)' }}>Resolution:</span>
                            </div>
                            {Object.entries(stats.resolutions).map(
                                ([res, count]) => (
                                    <div
                                        key={res}
                                        className="flex items-center space-x-2 ml-4"
                                    >
                                        <div
                                            className="w-3 h-3 rounded"
                                            style={{
                                                background: res === "2m"
                                                    ? 'var(--tint-red)'
                                                    : res === "4m"
                                                      ? 'var(--tint-teal)'
                                                      : res === "8m"
                                                        ? 'var(--signal)'
                                                        : res === "16m"
                                                          ? 'var(--tint-yellow)'
                                                          : 'var(--fill-2)'
                                            }}
                                        ></div>
                                        <span>
                                            {res}: {count} tiles
                                        </span>
                                    </div>
                                ),
                            )}
                        </div>
                        <div className="text-xs mt-3 pt-3" style={{ color: 'var(--fg2)', borderTop: '0.5px solid var(--bg-hairline-strong)' }}>
                            {lassoMode ? (
                                <>
                                    <div className="flex items-center space-x-1 font-medium mb-1" style={{ color: 'var(--fg1)' }}>
                                        <svg
                                            className="w-4 h-4"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                        <span>[OK] Lasso mode enabled</span>
                                    </div>
                                    &gt; Draw on map to select tiles
                                    <br />
                                    &gt; Drag to create selection area
                                    <br />&gt; Click button to exit lasso mode
                                </>
                            ) : (
                                <>
                                    &gt; Click tiles to select individually
                                    <br />&gt; Enable lasso mode for area selection
                                </>
                            )}
                        </div>
                    </div>
                </Glass>
            )}

            {/* Highlighted Tiles Banner */}
            {highlightedTiles.length > 0 && (
                <Glass className="absolute max-w-sm z-20 p-4" style={{ top: 64, right: 16 }} radius={12}>
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'var(--tint-yellow)', color: 'var(--bg)' }}>
                            <span className="text-lg font-bold">
                                {highlightedTiles.length}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-semibold" style={{ color: 'var(--tint-yellow)' }}>
                                Selected Tiles Highlighted
                            </h3>
                            <p className="text-xs" style={{ color: 'var(--fg2)' }}>
                                Shown with gold outline
                            </p>
                        </div>
                    </div>
                </Glass>
            )}

            {/* Selected Tile Info Panel */}
            {selectedTile && (
                <Glass className="absolute bottom-4 left-4 p-4 max-w-md z-20" radius={12}>
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold font-mono" style={{ color: 'var(--fg1)' }}>
                            Tile: {selectedTile.tile}
                        </h3>
                        <button
                            onClick={() => setSelectedTile(null)}
                            style={{ color: 'var(--fg2)' }}
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                    <div className="text-sm space-y-2 font-mono" style={{ color: 'var(--fg2)' }}>
                        <div>
                            <span style={{ color: 'var(--fg1)' }}>Resolution:</span>{" "}
                            {selectedTile.resolution}
                        </div>
                        <div>
                            <span style={{ color: 'var(--fg1)' }}>Delivery Date:</span>{" "}
                            {new Date(selectedTile.date).toLocaleDateString()}
                        </div>
                        <div>
                            <span style={{ color: 'var(--fg1)' }}>UTM Zone:</span> {selectedTile.utm}
                        </div>
                        <div className="pt-2">
                            <a
                                href={selectedTile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline text-xs break-all"
                                style={{ color: 'var(--tint-teal)' }}
                            >
                                Download URL →
                            </a>
                        </div>
                    </div>
                </Glass>
            )}

            {/* Selection Action Panel */}
            {(selectedTiles.size > 0 || downloadedTileIds.size > 0) && (
                <Glass className="absolute bottom-4 right-4 p-4 z-20 max-w-md" radius={12}>
                    <div className="space-y-3">
                        {/* Summary counts */}
                        <div className="flex items-center space-x-4 text-sm font-mono">
                            {Array.from(selectedTiles).filter(t => !downloadedTileIds.has(t)).length > 0 && (
                                <div className="flex items-center space-x-2">
                                    <div className="w-3 h-3 rounded" style={{ background: 'var(--signal)' }}></div>
                                    <span style={{ color: 'var(--fg1)' }}>
                                        +{Array.from(selectedTiles).filter(t => !downloadedTileIds.has(t)).length} new
                                    </span>
                                </div>
                            )}
                            {Array.from(selectedTiles).filter(t => downloadedTileIds.has(t)).length > 0 && (
                                <div className="flex items-center space-x-2">
                                    <div className="w-3 h-3 rounded bg-cyan-500"></div>
                                    <span style={{ color: 'var(--tint-teal)' }}>
                                        {Array.from(selectedTiles).filter(t => downloadedTileIds.has(t)).length} keeping
                                    </span>
                                </div>
                            )}
                            {Array.from(downloadedTileIds).filter(t => !selectedTiles.has(t)).length > 0 && (
                                <div className="flex items-center space-x-2">
                                    <div className="w-3 h-3 rounded bg-cyan-900"></div>
                                    <span style={{ color: 'var(--fg2)' }}>
                                        -{Array.from(downloadedTileIds).filter(t => !selectedTiles.has(t)).length} removing
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Storage & estimate info */}
                        {(() => {
                            const newTiles = tiles.filter(t => selectedTiles.has(t.tile) && !downloadedTileIds.has(t.tile));
                            const estMB = quickEstimateMB(newTiles);
                            const estGB = (estMB / 1024).toFixed(1);
                            const freeGB = storageInfo?.disk?.freeGB;
                            const exceedsFree = freeGB != null && estMB / 1024 > freeGB;

                            return newTiles.length > 0 ? (
                                <div className="text-xs font-mono space-y-1 pt-2" style={{ borderTop: '0.5px solid var(--bg-hairline-strong)' }}>
                                    <div style={{ color: 'var(--fg2)' }}>
                                        Est. download: <span style={{ color: 'var(--fg1)' }}>{estMB >= 1024 ? `${estGB} GB` : `${estMB} MB`}</span>
                                    </div>
                                    {freeGB != null && (
                                        <div style={{ color: 'var(--fg2)' }}>
                                            Free space: <span style={{ color: 'var(--fg1)' }}>{freeGB} GB</span>
                                        </div>
                                    )}
                                    {exceedsFree && (
                                        <div className="font-medium" style={{ color: 'var(--tint-red)' }}>
                                            Warning: estimated size exceeds free disk space
                                        </div>
                                    )}
                                </div>
                            ) : null;
                        })()}

                        {/* Actions */}
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-mono" style={{ color: 'var(--fg2)' }}>
                                {selectedTiles.size} tile{selectedTiles.size !== 1 ? "s" : ""} total
                            </div>
                            <div className="flex space-x-2">
                                <button
                                    onClick={handleClearSelection}
                                    className="px-3 py-2 rounded-lg text-sm font-medium"
                                    style={{ background: 'var(--fill-1)', color: 'var(--fg1)', border: '0.5px solid var(--bg-hairline-strong)' }}
                                >
                                    Clear All
                                </button>
                                <button
                                    onClick={handleViewSelected}
                                    className="px-3 py-2 rounded-lg text-sm font-medium"
                                    style={{ background: 'var(--signal)', color: '#fff' }}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </Glass>
            )}
        </div>
    );
}

export default BlueTopoTilesView;
