#!/bin/bash

# OpenHelm Status Checker

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧭 OpenHelm Status Check${NC}"
echo "================================"
echo ""

# Check Martin
if pgrep -f "martin" > /dev/null; then
    MARTIN_PID=$(pgrep -f "martin")
    echo -e "${GREEN}✓${NC} Martin Tile Server: Running (PID: $MARTIN_PID)"
    echo "  → http://localhost:3001"
else
    echo -e "${RED}✗${NC} Martin Tile Server: Not running"
fi

# Check API Server
if pgrep -f "api-server/server.js" > /dev/null; then
    API_PID=$(pgrep -f "api-server/server.js")
    echo -e "${GREEN}✓${NC} API Server: Running (PID: $API_PID)"
    echo "  → http://localhost:3002"
else
    echo -e "${RED}✗${NC} API Server: Not running"
fi

# Check Vite
if pgrep -f "vite" > /dev/null; then
    VITE_PID=$(pgrep -f "vite")
    echo -e "${GREEN}✓${NC} Vite Dev Server: Running (PID: $VITE_PID)"
    echo "  → http://localhost:3000"
else
    echo -e "${RED}✗${NC} Vite Dev Server: Not running"
fi

echo ""

# Check if all services are running
if pgrep -f "martin" > /dev/null && pgrep -f "api-server/server.js" > /dev/null && pgrep -f "vite" > /dev/null; then
    echo -e "${GREEN}All OpenHelm services are running!${NC}"
else
    echo -e "${YELLOW}Some services are not running. Run ./start-openhelm.sh to start them.${NC}"
fi
