// @vitest-environment node
//
// Drives the same handlePgn() path the live SimpleCan reader feeds, via the
// _handlePgnForTest export. Each test resets vesselData first so order doesn't
// matter. canboatjs returns SI units (K, Pa, m, m/s, rad, V, A, L/h) — the
// service converts to display units; tests assert on the display units.

import { beforeEach, describe, it, expect } from 'vitest'
import {
  _handlePgnForTest,
  _resetVesselDataForTest,
  getVesselData,
  getPgnInventory
} from '../nmea2000Service.js'

beforeEach(() => {
  _resetVesselDataForTest()
})

// canboatjs hands fields back as either raw numbers or { value, units }
// objects. The service's `num()` and `isReference()` helpers accept both —
// tests cover both shapes.

describe('PGN 127751 — DC Voltage/Current (this boat\'s battery monitor)', () => {
  it('populates batteryVoltage/batteryCurrent and tags source', () => {
    _handlePgnForTest({
      pgn: 127751,
      src: 0x94,
      fields: { connectionNumber: 1, dcVoltage: 13.42, dcCurrent: 5.1 }
    })
    const v = getVesselData()
    expect(v.batteryVoltage).toBe(13.42)
    expect(v.batteryCurrent).toBe(5.1)
    expect(v.batterySource).toBe('127751')
  })

  it('ignores 0 V readings from unused connection slots', () => {
    // Live battery reading first…
    _handlePgnForTest({
      pgn: 127751, src: 0x94,
      fields: { connectionNumber: 1, dcVoltage: 12.5, dcCurrent: 1.36 }
    })
    expect(getVesselData().batteryVoltage).toBe(12.5)
    // …then an unused slot (connectionNumber: 0/2 → 0 V) must NOT blank it.
    _handlePgnForTest({
      pgn: 127751, src: 0x94,
      fields: { connectionNumber: 0, dcVoltage: 0, dcCurrent: 0 }
    })
    _handlePgnForTest({
      pgn: 127751, src: 0x94,
      fields: { connectionNumber: 2, dcVoltage: 0, dcCurrent: 0 }
    })
    expect(getVesselData().batteryVoltage).toBe(12.5)
    expect(getVesselData().batteryCurrent).toBeCloseTo(1.36)
  })

  it('127751 wins over a stale 127508 reading', () => {
    _handlePgnForTest({ pgn: 127508, src: 0x50, fields: { voltage: 12.0 } })
    _handlePgnForTest({ pgn: 127751, src: 0x94, fields: { connectionNumber: 1, dcVoltage: 13.6 } })
    expect(getVesselData().batteryVoltage).toBe(13.6)
    expect(getVesselData().batterySource).toBe('127751')
    // A subsequent 127508 must NOT overwrite the more recent 127751 reading.
    _handlePgnForTest({ pgn: 127508, src: 0x50, fields: { voltage: 12.1 } })
    expect(getVesselData().batteryVoltage).toBe(13.6)
    expect(getVesselData().batterySource).toBe('127751')
  })
})

describe('PGN 127508 — Battery Status (legacy / other boats)', () => {
  it('still works when 127751 is absent', () => {
    _handlePgnForTest({
      pgn: 127508,
      src: 0x50,
      fields: { voltage: 12.45, current: 1.2 }
    })
    const v = getVesselData()
    expect(v.batteryVoltage).toBe(12.45)
    expect(v.batteryCurrent).toBe(1.2)
    expect(v.batterySource).toBe('127508')
  })
})

