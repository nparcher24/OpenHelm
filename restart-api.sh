#!/bin/bash
# Restart the OpenHelm API server

# Kill existing API server
pkill -f "node api-server/server.js" 2>/dev/null

# Wait a moment for port to free
sleep 0.5

# Start new instance
cd /home/hic/OpenHelm
node api-server/server.js >> api.log 2>&1 &

echo "API server restarted (PID: $!)"
