#!/bin/bash
export HOME=/home/hic
export PATH="/snap/bin:/home/hic/.cargo/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd /home/hic/OpenHelm
exec >> openhelm.log 2>&1
echo "$(date): Starting OpenHelm services..."

source "$HOME/.cargo/env" 2>/dev/null

# Start backend services
martin --config martin-config.yaml > martin.log 2>&1 &
node api-server/server.js > api.log 2>&1 &
npx vite preview --host 0.0.0.0 --port 3000 > vite.log 2>&1 &

# Wait for frontend
WAITED=0
while [ $WAITED -lt 60 ]; do
    curl -s -o /dev/null http://localhost:3000 2>/dev/null && break
    sleep 1
    WAITED=$((WAITED + 1))
done
echo "Services ready in ${WAITED}s"

# Start matchbox window manager (forces all windows fullscreen)
matchbox-window-manager -use_titlebar no -use_cursor no &

# Hide cursor
unclutter -idle 0.1 -root &

# Launch chromium kiosk
exec /snap/bin/chromium \
  --kiosk \
  --start-maximized \
  --start-fullscreen \
  --window-size=1920,1080 \
  --window-position=0,0 \
  --no-sandbox \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-translate \
  --enable-gpu-rasterization \
  --ignore-gpu-blocklist \
  --disable-dev-shm-usage \
  --js-flags="--max-old-space-size=8192" \
  --password-store=basic \
  --touch-events=enabled \
  --remote-debugging-port=9222 \
  http://localhost:3000