describe('GPS PGNs feed the vesselData.gps block for the arbiter', () => {
  it('129025 Position Rapid Update fills lat/lon + src + timestamp', () => {
    _handlePgnForTest({
      pgn: 129025,
      src: 0x03,
      fields: { latitude: 36.85, longitude: -76.30 }
    })
    const v = getVesselData()
    expect(v.gps.latitude).toBeCloseTo(36.85)
    expect(v.gps.longitude).toBeCloseTo(-76.30)
    expect(v.gps.src).toBe(0x03)
    expect(v.gps.timestamp).toBeTypeOf('number')
  })

  it('129025 rejects out-of-range coordinates', () => {
    _handlePgnForTest({
      pgn: 129025,
      src: 0x03,
      fields: { latitude: 999, longitude: 999 }
    })
    expect(getVesselData().gps.latitude).toBeNull()
    expect(getVesselData().gps.longitude).toBeNull()
  })

  it('129026 COG/SOG converts cog rad→deg and keeps sog in m/s', () => {
    _handlePgnForTest({
      pgn: 129026,
      src: 0x03,
      fields: { cog: Math.PI / 2, sog: 5.5 } // 90° true, 5.5 m/s
    })
    const v = getVesselData()
    expect(v.gps.cog).toBeCloseTo(90)
    expect(v.gps.sog).toBeCloseTo(5.5)
  })

  it('129026 normalizes negative cog into 0..360', () => {
    _handlePgnForTest({
      pgn: 129026,
      src: 0x03,
      fields: { cog: -Math.PI / 4 } // -45° → 315°
    })
    expect(getVesselData().gps.cog).toBeCloseTo(315)
  })

  it('129029 GNSS Position sets sats and infers fix=true at >=4 sats', () => {
    _handlePgnForTest({
      pgn: 129029,
      src: 0x03,
      fields: { latitude: 36.85, longitude: -76.30, altitude: 5, numberOfSvs: 9, hdop: 0.8, pdop: 1.4 }
    })
    const v = getVesselData()
    expect(v.gps.satellites).toBe(9)
    expect(v.gps.fix).toBe(true)
    expect(v.gps.altitude).toBe(5)
    expect(v.gps.hdop).toBeCloseTo(0.8)
    expect(v.gps.pdop).toBeCloseTo(1.4)
  })

  it('129029 reports fix=false when sats < 4', () => {
    _handlePgnForTest({
      pgn: 129029,
      src: 0x03,
      fields: { latitude: 36.85, longitude: -76.30, numberOfSvs: 3 }
    })
    expect(getVesselData().gps.fix).toBe(false)
  })

  it('129539 GNSS DOPs fills hdop/vdop/pdop', () => {
    _handlePgnForTest({
      pgn: 129539,
      src: 0x03,
      fields: { hdop: 0.7, vdop: 1.0, tdop: 1.2 }
    })
    const v = getVesselData()
    expect(v.gps.hdop).toBeCloseTo(0.7)
    expect(v.gps.vdop).toBeCloseTo(1.0)
    expect(v.gps.pdop).toBeCloseTo(1.2)
  })
})

describe('Wind (130306)', () => {
  it('converts m/s → kts and rad → deg, captures reference', () => {
    _handlePgnForTest({
      pgn: 130306,
      src: 0x10,
      fields: { windSpeed: 5.0, windAngle: Math.PI, reference: 'Apparent' }
    })
    const v = getVesselData()
    expect(v.windSpeed).toBeCloseTo(9.7, 1) // 5 m/s × 1.94384
    expect(v.windAngle).toBe(180)
    expect(v.windReference).toBe('apparent')
  })

  it('handles enum-shaped reference field ({ name: ... })', () => {
    _handlePgnForTest({
      pgn: 130306,
      src: 0x10,
      fields: { windSpeed: 1.0, windAngle: 0, reference: { name: 'True (boat referenced)' } }
    })
    expect(getVesselData().windReference).toBe('true (boat referenced)')
  })
})

describe('Heading + attitude (127250 / 127257)', () => {
  it('127250 converts heading rad → deg and captures reference', () => {
    _handlePgnForTest({
      pgn: 127250,
      src: 0x05,
      fields: { heading: Math.PI, reference: 'Magnetic' }
    })
    const v = getVesselData()
    expect(v.vesselHeading).toBeCloseTo(180)
    expect(v.headingReference).toBe('magnetic')
  })

  it('127257 fills roll/pitch/yaw in degrees (radToDeg normalizes to 0..360)', () => {
    _handlePgnForTest({
      pgn: 127257,
      src: 0x05,
      fields: { roll: 0.1, pitch: -0.05, yaw: Math.PI / 4 }
    })
    const v = getVesselData()
    expect(v.attitudeRoll).toBeCloseTo(5.7, 1)     // 0.1 rad ≈ 5.73°
    expect(v.attitudePitch).toBeCloseTo(357.1, 1)  // -0.05 rad → 357.14° (normalized)
    expect(v.attitudeYaw).toBeCloseTo(45, 1)
  })
})

describe('Rudder (127245)', () => {
  it('converts rad → deg', () => {
    _handlePgnForTest({
      pgn: 127245,
      src: 0x07,
      fields: { position: 0.1 } // ~5.73°
    })
    expect(getVesselData().rudderAngle).toBeCloseTo(5.7, 1)
  })
})

