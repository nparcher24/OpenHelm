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

First populated 2026-04-26 from a 30 s `candump` capture (3315 frames, 0 RX errors). Use `n2k_adapter/src/decode-capture.js <log>` to refresh.

| Src (hex/dec) | Device (inferred)                  | PGNs observed (frames in 30 s)                                                                                                                                                                                                                                                                       | Notes |
|---:|---|---|---|
| `0x01` / 1   | Fuel-tank level sender              | 127505 Fluid Level (12); 126720 group-function (90)                                                                                                                                                                                                                                                  | Already decoded by `nmea2000Service.js`. |
| `0x02` / 2   | Unknown N2K node                    | 126993 Heartbeat (1); 126720 group-function (30)                                                                                                                                                                                                                                                     | Quiet — only heartbeat + ISO group function. Possible NMEA-gateway / bridge. |
| `0x03` / 3   | **Multifunction display / GPS**     | 129025 Position Rapid (300); 129026 COG/SOG Rapid (120); 129029 GNSS Position (210); 129539 GNSS DOPs (30); 129540 GNSS Sats in View (660); 129283 XTE (30); 129284 Navigation Data (150); 127258 Magnetic Variation (30); 130310/130312 Env/Temp (75); 126720 Fusion-class Request Status (1029)     | Primary nav source. Also speaks Fusion proprietary PGNs → likely an MFD (Garmin/Raymarine/Simrad) doubling as the Fusion radio remote head. **Not currently surfaced by OpenHelm — frontend GPS comes from USB-serial WitMotion via `gpsService.js`.** |
| `0x0A` / 10  | **Fusion marine stereo**            | 130820 Fusion: Power State (63); 126993 Heartbeat (1)                                                                                                                                                                                                                                                | Out of scope for nav, but useful for future "audio status" surfacing. |
| `0x32` / 50  | Switch panel / bus controller       | 127501 Binary Switch Bank Status (19, **priority 0**)                                                                                                                                                                                                                                                | High priority + only sends switch state → looks like a dedicated switch input device (e.g. Maretron SIM100 or similar). |
| `0x50` / 80  | **Engine ECU**                      | 126983 Alert (30); 126985 Alert Text (2); 65292 proprietary (120); 65293 proprietary (120); 126993 Heartbeat (1)                                                                                                                                                                                     | **No standard 127488/127489 frames.** Engine telemetry is in proprietary PGNs 65292/65293 — almost certainly Mercury SmartCraft or Yamaha Command Link. RPM/temp/oil pressure won't appear in OpenHelm until those proprietary PGNs are decoded. |
| `0x94` / 148 | **Battery / DC monitor**            | 127751 DC Voltage/Current (24); 127500 Load Controller (24); 127501 Binary Switch Bank Status (3); 65300 proprietary (7); 126993 Heartbeat (1)                                                                                                                                                       | Likely Mastervolt/Victron/Lithionics-class. **127508 (Battery Status) not used here — the device exposes 127751 instead.** Existing service decodes 127508 only; needs to also handle 127751 to read battery voltage/current from this boat. |

### Capture commands

Refresh the inventory:

```bash
# Capture (run from anywhere)
timeout 30 candump -tz can0 > /tmp/n2k_capture.log

# Decode + summarize
node n2k_adapter/src/decode-capture.js /tmp/n2k_capture.log
```

## Known Issues

_None yet — populate as we hit them on the live bus._

## Running Log

_Append-only log of what's been built and verified, newest at top._

