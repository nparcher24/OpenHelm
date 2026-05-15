#!/bin/bash
#
# n2k_adapter/setup/install.sh
#
# Installs the SH-C30G NMEA 2000 USB adapter on a Linux host:
#   1. apt install can-utils
#   2. Drop udev rule into /etc/udev/rules.d/ for stable can0 naming
#   3. Drop systemd unit into /etc/systemd/system/ that brings can0 up at boot
#   4. Reload udev + systemd, enable the unit
#
# PLACEHOLDER — first-light testing on Linux happens before this script is
# trusted. Things still to validate before relying on it:
#   - Confirm the SH-C30G's actual USB VID/PID/serial and update 99-canable.rules.
#   - Confirm `apt install can-utils` is the right package on Pi OS bookworm
#     (it is) and on Ubuntu 22.04 LTS HWE (it is — package name is identical).
#   - Decide whether can0.service needs to come up Before= the OpenHelm api-server
#     unit; if so, add a drop-in.
#
# Run from the repo root:
#   sudo n2k_adapter/setup/install.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${BLUE}[n2k-setup]${NC} $1"; }
success() { echo -e "${GREEN}[n2k-setup]${NC} $1"; }
warn()    { echo -e "${YELLOW}[n2k-setup]${NC} $1"; }
error()   { echo -e "${RED}[n2k-setup]${NC} $1" >&2; }

if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (sudo)."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UDEV_RULE_SRC="$SCRIPT_DIR/99-canable.rules"
SYSTEMD_UNIT_SRC="$SCRIPT_DIR/can0.service"

UDEV_RULE_DST="/etc/udev/rules.d/99-canable.rules"
SYSTEMD_UNIT_DST="/etc/systemd/system/can0.service"

# 1. Install can-utils (candump, cansend, canbusload)
if ! command -v candump >/dev/null 2>&1; then
    info "Installing can-utils..."
    apt-get update -qq
    apt-get install -y can-utils
    success "can-utils installed"
else
    success "can-utils already installed"
fi

# 2. Install udev rule
if [[ ! -f "$UDEV_RULE_SRC" ]]; then
    error "Missing $UDEV_RULE_SRC"
    exit 1
fi

info "Installing udev rule → $UDEV_RULE_DST"
cp "$UDEV_RULE_SRC" "$UDEV_RULE_DST"
chmod 0644 "$UDEV_RULE_DST"
udevadm control --reload-rules
udevadm trigger
success "udev rule installed and reloaded"

warn "Edit $UDEV_RULE_DST to set the actual SH-C30G serial number,"
warn "then unplug + replug the adapter so the rule re-evaluates."

# 3. Install systemd unit
if [[ ! -f "$SYSTEMD_UNIT_SRC" ]]; then
    error "Missing $SYSTEMD_UNIT_SRC"
    exit 1
fi

info "Installing systemd unit → $SYSTEMD_UNIT_DST"
cp "$SYSTEMD_UNIT_SRC" "$SYSTEMD_UNIT_DST"
chmod 0644 "$SYSTEMD_UNIT_DST"
systemctl daemon-reload
systemctl enable can0.service
success "can0.service enabled (will start on next boot, or when can0 appears)"

# 4. Try to start it now if can0 already exists
if ip link show can0 >/dev/null 2>&1; then
    info "can0 already present — starting can0.service now"
    systemctl start can0.service
    ip -details link show can0 || true
else
    warn "can0 not present yet. Plug in the SH-C30G and the service will activate via the device dependency."
fi

success "Setup complete. Next: candump can0  (expect continuous traffic on a live N2K bus)."
