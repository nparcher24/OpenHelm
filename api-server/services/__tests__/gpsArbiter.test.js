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

function freshWitmotionB(overrides = {}) {
  return {
    latitude: 36.851,
    longitude: -76.301,
    altitude: 5.1,
    cog: 91,
    groundSpeed: 5.0,
    satellites: 9,
    fix: true,
    pdop: 1.4,
    hdop: 0.8,
    vdop: 1.1,
    timestamp: NOW - 400,
    device: '/dev/witmotion-b',
    stale: false,
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

describe('selectSource (two-source legacy: witmotion + n2k)', () => {
  it('picks tighter source (lower HDOP) when both fresh — n2k typically wins', () => {
    // Fixtures: witmotion hdop=0.9, n2k hdop=0.7
    const r = selectSource(freshWitmotion(), null, freshN2k(), NOW)
    expect(r.source).toBe('n2k')
    expect(r.witmotionAvailable).toBe(true)
    expect(r.n2kAvailable).toBe(true)
    expect(r.witmotionHdop).toBe(0.9)
    expect(r.n2kHdop).toBe(0.7)
  })

  it('picks witmotion when its HDOP is tighter', () => {
    const wm = freshWitmotion({ hdop: 0.5 })
    const n2k = freshN2k({ gps: { hdop: 1.5 } })
    expect(selectSource(wm, null, n2k, NOW).source).toBe('witmotion')
  })

  it('breaks HDOP ties in favor of witmotion (sensor co-location)', () => {
    const wm = freshWitmotion({ hdop: 1.0 })
    const n2k = freshN2k({ gps: { hdop: 1.0 } })
    expect(selectSource(wm, null, n2k, NOW).source).toBe('witmotion')
  })

  it('treats missing HDOP as Infinity (known value beats unknown)', () => {
    const wm = freshWitmotion({ hdop: null })
    const n2k = freshN2k({ gps: { hdop: 0.7 } })
    expect(selectSource(wm, null, n2k, NOW).source).toBe('n2k')
  })

  it('falls back to n2k when witmotion is stale', () => {
    const wm = freshWitmotion({ timestamp: NOW - (STALE_MS + 1000) })
    const r = selectSource(wm, null, freshN2k(), NOW)
    expect(r.source).toBe('n2k')
    expect(r.witmotionAvailable).toBe(false)
    expect(r.n2kAvailable).toBe(true)
  })

  it('falls back to n2k when witmotion has no fix', () => {
    const wm = freshWitmotion({ fix: false })
    const r = selectSource(wm, null, freshN2k(), NOW)
    expect(r.source).toBe('n2k')
  })

  it('falls back to n2k when witmotion has null lat/lon', () => {
    const wm = freshWitmotion({ latitude: null, longitude: null })
    const r = selectSource(wm, null, freshN2k(), NOW)
    expect(r.source).toBe('n2k')
  })

  it('returns "none" when both are stale', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const n2k = freshN2k({ gps: { timestamp: NOW - 60_000 } })
    const r = selectSource(wm, null, n2k, NOW)
    expect(r.source).toBe('none')
    expect(r.witmotionAvailable).toBe(false)
    expect(r.n2kAvailable).toBe(false)
  })

  it('returns "none" when witmotion has no fix and n2k bus is empty', () => {
    const wm = freshWitmotion({ fix: false })
    const n2k = { gps: { latitude: null, longitude: null, timestamp: null } }
    const r = selectSource(wm, null, n2k, NOW)
    expect(r.source).toBe('none')
  })

  it('handles missing inputs without throwing', () => {
    expect(selectSource(null, null, null, NOW).source).toBe('none')
    expect(selectSource(undefined, undefined, undefined, NOW).source).toBe('none')
    expect(selectSource({}, null, {}, NOW).source).toBe('none')
  })

  it('respects N2K fix=false explicitly', () => {
    const n2k = freshN2k({ gps: { fix: false } })
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    expect(selectSource(wm, null, n2k, NOW).source).toBe('none')
  })

  it('treats null N2K fix as acceptable when sats and lat/lon present', () => {
    const n2k = freshN2k({ gps: { fix: null } })
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    expect(selectSource(wm, null, n2k, NOW).source).toBe('n2k')
  })
})

describe('selectSource (three-way: primary + secondary + n2k)', () => {
  it('picks witmotion-b when its HDOP is tightest', () => {
    // Fixtures: primary 0.9, secondary 0.8, n2k 0.7 → wait, n2k still wins
    // Force secondary to be best:
    const wm = freshWitmotion({ hdop: 0.9 })
    const wmB = freshWitmotionB({ hdop: 0.4 })
    const n2k = freshN2k({ gps: { hdop: 0.7 } })
    const r = selectSource(wm, wmB, n2k, NOW)
    expect(r.source).toBe('witmotion-b')
    expect(r.witmotionBAvailable).toBe(true)
    expect(r.witmotionBHdop).toBe(0.4)
  })

  it('picks witmotion-b as fallback when primary and n2k both stale', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const wmB = freshWitmotionB()
    const n2k = freshN2k({ gps: { timestamp: NOW - 60_000 } })
    const r = selectSource(wm, wmB, n2k, NOW)
    expect(r.source).toBe('witmotion-b')
  })

  it('considers all three when all fresh — picks lowest HDOP', () => {
    const wm = freshWitmotion({ hdop: 1.5 })
    const wmB = freshWitmotionB({ hdop: 1.2 })
    const n2k = freshN2k({ gps: { hdop: 0.5 } })
    expect(selectSource(wm, wmB, n2k, NOW).source).toBe('n2k')
  })

  it('three-way tiebreak: primary > secondary > n2k when HDOPs equal', () => {
    const wm = freshWitmotion({ hdop: 1.0 })
    const wmB = freshWitmotionB({ hdop: 1.0 })
    const n2k = freshN2k({ gps: { hdop: 1.0 } })
    expect(selectSource(wm, wmB, n2k, NOW).source).toBe('witmotion')
  })

  it('two-way tiebreak (secondary vs n2k): secondary wins', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })   // stale primary
    const wmB = freshWitmotionB({ hdop: 1.0 })
    const n2k = freshN2k({ gps: { hdop: 1.0 } })
    expect(selectSource(wm, wmB, n2k, NOW).source).toBe('witmotion-b')
  })

  it('stale secondary is treated as absent', () => {
    const wm = freshWitmotion()
    const wmB = freshWitmotionB({ stale: true })
    const r = selectSource(wm, wmB, null, NOW)
    expect(r.source).toBe('witmotion')
    expect(r.witmotionBAvailable).toBe(false)
  })

  it('null secondary works the same as missing', () => {
    const wm = freshWitmotion()
    const r = selectSource(wm, null, freshN2k(), NOW)
    expect(r.witmotionBAvailable).toBe(false)
    expect(r.witmotionBHdop).toBe(null)
  })

  it('secondary without fix is unavailable', () => {
    const wmB = freshWitmotionB({ fix: false })
    const r = selectSource(freshWitmotion({ timestamp: NOW - 60_000 }), wmB, null, NOW)
    expect(r.witmotionBAvailable).toBe(false)
    expect(r.source).toBe('none')
  })
})