describe('Environment (130310 / 130312)', () => {
  it('130310 converts water/air temp K→F and pressure Pa→hPa', () => {
    _handlePgnForTest({
      pgn: 130310,
      src: 0x08,
      fields: {
        waterTemperature: 293.15,                 // 20°C → 68°F
        outsideAmbientAirTemperature: 298.15,     // 25°C → 77°F
        atmosphericPressure: 101325               // → 1013.25 hPa
      }
    })
    const v = getVesselData()
    expect(v.waterTemp).toBe(68)
    expect(v.airTemp).toBe(77)
    expect(v.atmosphericPressure).toBeCloseTo(1013.3, 1)
  })

  it('130312 routes Sea Temperature to waterTemp', () => {
    _handlePgnForTest({
      pgn: 130312,
      src: 0x08,
      fields: { source: 'Sea Temperature', actualTemperature: 290.15 } // 17°C → 62.6°F
    })
    expect(getVesselData().waterTemp).toBe(63)
  })

  it('130312 routes Outside Temperature to airTemp', () => {
    _handlePgnForTest({
      pgn: 130312,
      src: 0x08,
      fields: { source: 'Outside Temperature', actualTemperature: 295.15 } // 22°C → 71.6°F
    })
    expect(getVesselData().airTemp).toBe(72)
  })
})

describe('Fuel (127505)', () => {
  it('only updates fuel fields when type=Fuel', () => {
    _handlePgnForTest({
      pgn: 127505,
      src: 0x01,
      fields: { type: 'Fuel', level: 76.5, capacity: 378.5 } // ~100 gal
    })
    const v = getVesselData()
    expect(v.fuelLevel).toBeCloseTo(76.5)
    expect(v.fuelCapacity).toBe(100)
  })

  it('ignores non-Fuel fluid types', () => {
    _handlePgnForTest({
      pgn: 127505,
      src: 0x01,
      fields: { type: 'Water', level: 50, capacity: 100 }
    })
    const v = getVesselData()
    expect(v.fuelLevel).toBeNull()
    expect(v.fuelCapacity).toBeNull()
  })
})

describe('canboatjs field-shape normalization', () => {
  it('accepts numeric fields as { value: n } objects', () => {
    _handlePgnForTest({
      pgn: 127489,
      src: 0x50,
      fields: {
        oilPressure:   { value: 344738 },          // 50 PSI in Pa
        temperature:   { value: 363.15 },          // 90°C → 194°F
        alternatorPotential: { value: 14.1 },
        fuelRate:      { value: 7.57 },            // L/h → 2 GPH
        totalEngineHours: { value: 891000 }        // s → 247.5 h
      }
    })
    const v = getVesselData()
    expect(v.oilPressure).toBeCloseTo(50, 0)
    expect(v.engineTemp).toBe(194)
    expect(v.batteryVoltage).toBe(14.1)
    expect(v.batterySource).toBe('engine')
    expect(v.fuelRate).toBeCloseTo(2.0, 1)
    expect(v.engineHours).toBeCloseTo(247.5, 1)
  })
})

describe('PGN inventory tracking', () => {
  it('records every PGN seen with category, src, and count', () => {
    _handlePgnForTest({ pgn: 127505, src: 0x01, fields: { type: 'Fuel', level: 50 } })
    _handlePgnForTest({ pgn: 127505, src: 0x01, fields: { type: 'Fuel', level: 51 } })
    _handlePgnForTest({ pgn: 130820, src: 0x0A, fields: {} })

    const inv = getPgnInventory()
    const fluid = inv.find(e => e.pgn === 127505)
    const audio = inv.find(e => e.pgn === 130820)
    expect(fluid).toBeTruthy()
    expect(fluid.count).toBe(2)
    expect(fluid.category).toBe('fuel')
    expect(fluid.src).toBe(0x01)
    expect(audio.category).toBe('audio')
  })

  it('unknown PGNs land in the "other" category', () => {
    _handlePgnForTest({ pgn: 99999, src: 0xFF, fields: {} })
    expect(getPgnInventory().find(e => e.pgn === 99999).category).toBe('other')
  })
})

describe('vesselData snapshot metadata', () => {
  it('marks isConnected=true and stamps timestamp on every PGN', () => {
    expect(getVesselData().isConnected).toBe(false)
    _handlePgnForTest({ pgn: 127505, src: 0x01, fields: { type: 'Fuel', level: 50 } })
    const v = getVesselData()
    expect(v.isConnected).toBe(true)
    expect(v.isDemoMode).toBe(false)
    expect(v.timestamp).toBeTypeOf('number')
    expect(v.pgnCount).toBeGreaterThan(0)
  })
})