### 2026-04-26 — First-light on air-segment + live-bus inventory
- Plugged SH-C30G into air-segment. Kernel auto-bound `gs_usb` (no modprobe), `can0` netdev created in DOWN state.
- USB descriptors: VID `1d50`, PID `606f`, vendor string `bytewerk`, model `candleLight_USB_to_CAN_adapter`, serial `0036003C5847570D20343432`. Updated `setup/99-canable.rules` with the real serial.
- Brought interface up by hand: `sudo ip link set can0 up type can bitrate 250000 && sudo ip link set can0 txqueuelen 1000`. State `ERROR-ACTIVE` (= idle-healthy), 250 kbps confirmed via `ip -details link show`.
- Installed `can-utils` (`apt install -y can-utils` → `candump`/`cansend`/`canbusload` now on PATH).
- Captured 30 s of live-bus traffic with adapter connected to the boat's N2K trunk: 3315 frames, 0 RX errors, 0 dropped, 0 overruns. Dumped to `/tmp/n2k_capture.log` (gitignored).
- Wrote `n2k_adapter/src/decode-capture.js` — offline decoder using canboatjs `FromPgn` with full fast-packet reassembly. Console-style logging matches `gpsService.js`.
- Decoded inventory (see Boat-Specific N2K Device Inventory table). 7 sources, 22 unique PGNs. Headline findings:
  - GPS / nav PGNs (129025/129026/129029/etc.) are present from src 0x03 — **not currently consumed by OpenHelm** (frontend GPS still comes from USB-serial WitMotion via `gpsService.js`).
  - Engine ECU at src 0x50 sends **no standard 127488/127489**. RPM/temp/oil/fuel are in proprietary 65292/65293 — Mercury SmartCraft or Yamaha Command Link, almost certainly. This is the biggest functional gap vs. what `nmea2000Service.js` expects.
  - Battery/DC monitor at src 0x94 uses **127751 (DC Voltage/Current)** instead of **127508 (Battery Status)** — existing service won't see this device's data without adding 127751.
  - No 128267 (Water Depth) frames seen — likely no transducer on this bus.
- Persistence (`can0.service`, `udev` rule) intentionally **not** installed yet — user wants to verify on the live bus by hand first.

### 2026-04-26 — Sub-project scaffolded (macOS dev box)
- Created `n2k_adapter/` directory tree (`setup/`, `src/`, `tests/`).
- Wrote sub-project `CLAUDE.md`, `README.md`, `.gitignore`.
- Wrote placeholder `setup/99-canable.rules`, `setup/can0.service`, `setup/install.sh`.
- Confirmed pre-existing `api-server/services/nmea2000Service.js` already targets `can0` via canboatjs — no new reader needed in `src/`.
- Hardware physically wired (white→CAN_H, blue→CAN_L, mesh→GND, red/black capped). Onboard 120 Ω switch left OFF. Adapter plugged into macOS for USB descriptor inspection only — no live-bus testing yet.

## Open Questions

> Cross-session/cross-machine context lives here so it isn't lost when sessions roll over. Move resolved items into the Running Log.

1. **Engine ECU proprietary decode (src 0x50, PGNs 65292/65293).** This is now the headline gap: real engine telemetry exists on the bus but lives in proprietary PGNs the existing service doesn't decode. Need to identify whether it's Mercury SmartCraft or Yamaha Command Link (both use prop-PGNs in this range) and either (a) add canboatjs custom-PGN definitions or (b) write a small decoder in `src/` that maps the byte layout to RPM/temp/oil/fuel and feeds the existing `vesselData` snapshot.
2. **Battery monitor uses 127751, not 127508 (src 0x94).** `nmea2000Service.js`'s `case 127508:` branch will never fire on this boat. Need to add a `case 127751:` (DC Voltage/Current) and decide whether to overwrite `batteryVoltage`/`batteryCurrent` from it or keep them separate (helpful when both are present on other boats).
3. **GPS bridging from N2K → OpenHelm.** Src 0x03 broadcasts 129025/129026/129029 already, but the frontend reads GPS from USB-serial WitMotion via `gpsService.js`. Question for the user: should `nmea2000Service.js` start populating lat/lon/COG/SOG from N2K as a fallback when the WitMotion is missing, or should we keep these strictly separate?
4. **Identity of src 0x02.** Only emits Heartbeat + ISO group function. No telemetry. Worth running an ISO Address Claim query (PGN 60928 request) to learn the NAME / manufacturer code of every device — easy follow-up tool to write.
5. **No 128267 (Water Depth) on this bus.** Either no transducer on N2K, or it's powered off / on a separate trunk. Confirm with the user before adding a depth-related UI element.
6. **`can0.service` boot ordering** — does it need `Before=openhelm-backend.service` so the API has `can0` at start? Current behavior: api-server falls back to demo mode if `can0` is missing, so this is polish. Decide before running `setup/install.sh`.
7. **Multi-adapter / udev pin still untested.** The serial-pinned rule (`0036003C5847570D20343432`) is now in `99-canable.rules` but hasn't been activated (`udevadm trigger`) — user is holding off on persistence until live-bus verification is complete. Activate when ready.
8. **Does the boat's bus run `Engine #2` PGNs?** Capture so far shows only one engine source (0x50) — looks single-engine, but a longer capture or address-claim sweep should confirm before locking that assumption in.
9. **AIS over N2K?** PGNs 129038/129039/129794 not seen in this 30 s capture. Either no AIS transponder, or AIS is silent at the dock with no targets in range. Re-check with the boat under way.