describe('buildSnapshot', () => {
  it('uses witmotion position when its HDOP is tighter', () => {
    const wm = freshWitmotion({ hdop: 0.5 })
    const n2k = freshN2k({ gps: { hdop: 2.0 } })
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.source).toBe('witmotion')
    expect(snap.latitude).toBeCloseTo(36.85)
    expect(snap.longitude).toBeCloseTo(-76.30)
    // cog/sog still prefer N2K when fresh, regardless of position source
    expect(snap.cog).toBe(92)
    expect(snap.cogSource).toBe('n2k')
    expect(snap.groundSpeed).toBe(5.2)
    expect(snap.satellites).toBe(8)
  })

  it('uses witmotion-b position when source is witmotion-b', () => {
    const wm = freshWitmotion({ hdop: 1.0 })
    const wmB = freshWitmotionB({ hdop: 0.4 })
    const snap = buildSnapshot(wm, wmB, null, NOW)
    expect(snap.source).toBe('witmotion-b')
    expect(snap.latitude).toBeCloseTo(36.851)
    expect(snap.longitude).toBeCloseTo(-76.301)
    expect(snap.satellites).toBe(9)
    expect(snap.hdop).toBe(0.4)
    expect(snap.device).toBe('/dev/witmotion-b')
  })

  it('exposes all three HDOPs in the snapshot for UI quality display', () => {
    const snap = buildSnapshot(freshWitmotion(), freshWitmotionB(), freshN2k(), NOW)
    expect(snap.witmotionHdop).toBe(0.9)
    expect(snap.witmotionBHdop).toBe(0.8)
    expect(snap.n2kHdop).toBe(0.7)
  })

  it('exposes per-source liveness summary for the GPS-page sources panel', () => {
    const snap = buildSnapshot(freshWitmotion(), freshWitmotionB(), freshN2k(), NOW)
    expect(snap.sources.witmotion.available).toBe(true)
    expect(snap.sources.witmotion.hdop).toBe(0.9)
    expect(snap.sources.witmotion.device).toBe('/dev/witmotion')
    expect(snap.sources['witmotion-b'].available).toBe(true)
    expect(snap.sources['witmotion-b'].hdop).toBe(0.8)
    expect(snap.sources['witmotion-b'].enabled).toBe(true)
    expect(snap.sources.n2k.available).toBe(true)
    expect(snap.sources.n2k.hdop).toBe(0.7)
    expect(snap.sources.n2k.src).toBe(0x03)
  })

  it('reports secondary as not-enabled when input is null', () => {
    const snap = buildSnapshot(freshWitmotion(), null, freshN2k(), NOW)
    expect(snap.sources['witmotion-b'].enabled).toBe(false)
    expect(snap.sources['witmotion-b'].available).toBe(false)
  })

  it('exposes cogDisagreement when both witmotion and n2k have fresh cog', () => {
    const wm = freshWitmotion({ cog: 10 })
    const n2k = freshN2k({ gps: { cog: 50 } })
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.cogDisagreement).not.toBeNull()
    expect(snap.cogDisagreement.deg).toBe(40)
    expect(snap.cogDisagreement.witmotionCog).toBe(10)
    expect(snap.cogDisagreement.n2kCog).toBe(50)
    expect(snap.cogDisagreement.major).toBe(true)
  })

  it('marks cogDisagreement as not-major below threshold', () => {
    const wm = freshWitmotion({ cog: 10 })
    const n2k = freshN2k({ gps: { cog: 25 } })
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.cogDisagreement.major).toBe(false)
  })

  it('reports cogDisagreement=null when only one source has cog', () => {
    const wm = freshWitmotion({ cog: null })
    const snap = buildSnapshot(wm, null, freshN2k(), NOW)
    expect(snap.cogDisagreement).toBe(null)
  })

  it('handles cogDisagreement wrap (359° vs 1° = 2°, not 358°)', () => {
    const wm = freshWitmotion({ cog: 359 })
    const n2k = freshN2k({ gps: { cog: 1 } })
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.cogDisagreement.deg).toBe(2)
    expect(snap.cogDisagreement.major).toBe(false)
  })

  it('falls back to witmotion cog when n2k cog is null', () => {
    const n2k = freshN2k({ gps: { cog: null } })
    const snap = buildSnapshot(freshWitmotion(), null, n2k, NOW)
    expect(snap.cog).toBe(90)
    expect(snap.cogSource).toBe('witmotion')
  })

  it('falls back to witmotion-b cog when source is witmotion-b and n2k stale', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const wmB = freshWitmotionB({ cog: 100 })
    const snap = buildSnapshot(wm, wmB, null, NOW)
    expect(snap.source).toBe('witmotion-b')
    expect(snap.cog).toBe(100)
    expect(snap.cogSource).toBe('witmotion-b')
  })

  it('falls back to witmotion cog when n2k is stale', () => {
    const n2k = freshN2k({ gps: { timestamp: NOW - 60_000 } })
    const snap = buildSnapshot(freshWitmotion(), null, n2k, NOW)
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
      buildSnapshot(wm, null, n2k, t)
      expect(calls.some(c => c.includes('COG disagreement'))).toBe(true)
    } finally {
      console.warn = warn
    }
  })

  it('uses n2k position when source=n2k', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap = buildSnapshot(wm, null, freshN2k(), NOW)
    expect(snap.source).toBe('n2k')
    expect(snap.latitude).toBeCloseTo(36.86)
    expect(snap.longitude).toBeCloseTo(-76.31)
    expect(snap.cog).toBe(92)
    expect(snap.groundSpeed).toBe(5.2)
    expect(snap.satellites).toBe(11)
  })

  it('preserves witmotion-only sensors regardless of active position source', () => {
    // Slow enough that the heading-slave logic does not engage (< 3 MPH)
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const n2k = freshN2k({ gps: { sog: 0.2 } })
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.source).toBe('n2k')
    // IMU + wave fields come from PRIMARY no matter what
    expect(snap.heading).toBe(95)
    expect(snap.roll).toBeCloseTo(0.1)
    expect(snap.pitch).toBeCloseTo(-0.2)
    expect(snap.pressure).toBe(1013.2)
    expect(snap.waveHeight).toBe(0.3)
    expect(snap.seaState).toBe(1)
    expect(snap.seaStateDesc).toBe('Calm (rippled)')
  })

  it('preserves primary IMU sensors even when active source is witmotion-b', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000, hdop: 5.0 })
    const wmB = freshWitmotionB({ hdop: 0.5 })
    const snap = buildSnapshot(wm, wmB, null, NOW)
    expect(snap.source).toBe('witmotion-b')
    // IMU still from the PRIMARY unit because that's where the wave/cal stack lives
    expect(snap.roll).toBeCloseTo(0.1)
    expect(snap.pitch).toBeCloseTo(-0.2)
    expect(snap.pressure).toBe(1013.2)
    expect(snap.waveHeight).toBe(0.3)
  })

  it('slaves heading to cog when underway above 3 MPH', () => {
    const wm = freshWitmotion({ heading: 270, cog: 90, groundSpeed: 5.0 })
    const snap = buildSnapshot(wm, null, { gps: { latitude: null, longitude: null, timestamp: null } }, NOW)
    expect(snap.headingSlavedToCog).toBe(true)
    expect(snap.heading).toBe(90)
  })

  it('leaves heading alone below 3 MPH', () => {
    const wm = freshWitmotion({ heading: 270, cog: 90, groundSpeed: 1.0 })
    const snap = buildSnapshot(wm, null, freshN2k({ gps: { sog: 1.0 } }), NOW)
    expect(snap.headingSlavedToCog).toBe(false)
    expect(snap.heading).toBe(270)
  })

  it('does not slave heading when cog is null', () => {
    const wm = freshWitmotion({ heading: 270, cog: null, groundSpeed: 5.0 })
    const snap = buildSnapshot(wm, null, freshN2k({ gps: { cog: null } }), NOW)
    expect(snap.headingSlavedToCog).toBe(false)
    expect(snap.heading).toBe(270)
  })

  it('uses arbitrated n2k sog when gating the slave on a stale-witmotion fallback', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000, heading: 270 })
    const n2k = freshN2k({ gps: { cog: 45, sog: 5.2 } })
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.source).toBe('n2k')
    expect(snap.headingSlavedToCog).toBe(true)
    expect(snap.heading).toBe(45)
  })

  it('exposes source-label for the UI (all four states)', () => {
    expect(buildSnapshot(freshWitmotion(), null, freshN2k(), NOW).sourceLabel).toBe('NMEA 2000 (boat MFD)')
    expect(buildSnapshot(freshWitmotion({ hdop: 0.3 }), null, freshN2k(), NOW).sourceLabel).toBe('WitMotion (USB)')
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const wmB = freshWitmotionB({ hdop: 0.3 })
    expect(buildSnapshot(wm, wmB, freshN2k(), NOW).sourceLabel).toBe('WitMotion B (USB)')
    expect(buildSnapshot(null, null, null, NOW).sourceLabel).toBe('No fix')
  })

  it('reports n2kSrc when n2k is active', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap = buildSnapshot(wm, null, freshN2k({ gps: { src: 0x03 } }), NOW)
    expect(snap.n2kSrc).toBe(0x03)
  })

  it('age reflects active source timestamp', () => {
    const snap = buildSnapshot(freshWitmotion(), null, freshN2k(), NOW)
    expect(snap.age).toBe(200)
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const snap2 = buildSnapshot(wm, null, freshN2k(), NOW)
    expect(snap2.age).toBe(200)
    const snap3 = buildSnapshot(freshWitmotion({ hdop: 0.3 }), null, freshN2k(), NOW)
    expect(snap3.age).toBe(500)
  })

  it('age reflects witmotion-b timestamp when it is the active source', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000 })
    const wmB = freshWitmotionB({ timestamp: NOW - 300 })
    const snap = buildSnapshot(wm, wmB, null, NOW)
    expect(snap.source).toBe('witmotion-b')
    expect(snap.age).toBe(300)
  })

  it('returns age=null when no source has any timestamp', () => {
    const wm = { latitude: null, longitude: null, timestamp: null, fix: false }
    const n2k = { gps: { latitude: null, longitude: null, timestamp: null } }
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.source).toBe('none')
    expect(snap.age).toBe(null)
  })

  it('falls back to witmotion altitude/satellites if n2k omits them', () => {
    const wm = freshWitmotion({ timestamp: NOW - 60_000, altitude: 99, satellites: 7 })
    const n2k = freshN2k({ gps: { altitude: null, satellites: null } })
    const snap = buildSnapshot(wm, null, n2k, NOW)
    expect(snap.source).toBe('n2k')
    expect(snap.altitude).toBe(99)
    expect(snap.satellites).toBe(7)
  })
})
