// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { selectSource, buildSnapshot, STALE_MS } from '../gpsArbiter.js'

const NOW = 1_700_000_000_000

function freshWitmotion(overrides = {}) {
  return {
    latitude: 36.85,
    longitude: -76.30,
    altitude: 5,
    cog: 90,
    groundSpeed: 5.0,
    satellites: 8,
    fix: true,
    pdop: 1.5,
    hdop: 0.9,
    vdop: 1.2,
    timestamp: NOW - 500,
    heading: 95,
    roll: 0.1,
    pitch: -0.2,
    pressure: 1013.2,
    waveHeight: 0.3,
    seaState: 1,
    seaStateDesc: 'Calm (rippled)',
    headingOffset: 0,
    device: '/dev/witmotion',
    ...overrides
  }
}

function freshN2k(overrides = {}) {
  return {
    gps: {
      latitude: 36.86,
      longitude: -76.31,
      altitude: 6,
      cog: 92,
      sog: 5.2,
      satellites: 11,
      fix: true,
      hdop: 0.7,
      pdop: 1.1,
      vdop: 1.0,
      timestamp: NOW - 200,
      src: 0x03,
      ...(overrides.gps || {})
    }
  }
}

describe('selectSource', () => {
  it('prefers witmotion when both are fresh', () => {
    const r = selectSource(freshWitmotion(), freshN2k(), NOW)
    expect(r.source).toBe('witmotion')
    expect(r.witmotionAvailable).toBe(true)
    expect(r.n2kAvailable).toBe(true)
  })

  it('falls back to n2k when witmotion is stale', () => {
    const wm = freshWitmotion({ timestamp: NOW - (STALE_MS + 1000) })
    const r = selectSource(wm, freshN2k(), NOW)
    expect(r.source).toBe('n2k')
    expect(r.witmotionAvailable).toBe(false)
    expect(r.n2kAvailable).toBe(true)
  })

  it('falls back to n2k when witmotion has no fix', () => {
    const wm = freshWitmotion({ fix: false })
    const r = selectSource(wm, freshN2k(), NOW)
    expect(r.source).toBe('n2k')
  })

  it('falls back to n2k when witmotion has null lat/lon', () => {
    const wm = freshWitmotion({ latitude: null, longitude: null })
    const r = selectSource(wm, freshN2k(), NOW)
    expect(r.source).toBe('n2k')
  })

  it('returns "none" when both are stale', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const n2k = freshN2k({ gps: { timestamp: NOW - 60_000 } })
    const r = selectSource(wm, n2k, NOW)
    expect(r.source).toBe('none')
    expect(r.witmotionAvailable).toBe(false)
    expect(r.n2kAvailable).toBe(false)
  })

  it('returns "none" when witmotion has no fix and n2k bus is empty', () => {
    const wm = freshWitmotion({ fix: false })
    const n2k = { gps: { latitude: null, longitude: null, timestamp: null } }
    const r = selectSource(wm, n2k, NOW)
    expect(r.source).toBe('none')
  })

  it('handles missing inputs without throwing', () => {
    expect(selectSource(null, null, NOW).source).toBe('none')
    expect(selectSource(undefined, undefined, NOW).source).toBe('none')
    expect(selectSource({}, {}, NOW).source).toBe('none')
  })

  it('respects N2K fix=false explicitly', () => {
    const n2k = freshN2k({ gps: { fix: false } })
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    expect(selectSource(wm, n2k, NOW).source).toBe('none')
  })

  it('treats null N2K fix as acceptable when sats and lat/lon present', () => {
    const n2k = freshN2k({ gps: { fix: null } })
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    expect(selectSource(wm, n2k, NOW).source).toBe('n2k')
  })
})

