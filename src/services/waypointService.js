/**
 * Waypoint Service - Frontend
 * API wrapper for waypoint CRUD operations
 */

// Use relative URL that works from any client
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3002/api/waypoints'
  : `http://${window.location.hostname}:3002/api/waypoints`;

/**
 * Get all waypoints
 * @returns {Promise<{success: boolean, count: number, waypoints: Array}>}
 */
export async function getAllWaypoints() {
  try {
    const response = await fetch(`${API_BASE_URL}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch waypoints: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching waypoints:', error);
    throw error;
  }
}

/**
 * Get a single waypoint by ID
 * @param {number} id - Waypoint ID
 * @returns {Promise<{success: boolean, waypoint: Object}>}
 */
export async function getWaypoint(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch waypoint: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching waypoint:', error);
    throw error;
  }
}

/**
 * Create a new waypoint
 * @param {Object} data - Waypoint data
 * @param {string} data.name - Waypoint name
 * @param {string} [data.description] - Optional description
 * @param {number} data.latitude - Latitude (-90 to 90)
 * @param {number} data.longitude - Longitude (-180 to 180)
 * @param {string} [data.icon] - Icon identifier
 * @param {string} [data.color] - Hex color string
 * @returns {Promise<{success: boolean, message: string, waypoint: Object}>}
 */
export async function createWaypoint(data) {
  try {
    const response = await fetch(`${API_BASE_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to create waypoint: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating waypoint:', error);
    throw error;
  }
}

/**
 * Update an existing waypoint
 * @param {number} id - Waypoint ID
 * @param {Object} data - Fields to update
 * @returns {Promise<{success: boolean, message: string, waypoint: Object}>}
 */
export async function updateWaypoint(id, data) {
  try {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to update waypoint: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating waypoint:', error);
    throw error;
  }
}

/**
 * Delete a single waypoint
 * @param {number} id - Waypoint ID to delete
 * @returns {Promise<{success: boolean, message: string, id: number}>}
 */
export async function deleteWaypoint(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to delete waypoint: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting waypoint:', error);
    throw error;
  }
}

/**
 * Delete multiple waypoints at once
 * @param {Array<number>} ids - Array of waypoint IDs to delete
 * @returns {Promise<{success: boolean, message: string, deleted: Array, failed: Array}>}
 */
export async function deleteWaypointsBatch(ids) {
  try {
    const response = await fetch(`${API_BASE_URL}/delete-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to delete waypoints: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting waypoints:', error);
    throw error;
  }
}

/**
 * Export waypoints as CSV file (triggers download)
 * @returns {Promise<string>} CSV content
 */
export async function exportWaypointsCSV() {
  try {
    const response = await fetch(`${API_BASE_URL}/export/csv`);
    if (!response.ok) {
      throw new Error(`Failed to export waypoints: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error('Error exporting waypoints:', error);
    throw error;
  }
}

/**
 * Format waypoints for clipboard sharing
 * @param {Array} waypoints - Array of waypoint objects
 * @returns {string} Formatted text for clipboard
 */
export function formatWaypointsForClipboard(waypoints) {
  return waypoints.map(wp =>
    `${wp.name}: ${wp.latitude.toFixed(6)}, ${wp.longitude.toFixed(6)}${wp.description ? ` - ${wp.description}` : ''}`
  ).join('\n');
}

/**
 * Generate mailto link for sharing waypoints via email
 * @param {Array} waypoints - Array of waypoint objects
 * @returns {string} mailto: URL
 */
export function generateWaypointEmailLink(waypoints) {
  const subject = `OpenHelm Waypoints (${waypoints.length})`;
  const body = waypoints.map(wp =>
    `${wp.name}\nPosition: ${wp.latitude.toFixed(6)}, ${wp.longitude.toFixed(6)}${wp.description ? `\nDescription: ${wp.description}` : ''}`
  ).join('\n\n');

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
