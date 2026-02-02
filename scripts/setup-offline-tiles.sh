#!/bin/bash

# OpenHelm Offline Tile Setup
# Creates a minimal offline tile solution for marine navigation

set -e

echo "🗺️  Setting up offline tiles for OpenHelm..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[Offline Setup]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[Offline Setup]${NC} ✅ $1"
}

print_warning() {
    echo -e "${YELLOW}[Offline Setup]${NC} ⚠️  $1"
}

# Create minimal sample tiles for Virginia Beach area
print_status "Creating sample offline tiles..."

# Create tile directory structure
mkdir -p tiles/sample-tiles/{8,9,10,11,12}/{128,129,130}/{96,97,98}

# Create a simple blue tile (representing water) as PNG
python3 -c "
from PIL import Image
import os

# Create a simple blue tile representing water
def create_water_tile():
    img = Image.new('RGB', (256, 256), color='#a8cce8')  # Light blue water
    return img

def create_land_tile():
    img = Image.new('RGB', (256, 256), color='#f0e6d2')  # Light tan land
    return img

# Generate basic tiles for Virginia Beach area
for z in [8, 9, 10, 11, 12]:
    for x in [128, 129, 130]:
        for y in [96, 97, 98]:
            tile_path = f'tiles/sample-tiles/{z}/{x}/{y}.png'
            os.makedirs(os.path.dirname(tile_path), exist_ok=True)
            
            # Simple logic: tiles closer to shore are land, others water
            if x == 129 and y == 97:  # Virginia Beach area
                tile = create_land_tile()
            else:
                tile = create_water_tile()
            
            tile.save(tile_path, 'PNG')

print('Sample tiles created successfully')
" 2>/dev/null || {
    print_warning "Python PIL not available, creating basic tiles with ImageMagick..."
    
    # Fallback: create basic tiles with convert command
    for z in {8..12}; do
        for x in {128..130}; do
            for y in {96..98}; do
                mkdir -p "tiles/sample-tiles/$z/$x"
                
                if command -v convert >/dev/null 2>&1; then
                    # Create simple colored tiles
                    if [[ $x -eq 129 && $y -eq 97 ]]; then
                        # Land tile (tan)
                        convert -size 256x256 xc:"#f0e6d2" "tiles/sample-tiles/$z/$x/$y.png"
                    else
                        # Water tile (blue)
                        convert -size 256x256 xc:"#a8cce8" "tiles/sample-tiles/$z/$x/$y.png"
                    fi
                else
                    # Create empty placeholder files
                    touch "tiles/sample-tiles/$z/$x/$y.png"
                fi
            done
        done
    done
}

print_success "Sample tiles created in tiles/sample-tiles/"

# Update Martin configuration to serve our offline tiles
print_status "Configuring Martin for offline tile serving..."

cat > martin-config-offline.yaml << EOF
# Martin Offline Configuration for OpenHelm
listen_addresses: "0.0.0.0:3001"

# Performance optimizations for Pi hardware
worker_processes: 2
max_feature_count: 10000

# Serve static tiles directory
sprite_sources:
  sample-tiles:
    path: "./tiles/sample-tiles"

# Enable directory tile serving (if Martin supports it)
# Otherwise we'll serve through a simple HTTP endpoint

# Cache configuration
cache_size_mb: 256

# Enable CORS for local access
EOF

print_success "Martin offline configuration created"

print_status "Creating offline tile serving endpoint..."

# Create a simple tile server script as backup
cat > serve-offline-tiles.py << 'EOF'
#!/usr/bin/env python3
"""
Simple offline tile server for OpenHelm
Serves tiles from the local tiles directory
"""

import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import mimetypes

class TileHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse the request path
        path = urlparse(self.path).path
        
        # Handle tile requests: /tiles/{z}/{x}/{y}.png
        if path.startswith('/tiles/'):
            parts = path.split('/')
            if len(parts) == 5:  # ['', 'tiles', z, x, y.png]
                z, x, y_ext = parts[2], parts[3], parts[4]
                if y_ext.endswith('.png'):
                    y = y_ext[:-4]  # Remove .png extension
                    
                    tile_path = f'tiles/sample-tiles/{z}/{x}/{y}.png'
                    
                    if os.path.exists(tile_path):
                        self.send_response(200)
                        self.send_header('Content-type', 'image/png')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        
                        with open(tile_path, 'rb') as f:
                            self.wfile.write(f.read())
                        return
        
        # Return 404 for other requests
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Tile not found')
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass

if __name__ == '__main__':
    port = 3002  # Use different port from Martin
    server = HTTPServer(('0.0.0.0', port), TileHandler)
    print(f'Serving offline tiles on http://0.0.0.0:{port}')
    print('Access tiles at: http://localhost:3002/tiles/{z}/{x}/{y}.png')
    server.serve_forever()
EOF

chmod +x serve-offline-tiles.py

print_success "Offline tile server script created"
print_status "You can run it with: python3 serve-offline-tiles.py"

print_success "Offline tile setup complete!"
print_status "Sample tiles cover the Virginia Beach area (limited zoom levels)"
print_warning "For production use, download actual map tiles using a tile downloading tool"