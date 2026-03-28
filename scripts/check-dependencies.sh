#!/bin/bash

# Lightweight dependency check — runs after npm install.
# Warns about missing system packages but does NOT install them.
# For installation, run: npm run setup

MISSING=()

check() {
    command -v "$1" &>/dev/null || MISSING+=("$1")
}

check ogr2ogr
check gdal_calc.py
check tippecanoe
check martin

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo ""
    echo "  ⚠  Missing system dependencies: ${MISSING[*]}"
    echo "  ⚠  Run 'npm run setup' to install them."
    echo ""
fi
