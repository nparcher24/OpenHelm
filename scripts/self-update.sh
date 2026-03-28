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

    git checkout main --force 2>/dev/null || true
    git reset --hard "$ROLLBACK_REF" 2>/dev/null || true

    # Restore backed-up build
    if [ -d "dist-backup" ]; then
        rm -rf dist
        mv dist-backup dist
        echo "[Update] Restored previous build from backup"
    fi

    # Restore old dependencies
    npm install 2>/dev/null || true

    # Restart services with old code
    restart_services

    rm -f .update-rollback-ref
    exit "$exit_code"
}

# --- Platform-aware restart ---
restart_services() {
    echo "[Update] Restarting backend services (keeping browser alive)..."

    # Kill backend services only — leave Chromium running so the frontend
    # can detect the restart and reload itself with the new code
    pkill -f "node api-server/server.js" 2>/dev/null || true
    pkill -f "vite preview" 2>/dev/null || true
    pkill -f "martin" 2>/dev/null || true
    sleep 2

    # Restart backend services
    cd "$PROJECT_DIR"
    source "$HOME/.cargo/env" 2>/dev/null || true
    martin --config martin-config.yaml > martin.log 2>&1 &
    node api-server/server.js > api.log 2>&1 &
    npx vite preview --host 0.0.0.0 --port 3000 > vite.log 2>&1 &
    disown -a
}

# --- Step 3: Fetch latest code ---
echo "PROGRESS 10 Fetching latest code"
if ! git fetch origin --tags 2>&1; then
    rollback "git fetch failed" 1
fi

# --- Step 4: Update main branch to release tag ---
echo "PROGRESS 20 Checking out ${TARGET_TAG}"
git checkout main --force 2>&1 || true
if ! git reset --hard "${TARGET_TAG}" 2>&1; then
    rollback "git reset to ${TARGET_TAG} failed" 1
fi

# --- Step 5: Install dependencies ---
echo "PROGRESS 30 Installing dependencies"
if ! npm install 2>&1; then
    rollback "npm install failed" 2
fi

# --- Step 6: Build application ---
echo "PROGRESS 60 Building application"
if ! npx vite build 2>&1; then
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
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health 2>/dev/null | grep -q "200"; then
        echo "PROGRESS 95 API server is up"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "PROGRESS -1 Services failed to start within ${MAX_WAIT}s"
    exit 4
fi

# Quick check for frontend
if curl -s -o /dev/null http://localhost:3000 2>/dev/null; then
    echo "PROGRESS 98 Frontend is up"
fi

echo "PROGRESS 100 Update complete — now running ${TARGET_TAG}"
exit 0
