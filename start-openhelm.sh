#!/bin/bash

# OpenHelm Complete System Startup Script
# Kills existing processes, starts tile server, frontend, and launches app

set -e

echo "🚀 Starting OpenHelm Marine Navigation System..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[OpenHelm]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OpenHelm]${NC} ✅ $1"
}

print_warning() {
    echo -e "${YELLOW}[OpenHelm]${NC} ⚠️  $1"
}

print_error() {
    echo -e "${RED}[OpenHelm]${NC} ❌ $1"
}

# Step 1: Kill existing processes
print_status "Terminating existing processes..."

# Kill existing tile servers
pkill -f "martin" 2>/dev/null && print_success "Stopped existing Martin tile server" || print_warning "No existing Martin processes found"

# Kill existing Node.js development servers
pkill -f "vite" 2>/dev/null && print_success "Stopped existing Vite dev server" || print_warning "No existing Vite processes found"
pkill -f "npm.*dev" 2>/dev/null && print_success "Stopped existing npm dev processes" || true

# Kill existing API server processes
pkill -f "api-server/server.js" 2>/dev/null && print_success "Stopped existing API server" || print_warning "No existing API server processes found"

# Kill any process using port 3002 (API server port)
API_PORT_PID=$(lsof -ti :3002 2>/dev/null || true)
if [ -n "$API_PORT_PID" ]; then
    kill $API_PORT_PID 2>/dev/null && print_success "Killed process using port 3002" || print_warning "Could not kill process on port 3002"
fi

# Kill existing Chromium instances
pkill -f "chromium-browser" 2>/dev/null && print_success "Closed existing Chromium instances" || print_warning "No existing Chromium instances found"

# Wait for processes to clean up
sleep 2

# Step 2: Install Martin if not present
print_status "Checking Martin tile server installation..."

if ! command -v martin &> /dev/null; then
    print_status "Installing Martin tile server..."
    
    # Get latest Martin version and download for ARM64 Linux
    MARTIN_VERSION="v0.18.1"
    MARTIN_URL="https://github.com/maplibre/martin/releases/download/${MARTIN_VERSION}/martin-aarch64-unknown-linux-musl.tar.gz"
    
    print_status "Downloading Martin ${MARTIN_VERSION} for ARM64 Linux..."
    if ! curl -L -o martin.tar.gz "$MARTIN_URL"; then
        print_error "Failed to download Martin"
        exit 1
    fi
    
    print_status "Extracting Martin..."
    if ! tar -xzf martin.tar.gz; then
        print_error "Failed to extract Martin"
        exit 1
    fi
    
    print_status "Installing Martin..."
    if ! sudo mv martin /usr/local/bin/; then
        print_error "Failed to install Martin (try running with sudo or install manually)"
        exit 1
    fi
    
    rm martin.tar.gz
    print_success "Martin tile server installed"
else
    print_success "Martin tile server already installed"
fi

# Step 3: Install frontend dependencies
print_status "Installing frontend dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    print_success "Frontend dependencies installed"
else
    print_success "Frontend dependencies already installed"
fi

# Step 4: Start Martin tile server in background
print_status "Starting Martin tile server on port 3001..."
martin --config martin-config.yaml > martin.log 2>&1 &
MARTIN_PID=$!

# Wait for Martin to start
sleep 3

# Check if Martin started successfully
if kill -0 $MARTIN_PID 2>/dev/null; then
    print_success "Martin tile server started (PID: $MARTIN_PID)"
    echo "📍 Tile server URL: http://localhost:3001"
else
    print_error "Failed to start Martin tile server"
    print_status "Check martin.log for details"
    exit 1
fi

# Step 5: Start API server in background
print_status "Starting OpenHelm API server on port 3002..."
node api-server/server.js > api.log 2>&1 &
API_PID=$!

# Wait for API server to start
sleep 3

# Check if API server started successfully
if kill -0 $API_PID 2>/dev/null; then
    print_success "API server started (PID: $API_PID)"
    echo "📡 API URL: http://localhost:3002"
else
    print_error "Failed to start API server"
    print_status "Check api.log for details"
    kill $MARTIN_PID 2>/dev/null
    exit 1
fi

# Step 6: Start Vite development server in background
print_status "Starting Vite development server on port 3000..."
npm run dev > vite.log 2>&1 &
VITE_PID=$!

# Wait for Vite to start
sleep 5

# Check if Vite started successfully
if kill -0 $VITE_PID 2>/dev/null; then
    print_success "Vite development server started (PID: $VITE_PID)"
    echo "🌐 Frontend URL: http://localhost:3000"
