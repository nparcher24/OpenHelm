/**
 * Heading Fusion — fuses two WitMotion AHRS units + GPS COG into a single
 * trustworthy heading. See HEADING_FUSION.md at repo root for the full spec
 * (and the boat-side checklist if you're resuming after a deploy).
 *
 * Design summary:
 *   - Complementary filter, gyro-dominant short-term, COG-corrected long-term.
 *   - Dual gyros are averaged after per-unit bias correction.
 *   - The magnetometer is intentionally NOT used for heading in v1 — the whole
 *     reason this fusion exists is that console interference makes mag heading
 *     unusable. The two mags ARE compared as a "is mag trustworthy right now?"
 *     gradient signal, but it's currently informational only.
 *   - When the secondary unit is absent (env var unset, port unplugged), the
 *     fuser passes through the fallback heading that buildSnapshot already
 *     computed. Boat keeps working unchanged until the second unit comes
 *     online.
 *
 * Pure-ish stateful module. The factory createHeadingFuser() returns an object
 * with its own state; gpsArbiter instantiates one. Tests can instantiate as
 * many as they want with deterministic inputs.
 */

// Above this ground speed, COG is reliable enough to correct the gyro
// integration with. Same threshold the existing arbiter uses for its
// COG-slaving feature so the two behave consistently.
export const HEADING_SLAVE_SPEED_MS = 1.341  // 3 MPH

// Filter parameters — tune on the boat. See HEADING_FUSION.md §6.
export const DEFAULT_PARAMS = Object.freeze({
  alpha: 0.995,                  // gyro/COG balance; higher = trust gyro more
  biasLearnRate: 0.001,          // per-second integrator on bias from COG residual
  maxBiasDps: 5,                 // safety clamp on learned bias (deg/s)
  maxDtSeconds: 1.0,             // gap above which we reset rather than predict
  gradientThresholdUT: 10,       // |B_A - B_B| above this flags mag interference
})

function wrap360(deg) {
  let x = deg % 360
  if (x < 0) x += 360
  // `-720 % 360` is `-0` in IEEE-754 — normalize to `+0` so callers/tests
  // get a canonical zero.
  return x === 0 ? 0 : x
}

