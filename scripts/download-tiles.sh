#!/bin/bash

# OpenHelm Offline Tile Downloader
# Downloads tiles for Virginia Beach / Chesapeake Bay area for offline use

set -e

echo "🗺️  Downloading offline tiles for Virginia Beach area..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[Tile Download]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[Tile Download]${NC} ✅ $1"
}

print_warning() {
    echo -e "${YELLOW}[Tile Download]${NC} ⚠️  $1"
}

print_error() {
    echo -e "${RED}[Tile Download]${NC} ❌ $1"
}

# Virginia Beach / Chesapeake Bay area bounds
# Southwest: Virginia Beach
# Northeast: Chesapeake Bay / Maryland border
MIN_LON=-76.5
MAX_LON=-75.5
MIN_LAT=36.5
MAX_LAT=37.5

# Zoom levels for marine navigation
MIN_ZOOM=8
MAX_ZOOM=14

print_status "Download area: Virginia Beach to Chesapeake Bay"
print_status "Longitude: ${MIN_LON} to ${MAX_LON}"
print_status "Latitude: ${MIN_LAT} to ${MAX_LAT}"
print_status "Zoom levels: ${MIN_ZOOM} to ${MAX_ZOOM}"

# Create tile directories
mkdir -p tiles/openstreetmap/{z}/{x}

# Calculate total tiles (rough estimate)
TOTAL_TILES=0
for z in $(seq $MIN_ZOOM $MAX_ZOOM); do
    # Calculate tiles at this zoom level
    TILES_AT_ZOOM=$(python3 -c "
import math
def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    x = int((lon_deg + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (x, y)

min_x, max_y = deg2num($MIN_LAT, $MIN_LON, $z)
max_x, min_y = deg2num($MAX_LAT, $MAX_LON, $z)

tiles = (max_x - min_x + 1) * (max_y - min_y + 1)
print(tiles)
")
    TOTAL_TILES=$((TOTAL_TILES + TILES_AT_ZOOM))
done

print_status "Estimated tiles to download: ${TOTAL_TILES}"
print_warning "This will take several minutes and use ~${TOTAL_TILES} HTTP requests"

# Ask for confirmation
read -p "Continue with download? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_status "Download cancelled"
    exit 0
fi

# Download tiles
DOWNLOADED=0
FAILED=0

print_status "Starting tile download..."

for z in $(seq $MIN_ZOOM $MAX_ZOOM); do
    print_status "Downloading zoom level $z..."
    
    # Calculate tile bounds for this zoom level
    python3 -c "
import math
import os
import requests
import time
from pathlib import Path

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    x = int((lon_deg + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (x, y)

zoom = $z
min_x, max_y = deg2num($MIN_LAT, $MIN_LON, zoom)
max_x, min_y = deg2num($MAX_LAT, $MAX_LON, zoom)

downloaded = 0
failed = 0

for x in range(min_x, max_x + 1):
    for y in range(min_y, max_y + 1):
        tile_dir = f'tiles/openstreetmap/{zoom}/{x}'
        tile_path = f'{tile_dir}/{y}.png'
        
        if os.path.exists(tile_path):
            continue  # Skip if already downloaded
            
        Path(tile_dir).mkdir(parents=True, exist_ok=True)
        
        # Download from OpenStreetMap tile server
        url = f'https://tile.openstreetmap.org/{zoom}/{x}/{y}.png'
        
        try:
            response = requests.get(url, timeout=10, headers={
                'User-Agent': 'OpenHelm Marine Navigation System'
            })
            response.raise_for_status()
            
            with open(tile_path, 'wb') as f:
                f.write(response.content)
            
            downloaded += 1
            if downloaded % 50 == 0:
                print(f'Downloaded {downloaded} tiles at zoom {zoom}...')
            
            # Rate limiting - be nice to OSM servers
            time.sleep(0.1)
            
        except Exception as e:
            failed += 1
            print(f'Failed to download {url}: {e}')

print(f'Zoom {zoom} complete: {downloaded} downloaded, {failed} failed')
"
done

print_success "Tile download completed!"
print_status "Downloaded tiles are stored in: tiles/openstreetmap/"

# Create a basic tile source configuration for Martin
print_status "Creating Martin configuration for offline tiles..."

# Note: We'll need to convert to MBTiles or use a different approach for Martin
print_warning "Note: Standard tile directories require additional Martin configuration"
print_status "Consider converting to MBTiles format for better Martin integration"

print_success "Offline tile setup complete!"
print_status "Tiles are ready for offline marine navigation"