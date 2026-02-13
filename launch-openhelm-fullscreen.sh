#!/bin/bash

# OpenHelm Fullscreen GUI Launcher
# Ensures services are running, then launches Chromium in fullscreen kiosk mode

cd "$(dirname "$0")"

# Set display
export DISPLAY=:0

echo "🚀 Launching OpenHelm (Fullscreen)..."

# Check if services are already running
if ! lsof -ti :3000 > /dev/null 2>&1; then
    echo "📡 Starting backend services..."
    # Start services in background
    martin --config martin-config.yaml > martin.log 2>&1 &
    sleep 2
    node api-server/server.js > api.log 2>&1 &
    sleep 2
    npm run dev > vite.log 2>&1 &
    sleep 5
    echo "✅ Services started"
else
    echo "✅ Services already running"
fi

echo "🌐 Launching Chromium in fullscreen mode..."

# Launch Chromium in kiosk mode (fullscreen without borders)
# Press Alt+F4 or use touchscreen gestures to exit
chromium-browser \
    --kiosk \
    --password-store=basic \
    --overscroll-history-navigation=0 \
    --touch-events=enabled \
    --remote-debugging-port=9222 \
    http://localhost:3000 &

sleep 2
echo "✅ OpenHelm launched in fullscreen!"
