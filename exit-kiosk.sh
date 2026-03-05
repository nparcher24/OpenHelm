#!/bin/bash
# Exit kiosk mode and restore the desktop environment
# Called by the API server's /api/system/exit-kiosk endpoint
# Backend services (Martin, API, Vite preview) keep running

# Kill Chromium kiosk
pkill -f 'chromium-browser|chromium' 2>/dev/null || true

sleep 1

# Launch desktop environment
/usr/bin/lwrespawn /usr/bin/pcmanfm --desktop --profile LXDE-pi &
/usr/bin/lwrespawn /usr/bin/wf-panel-pi &

echo "Desktop environment restored. OpenHelm services still running on ports 3000-3002."
