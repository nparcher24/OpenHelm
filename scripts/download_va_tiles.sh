#!/bin/bash
# Download BlueTopo tiles for Virginia Beach area
# Downloads in parallel with progress tracking and resume capability

set -e

TILE_LIST="va_beach_tiles.csv"
DOWNLOAD_DIR="bluetopo_tiles"
PARALLEL_DOWNLOADS=4
LOG_FILE="download_tiles.log"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Create download directory
mkdir -p "$DOWNLOAD_DIR"

# Count total tiles (excluding header)
TOTAL_TILES=$(tail -n +2 "$TILE_LIST" | wc -l)

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}BlueTopo Tile Downloader${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""
echo -e "${GREEN}Total tiles to download: $TOTAL_TILES${NC}"
echo -e "${GREEN}Download directory: $DOWNLOAD_DIR${NC}"
echo -e "${GREEN}Parallel downloads: $PARALLEL_DOWNLOADS${NC}"
echo ""

# Initialize log
echo "Download started at $(date)" > "$LOG_FILE"

# Function to download a single tile
download_tile() {
    local tile_id="$1"
    local url="$2"
    local filename="${tile_id}.tiff"
    local filepath="$DOWNLOAD_DIR/$filename"

    # Skip if already downloaded
    if [ -f "$filepath" ]; then
        echo -e "${YELLOW}[SKIP]${NC} $tile_id (already exists)"
        return 0
    fi

    # Download with curl
    if curl -f -s -S --retry 3 --retry-delay 2 -o "$filepath" "$url" 2>&1; then
        local size=$(ls -lh "$filepath" | awk '{print $5}')
        echo -e "${GREEN}[OK]${NC}   $tile_id ($size)"
        echo "SUCCESS: $tile_id - $url" >> "$LOG_FILE"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $tile_id"
        echo "FAILED: $tile_id - $url" >> "$LOG_FILE"
        rm -f "$filepath"  # Remove partial download
        return 1
    fi
}

export -f download_tile
export DOWNLOAD_DIR LOG_FILE GREEN YELLOW RED NC BLUE

# Read CSV and download in parallel
echo "Starting downloads..."
echo ""

tail -n +2 "$TILE_LIST" | while IFS=',' read -r tile_id url resolution utm date minx miny maxx maxy; do
    echo -e "$tile_id\t$url"
done | xargs -P "$PARALLEL_DOWNLOADS" -L 1 bash -c 'download_tile "$0" "$1"'

echo ""
echo -e "${BLUE}=====================================${NC}"
echo "Download completed at $(date)" | tee -a "$LOG_FILE"

# Count successful downloads
DOWNLOADED=$(find "$DOWNLOAD_DIR" -name "*.tiff" | wc -l)
echo -e "${GREEN}Successfully downloaded: $DOWNLOADED / $TOTAL_TILES tiles${NC}"

# Calculate total size
TOTAL_SIZE=$(du -sh "$DOWNLOAD_DIR" | awk '{print $1}')
echo -e "${GREEN}Total size: $TOTAL_SIZE${NC}"
echo ""

# Check for failures
FAILED=$(grep -c "FAILED:" "$LOG_FILE" 2>/dev/null || echo "0")
if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Warning: $FAILED tiles failed to download${NC}"
    echo -e "${YELLOW}Check $LOG_FILE for details${NC}"
    echo ""
    echo "To retry failed downloads, run this script again."
fi

echo -e "${BLUE}=====================================${NC}"
