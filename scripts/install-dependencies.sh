#!/bin/bash

# OpenHelm System Dependencies Installer
# Installs all required system packages that aren't managed by npm.
# Run once after cloning the repo:  ./scripts/install-dependencies.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${BLUE}[setup]${NC} $1"; }
success() { echo -e "${GREEN}[setup]${NC} $1"; }
error()   { echo -e "${RED}[setup]${NC} $1"; }

ARCH=$(uname -m)
MISSING=()

# ── Check each dependency ────────────────────────────────────────────

check_cmd() {
    local cmd="$1" pkg="$2" desc="$3"
    if command -v "$cmd" &>/dev/null; then
        success "$desc ($cmd) already installed"
    else
        info "$desc ($cmd) not found — will install"
        MISSING+=("$pkg")
    fi
}

echo ""
info "Checking OpenHelm system dependencies..."
echo ""

# GDAL — ogr2ogr, gdaldem, gdal_calc.py, gdal2tiles.py, gdallocationinfo
check_cmd ogr2ogr       "gdal-bin python3-gdal" "GDAL tools"

# Tippecanoe — vector tile generation for CUSP coastline data
check_cmd tippecanoe     "tippecanoe"            "Tippecanoe"

# Martin — tile server (custom install, not in apt)
check_cmd martin         "__martin__"            "Martin tile server"

# Node.js
check_cmd node           "nodejs"                "Node.js"

echo ""

# ── Install missing apt packages ─────────────────────────────────────

APT_PKGS=()
NEED_MARTIN=false

for pkg in "${MISSING[@]}"; do
    if [[ "$pkg" == "__martin__" ]]; then
        NEED_MARTIN=true
    else
        # pkg may contain multiple space-separated package names
        for p in $pkg; do
            APT_PKGS+=("$p")
        done
    fi
done

if [[ ${#APT_PKGS[@]} -gt 0 ]]; then
    info "Installing apt packages: ${APT_PKGS[*]}"
    sudo apt update -qq
    sudo apt install -y "${APT_PKGS[@]}"
    success "apt packages installed"
else
    success "All apt packages present"
fi

# ── Install Martin (not in apt) ──────────────────────────────────────

if $NEED_MARTIN; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$SCRIPT_DIR/install-martin.sh" ]]; then
        info "Installing Martin via install-martin.sh..."
        bash "$SCRIPT_DIR/install-martin.sh"
    else
        error "Martin not found and install-martin.sh is missing."
        error "Install Martin manually: https://github.com/maplibre/martin"
        exit 1
    fi
fi

# ── Install npm packages ─────────────────────────────────────────────

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$REPO_DIR/node_modules" ]]; then
    info "Installing npm packages..."
    cd "$REPO_DIR" && npm install
    success "npm packages installed"
else
    success "npm packages already installed"
fi

# ── Final verification ───────────────────────────────────────────────

echo ""
info "Verifying all dependencies..."
echo ""

FAIL=false
verify_cmd() {
    local cmd="$1" desc="$2"
    if command -v "$cmd" &>/dev/null; then
        local ver
        ver=$("$cmd" --version 2>/dev/null | head -1) || ver="installed"
        success "$desc: $ver"
    else
        error "$desc ($cmd) — MISSING"
        FAIL=true
    fi
}

verify_cmd ogr2ogr      "GDAL"
verify_cmd gdal_calc.py  "GDAL Python"
verify_cmd tippecanoe    "Tippecanoe"
verify_cmd martin        "Martin"
verify_cmd node          "Node.js"

echo ""
if $FAIL; then
    error "Some dependencies are still missing — see above."
    exit 1
else
    success "All dependencies installed. Run ./start-openhelm.sh to launch."
fi
