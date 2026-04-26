#!/usr/bin/env bash
# Swap the kiosk's `vite preview` (static dist/) for `vite dev` (HMR) on the same
# port (3000) so Chromium picks up source changes automatically — no rebuild,
# no restart per change.
#
# The kiosk service keeps running. We only kill the preview server and start
# `vite dev` in its place. When you're done iterating, run `scripts/prod-mode.sh`
# to flip back to the static preview.
#
# Run from a foreground terminal — vite logs to stdout. Ctrl+C exits dev mode
# (the kiosk will keep showing the last loaded page until you flip back).

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[dev] killing vite preview on :3000…"
# Be precise: only target the preview command, not vite dev itself.
pkill -f 'vite preview' 2>/dev/null || true
# Free the port if anything else is squatting on it.
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

echo "[dev] starting vite dev (HMR) on :3000…"
echo "[dev] Chromium kiosk will hot-reload on save. Ctrl+C to stop."
echo "[dev] When done: ./scripts/prod-mode.sh  (restores static preview)"
echo

# Reload Chromium once so it leaves the now-dead preview connection.
# CDP /json/list is unreliable on snap-Chromium; cheaper to just trigger a
# refresh after vite dev is up. We touch the page via the keystroke manager:
# Chromium auto-retries http://localhost:3000 if the page errors out.

exec npx vite --host 0.0.0.0 --port 3000
