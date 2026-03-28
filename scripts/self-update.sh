#!/bin/bash
# OpenHelm Self-Update Script
# Usage: ./scripts/self-update.sh <target-tag>
# Exit codes: 0=success, 1=git-fail, 2=npm-fail, 3=build-fail, 4=rollback-triggered
#
# Prints PROGRESS markers to stdout for the API server to parse:
#   PROGRESS <0-100> <message>
#   PROGRESS -1 <error message>   (indicates failure/rollback)

set -euo pipefail

TARGET_TAG="${1:?Usage: self-update.sh <target-tag>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "PROGRESS 0 Starting update to ${TARGET_TAG}"

# --- Step 1: Save rollback reference ---
echo "PROGRESS 5 Saving rollback reference"
ROLLBACK_REF=$(git rev-parse HEAD)
echo "$ROLLBACK_REF" > .update-rollback-ref

# --- Step 2: Backup current build ---
echo "PROGRESS 8 Backing up current build"
if [ -d "dist" ]; then
    rm -rf dist-backup
    cp -r dist dist-backup
fi

# --- Rollback function ---
rollback() {
    local reason="$1"
    local exit_code="${2:-4}"
    echo "PROGRESS -1 Rollback: ${reason}"
    echo "[Update] Rolling back to ${ROLLBACK_REF}..."

    git checkout "$ROLLBACK_REF" --force 2>/dev/null || true

    # Restore backed-up build
    if [ -d "dist-backup" ]; then
        rm -rf dist
        mv dist-backup dist
        echo "[Update] Restored previous build from backup"
    fi

    # Restore old dependencies
    npm ci --omit=dev 2>/dev/null || true

    # Restart services with old code
    restart_services

    rm -f .update-rollback-ref
    exit "$exit_code"
}

# --- Platform-aware restart ---
restart_services() {
    echo "[Update] Detecting platform for restart..."

    if systemctl is-active --quiet openhelm-kiosk 2>/dev/null; then
        echo "[Update] GMKtec detected — restarting via systemd"
        sudo systemctl restart openhelm-kiosk
    else
        echo "[Update] Pi detected — restarting via start-openhelm-prod.sh"
        # Kill existing services (except this script)
        pkill -f "vite preview|vite build" 2>/dev/null || true
        pkill -f "node api-server/server.js" 2>/dev/null || true
        # Small delay to let processes die
        sleep 2
        # Launch prod script in background (nohup so it survives)
        nohup bash "$PROJECT_DIR/start-openhelm-prod.sh" >> "$PROJECT_DIR/openhelm.log" 2>&1 &
        disown
    fi
}

# --- Step 3: Fetch latest code ---
echo "PROGRESS 10 Fetching latest code"
if ! git fetch origin --tags 2>&1; then
    rollback "git fetch failed" 1
fi

# --- Step 4: Checkout release tag ---
echo "PROGRESS 20 Checking out ${TARGET_TAG}"
if ! git checkout "${TARGET_TAG}" --force 2>&1; then
    rollback "git checkout ${TARGET_TAG} failed" 1
fi

# --- Step 5: Install dependencies ---
echo "PROGRESS 30 Installing dependencies"
if ! npm ci --omit=dev 2>&1; then
    rollback "npm ci failed" 2
fi

# --- Step 6: Build application ---
echo "PROGRESS 60 Building application"
if ! npm run build 2>&1; then
    rollback "npm run build failed" 3
fi

# --- Step 7: Clean up backup (build succeeded) ---
echo "PROGRESS 80 Build successful, cleaning up"
rm -rf dist-backup
rm -f .update-rollback-ref

# --- Step 8: Restart services ---
echo "PROGRESS 85 Restarting services"
restart_services

# --- Step 9: Verify services ---
echo "PROGRESS 90 Waiting for services to start"
MAX_WAIT=90
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    # Check if API server is responding
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health 2>/dev/null | grep -q "200"; then
        echo "PROGRESS 95 API server is up"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "PROGRESS -1 Services failed to start within ${MAX_WAIT}s"
    exit 4
fi

# Wait a bit more for frontend
sleep 3
if curl -s -o /dev/null http://localhost:3000 2>/dev/null; then
    echo "PROGRESS 98 Frontend is up"
fi

echo "PROGRESS 100 Update complete — now running ${TARGET_TAG}"
exit 0
