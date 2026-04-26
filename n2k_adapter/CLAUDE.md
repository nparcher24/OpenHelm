# n2k_adapter — Sub-Project Memory

> **Standing instruction (READ ON EVERY SESSION):** Update this file whenever you uncover anything that future sessions or another machine would need. Specifically:
> - PGNs actually observed on this boat (with src addresses + descriptions)
> - Wiring deviations or quirks discovered when tracing the bus
> - Linux kernel / `gs_usb` driver / candleLight firmware versions that work or don't
> - Any custom udev rules, systemd units, modprobe configs, or boot configs needed
> - Performance issues or buffer tuning beyond the documented `txqueuelen 1000`
> - Open questions resolved (move them out of the Open Questions section)
>
> Also keep the root `CLAUDE.md` "NMEA 2000 USB Adapter Sub-Project" section in sync for the high-level facts. This file holds the granular running log.

## Purpose

Hardware-level integration for an NMEA 2000 USB-to-CAN adapter (DSD TECH SH-C30G) that feeds the existing OpenHelm vessel-data pipeline (`api-server/services/nmea2000Service.js`).

The adapter's job is to make `can0` appear on the host. Everything above the SocketCAN layer (PGN decode, vessel-data snapshot, WebSocket fan-out) already exists in the main app and should keep working unchanged once the OS-level interface is up.

## Pre-Existing Integration (IMPORTANT)

OpenHelm already has working NMEA 2000 plumbing. **Do not duplicate it.** Locations:

- `api-server/services/nmea2000Service.js` — `SimpleCan` reads from `can0`, `FromPgn` decodes, snapshot is held in `vesselData`. Falls back to demo mode if `can0` unavailable.
- `api-server/routes/vessel.js` — `GET /api/vessel`, `GET /api/vessel/status`.
- `api-server/server.js` — auto-starts the service, fans vessel updates out via WebSocket on the same port as the API.
- `package.json` — `@canboat/canboatjs ^3.14.0` is already a dependency.

PGNs the existing service handles: 127488, 127489, 127505, 127508, 128267, 130312.

When the SH-C30G is brought up on Linux as `can0`, the existing service should pick it up automatically. The work for this sub-project is therefore mostly **OS-level plumbing + diagnostics + boat-specific PGN inventory**, not new application code.

## File Structure

```
n2k_adapter/
├── CLAUDE.md           # This file — sub-project memory + running log
├── README.md           # Human-facing setup doc (hardware, wiring, Linux setup, troubleshooting)
├── .gitignore          # Sub-project-specific ignores (Python venv, .pyc, captures, etc.)
├── setup/              # System config (ships with the repo, copied into place by install.sh)
│   ├── 99-canable.rules    # udev rule — stable naming for SH-C30G regardless of plug order
│   ├── can0.service        # systemd unit — bring up can0 at boot @ 250 kbps with txqueuelen 1000
│   └── install.sh          # Installer — copies the above into /etc and reloads systemd/udev
├── src/                # Application code (empty for now — first-light testing on Linux comes first)
└── tests/              # Test scripts and capture fixtures (empty for now)
```

## Design Decisions

- **No new top-level app process.** The existing `api-server/services/nmea2000Service.js` is the integration point. Anything in `n2k_adapter/src/` should be diagnostic / sniffing tools (PGN discovery, bus health, capture replay), not a parallel reader.
- **candleLight firmware + `gs_usb` kernel driver** is the supported path. `slcan` is rejected: documented to drop fast-packet frames under load, and N2K relies heavily on fast-packet for engine and AIS PGNs.
- **Adapter is USB-powered.** NET-S / NET-C wires from the Micro-C cable are capped. This keeps the boat's 12V N2K supply electrically isolated from the host.
- **Onboard 120 Ω terminator OFF.** The bus already has terminators at both ends; adding a third causes reflections.
- **Sub-project lives at the repo root** (sibling to `api-server/`), not inside `api-server/services/`, because the artifacts are not all JavaScript — udev rules, systemd units, install scripts, and possibly Python sniffers all live here together.

## Dependencies

### Already in the repo
- `@canboat/canboatjs ^3.14.0` (Node, used by `api-server/services/nmea2000Service.js`)

### To install on the Linux host
- `can-utils` (apt) — provides `candump`, `cansend`, `cangen`, `canbusload`. Required for first-light verification.
- `iproute2` (already present) — `ip link` to bring `can0` up/down.

