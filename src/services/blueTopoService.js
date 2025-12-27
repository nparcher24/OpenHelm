/**
 * BlueTopo Service
 * Handles interactions with NOAA BlueTopo tile scheme data
 */

// Use relative URL that works from any client
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3002/api/bluetopo'
  : `http://${window.location.hostname}:3002/api/bluetopo`;

/**
 * Fetch information about the latest tile scheme available on NOAA S3
 */
export async function fetchLatestTileSchemeInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/tile-scheme/latest`);
    if (!response.ok) {
      throw new Error(`Failed to fetch latest tile scheme: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching latest tile scheme:', error);
    throw error;
  }
}

/**
 * Fetch information about the local tile scheme file
 */
export async function fetchLocalTileSchemeInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/tile-scheme/local`);
    if (!response.ok) {
      throw new Error(`Failed to fetch local tile scheme: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching local tile scheme:', error);
    throw error;
  }
}

/**
 * Download the latest tile scheme file
 */
export async function downloadTileScheme(url, filename) {
  try {
    const response = await fetch(`${API_BASE_URL}/tile-scheme/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, filename })
    });

    if (!response.ok) {
      throw new Error(`Failed to download tile scheme: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error downloading tile scheme:', error);
    throw error;
  }
}

/**
 * Check if a newer tile scheme is available and optionally download it
 */
export async function checkForUpdates() {
  try {
    const [latest, local] = await Promise.all([
      fetchLatestTileSchemeInfo(),
      fetchLocalTileSchemeInfo()
    ]);

    if (!local.exists) {
      return {
        updateAvailable: true,
        latest,
        local: null,
        message: 'No local tile scheme found'
      };
    }

    const latestDate = new Date(latest.lastModified);
    const localDate = new Date(local.lastModified);

    const updateAvailable = latestDate > localDate;

    return {
      updateAvailable,
      latest,
      local,
      message: updateAvailable
        ? 'Newer tile scheme available'
        : 'Local tile scheme is up to date'
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    throw error;
  }
}
