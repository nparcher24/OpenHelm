#!/bin/bash
#
# OpenHelm system install — wires the boot-time bits together on a fresh host:
#   - can-utils (apt) for diagnostic CAN tools
#   - 99-canable.rules     → /etc/udev/rules.d/   (stable can0 naming)
#   - 99-witmotion.rules   → /etc/udev/rules.d/   (stable /dev/witmotion symlink)
#   - can0.service         → /etc/systemd/system/ (brings can0 up at 250 kbps)
#   - openhelm-backend.service → /etc/systemd/system/ (api-server + Martin at boot)
#
# Idempotent — safe to re-run.
#
# Usage:
#   sudo /home/hic/OpenHelm/setup/install.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${BLUE}[setup]${NC} $1"; }
ok()      { echo -e "${GREEN}[setup]${NC} $1"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $1"; }
err()     { echo -e "${RED}[setup]${NC} $1" >&2; }

if [[ $EUID -ne 0 ]]; then
    err "Must be run as root (sudo)."
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETUP_DIR="$REPO_ROOT/setup"
N2K_SETUP_DIR="$REPO_ROOT/n2k_adapter/setup"

# 1. can-utils
if ! command -v candump >/dev/null 2>&1; then
    info "Installing can-utils..."
    apt-get update -qq
    apt-get install -y can-utils
    ok "can-utils installed"
else
    ok "can-utils already installed"
fi

# 2. udev rules
install_udev_rule() {
    local src="$1"
    local name="$(basename "$src")"
    local dst="/etc/udev/rules.d/$name"
    if [[ ! -f "$src" ]]; then
        warn "Missing $src — skipping"
        return
    fi
    info "Installing udev rule → $dst"
    cp "$src" "$dst"
    chmod 0644 "$dst"
}

install_udev_rule "$N2K_SETUP_DIR/99-canable.rules"
install_udev_rule "$SETUP_DIR/udev/99-witmotion.rules"

udevadm control --reload-rules
udevadm trigger
ok "udev rules reloaded"

# 3. systemd units
install_unit() {
    local src="$1"
    local name="$(basename "$src")"
    local dst="/etc/systemd/system/$name"
    if [[ ! -f "$src" ]]; then
        warn "Missing $src — skipping"
        return
    fi
    info "Installing systemd unit → $dst"
    cp "$src" "$dst"
    chmod 0644 "$dst"
}

install_unit "$N2K_SETUP_DIR/can0.service"
install_unit "$SETUP_DIR/systemd/openhelm-backend.service"

# Make the wrapper script executable in place (it lives in the repo so
# systemd doesn't need it copied out — it just needs +x).
chmod 0755 "$SETUP_DIR/systemd/openhelm-backend.sh"

systemctl daemon-reload

# Enable units. can0.service activates via the device dependency when the
# adapter appears, so `enable` alone is enough — `--now` would fail if the
# adapter isn't currently plugged in.
systemctl enable can0.service
systemctl enable openhelm-backend.service
ok "Units enabled (will start on next boot)"

# Try to start them now if conditions allow.
if ip link show can0 >/dev/null 2>&1; then
    info "can0 already present — starting can0.service now"
    systemctl restart can0.service
    ip -details link show can0 || true
else
    warn "can0 not present yet. Plug in the SH-C30G; the service will auto-activate."
fi

if ! systemctl is-active --quiet openhelm-backend.service; then
    info "Starting openhelm-backend.service..."
    # Stop any inline backend started by start-kiosk.sh so we don't double-bind port 3002.
    pkill -f 'api-server/server.js' 2>/dev/null || true
    pkill -f 'martin --config' 2>/dev/null || true
    sleep 1
    systemctl start openhelm-backend.service
    sleep 2
    systemctl status openhelm-backend.service --no-pager | head -10 || true
fi

ok "Setup complete."
echo ""
echo "Verify with:"
echo "  ls -l /dev/witmotion        # should symlink to /dev/ttyUSB*"
echo "  ip -details link show can0  # should show bitrate 250000, qlen 1000"
echo "  systemctl status openhelm-backend"
echo "  curl -s http://localhost:3002/api/vessel | jq '.pgnCount, .gps'"
echo "  curl -s http://localhost:3002/api/gps    | jq '.source, .latitude, .longitude'"
