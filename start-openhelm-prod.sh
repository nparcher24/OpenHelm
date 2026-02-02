#!/bin/bash

# OpenHelm Production Startup Script
# Uses production build for better performance on Raspberry Pi 5

set -e

echo "Starting OpenHelm (Production Mode)..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() { echo -e "${BLUE}[OpenHelm]${NC} $1"; }
print_success() { echo -e "${GREEN}[OpenHelm]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[OpenHelm]${NC} $1"; }
print_error() { echo -e "${RED}[OpenHelm]${NC} $1"; }

# Step 1: Kill existing processes
print_status "Terminating existing processes..."
pkill -f "martin" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true
pkill -f "npm.*preview" 2>/dev/null || true
pkill -f "api-server/server.js" 2>/dev/null || true
pkill -f "chromium-browser" 2>/dev/null || true

API_PORT_PID=$(lsof -ti :3002 2>/dev/null || true)
[ -n "$API_PORT_PID" ] && kill $API_PORT_PID 2>/dev/null || true

sleep 2

# Step 2: Build production bundle
print_status "Building production bundle..."
npm run build
print_success "Production build complete"

# Step 3: Start Martin tile server
print_status "Starting Martin tile server on port 3001..."
martin --config martin-config.yaml > martin.log 2>&1 &
MARTIN_PID=$!
sleep 3

if kill -0 $MARTIN_PID 2>/dev/null; then
    print_success "Martin tile server started (PID: $MARTIN_PID)"
else
    print_error "Failed to start Martin tile server"
    exit 1
fi

# Step 4: Start API server
print_status "Starting API server on port 3002..."
node api-server/server.js > api.log 2>&1 &
API_PID=$!
sleep 3

if kill -0 $API_PID 2>/dev/null; then
    print_success "API server started (PID: $API_PID)"
else
    print_error "Failed to start API server"
    kill $MARTIN_PID 2>/dev/null
    exit 1
fi

# Step 5: Start Vite preview server (serves production build)
print_status "Starting production server on port 3000..."
npm run preview -- --host 0.0.0.0 --port 3000 > vite.log 2>&1 &
VITE_PID=$!
sleep 5

if kill -0 $VITE_PID 2>/dev/null; then
    print_success "Production server started (PID: $VITE_PID)"
else
    print_error "Failed to start production server"
    kill $MARTIN_PID $API_PID 2>/dev/null
    exit 1
fi

# Step 6: Configure display and launch Chromium
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0
fi

if xset q &>/dev/null; then
    xset s off 2>/dev/null || true
    xset -dpms 2>/dev/null || true
    xset s noblank 2>/dev/null || true
    sleep 2

    if command -v chromium-browser &> /dev/null; then
        CHROMIUM_CMD="chromium-browser"
    elif command -v chromium &> /dev/null; then
        CHROMIUM_CMD="chromium"
    else
        print_warning "Chromium not found - access at http://localhost:3000"
        CHROMIUM_PID=""
    fi

    if [ -n "$CHROMIUM_CMD" ]; then
        print_status "Launching Chromium (GPU-accelerated)..."
        $CHROMIUM_CMD \
          --no-sandbox \
          --window-size=1920,1080 \
          --window-position=0,0 \
          --no-first-run \
          --no-default-browser-check \
          --disable-infobars \
          --disable-translate \
          --disable-background-timer-throttling \
          --disable-renderer-backgrounding \
          --disable-backgrounding-occluded-windows \
          --enable-gpu-rasterization \
          --enable-oop-rasterization \
          --enable-hardware-overlays \
          --use-gl=egl \
          --ignore-gpu-blocklist \
          --enable-zero-copy \
          --enable-native-gpu-memory-buffers \
          --canvas-oop-rasterization \
          --disable-dev-shm-usage \
          --password-store=basic \
          --overscroll-history-navigation=0 \
          --touch-events=enabled \
          http://localhost:3000 &
        CHROMIUM_PID=$!
    fi
else
    print_warning "No X server detected - access at http://localhost:3000"
    CHROMIUM_PID=""
fi

print_success "OpenHelm started in PRODUCTION mode!"
echo ""
echo "Frontend: http://localhost:3000 (production build)"
echo "Tiles:    http://localhost:3001"
echo "API:      http://localhost:3002"
echo ""
echo "PIDs: Martin=$MARTIN_PID, API=$API_PID, Vite=$VITE_PID, Chromium=$CHROMIUM_PID"
echo ""
print_status "Press Ctrl+C to stop all services"

cleanup() {
    echo ""
    print_status "Shutting down..."
    [ -n "$CHROMIUM_PID" ] && kill $CHROMIUM_PID 2>/dev/null
    [ -n "$VITE_PID" ] && kill $VITE_PID 2>/dev/null
    [ -n "$API_PID" ] && kill $API_PID 2>/dev/null
    [ -n "$MARTIN_PID" ] && kill $MARTIN_PID 2>/dev/null
    print_success "Shutdown complete"
    exit 0
}

trap cleanup SIGINT SIGTERM

while true; do
    if ! kill -0 $MARTIN_PID 2>/dev/null; then
        print_error "Martin died unexpectedly"
        break
    fi
    if ! kill -0 $API_PID 2>/dev/null; then
        print_error "API server died unexpectedly"
        break
    fi
    if ! kill -0 $VITE_PID 2>/dev/null; then
        print_error "Production server died unexpectedly"
        break
    fi
    if [ -n "$CHROMIUM_PID" ] && ! kill -0 $CHROMIUM_PID 2>/dev/null; then
        print_warning "Chromium closed - servers still running at http://localhost:3000"
        CHROMIUM_PID=""
    fi
    sleep 5
done

cleanup
