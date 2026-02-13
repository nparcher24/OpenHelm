#!/bin/bash

# OpenHelm Full Restart Script
# Kills all processes and restarts everything including the UI

cd "$(dirname "$0")"
export DISPLAY=:0

echo "🛑 Stopping all OpenHelm processes..."

# Kill Chromium instances showing OpenHelm
pkill -f 'chromium.*localhost:3000' 2>/dev/null

# Kill all backend services
pkill -f 'martin.*config' 2>/dev/null
pkill -f 'node.*api-server' 2>/dev/null
pkill -f 'vite' 2>/dev/null

sleep 2

# Force kill anything on our ports
for port in 3000 3001 3002; do
    pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null
    fi
done

sleep 1
echo "✅ All processes stopped"

echo "🚀 Starting OpenHelm services..."

# Start Martin tile server
echo "  Starting Martin tileserver (port 3001)..."
martin --config martin-config.yaml > martin.log 2>&1 &
sleep 2

# Start API server
echo "  Starting API server (port 3002)..."
node api-server/server.js > api.log 2>&1 &
sleep 2

# Start Vite dev server
echo "  Starting Vite dev server (port 3000)..."
npm run dev > vite.log 2>&1 &
sleep 4

# Verify services
echo ""
echo "📊 Service Status:"
ALL_OK=true
for port in 3000 3001 3002; do
    if lsof -ti :$port > /dev/null 2>&1; then
        echo "  ✅ Port $port: Running"
    else
        echo "  ❌ Port $port: Failed"
        ALL_OK=false
    fi
done

if [ "$ALL_OK" = true ]; then
    echo ""
    echo "🌐 Launching Chromium with GPU acceleration..."
    # System config in /etc/chromium.d/01-openhelm-gpu adds GPU flags
    # Enable remote debugging for MCP browser automation
    chromium-browser \
        --window-size=1920,1080 \
        --window-position=0,0 \
        --password-store=basic \
        --overscroll-history-navigation=0 \
        --touch-events=enabled \
        --remote-debugging-port=9222 \
        http://localhost:3000 &
    sleep 2
    echo "✅ OpenHelm restarted successfully!"
else
    echo ""
    echo "❌ Some services failed to start. Check logs:"
    echo "   tail -f api.log martin.log vite.log"
fi
