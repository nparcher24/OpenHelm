#!/usr/bin/env bash
# Build the frontend and restart the kiosk service so Chromium picks up the new bundle.
# This is the "deploy" step on the GMKtec — there is no remote target; the kiosk
# runs on this same box, so we just rebuild dist/ and bounce the service.
#
# Passwordless sudo for `systemctl restart openhelm-kiosk` is configured in
# /etc/sudoers.d/openhelm-kiosk, so this script runs end-to-end without prompting.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[deploy] vite build…"
npm run build

echo "[deploy] restarting openhelm-kiosk…"
sudo -n /usr/bin/systemctl restart openhelm-kiosk

# Wait for vite preview to come back up (max 30s).
WAITED=0
until curl -fsS -o /dev/null --max-time 1 http://localhost:3000; do
  if [[ $WAITED -ge 30 ]]; then
    echo "[deploy] WARNING: vite preview did not respond on :3000 within 30s" >&2
    exit 1
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

echo "[deploy] OK — kiosk is serving the new build (waited ${WAITED}s)"
