#!/bin/bash
#
# Wrapper invoked by openhelm-backend.service.
# Starts Martin (tile server) and the Node api-server. Tails both processes;
# if either exits non-zero, the script exits non-zero so systemd restarts us.

set -euo pipefail

cd /home/hic/OpenHelm

# Martin in the background. It writes its own log via stdout redirection
# from the systemd unit, so just pipe to that here.
/home/hic/.cargo/bin/martin --config martin-config.yaml >> /home/hic/OpenHelm/martin.log 2>&1 &
MARTIN_PID=$!

# api-server in the foreground so systemd tracks its lifecycle.
# If Martin dies, also exit so the whole service restarts together.
trap 'kill $MARTIN_PID 2>/dev/null || true' EXIT

exec /usr/bin/node api-server/server.js
