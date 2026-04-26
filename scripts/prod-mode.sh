#!/usr/bin/env bash
# Flip back from `vite dev` to `vite preview` (static dist/) by restarting the
# kiosk service. Use this after a dev session, or any time the kiosk is in a
# weird state.

set -euo pipefail

echo "[prod] restarting openhelm-kiosk…"
sudo -n /usr/bin/systemctl restart openhelm-kiosk

WAITED=0
until curl -fsS -o /dev/null --max-time 1 http://localhost:3000; do
  if [[ $WAITED -ge 30 ]]; then
    echo "[prod] WARNING: vite preview did not respond on :3000 within 30s" >&2
    exit 1
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

echo "[prod] OK — kiosk is serving dist/ (waited ${WAITED}s)"
