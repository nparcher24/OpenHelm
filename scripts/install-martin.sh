#!/bin/bash

# Martin Tile Server Installation Script for Raspberry Pi 5
# This script downloads and installs Martin tile server optimized for ARM64

set -e

echo "🗺️  Installing Martin Tile Server for OpenHelm..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[Martin Install]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[Martin Install]${NC} ✅ $1"
}

print_error() {
    echo -e "${RED}[Martin Install]${NC} ❌ $1"
}

# Check if running on ARM64
ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" ]]; then
    print_error "This script is optimized for ARM64/aarch64 (Raspberry Pi 5)"
    print_status "Your architecture: $ARCH"
    print_status "You may need to adjust the download URL for your platform"
fi

# Check if Martin is already installed
if command -v martin &> /dev/null; then
    CURRENT_VERSION=$(martin --version 2>/dev/null | head -1)
    print_success "Martin is already installed: $CURRENT_VERSION"
    exit 0
fi

# Download and install Martin
MARTIN_VERSION="v0.11.4"
MARTIN_URL="https://github.com/maplibre/martin/releases/download/${MARTIN_VERSION}/martin-Linux-aarch64.tar.gz"
TEMP_DIR=$(mktemp -d)

print_status "Downloading Martin ${MARTIN_VERSION} for ARM64..."
cd "$TEMP_DIR"

if ! curl -L -o martin.tar.gz "$MARTIN_URL"; then
    print_error "Failed to download Martin"
    print_status "Check your internet connection and try again"
    exit 1
fi

print_status "Extracting Martin..."
if ! tar -xzf martin.tar.gz; then
    print_error "Failed to extract Martin archive"
    exit 1
fi

print_status "Installing Martin to /usr/local/bin..."
if ! sudo mv martin /usr/local/bin/; then
    print_error "Failed to install Martin (permission denied?)"
    print_status "Make sure you can run sudo commands"
    exit 1
fi

# Cleanup
cd /
rm -rf "$TEMP_DIR"

# Verify installation
if command -v martin &> /dev/null; then
    VERSION=$(martin --version 2>/dev/null | head -1)
    print_success "Martin tile server installed successfully!"
    print_success "Version: $VERSION"
    echo ""
    print_status "You can now run: ./start-openhelm.sh"
else
    print_error "Installation completed but Martin is not in PATH"
    exit 1
fi