else
    print_error "Failed to start Vite development server"
    print_status "Check vite.log for details"
    kill $MARTIN_PID 2>/dev/null
    kill $API_PID 2>/dev/null
    exit 1
fi

# Step 7: Configure display and launch Chromium
print_status "Configuring display for marine use..."

# Check if we have a display available
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0
fi

# Check if X server is running
if xset q &>/dev/null; then
    print_status "X server detected, configuring display settings..."
    # Disable screen blanking and power management
    xset s off 2>/dev/null || print_warning "Could not disable screen blanking"
    xset -dpms 2>/dev/null || print_warning "Could not disable power management"  
    xset s noblank 2>/dev/null || print_warning "Could not disable screen blanking"
    
    # Wait a moment for servers to be fully ready
    sleep 2
    
    print_status "Launching OpenHelm in windowed mode..."

    # Check if chromium-browser exists
    if command -v chromium-browser &> /dev/null; then
        CHROMIUM_CMD="chromium-browser"
    elif command -v chromium &> /dev/null; then
        CHROMIUM_CMD="chromium"
    else
        print_error "Chromium browser not found"
        print_status "Install with: sudo apt install chromium-browser"
        print_status "Servers are running - you can access at http://localhost:3000"
        CHROMIUM_PID=""
    fi

    if [ -n "$CHROMIUM_CMD" ]; then
        # Launch Chromium in windowed mode optimized for Raspberry Pi 5 GPU acceleration
        # Note: Do NOT pass --use-gl=egl or --use-angle flags - Chromium 145+ auto-detects
        $CHROMIUM_CMD \
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
          --ignore-gpu-blocklist \
          --enable-zero-copy \
          --disable-dev-shm-usage \
          --password-store=basic \
          --overscroll-history-navigation=0 \
          --touch-events=enabled \
          --remote-debugging-port=9222 \
          http://localhost:3000 &

        CHROMIUM_PID=$!
    fi
else
    print_warning "No X server detected - running in headless mode"
    print_status "Access OpenHelm at: http://localhost:3000"
    CHROMIUM_PID=""
fi

print_success "OpenHelm launched successfully!"
echo ""
echo "🧭 OpenHelm Marine Navigation System is running:"
echo "   Frontend: http://localhost:3000"
echo "   Tiles:    http://localhost:3001"
echo ""
echo "📋 Process IDs:"
echo "   Martin:   $MARTIN_PID"
echo "   API:      $API_PID"
echo "   Vite:     $VITE_PID"
echo "   Chromium: $CHROMIUM_PID"
echo ""
echo "📝 Logs:"
echo "   Tile server: martin.log"
echo "   API server:  api.log"
echo "   Frontend:    vite.log"
echo ""
print_status "Press Ctrl+C to stop all services"

# Trap Ctrl+C to cleanly shut down all services
cleanup() {
    echo ""
    print_status "Shutting down OpenHelm services..."
    [ -n "$CHROMIUM_PID" ] && kill $CHROMIUM_PID 2>/dev/null && print_success "Stopped Chromium"
    [ -n "$VITE_PID" ] && kill $VITE_PID 2>/dev/null && print_success "Stopped Vite server"
    [ -n "$API_PID" ] && kill $API_PID 2>/dev/null && print_success "Stopped API server"
    [ -n "$MARTIN_PID" ] && kill $MARTIN_PID 2>/dev/null && print_success "Stopped Martin tile server"
    print_success "OpenHelm shutdown complete"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running and monitor processes
while true; do
    # Check if any critical process died
    if ! kill -0 $MARTIN_PID 2>/dev/null; then
        print_error "Martin tile server died unexpectedly"
        break
    fi
    
    if ! kill -0 $API_PID 2>/dev/null; then
        print_error "API server died unexpectedly"
        break
    fi
    
    if ! kill -0 $VITE_PID 2>/dev/null; then
        print_error "Vite development server died unexpectedly"
        break
    fi
    
    # Only monitor Chromium if it was started
    if [ -n "$CHROMIUM_PID" ] && ! kill -0 $CHROMIUM_PID 2>/dev/null; then
        print_warning "Chromium closed - keeping servers running"
        print_status "You can reopen at: http://localhost:3000"
        CHROMIUM_PID=""  # Don't keep checking
    fi
    
    sleep 5
done

# If we get here, something failed
print_error "A critical service failed. Cleaning up..."
cleanup