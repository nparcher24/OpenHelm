#!/bin/bash
# Switch OpenHelm from production kiosk to development mode
# Usage: ./start-dev.sh

cd /home/hic/OpenHelm

echo "Stopping production OpenHelm..."
# Kill kiosk Chromium
pkill -f 'chromium-browser|chromium' 2>/dev/null || true
# Kill production services (preview server, martin, api-server)
pkill -f 'start-openhelm-prod' 2>/dev/null || true
pkill -f 'vite.*preview' 2>/dev/null || true
pkill -f 'martin' 2>/dev/null || true
pkill -f 'api-server/server.js' 2>/dev/null || true
lsof -ti :3002 2>/dev/null | xargs kill 2>/dev/null || true
sleep 2

echo "Starting OpenHelm in development mode..."
# Start desktop environment if not running
if ! pgrep -f 'wf-panel-pi' > /dev/null 2>&1; then
    /usr/bin/lwrespawn /usr/bin/pcmanfm --desktop --profile LXDE-pi &
    /usr/bin/lwrespawn /usr/bin/wf-panel-pi &
fi

# Launch dev mode (Martin + API + Vite HMR + Chromium windowed)
./start-openhelm.sh
