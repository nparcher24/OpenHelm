#!/bin/bash

# OpenHelm Fullscreen Launcher
# Optimized for Raspberry Pi marine display

# Kill existing chromium instances
pkill -f chromium-browser

# Wait for processes to clean up
sleep 2

# Disable screen blanking and power management
export DISPLAY=:0
xset s off
xset -dpms
xset s noblank

# Launch Chromium in fullscreen kiosk mode
chromium-browser \
  --kiosk \
  --no-sandbox \
  --disable-web-security \
  --disable-features=VizDisplayCompositor \
  --start-fullscreen \
  --window-size=1920,1080 \
  --window-position=0,0 \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-translate \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --disable-ipc-flooding-protection \
  --enable-gpu-rasterization \
  --enable-oop-rasterization \
  --enable-hardware-overlays \
  --use-gl=desktop \
  --ignore-gpu-blacklist \
  --max_old_space_size=512 \
  http://localhost:3000