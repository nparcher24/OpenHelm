#!/bin/bash

# OpenHelm GUI Launcher
# Ensures services are running, then launches Chromium with GPU

cd "$(dirname "$0")"

# Set display
export DISPLAY=:0

echo "🚀 Launching OpenHelm..."

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

echo "🌐 Launching Chromium with GPU..."

# Launch Chromium with default settings (GPU works best this way) and skip keychain
chromium-browser --password-store=basic http://localhost:3000 &

sleep 2
echo "✅ OpenHelm launched!"
