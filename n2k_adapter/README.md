# n2k_adapter

NMEA 2000 USB-to-CAN adapter integration for OpenHelm.

This module wires a DSD TECH SH-C30G isolated USB-to-CAN adapter into the boat's NMEA 2000 backbone and exposes it to the host as a SocketCAN interface (`can0`). Once `can0` is up, OpenHelm's existing `api-server/services/nmea2000Service.js` reads frames via `@canboat/canboatjs` and pushes decoded vessel data through the WebSocket pipeline — no application changes required.

## Hardware

| Item | Notes |
|------|-------|
| **DSD TECH SH-C30G** | Isolated USB-to-CAN adapter. CANable 1.0 Pro clone, STM32F072 MCU. Ships with **candleLight** firmware (do not reflash). [Product page](https://www.deshide.com/) |
| **NMEA 2000 Micro-C drop cable** (sacrificed) | One end keeps the male Micro-C connector that mates with the boat's bus T-fitting. The other end is cut and stripped to wire into the adapter's screw terminals. |
| **Linux host** | Raspberry Pi 5 (primary) or GMKtec M6 Ultra (air-segment). Both already covered by OpenHelm. macOS works for USB descriptor inspection only — no SocketCAN. |

## Wiring

Standard NMEA 2000 Micro-C pinout vs SH-C30G screw terminals:

| Micro-C wire | N2K signal      | SH-C30G terminal | Action      |
|--------------|-----------------|------------------|-------------|
| White        | CAN_H           | CAN_H            | Connect     |
| Blue         | CAN_L           | CAN_L            | Connect     |
| Mesh shield  | Drain / Shield  | GND              | Connect     |
| Red          | NET-S (+12 V)   | —                | **Cap, do not connect** |
| Black        | NET-C (0 V)     | —                | **Cap, do not connect** |

The SH-C30G is USB-powered. Leaving the bus 12 V supply disconnected from the adapter prevents ground loops and back-feed risks against the boat's electrical system.

### Termination

The N2K backbone is already terminated with 120 Ω resistors at each physical end of the trunk. The SH-C30G has an onboard 120 Ω termination switch — **leave it OFF**. Adding a third terminator turns the bus into a mismatched stub and causes reflections / dropped frames.

## Linux Setup

### One-time installer

The `setup/install.sh` script copies a udev rule and a systemd unit into place and installs `can-utils`. From the repo root:

```bash
sudo n2k_adapter/setup/install.sh
```

What it does:

1. `apt install can-utils` (provides `candump`, `cansend`, `canbusload`).
2. Copies `setup/99-canable.rules` → `/etc/udev/rules.d/99-canable.rules` and reloads udev. This pins the SH-C30G to a stable interface name (`can0`) regardless of plug-in order.
3. Copies `setup/can0.service` → `/etc/systemd/system/can0.service` and enables it. This brings `can0` up at 250 kbps with `txqueuelen 1000` on every boot.

### Manual one-shot bring-up (no install.sh)

If you just want to test without installing anything system-wide:

```bash
sudo ip link set can0 up type can bitrate 250000
sudo ip link set can0 txqueuelen 1000
```

> **Why `txqueuelen 1000`?** The kernel's default of 10 is fine for diagnostic CAN traffic but drops frames during NMEA 2000 fast-packet bursts (engine telemetry, AIS messages). 1000 gives enough headroom for the worst-case multi-frame transport without measurable latency cost.

## Quickstart

Confirm the adapter and bus are healthy before involving OpenHelm:

```bash
# 1. After plugging in, see the kernel claim it
dmesg | tail -20
# Expect a line mentioning "gs_usb" or "candle"

# 2. Bring the interface up (or rely on can0.service if installed)
sudo ip link set can0 up type can bitrate 250000
sudo ip link set can0 txqueuelen 1000

# 3. Watch raw frames
candump -tz can0
# A live N2K bus produces continuous traffic. Extended (29-bit) IDs starting
# with 0x09 / 0x0A / 0x0B / 0x18 / 0x19 are normal J1939/N2K headers.

# 4. Decode PGNs (requires canboat CLI tools)
candump -L can0 | analyzer -json | jq .
```

Once raw frames are flowing, start OpenHelm normally — the API server's `nmea2000Service` will pick up `can0` automatically:

```bash
node api-server/server.js
curl http://localhost:3002/api/vessel | jq .
# Expect: isConnected: true, isDemoMode: false, pgnCount > 0
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `candump` shows nothing | Adapter not seeing the bus | Check CAN_H / CAN_L not swapped, terminator switch OFF, bus actually has terminators at both ends, drop cable seated in T-fitting. |
| `ip link show can0` says `state DOWN` and `bitrate not set` | Interface never configured | Run the `ip link set can0 up type can bitrate 250000` command, or install `can0.service`. |
| `RX-OVR` / `RX overrun` errors growing in `ip -s link show can0` | `txqueuelen` still at default 10, fast-packet drops | `sudo ip link set can0 txqueuelen 1000`. |
| Adapter not enumerating (`dmesg` silent) | USB cable issue, or device in bootloader mode | Try a different USB cable / port. The board has a button to flip into DFU — make sure it's not stuck in that state. |
| Two `canX` interfaces appearing or non-deterministic naming | More than one CANable-class device, or other CAN HAT also installed | The udev rule in `setup/99-canable.rules` pins the SH-C30G by serial. Update the rule with this device's actual serial (read with `udevadm info -a -n /dev/bus/usb/...`) if you see this. |
| `error-active`, `error-passive`, `bus-off` shown in `ip -details link show can0` | Adapter is running but the bus is degraded (impedance mismatch, miswire, dead segment) | Recheck termination first (third terminator on SH-C30G is the most common cause), then wiring polarity. |
| OpenHelm `/api/vessel` shows `isDemoMode: true` despite `candump` working | API server started before `can0` was up, or canboatjs SimpleCan failed to attach | Restart the api-server: `pkill -f api-server && node api-server/server.js`. |

## See Also

- `CLAUDE.md` (this directory) — sub-project running log, design decisions, open questions.
- `../CLAUDE.md` — root project memory, includes the high-level NMEA 2000 sub-project section.
- `../api-server/services/nmea2000Service.js` — pre-existing canboatjs integration that consumes `can0`.
- [canboat](https://github.com/canboat/canboat) — PGN definitions and CLI tools.
- [canboatjs](https://github.com/canboat/canboatjs) — Node bindings used by OpenHelm.
- [CANable / candleLight](https://canable.io/) — adapter firmware reference.