describe('buildSnapshot', () => {
  it('uses witmotion position when source=witmotion', () => {
    const snap = buildSnapshot(freshWitmotion(), freshN2k(), NOW)
    expect(snap.source).toBe('witmotion')
    expect(snap.latitude).toBeCloseTo(36.85)
    expect(snap.longitude).toBeCloseTo(-76.30)
    expect(snap.cog).toBe(90)
    expect(snap.groundSpeed).toBe(5.0)
    expect(snap.satellites).toBe(8)
  })

  it('uses n2k position when source=n2k', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap = buildSnapshot(wm, freshN2k(), NOW)
    expect(snap.source).toBe('n2k')
    expect(snap.latitude).toBeCloseTo(36.86)
    expect(snap.longitude).toBeCloseTo(-76.31)
    expect(snap.cog).toBe(92)
    expect(snap.groundSpeed).toBe(5.2)
    expect(snap.satellites).toBe(11)
  })

  it('preserves witmotion-only sensors regardless of source', () => {
    // Slow enough that the heading-slave logic does not engage (< 3 MPH)
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const n2k = freshN2k({ gps: { sog: 0.2 } })
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.source).toBe('n2k')
    // IMU + wave fields come from WitMotion no matter what
    expect(snap.heading).toBe(95)
    expect(snap.roll).toBeCloseTo(0.1)
    expect(snap.pitch).toBeCloseTo(-0.2)
    expect(snap.pressure).toBe(1013.2)
    expect(snap.waveHeight).toBe(0.3)
    expect(snap.seaState).toBe(1)
    expect(snap.seaStateDesc).toBe('Calm (rippled)')
  })

  it('slaves heading to cog when underway above 3 MPH', () => {
    // 5 m/s ≈ 11 MPH — well above the 1.341 m/s threshold
    const wm = freshWitmotion({ heading: 270, cog: 90, groundSpeed: 5.0 })
    const snap = buildSnapshot(wm, freshN2k(), NOW)
    expect(snap.headingSlavedToCog).toBe(true)
    expect(snap.heading).toBe(90) // pulled to cog, not the IMU's 270
  })

  it('leaves heading alone below 3 MPH', () => {
    // 1.0 m/s ≈ 2.2 MPH — below threshold
    const wm = freshWitmotion({ heading: 270, cog: 90, groundSpeed: 1.0 })
    const snap = buildSnapshot(wm, freshN2k({ gps: { sog: 1.0 } }), NOW)
    expect(snap.headingSlavedToCog).toBe(false)
    expect(snap.heading).toBe(270)
  })

  it('does not slave heading when cog is null', () => {
    const wm = freshWitmotion({ heading: 270, cog: null, groundSpeed: 5.0 })
    const snap = buildSnapshot(wm, freshN2k({ gps: { cog: null } }), NOW)
    expect(snap.headingSlavedToCog).toBe(false)
    expect(snap.heading).toBe(270)
  })

  it('uses arbitrated n2k sog when gating the slave on a stale-witmotion fallback', () => {
    // WitMotion stale → arbitrated groundSpeed comes from N2K's sog
    const wm = freshWitmotion({ timestamp: NOW - 60_000, heading: 270 })
    const n2k = freshN2k({ gps: { cog: 45, sog: 5.2 } })
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.source).toBe('n2k')
    expect(snap.headingSlavedToCog).toBe(true)
    expect(snap.heading).toBe(45)
  })

  it('exposes source-label for the UI', () => {
    expect(buildSnapshot(freshWitmotion(), freshN2k(), NOW).sourceLabel).toBe('WitMotion (USB)')
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    expect(buildSnapshot(wm, freshN2k(), NOW).sourceLabel).toBe('NMEA 2000 (boat MFD)')
    expect(buildSnapshot(null, null, NOW).sourceLabel).toBe('No fix')
  })

  it('reports n2kSrc when n2k is active', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap = buildSnapshot(wm, freshN2k({ gps: { src: 0x03 } }), NOW)
    expect(snap.n2kSrc).toBe(0x03)
  })

  it('age reflects active source timestamp', () => {
    const snap = buildSnapshot(freshWitmotion(), freshN2k(), NOW)
    expect(snap.age).toBe(500) // witmotion is 500ms old
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap2 = buildSnapshot(wm, freshN2k(), NOW)
    expect(snap2.age).toBe(200) // n2k is 200ms old
  })

  it('returns age=null when no source has any timestamp', () => {
    const wm = { latitude: null, longitude: null, timestamp: null, fix: false }
    const n2k = { gps: { latitude: null, longitude: null, timestamp: null } }
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.source).toBe('none')
    expect(snap.age).toBe(null)
  })

  it('falls back to witmotion altitude/satellites if n2k omits them', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000, altitude: 99, satellites: 7 })
    const n2k = freshN2k({ gps: { altitude: null, satellites: null } })
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.source).toBe('n2k')
    expect(snap.altitude).toBe(99)
    expect(snap.satellites).toBe(7)
  })
})
