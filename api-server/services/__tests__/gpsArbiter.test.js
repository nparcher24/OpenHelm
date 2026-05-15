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
  it('picks tighter source (lower HDOP) when both fresh — n2k typically wins', () => {
    // Fixtures: witmotion hdop=0.9, n2k hdop=0.7
    const r = selectSource(freshWitmotion(), freshN2k(), NOW)
    expect(r.source).toBe('n2k')
    expect(r.witmotionAvailable).toBe(true)
    expect(r.n2kAvailable).toBe(true)
    expect(r.witmotionHdop).toBe(0.9)
    expect(r.n2kHdop).toBe(0.7)
  })

  it('picks witmotion when its HDOP is tighter', () => {
    const wm = freshWitmotion({ hdop: 0.5 })
    const n2k = freshN2k({ gps: { hdop: 1.5 } })
    expect(selectSource(wm, n2k, NOW).source).toBe('witmotion')
  })

  it('breaks HDOP ties in favor of witmotion (sensor co-location)', () => {
    const wm = freshWitmotion({ hdop: 1.0 })
    const n2k = freshN2k({ gps: { hdop: 1.0 } })
    expect(selectSource(wm, n2k, NOW).source).toBe('witmotion')
  })

  it('treats missing HDOP as Infinity (known value beats unknown)', () => {
    const wm = freshWitmotion({ hdop: null })
    const n2k = freshN2k({ gps: { hdop: 0.7 } })
    expect(selectSource(wm, n2k, NOW).source).toBe('n2k')
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
  it('uses witmotion position when its HDOP is tighter', () => {
    const wm = freshWitmotion({ hdop: 0.5 })
    const n2k = freshN2k({ gps: { hdop: 2.0 } })
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.source).toBe('witmotion')
    expect(snap.latitude).toBeCloseTo(36.85)
    expect(snap.longitude).toBeCloseTo(-76.30)
    // cog/sog still prefer N2K when fresh, regardless of position source
    expect(snap.cog).toBe(92)
    expect(snap.cogSource).toBe('n2k')
    expect(snap.groundSpeed).toBe(5.2)
    expect(snap.satellites).toBe(8)
  })

  it('exposes both HDOPs in the snapshot for UI quality display', () => {
    const snap = buildSnapshot(freshWitmotion(), freshN2k(), NOW)
    expect(snap.witmotionHdop).toBe(0.9)
    expect(snap.n2kHdop).toBe(0.7)
  })

  it('exposes cogDisagreement when both sources have fresh cog', () => {
    const wm = freshWitmotion({ cog: 10 })
    const n2k = freshN2k({ gps: { cog: 50 } })
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.cogDisagreement).not.toBeNull()
    expect(snap.cogDisagreement.deg).toBe(40)
    expect(snap.cogDisagreement.witmotionCog).toBe(10)
    expect(snap.cogDisagreement.n2kCog).toBe(50)
    expect(snap.cogDisagreement.major).toBe(true)
  })

  it('marks cogDisagreement as not-major below threshold', () => {
    const wm = freshWitmotion({ cog: 10 })
    const n2k = freshN2k({ gps: { cog: 25 } })
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.cogDisagreement.major).toBe(false)
  })

  it('reports cogDisagreement=null when only one source has cog', () => {
    const wm = freshWitmotion({ cog: null })
    const snap = buildSnapshot(wm, freshN2k(), NOW)
    expect(snap.cogDisagreement).toBe(null)
  })

  it('handles cogDisagreement wrap (359° vs 1° = 2°, not 358°)', () => {
    const wm = freshWitmotion({ cog: 359 })
    const n2k = freshN2k({ gps: { cog: 1 } })
    const snap = buildSnapshot(wm, n2k, NOW)
    expect(snap.cogDisagreement.deg).toBe(2)
    expect(snap.cogDisagreement.major).toBe(false)
  })

  it('falls back to witmotion cog when n2k cog is null', () => {
    const n2k = freshN2k({ gps: { cog: null } })
    const snap = buildSnapshot(freshWitmotion(), n2k, NOW)
    expect(snap.cog).toBe(90)
    expect(snap.cogSource).toBe('witmotion')
  })

  it('falls back to witmotion cog when n2k is stale', () => {
    const n2k = freshN2k({ gps: { timestamp: NOW - 60_000 } })
    const snap = buildSnapshot(freshWitmotion(), n2k, NOW)
    expect(snap.cog).toBe(90)
    expect(snap.cogSource).toBe('witmotion')
  })

  it('warns on large COG disagreement between sources', () => {
    const warn = console.warn
    const calls = []
    console.warn = (m) => calls.push(m)
    try {
      // Bump `now` past prior warn-throttle state from earlier tests.
      const t = NOW + 1_000_000
      const wm = freshWitmotion({ cog: 0, timestamp: t - 500 })
      const n2k = freshN2k({ gps: { cog: 60, timestamp: t - 200 } })
      buildSnapshot(wm, n2k, t)
      expect(calls.some(c => c.includes('COG disagreement'))).toBe(true)
    } finally {
      console.warn = warn
    }
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
    // 5 m/s ≈ 11 MPH — well above the 1.341 m/s threshold.
    // No N2K source so witmotion cog is the only one available.
    const wm = freshWitmotion({ heading: 270, cog: 90, groundSpeed: 5.0 })
    const snap = buildSnapshot(wm, { gps: { latitude: null, longitude: null, timestamp: null } }, NOW)
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
    // Default fixtures: n2k.hdop (0.7) < witmotion.hdop (0.9) → n2k wins
    expect(buildSnapshot(freshWitmotion(), freshN2k(), NOW).sourceLabel).toBe('NMEA 2000 (boat MFD)')
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    expect(buildSnapshot(wm, freshN2k(), NOW).sourceLabel).toBe('NMEA 2000 (boat MFD)')
    // Tighten witmotion HDOP so it wins
    expect(buildSnapshot(freshWitmotion({ hdop: 0.3 }), freshN2k(), NOW).sourceLabel).toBe('WitMotion (USB)')
    expect(buildSnapshot(null, null, NOW).sourceLabel).toBe('No fix')
  })

  it('reports n2kSrc when n2k is active', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap = buildSnapshot(wm, freshN2k({ gps: { src: 0x03 } }), NOW)
    expect(snap.n2kSrc).toBe(0x03)
  })

  it('age reflects active source timestamp', () => {
    // Default fixtures pick n2k (tighter HDOP) → age = 200ms
    const snap = buildSnapshot(freshWitmotion(), freshN2k(), NOW)
    expect(snap.age).toBe(200)
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap2 = buildSnapshot(wm, freshN2k(), NOW)
    expect(snap2.age).toBe(200) // n2k is 200ms old
    // Force witmotion source by tightening its HDOP
    const snap3 = buildSnapshot(freshWitmotion({ hdop: 0.3 }), freshN2k(), NOW)
    expect(snap3.age).toBe(500) // witmotion is 500ms old
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