function wrapSigned(deg) {
  let x = deg
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Compute the mag-field magnitude difference between two units.
 * Returns null if either unit is missing mag data. Returned units are whatever
 * the raw WitMotion `hx/hy/hz` fields are in (the protocol doc lists them as
 * unscaled int16; the gradient threshold should be tuned against observed
 * values on the boat — we do not need to know the µT scale to compare).
 */
function magGradient(primary, secondary) {
  if (!primary || !secondary) return null
  const aOk = isFiniteNumber(primary.hx) && isFiniteNumber(primary.hy) && isFiniteNumber(primary.hz)
  const bOk = isFiniteNumber(secondary.hx) && isFiniteNumber(secondary.hy) && isFiniteNumber(secondary.hz)
  if (!aOk || !bOk) return null
  const dx = primary.hx - secondary.hx
  const dy = primary.hy - secondary.hy
  const dz = primary.hz - secondary.hz
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Per-unit gyro health: rate must be a finite number within plausible range.
 * Anything over ~720 °/s is the chip saturated or a parser glitch.
 */
function gyroHealthy(unit) {
  if (!unit) return false
  if (!isFiniteNumber(unit.wz)) return false
  if (Math.abs(unit.wz) > 720) return false
  return true
}

/**
 * Are the two gyros reporting compatible rates? Disagreement >5 °/s for the
 * same physical body is "one of these is broken." Returned status is one of:
 *   'ok'        — rates agree closely
 *   'disagree'  — rates differ by > tolerance
 *   'unknown'   — one or both rates missing
 */
function gyroAgreement(primary, secondary, toleranceDps = 5) {
  if (!gyroHealthy(primary) || !gyroHealthy(secondary)) return 'unknown'
  // Compare bias-corrected rates; but at the agreement-check level we don't
  // have biases here, so the raw comparison is sufficient — biases are
  // typically tenths of a deg/s, well inside the tolerance window.
  return Math.abs(primary.wz - secondary.wz) <= toleranceDps ? 'ok' : 'disagree'
}

/**
 * Compute the effective gyro rate from the active units, applying bias
 * corrections. Returns null when no healthy gyro is available.
 */
function effectiveGyroRate(primary, secondary, biasA, biasB) {
  const aOk = gyroHealthy(primary)
  const bOk = gyroHealthy(secondary)
  if (aOk && bOk) return ((primary.wz - biasA) + (secondary.wz - biasB)) / 2
  if (aOk) return primary.wz - biasA
  if (bOk) return secondary.wz - biasB
  return null
}

/**
 * Factory. Each fuser instance owns its filter state.
 *
 *   const fuser = createHeadingFuser()
 *   const out = fuser.update({ now, primary, secondary, vessel, fallbackHeading })
 */
export function createHeadingFuser(params = {}) {
  const cfg = { ...DEFAULT_PARAMS, ...params }

  const state = {
    heading: null,        // last fused heading (deg, [0,360))
    biasA: 0,             // learned gyro bias for primary unit (deg/s)
    biasB: 0,             // learned gyro bias for secondary unit (deg/s)
    lastTs: null,         // last update timestamp (epoch ms)
    initialized: false,   // becomes true once we have a starting heading
    // Diagnostics — useful for the /api/gps/heading-fusion endpoint
    lastSource: 'uninitialized',
  }

  function reset() {
    state.heading = null
    state.biasA = 0
    state.biasB = 0
    state.lastTs = null
    state.initialized = false
    state.lastSource = 'reset'
  }

  function getState() {
    // Return a defensive copy — callers shouldn't mutate the live state.
    return { ...state }
  }

  /**
   * @param {object}  inputs
   * @param {number}  inputs.now                  epoch ms (injected for tests)
   * @param {object?} inputs.primary              gpsService.getGpsData() output
   * @param {object?} inputs.secondary            gpsServiceSecondary output, or null when absent
   * @param {object?} inputs.vessel               nmea2000Service.getVesselData() output
   * @param {number?} inputs.fallbackHeading      what buildSnapshot would otherwise return (deg)
   * @param {number?} inputs.fallbackCog          cog the arbiter picked (deg)
   * @param {number?} inputs.fallbackGroundSpeed  groundSpeed the arbiter picked (m/s)
   */
  function update(inputs) {
    const {
      now,
      primary,
      secondary,
      fallbackHeading,
      fallbackCog,
      fallbackGroundSpeed,
    } = inputs

    const hasPrimary = gyroHealthy(primary)
    const hasSecondary = gyroHealthy(secondary)

    // Single-unit mode: secondary missing entirely. Pass through fallback so
    // existing behavior is preserved bit-for-bit. We still tick lastTs so when
    // the secondary appears later we don't try to predict over a huge dt.
    if (!secondary) {
      state.heading = isFiniteNumber(fallbackHeading) ? wrap360(fallbackHeading) : state.heading
      state.lastTs = now
      state.initialized = isFiniteNumber(state.heading)
      state.lastSource = 'single-unit-passthrough'
      return {
        heading: state.heading,
        source: 'single-unit-passthrough',
        confidence: 'reduced',
        primaryHealth: hasPrimary ? 'ok' : 'no-gyro',
        secondaryHealth: 'absent',
        magInterferenceDetected: false,
        magGradient: null,
        biasA: state.biasA,
        biasB: state.biasB,
        gyroAgreement: 'unknown',
      }
    }

    // Both units in scope — full fusion path.
    const dt = state.lastTs != null ? (now - state.lastTs) / 1000 : 0

    // Gap, clock regression, or first sample → reseed from fallback.
    if (!state.initialized || dt <= 0 || dt > cfg.maxDtSeconds) {
      state.heading = isFiniteNumber(fallbackHeading)
        ? wrap360(fallbackHeading)
        : (isFiniteNumber(primary?.headingRaw) ? wrap360(primary.headingRaw) : 0)
      state.lastTs = now
      state.initialized = true
      state.lastSource = 'reseed'
      return {
        heading: state.heading,
        source: 'reseed',
        confidence: 'initializing',
        primaryHealth: hasPrimary ? 'ok' : 'no-gyro',
        secondaryHealth: hasSecondary ? 'ok' : 'no-gyro',
        magInterferenceDetected: false,
        magGradient: magGradient(primary, secondary),
        biasA: state.biasA,
        biasB: state.biasB,
        gyroAgreement: gyroAgreement(primary, secondary),
      }
    }

    // Predict from bias-corrected mean rate.
    const rate = effectiveGyroRate(primary, secondary, state.biasA, state.biasB)
    let predicted
    if (rate == null) {
      // No usable gyro this tick — coast on prior heading. Bias estimates
      // don't move; we just hold.
      predicted = state.heading
    } else {
      predicted = wrap360(state.heading + rate * dt)
    }

    // COG outer-loop correction when we're moving fast enough to trust it.
    const sog = isFiniteNumber(fallbackGroundSpeed) ? fallbackGroundSpeed : null
    const cog = isFiniteNumber(fallbackCog) ? fallbackCog : null
    let corrected = predicted
    let cogApplied = false
    if (sog != null && sog > HEADING_SLAVE_SPEED_MS && cog != null) {
      const err = wrapSigned(cog - predicted)
      corrected = wrap360(predicted + (1 - cfg.alpha) * err)
      cogApplied = true

      // Slow integrator on bias: a persistent residual implies the gyros'
      // average rate is biased. Both biases learn together (a single error
      // signal can't separate them — see HEADING_FUSION.md for the EKF
      // upgrade path).
      const biasUpdate = err * dt * cfg.biasLearnRate
      state.biasA = clamp(state.biasA + biasUpdate, -cfg.maxBiasDps, cfg.maxBiasDps)
      state.biasB = clamp(state.biasB + biasUpdate, -cfg.maxBiasDps, cfg.maxBiasDps)
    }

    state.heading = corrected
    state.lastTs = now
    state.lastSource = cogApplied ? 'fused-with-cog' : 'fused-gyro-only'

    const grad = magGradient(primary, secondary)
    const interferenceDetected = grad != null && grad > cfg.gradientThresholdUT
    const agreement = gyroAgreement(primary, secondary)

    return {
      heading: corrected,
      source: state.lastSource,
      confidence: agreement === 'disagree' ? 'gyro-disagreement'
                : interferenceDetected     ? 'mag-suspect-but-ok'
                : cogApplied               ? 'high'
                                           : 'medium',
      primaryHealth: hasPrimary ? 'ok' : 'no-gyro',
      secondaryHealth: hasSecondary ? 'ok' : 'no-gyro',
      magInterferenceDetected: interferenceDetected,
      magGradient: grad,
      biasA: state.biasA,
      biasB: state.biasB,
      gyroAgreement: agreement,
    }
  }

  return { update, reset, getState }
}

// Exported for unit tests / advanced callers.
export const _internals = {
  wrap360,
  wrapSigned,
  magGradient,
  gyroHealthy,
  gyroAgreement,
  effectiveGyroRate,
  clamp,
}
