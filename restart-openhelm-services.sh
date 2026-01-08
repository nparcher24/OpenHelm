#!/bin/bash

# OpenHelm Services Restart Script
# Stops all services and restarts them cleanly

cd "$(dirname "$0")"

echo "🛑 Stopping OpenHelm services..."

# Kill all OpenHelm-related processes
pkill -f 'martin.*config' 2>/dev/null
pkill -f 'node.*api-server' 2>/dev/null
pkill -f 'vite' 2>/dev/null

sleep 2

# Double-check ports are free
for port in 3000 3001 3002; do
    pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        echo "Killing process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null
    fi
done

sleep 1
echo "✅ Services stopped"

echo "🚀 Starting OpenHelm services..."

# Start Martin tile server
echo "  Starting Martin tileserver on port 3001..."
martin --config martin-config.yaml > martin.log 2>&1 &
sleep 2

# Start API server
echo "  Starting API server on port 3002..."
node api-server/server.js > api.log 2>&1 &
sleep 2

# Start Vite dev server
echo "  Starting Vite dev server on port 3000..."
npm run dev > vite.log 2>&1 &
sleep 3

# Verify services started
echo ""
echo "📊 Service Status:"
for port in 3000 3001 3002; do
    if lsof -ti :$port > /dev/null 2>&1; then
        echo "  ✅ Port $port: Running"
    else
        echo "  ❌ Port $port: Not running"
    fi
done

echo ""
echo "✅ OpenHelm services restarted!"
echo "   View logs: tail -f api.log martin.log vite.log"
