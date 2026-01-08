/**
 * Waypoint Icons and Colors
 * SVG paths for marine navigation waypoint icons
 */

// Icon definitions with SVG paths (all viewBox="0 0 24 24")
export const WAYPOINT_ICONS = {
  'map-pin': {
    label: 'General',
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'
  },
  'anchor': {
    label: 'Anchorage',
    path: 'M17 15l-3-3V9c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.62-.97 3.01-2.36 3.64L17 15zm-5 7c-3.87 0-7-3.13-7-7h2c0 2.76 2.24 5 5 5s5-2.24 5-5h2c0 3.87-3.13 7-7 7zm0-6c-1.66 0-3-1.34-3-3h2c0 .55.45 1 1 1s1-.45 1-1h2c0 1.66-1.34 3-3 3z'
  },
  'lighthouse': {
    label: 'Landmark',
    path: 'M9 21h6v-2H9v2zm3-19l-7 7v2h3v7h2v-7h4v7h2v-7h3v-2l-7-7zm0 3.5L14.5 8h-5L12 5.5z'
  },
  'sailboat': {
    label: 'Marina',
    path: 'M11 13V5c0-.55.45-1 1-1s1 .45 1 1v1h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v5h4.4l-5.9 5.9c-.2.2-.5.2-.7 0L4 13h7zm8 6v2H5v-2h14z'
  },
  'fishing': {
    label: 'Fishing',
    path: 'M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z'
  },
  'buoy': {
    label: 'Buoy',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'
  },
  'lifebuoy': {
    label: 'Safety',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z'
  },
  'star': {
    label: 'Favorite',
    path: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'
  }
};

// Preset colors for waypoints
export const WAYPOINT_COLORS = [
  { hex: '#00ff00', label: 'Green' },
  { hex: '#ff4444', label: 'Red' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#00ffff', label: 'Cyan' },
  { hex: '#ff00ff', label: 'Magenta' },
  { hex: '#ff8800', label: 'Orange' },
  { hex: '#ffffff', label: 'White' }
];

/**
 * Get icon definition by ID
 * @param {string} iconId - Icon identifier
 * @returns {Object} Icon definition with label and path
 */
export function getIconDefinition(iconId) {
  return WAYPOINT_ICONS[iconId] || WAYPOINT_ICONS['map-pin'];
}

/**
 * Get all icon IDs
 * @returns {Array<string>} Array of icon IDs
 */
export function getIconIds() {
  return Object.keys(WAYPOINT_ICONS);
}

/**
 * Render waypoint icon as JSX SVG element
 * @param {string} iconId - Icon identifier
 * @param {string} color - Fill color (hex)
 * @param {string} className - CSS class for sizing
 * @returns {JSX.Element} SVG element
 */
export function WaypointIcon({ iconId, color = '#00ff00', className = 'w-6 h-6' }) {
  const icon = getIconDefinition(iconId);

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={icon.path} />
    </svg>
  );
}

/**
 * Create SVG string for map marker (for MapLibre marker elements)
 * @param {string} iconId - Icon identifier
 * @param {string} color - Fill color (hex)
 * @param {number} size - Size in pixels
 * @returns {string} SVG HTML string
 */
export function createMarkerSVG(iconId, color = '#00ff00', size = 32) {
  const icon = getIconDefinition(iconId);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      <path d="${icon.path}" />
    </svg>
  `;
}

/**
 * Format latitude for display
 * @param {number} lat - Latitude in decimal degrees
 * @returns {string} Formatted latitude (e.g., "36.8532°N")
 */
export function formatLatitude(lat) {
  const dir = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(4)}°${dir}`;
}

/**
 * Format longitude for display
 * @param {number} lng - Longitude in decimal degrees
 * @returns {string} Formatted longitude (e.g., "75.9781°W")
 */
export function formatLongitude(lng) {
  const dir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lng).toFixed(4)}°${dir}`;
}

/**
 * Format coordinates for display
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Formatted coordinates
 */
export function formatCoordinates(lat, lng) {
  return `${formatLatitude(lat)} / ${formatLongitude(lng)}`;
}
