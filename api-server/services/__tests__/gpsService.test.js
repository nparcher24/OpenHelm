import { describe, it, expect, beforeEach } from 'vitest'
import { _cogInternals, getGpsData } from '../gpsService.js'

const { haversineMeters, bearingDeg, updateCogFromPosition, reset, COG_BASELINE_MS, COG_MIN_DIST_M } = _cogInternals

describe('position-derived COG', () => {
  beforeEach(() => reset())

  it('haversine matches known short distance to <1%', () => {
    // Two points ~111m apart along a meridian (0.001° lat)
    const d = haversineMeters(36.8, -76.0, 36.801, -76.0)
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })

  it('bearing of due-north travel is ~0°', () => {
    const b = bearingDeg(36.8, -76.0, 36.81, -76.0)
    expect(b).toBeLessThan(1)
  })

  it('bearing of due-east travel is ~90°', () => {
    const b = bearingDeg(36.8, -76.0, 36.8, -75.99)
    expect(b).toBeGreaterThan(89)
    expect(b).toBeLessThan(91)
  })

  it('returns null until baseline window has elapsed', () => {
    updateCogFromPosition(36.80, -76.0, 1000)
    updateCogFromPosition(36.81, -76.0, 1500)  // only 500ms baseline
    expect(getGpsData().cog).toBe(null)
  })

  it('emits a bearing once baseline window has elapsed and boat has moved', () => {
    const t0 = 1000
    updateCogFromPosition(36.80, -76.0, t0)
    // 1.6s later, ~111m north
    updateCogFromPosition(36.801, -76.0, t0 + COG_BASELINE_MS + 100)
    const cog = getGpsData().cog
    expect(cog).not.toBeNull()
    expect(cog).toBeLessThan(1) // due north
  })

  it('emits null when boat has moved less than the noise floor', () => {
    const t0 = 1000
    updateCogFromPosition(36.80, -76.0, t0)
    // 2s later, only ~0.1m drift (well below 3m floor)
    updateCogFromPosition(36.80 + 0.000001, -76.0, t0 + COG_BASELINE_MS + 500)
    expect(getGpsData().cog).toBe(null)
  })

  it('tracks an east-then-south turn within ~1 baseline window', () => {
    const t0 = 1000
    // Travel east at ~5 m/s for 4s: roughly 90°
    for (let i = 0; i <= 4; i++) {
      const lon = -76.0 + (i * 0.00005)  // ~5m per step at this lat
      updateCogFromPosition(36.80, lon, t0 + i * 1000)
    }
    expect(getGpsData().cog).toBeGreaterThan(85)
    expect(getGpsData().cog).toBeLessThan(95)

    // Pivot to south, give it 2 baseline windows of new travel
    for (let i = 1; i <= 4; i++) {
      const lat = 36.80 - (i * 0.00005)
      updateCogFromPosition(lat, -76.0 + 4 * 0.00005, t0 + (4 + i) * 1000)
    }
    const cog = getGpsData().cog
    expect(cog).toBeGreaterThan(170)
    expect(cog).toBeLessThan(190)
  })
})
