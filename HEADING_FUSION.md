# Heading Fusion — Dual-WitMotion Compass

> **Quick-start for the next session**
> If you're reading this because the user said *"get the heading working"*, you are picking up an in-flight implementation. The user has already physically mounted the second WitMotion. The math, fallback path, and tests live on `feat/design-restyle`.
>
> **Start with §0 below: verify the secondary unit's signal is reaching the server.** That alone is what "get the heading working" means in practice — the math is ready, the wiring is done, the only question is whether the udev rule resolves, the service starts, and frames arrive. Don't proceed to mag calibration or sea trial until §0 is green.

## The problem we're solving

The console electronics around the WitMotion produce so much magnetic interference that the AHRS-derived heading is unusable — wildly off, drifts with which gear is on, doesn't trust any calibration. The user can't easily relocate the unit, and the existing on-device spherical-fit mag-cal is unlikely to be enough on its own.

The user has a **second identical WitMotion** to be mounted symmetrically on the opposite side of the console (~3 ft baseline). Our job is to fuse both units into a single reliable digital heading that the chart and instruments can use.

## What the second unit actually buys us

We discussed this with the user already; record here so future-us doesn't relitigate:

1. **Dual gyros — the real prize.** Two independent MEMS gyros, separate biases, uncorrelated noise. Bias-correct each against COG, average the corrected rates → ~√2 noise reduction and continuous failure detection. The gyro is what drives short-term heading; the magnetometer's role drops to occasional sanity check.
2. **Dual COG cross-check.** Two consumer GPS receivers will rarely both glitch the same way. Disagreement >5° at speed for several seconds = freeze the offender.
3. **Magnetometer gradient as a *trust-detector*.** Earth's field is uniform across 3 ft. `|B_A − B_B|` should be essentially zero in clean air. When it isn't, the difference is purely local interference — a live "is the mag trustworthy right now?" signal. We don't need it to *give* us heading; we need it to tell us when *not* to use mag.
4. **What it does NOT buy us:** magnetometer fusion (the two mags sit in genuinely different distortion environments, so naive averaging doesn't cancel anything), and dual-antenna-GPS heading (consumer-grade position noise is ~3 m, dwarfs the 0.9 m baseline).

## Architecture

```
┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐
│ gpsService.js (PRIMARY)  │  │ gpsServiceSecondary.js   │  │ nmea2000Service.js   │
│ /dev/witmotion           │  │ /dev/witmotion-b         │  │ NMEA 2000 bus        │
│ position + IMU + waves + │  │ position (lat/lon/COG/   │  │ Garmin MFD GPS:      │
│ mag-cal + headingOffset  │  │ HDOP/sats) + gyro/mag    │  │ position + COG + SOG │
│                          │  │ for heading fusion       │  │                      │
└──────────┬───────────────┘  └────────────┬─────────────┘  └──────────┬───────────┘
           │                               │                            │
           │   getGpsData()    getSecondaryGpsData()      getVesselData()
           │                               │                            │
           ▼                               ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ gpsArbiter.getActiveGps()                                                       │
│   1. selectSource(primary, secondary, vessel) → picks tightest HDOP             │
│        tiebreak: primary > secondary > n2k                                      │
│   2. buildSnapshot(primary, secondary, vessel) → pure, composes the snapshot    │
│        - position fields from active source                                     │
│        - COG/SOG prefer N2K when fresh (PGN 129026 fastest+calibrated)          │
│        - IMU/wave/mag-cal sensors ALWAYS from primary (only it has them)        │
│   3. fuser.update({primary, secondary, vessel, fallback}) → heading fusion      │
│   4. snapshot.heading = fusion.heading                                          │
│   5. snapshot.headingFusion = {confidence, perUnitHealth, gradient, biases…}   │
│   6. snapshot.sources = {witmotion, witmotion-b, n2k} per-source health        │
└────────────────────────┬────────────────────────────────────────────────────────┘
                         │
                         ▼
                  WebSocket → ChartView, GpsView (sources panel), TopBar, etc.
```

**Two arbitrations layered on top of each other:**
- **Position arbitration** — tightest-HDOP source wins. All three are real candidates; the GPS page surfaces all three side-by-side with the active one highlighted.
- **Heading fusion** — gyro-dominant complementary filter using BOTH WitMotion units' gyros, COG-corrected from whatever the position arbiter picked.

Fusion is **stateful** (filter state lives across ticks), so it sits behind a factory `createHeadingFuser()` instantiated once in `gpsArbiter.js`. `buildSnapshot` stays pure — every existing test still passes.

When the secondary is absent (today's reality, and forever after a hardware fault), the fuser is a transparent pass-through: it returns the fallback heading that `buildSnapshot` already computed. The boat keeps working exactly as it does today until the second unit comes online.

## Filter design

**v1 — complementary filter** (already implemented):

```
state: { heading, biasA, biasB, lastTs }

each tick:
  dt        = (now - lastTs) / 1000
  rateA     = primary.wz  - biasA       # deg/s
  rateB     = secondary.wz - biasB
  rateMean  = (rateA + rateB) / 2

  predicted = wrap360(heading + rateMean * dt)

  if sog > HEADING_SLAVE_SPEED_MS and cog is finite:
    err = wrapSigned(cog - predicted)
    heading = wrap360(predicted + (1 - α) * err)        # α ≈ 0.995
    biasA  += err * dt * BIAS_LEARN_RATE                # slow integrator
    biasB  += err * dt * BIAS_LEARN_RATE
  else:
    heading = predicted   # gyro-only when at rest / no COG

  lastTs = now
```

Caveats acknowledged in the implementation comments:
- A single error signal can't distinguish biasA from biasB — they learn together. An EKF can split them via cross-covariance; left as a deferred upgrade once we have data.
- Biases are clamped (±5 °/s) to prevent runaway learning from a stuck COG.

**v2 (deferred)** — EKF with state `[heading, biasA, biasB]`, gyro measurements per unit, COG measurement when valid, mag heading when the gradient detector says clean. Maybe 100 LoC of replacement code; defer until v1 reveals a real shortcoming.

**Mag-gradient detector** (informational in v1, downweight-driver in v2):

```
magDiff = sqrt((Bxa-Bxb)² + (Bya-Byb)² + (Bza-Bzb)²)
interferenceDetected = magDiff > GRADIENT_THRESHOLD_UT
```

Threshold is empirical — calibrate on the boat. Likely 5–15 µT.

## Files touched / added

| Path | Status | Purpose |
|------|--------|---------|
| `HEADING_FUSION.md` | **NEW** (this file) | Spec + handoff. |
| `api-server/services/headingFusion.js` | **NEW** | Stateful complementary-filter fuser. Factory `createHeadingFuser()`. |
| `api-server/services/__tests__/headingFusion.test.js` | **NEW** | 36 fusion-math tests. |
| `api-server/services/gpsServiceSecondary.js` | **NEW** | Secondary WitMotion reader — heading fusion inputs AND position-source fields. Opt-in via env var. |
| `api-server/services/gpsArbiter.js` | **MOD** | Three-way source selection (primary + secondary + n2k). Instantiates fuser, calls `update()` in `getActiveGps()`. Adds `snapshot.sources` for the UI. |
| `api-server/services/__tests__/gpsArbiter.test.js` | **MOD** | Updated for new signature, added 14 three-way tests (44 total). |
| `api-server/server.js` | **MOD** | Starts secondary GPS service (no-op when env var unset). |
| `api-server/routes/gps.js` | **MOD** | Adds `GET /api/gps/heading-fusion`, `/api/gps/secondary`, `/api/gps/sources`. |
| `src/components/GpsView.jsx` | **MOD** | Adds 'WitMotion B' to top-bar source badge. New `GpsSourcesPanel` showing all three sources with active highlighted. |
| `memory.md` | **MOD** | Pointer to this doc + the "get the heading working" trigger phrase. |

## Boat-side checklist

In order. Stop and report after each step if something's off — don't paper over.

### 0. **First — verify the secondary signal is arriving**

This is what "get the heading working" should accomplish before anything else. The user has already mounted and plugged in the second unit; the question is whether the OS sees it, the service started, and frames are being parsed.

```bash
# 0a. Is the second unit enumerated as a USB-serial port?
ls -l /dev/ttyUSB* /dev/witmotion*
# Expect: /dev/ttyUSB0 AND /dev/ttyUSB1 (or similar), and ideally
# /dev/witmotion + /dev/witmotion-b symlinks. If only one /dev/ttyUSB* shows,
# the second cable/USB port is the problem, not software.

# 0b. Is the OPENHELM_GPS_SECONDARY env var set in the kiosk service?
sudo systemctl show openhelm-kiosk -p Environment
# If not, follow §3 to add it, then restart the service.

# 0c. Are both GPS services actually running?
curl -s http://localhost:3002/api/gps/sources | jq
# Look for sources.witmotion.available and sources["witmotion-b"].available.
# Both should be true once they have a fix.

# 0d. Is the secondary's heading-fusion input flowing?
curl -s http://localhost:3002/api/gps/heading-fusion | jq
# headingFusion.secondaryHealth should be 'ok' (not 'absent').
# headingFusion.source should be 'fused-with-cog' or 'fused-gyro-only',
# not 'single-unit-passthrough'.
```

If any of those fail, fix that *first*. Don't attempt calibration or sea trial with broken signal.

If 0a fails: udev rule. Follow §2.
If 0b fails: env var on the service. Follow §3.
If 0c shows witmotion-b as not enabled: the secondary service isn't starting. Check `sudo journalctl -u openhelm-kiosk | grep GPS-B`.
If 0c shows enabled but available=false: device is there but no fix yet. Wait, or check the antenna position.
If 0d shows source=`single-unit-passthrough` despite secondary being available: the secondary's `wz` (gyro Z) is missing. Confirm `curl /api/gps/secondary` shows a non-null `wz`.

Only when §0 is fully green should you proceed.

### 1. Mount the second unit

Same orientation as the primary (X-forward, Z-up). Symmetric across the boat centerline, ~3 ft from primary. Cable to a free USB port on the GMKtec.

*(Already done by the user before invoking the boat-side session.)*

### 2. Make `/dev/witmotion-b` resolve

The existing rule matches by VID/PID alone, which both units share. Differentiate by USB port path:

```bash
# Find each unit's USB path while both are plugged in
udevadm info -a -n /dev/ttyUSB0 | grep -E 'KERNELS=='
udevadm info -a -n /dev/ttyUSB1 | grep -E 'KERNELS=='
# Pick the KERNELS value (looks like "1-1.2") for each.
```

Edit `setup/udev/99-witmotion.rules` to add a port-specific second rule:

```udev
# Primary — left-side console port (KERNELS value goes here)
SUBSYSTEM=="tty", KERNELS=="1-1.2", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", \
  SYMLINK+="witmotion", MODE="0660", GROUP="dialout"

# Secondary — right-side console port
SUBSYSTEM=="tty", KERNELS=="1-1.3", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", \
  SYMLINK+="witmotion-b", MODE="0660", GROUP="dialout"
```

Install + reload + verify both symlinks:

```bash
sudo cp setup/udev/99-witmotion.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
ls -l /dev/witmotion /dev/witmotion-b   # both should resolve to /dev/ttyUSB{0,1}
```

### 3. Enable the secondary service

Add to the kiosk service's environment (or `.env` if that's how it loads):

```
OPENHELM_GPS_SECONDARY=1
```

Or override the device path explicitly:

```
OPENHELM_GPS_SECONDARY_DEVICE=/dev/witmotion-b
```

Without one of these, the secondary service stays dormant and the fuser runs in pass-through mode.

### 4. Calibrate each unit independently

Each WitMotion lives in its own magnetic environment — calibrations don't transfer. From the existing wizard UI:

1. Disable the secondary (`unset OPENHELM_GPS_SECONDARY`), restart, run mag-cal on primary, save.
2. Re-enable secondary, restart, run mag-cal on secondary by temporarily pointing the wizard at `/dev/witmotion-b`. (See "follow-up #1" below — the cal wizard needs a unit selector for this; for the first pass, swap the cables.)

### 5. Sea trial

`./scripts/deploy.sh`. Take the boat out. Watch `GET /api/gps/heading-fusion` while underway:

- At rest, with engines on: confirm `interferenceDetected` flips when the chartplotter/radar cycles on (proves the gradiometer works).
- At cruise (>3 kn), in a straight line: confirm fused heading matches COG within a couple of degrees, and that learned biases stay bounded.
- Turning through 360°: confirm no wraparound glitches, and that biases don't run away during the turn.

### 6. Tune

Likely knobs (all in `headingFusion.js`):

- `ALPHA` — gyro/COG balance. Higher = trusts gyro more, slower to converge to COG. Start at 0.995.
- `BIAS_LEARN_RATE` — how quickly biases learn from COG drift. Start at 0.001/s.
- `GRADIENT_THRESHOLD_UT` — mag interference threshold. Set after observing field on the boat.
- `MAX_BIAS_DPS` — clamp on bias values. ±5 °/s should never realistically be reached.

## Follow-ups (capture, don't do yet)

1. **Mag-cal wizard needs a unit selector** so the user can calibrate each unit without swapping cables. Add a "Unit: Primary / Secondary" toggle that picks which serial port the cal commands target.
2. **Auto-calibrate heading offset on each unit** — `autoCalibrateHeadingToCourse` currently only nudges `gpsService.headingOffset`. Either deprecate that legacy offset (the fuser now does its job) or extend it to track both units.
3. **EKF v2** — full state `[heading, biasA, biasB]` with proper observation models for gyros + COG + (gated) mag. Splits biases properly.
4. **Heading-fusion confidence badge on the chart top bar** — green/amber/red chip next to the `HDG` metric, sourced from `snapshot.headingFusion.confidence`.
5. **Track recorder** — already stores `heading` per point; nothing to change, but verify the field reflects the new fused value once it's enabled on the boat.

## Open knobs I deliberately did *not* hard-decide

Captured here for the user to choose on-boat:

- **Where to display heading on the UI** — currently it's in the chart top bar's `HDG` chip, sourced from `snapshot.heading`. The fuser overwrites that field, so it picks up automatically. If the user wants a separate "fused heading vs mag heading" surface for diagnostics, add a new chip.
- **Whether to disable `autoCalibrateHeadingToCourse`** when fusion is active. The legacy offset becomes ~irrelevant once the fuser is running. Suggest leaving it on for now; revisit after a sea trial.
- **Mag heading as a third measurement** in the filter. Implementation supports it (commented-out block), but the user's whole reason for this project is that mag is bad. Leave it off until the gradiometer says we have moments of clean mag — then maybe blend it in at low weight during stationary periods.

---

Last updated by the home-dev session on 2026-05-15.
Status: math + skeleton wiring complete and tested on dev. Awaiting boat-side hardware install.