### Optional (only if we add Python sniffing tools)
- Python 3.11+ (whatever the host ships)
- `python-can` (pip) — Python access to SocketCAN
- `canboat` CLI tools (built from source: <https://github.com/canboat/canboat>) — for `analyzer` to decode pcap/candump output offline

## Conventions / TODOs to Align With Repo

The rest of OpenHelm uses Node + ESM + Winston-style logging. **TODO for the next session:** before writing any code in `src/`, check:
- How do other services log? (`api-server/services/gpsService.js` is a good reference — currently uses `console.log` with emoji prefixes; `winston` is in `package.json` but check whether it's wired up project-wide yet.)
- Are env vars read via a shared module, or just `process.env` inline? (Currently looks like inline `process.env`.)
- Is there a shared error type / Result pattern? (Root `CLAUDE.md` describes one but the existing api-server doesn't use it consistently.)

Match whatever the existing services do — don't introduce a new pattern just for this sub-project.

## Test Commands

Once the Linux box is set up, the canonical first-light sequence is:

```bash
# 1. Plug in adapter, verify enumeration
dmesg | tail -20                    # expect "gs_usb" or "candle"
ip link show can0                   # interface exists, state DOWN

# 2. Bring it up
sudo ip link set can0 up type can bitrate 250000
sudo ip link set can0 txqueuelen 1000
ip -details link show can0          # confirm bitrate=250000, qlen=1000

# 3. Sniff raw frames
candump -tz can0                    # should scroll continuously on a live bus

# 4. Test fast-packet integrity
canbusload can0@250000              # bus utilization
candump can0 | grep -E '^\s+can0\s+1[89]F'   # extended-ID J1939 frames

# 5. Verify the existing OpenHelm integration picks it up
# (from repo root)
node api-server/server.js
# In another shell:
curl http://localhost:3002/api/vessel | jq .
# Expect isConnected: true, isDemoMode: false, pgnCount > 0 within a few seconds.
```

If step 5 fails but step 3 succeeds, the bug is in our integration, not the adapter.

## Boat-Specific N2K Device Inventory

> Populate this table the first time the adapter is connected to the live bus. Run `candump can0` for ~60 s and note source addresses + PGNs.

| Src addr | Device              | PGNs observed | Notes |
|---------:|---------------------|---------------|-------|
|  _TBD_   | _TBD_               | _TBD_         |       |

Useful canboat command to enumerate the bus:

```bash
candump -L can0 > capture.log &
sleep 60 && kill %1
analyzer -json < capture.log | jq -r '.pgn' | sort -u
```

## Known Issues

_None yet — populate as we hit them on the live bus._

## Running Log

_Append-only log of what's been built and verified, newest at top._

### 2026-04-26 — Sub-project scaffolded (macOS dev box)
- Created `n2k_adapter/` directory tree (`setup/`, `src/`, `tests/`).
- Wrote sub-project `CLAUDE.md`, `README.md`, `.gitignore`.
- Wrote placeholder `setup/99-canable.rules`, `setup/can0.service`, `setup/install.sh`.
- Confirmed pre-existing `api-server/services/nmea2000Service.js` already targets `can0` via canboatjs — no new reader needed in `src/`.
- Hardware physically wired (white→CAN_H, blue→CAN_L, mesh→GND, red/black capped). Onboard 120 Ω switch left OFF. Adapter plugged into macOS for USB descriptor inspection only — no live-bus testing yet.

## Open Questions

> Cross-session/cross-machine context lives here so it isn't lost when sessions roll over. Move resolved items into the Running Log.

1. **Logging convention for any code under `src/`** — match existing `api-server/services/*.js` style (console + emoji) or use `winston`? Inspect what other services actually do before writing the first sniffer.
2. **Where does adapter enumeration get verified?** Does the existing `gpsService.js` do anything similar with serial-port detection that we should mimic for CAN-device detection?
3. **Should `can0.service` be in `setup/` (copied to `/etc/systemd/system/` by install.sh) or shipped as a one-shot script that runs at every boot?** Currently planned as a unit file. Confirm with the next session that this matches the rest of OpenHelm's deployment style — `start-openhelm-prod.sh` brings up app services, but bus interface bring-up is a kernel-network concern that wants to happen earlier in boot.
4. **Boot ordering** — does `can0.service` need `Before=openhelm-backend.service` (or whatever the API server unit is) so the API has `can0` available at start? The api-server today gracefully falls back to demo mode if `can0` is missing, so this is a polish item, not a blocker.
5. **Multi-adapter** — if the user ever has two CANable-class devices plugged in, `can0` is no longer deterministic. The udev rule in `setup/99-canable.rules` aims to fix this, but the matching path (by serial number? by USB port?) needs to be verified once we know the SH-C30G's actual USB descriptors.
6. **Does the boat's bus run `Engine #2` PGNs?** The existing service only handles single-engine PGN encodings. If this is a twin, we need to handle the `instance` field.
7. **AIS over N2K?** PGNs 129038/129039/129794 carry AIS. If the boat has an AIS transponder on the N2K bus, that's a free upgrade for OpenHelm — note in the boat-device inventory and decide whether to surface it through the existing vessel WebSocket or a new channel.
