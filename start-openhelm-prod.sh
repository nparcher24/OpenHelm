#!/bin/bash

# OpenHelm Production Kiosk Startup Script
# Launches OpenHelm in fullscreen kiosk mode on Raspberry Pi 5 (Wayland/labwc)
# Usage: ./start-openhelm-prod.sh [--rebuild]

cd /home/hic/OpenHelm

echo "Starting OpenHelm (Production Kiosk Mode)..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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
pkill -f "chromium-browser|chromium" 2>/dev/null || true

API_PORT_PID=$(lsof -ti :3002 2>/dev/null || true)
[ -n "$API_PORT_PID" ] && kill $API_PORT_PID 2>/dev/null || true

sleep 2

# Step 2: Build production bundle (skip if dist/ exists unless --rebuild)
if [ "$1" = "--rebuild" ] || [ ! -d "dist" ]; then
    print_status "Building production bundle..."
    if npm run build; then
        print_success "Production build complete"
    else
        print_error "Production build failed"
        exit 1
    fi
else
    print_success "Using existing production build (dist/)"
fi

# Step 3: Start backend services in parallel
print_status "Starting backend services..."

martin --config martin-config.yaml > martin.log 2>&1 &
MARTIN_PID=$!

node api-server/server.js > api.log 2>&1 &
API_PID=$!

npm run preview -- --host 0.0.0.0 --port 3000 > vite.log 2>&1 &
VITE_PID=$!

# Wait for all services to be ready (poll instead of fixed sleep)
# Cold boot on Pi 5 can take 60s+ for node/npm to start
print_status "Waiting for services to be ready..."
MAX_WAIT=90
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s -o /dev/null -w '' http://localhost:3000 2>/dev/null; then
        print_success "Frontend server is ready (${WAITED}s)"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done
if [ $WAITED -ge $MAX_WAIT ]; then
    print_error "Frontend server did not start within ${MAX_WAIT}s"
    kill $MARTIN_PID $API_PID $VITE_PID 2>/dev/null || true
    exit 1
fi

# Verify services started
FAILED=0
if kill -0 $MARTIN_PID 2>/dev/null; then
    print_success "Martin tile server started (PID: $MARTIN_PID)"
else
    print_error "Failed to start Martin tile server"
    FAILED=1
fi

if kill -0 $API_PID 2>/dev/null; then
    print_success "API server started (PID: $API_PID)"
else
    print_error "Failed to start API server"
    FAILED=1
fi

if kill -0 $VITE_PID 2>/dev/null; then
    print_success "Production server started (PID: $VITE_PID)"
else
    print_error "Failed to start production server"
    FAILED=1
fi

if [ "$FAILED" -eq 1 ]; then
    print_error "One or more services failed to start. Cleaning up..."
    kill $MARTIN_PID $API_PID $VITE_PID 2>/dev/null || true
    exit 1
fi

# Step 4: Launch Chromium in kiosk mode
# Ensure XDG_RUNTIME_DIR is set (may be missing in autostart context)
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Detect Wayland vs X11
if [ -n "$WAYLAND_DISPLAY" ]; then
    print_status "Wayland display detected ($WAYLAND_DISPLAY)"
    PLATFORM_FLAGS="--ozone-platform=wayland"
elif [ -n "$DISPLAY" ]; then
    print_status "X11 display detected ($DISPLAY)"
    PLATFORM_FLAGS=""
else
    # Autostart context - WAYLAND_DISPLAY may not be set yet
    # Auto-detect the wayland socket from /run/user/1000/
    export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    WAYLAND_SOCK=$(ls "$XDG_RUNTIME_DIR"/wayland-* 2>/dev/null | grep -v '\.lock' | head -1 | xargs basename 2>/dev/null)
    export WAYLAND_DISPLAY="${WAYLAND_SOCK:-wayland-0}"
    print_status "Auto-detected display: $WAYLAND_DISPLAY (XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR)"
    PLATFORM_FLAGS="--ozone-platform=wayland"
fi

if command -v chromium-browser &> /dev/null; then
    CHROMIUM_CMD="chromium-browser"
elif command -v chromium &> /dev/null; then
    CHROMIUM_CMD="chromium"
else
    print_warning "Chromium not found - access at http://localhost:3000"
    CHROMIUM_CMD=""
fi

if [ -n "$CHROMIUM_CMD" ]; then
    print_status "Launching Chromium in kiosk mode..."
    $CHROMIUM_CMD \
      --kiosk \
      --no-sandbox \
      --no-first-run \
      --no-default-browser-check \
      --disable-infobars \
      --disable-translate \
      --disable-background-timer-throttling \
      --disable-renderer-backgrounding \
      --disable-backgrounding-occluded-windows \
      --enable-gpu-rasterization \
      --ignore-gpu-blocklist \
      --disable-dev-shm-usage \
      --js-flags="--max-old-space-size=8192" \
      --password-store=basic \
      --overscroll-history-navigation=0 \
      --touch-events=enabled \
      --remote-debugging-port=9222 \
      --check-for-update-interval=31536000 \
      $PLATFORM_FLAGS \
      http://localhost:3000 &
    CHROMIUM_PID=$!
    print_success "Chromium kiosk launched (PID: $CHROMIUM_PID)"
else
    CHROMIUM_PID=""
fi

print_success "OpenHelm started in PRODUCTION KIOSK mode!"
echo ""
echo "Frontend: http://localhost:3000 (production build)"
echo "Tiles:    http://localhost:3001"
echo "API:      http://localhost:3002"
echo "Debug:    http://localhost:9222"
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
        # Check if a new Martin was spawned by the API server (e.g. restart from UI)
        NEW_PID=$(lsof -ti :3001 2>/dev/null | head -1)
        if [ -n "$NEW_PID" ]; then
            print_status "Martin restarted externally (new PID: $NEW_PID)"
            MARTIN_PID=$NEW_PID
        else
            print_warning "Martin stopped — restarting..."
            martin --config martin-config.yaml >> martin.log 2>&1 &
            MARTIN_PID=$!
            sleep 2
            if kill -0 $MARTIN_PID 2>/dev/null; then
                print_success "Martin restarted (PID: $MARTIN_PID)"
            else
                print_error "Martin failed to restart"
                break
            fi
        fi
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
