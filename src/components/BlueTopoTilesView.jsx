import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

    // Get highlighted tiles from navigation state
    const highlightedTiles = location.state?.highlightedTiles || [];

    // Center on continental US (covers most of the BlueTopo coverage)
    const center = [-95, 37];
    const zoom = 4;

    // Load tiles from CSV
    useEffect(() => {
        fetch("/bluetopo_tiles_global.csv")
            .then((response) => response.text())
            .then((csvText) => {
                // Split by newlines (handle both \n and \r\n)
                const lines = csvText
                    .split(/\r?\n/)
                    .filter((line) => line.trim());

                const parsedTiles = lines
                    .slice(1)
                    .map((line) => {
                        // Split by comma
                        const parts = line.split(",").map((p) => p.trim());

                        // CSV format: tile,url,resolution,utm,date,minx,miny,maxx,maxy
                        // Date field contains spaces like "2025-02-26 14:27:54"
                        return {
                            tile: parts[0],
                            url: parts[1],
                            resolution: parts[2] || "Unknown",
                            utm: parts[3],
                            date: parts[4],
                            minx: parseFloat(parts[5]),
                            miny: parseFloat(parts[6]),
                            maxx: parseFloat(parts[7]),
                            maxy: parseFloat(parts[8]),
                        };
                    })
                    .filter((tile) => {
                        // Filter out tiles with invalid coordinates
                        const valid =
                            !isNaN(tile.minx) &&
                            !isNaN(tile.miny) &&
                            !isNaN(tile.maxx) &&
                            !isNaN(tile.maxy);
                        if (!valid) {
                            console.warn("Invalid tile coordinates:", tile);
                        }
                        return valid;
                    });

                console.log("Loaded tiles:", parsedTiles.length);
                if (parsedTiles.length > 0) {
                    console.log("Sample tile:", parsedTiles[0]);
                }

                setTiles(parsedTiles);

                // Calculate stats
                const resolutions = {};
                parsedTiles.forEach((tile) => {
                    resolutions[tile.resolution] =
                        (resolutions[tile.resolution] || 0) + 1;
                });
                setStats({ total: parsedTiles.length, resolutions });
                setLoading(false);
            })
            .catch((error) => {
                console.error("Error loading tiles:", error);
                setLoading(false);
            });
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
        if (!mapLoaded || !map.current || tiles.length === 0) return;

        console.log("[BlueTopoTilesView] Highlighted tiles:", highlightedTiles);

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

            // Add fill layer with color coding by resolution and selection state
            map.current.addLayer({
                id: "tiles-fill",
                type: "fill",
                source: "tiles",
                paint: {
                    "fill-color": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false],
                        "#22c55e", // Green when selected
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
                        ["boolean", ["feature-state", "selected"], false],
                        "#16a34a", // Green for selected
                        ["get", "isHighlighted"],
                        "#fbbf24", // Gold for highlighted
                        "#1e293b", // Default dark
                    ],
                    "line-width": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false],
                        2, // Thicker for selected
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
    }, [mapLoaded, tiles, highlightedTiles, hasInitiallyFit]);

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
        const selectedTileData = tiles.filter((tile) =>
            selectedTiles.has(tile.tile),
        );
        navigate("/bluetopo-downloader", {
            state: { tiles: selectedTileData },
        });
    };

    return (
        <div className="relative h-full w-full bg-terminal-bg">
            {/* Lasso Mode Indicator Border */}
            {lassoMode && (
                <div className="absolute inset-0 pointer-events-none z-30 border-4 border-terminal-green shadow-glow-green animate-pulse" />
            )}

            {/* Map Container */}
            <div
                ref={mapContainer}
                className="h-full w-full"
                style={{ position: "relative" }}
            />

            {/* Loading Indicator */}
            {(loading || !mapLoaded) && (
                <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10">
                    <div className="text-center space-y-4">
                        <div className="w-8 h-8 border-4 border-terminal-green border-t-transparent rounded-full animate-spin mx-auto shadow-glow-green"></div>
                        <p className="text-terminal-green-dim">
                            {loading
                                ? "Loading tile data..."
                                : "Loading map..."}
                        </p>
                    </div>
                </div>
            )}

            {/* Back Button */}
            <button
                onClick={() => navigate("/bluetopo-downloader")}
                className="absolute top-4 left-4 z-30 bg-terminal-surface hover:bg-terminal-green/10 rounded-lg shadow-glow-green-sm p-3 border border-terminal-border hover:border-terminal-green transition-colors touch-manipulation"
                title="Back to BlueTopo Downloader"
            >
                <svg
                    className="w-6 h-6 text-terminal-green"
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
            {!loading && (
                <div className="absolute top-16 left-4 bg-terminal-surface rounded-lg shadow-glow-green-sm p-4 max-w-sm z-20 border border-terminal-border">
                    <h3 className="font-semibold text-terminal-green mb-3 uppercase tracking-wide text-sm">
                        Selection Tools
                    </h3>

                    {/* Lasso Mode Button */}
                    <button
                        onClick={() => setLassoMode(!lassoMode)}
                        className={`w-full mb-3 px-4 py-3 rounded-lg font-medium transition-all touch-manipulation ${
                            lassoMode
                                ? "bg-terminal-green text-terminal-bg shadow-glow-green"
                                : "bg-terminal-bg border border-terminal-border hover:border-terminal-green text-terminal-green"
                        }`}
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

                    <div className="text-sm space-y-2 text-terminal-green-dim font-mono">
                        <div>
                            <span className="text-terminal-green">Selected:</span> {selectedTiles.size} /{" "}
                            {stats.total} tiles
                        </div>
                        <div className="space-y-1">
                            <div>
                                <span className="text-terminal-green">Resolution:</span>
                            </div>
                            {Object.entries(stats.resolutions).map(
                                ([res, count]) => (
                                    <div
                                        key={res}
                                        className="flex items-center space-x-2 ml-4"
                                    >
                                        <div
                                            className={`w-3 h-3 rounded ${
                                                res === "2m"
                                                    ? "bg-terminal-red"
                                                    : res === "4m"
                                                      ? "bg-terminal-cyan"
                                                      : res === "8m"
                                                        ? "bg-terminal-green"
                                                        : res === "16m"
                                                          ? "bg-terminal-amber"
                                                          : "bg-terminal-border"
                                            }`}
                                        ></div>
                                        <span>
                                            {res}: {count} tiles
                                        </span>
                                    </div>
                                ),
                            )}
                        </div>
                        <div className="text-xs text-terminal-green-dim mt-3 pt-3 border-t border-terminal-border">
                            {lassoMode ? (
                                <>
                                    <div className="flex items-center space-x-1 text-terminal-green font-medium mb-1">
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
                </div>
            )}

            {/* Highlighted Tiles Banner */}
            {highlightedTiles.length > 0 && (
                <div className="absolute top-4 right-4 bg-terminal-amber/10 border-2 border-terminal-amber rounded-lg shadow-glow-amber p-4 max-w-sm z-20">
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-10 h-10 bg-terminal-amber rounded-full">
                            <span className="text-lg font-bold text-terminal-bg">
                                {highlightedTiles.length}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-semibold text-terminal-amber">
                                Selected Tiles Highlighted
                            </h3>
                            <p className="text-xs text-terminal-green-dim">
                                Shown with gold outline
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Selected Tile Info Panel */}
            {selectedTile && (
                <div className="absolute bottom-4 left-4 bg-terminal-surface rounded-lg shadow-glow-green-sm p-4 max-w-md z-20 border border-terminal-border">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-terminal-green font-mono">
                            Tile: {selectedTile.tile}
                        </h3>
                        <button
                            onClick={() => setSelectedTile(null)}
                            className="text-terminal-green-dim hover:text-terminal-green"
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
                    <div className="text-sm space-y-2 text-terminal-green-dim font-mono">
                        <div>
                            <span className="text-terminal-green">Resolution:</span>{" "}
                            {selectedTile.resolution}
                        </div>
                        <div>
                            <span className="text-terminal-green">Delivery Date:</span>{" "}
                            {new Date(selectedTile.date).toLocaleDateString()}
                        </div>
                        <div>
                            <span className="text-terminal-green">UTM Zone:</span> {selectedTile.utm}
                        </div>
                        <div className="pt-2">
                            <a
                                href={selectedTile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-terminal-cyan hover:underline text-xs break-all"
                            >
                                Download URL →
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Selection Action Panel */}
            {selectedTiles.size > 0 && (
                <div className="absolute bottom-4 right-4 bg-terminal-surface rounded-lg shadow-glow-green p-4 z-20 border border-terminal-green">
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                            <div className="flex items-center justify-center w-10 h-10 bg-terminal-green rounded-full shadow-glow-green-sm">
                                <span className="text-lg font-bold text-terminal-bg">
                                    {selectedTiles.size}
                                </span>
                            </div>
                            <div className="text-sm text-terminal-green-dim font-mono">
                                tile{selectedTiles.size !== 1 ? "s" : ""}{" "}
                                selected
                            </div>
                        </div>
                        <div className="flex space-x-2">
                            <button
                                onClick={handleClearSelection}
                                className="terminal-btn"
                            >
                                Clear
                            </button>
                            <button
                                onClick={handleViewSelected}
                                className="terminal-btn-primary"
                            >
                                View Selected
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BlueTopoTilesView;
