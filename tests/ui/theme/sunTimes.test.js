import { describe, it, expect } from 'vitest'
import { sunTimes, pickTheme } from '../../../src/ui/theme/sunTimes.js'

describe('sunTimes', () => {
  it('returns sunrise before sunset at Annapolis in June', () => {
    const { sunrise, sunset } = sunTimes(new Date('2026-06-21T12:00:00Z'), 38.98, -76.49)
    expect(sunrise.getTime()).toBeLessThan(sunset.getTime())
  })
  it('sunrise and sunset are roughly 12 hours apart near equinox', () => {
    const { sunrise, sunset } = sunTimes(new Date('2026-03-20T12:00:00Z'), 38.98, -76.49)
    const diffHours = (sunset.getTime() - sunrise.getTime()) / 3600000
    expect(diffHours).toBeGreaterThan(11.5)
    expect(diffHours).toBeLessThan(12.5)
  })
})

describe('pickTheme', () => {
  const sr = new Date('2026-06-21T10:00:00Z')
  const ss = new Date('2026-06-22T00:30:00Z')
  it('picks day between sunrise and sunset', () => {
    expect(pickTheme(new Date('2026-06-21T14:00:00Z'), sr, ss)).toBe('day')
  })
  it('picks dark for 2h window after sunset', () => {
    expect(pickTheme(new Date('2026-06-22T01:30:00Z'), sr, ss)).toBe('dark')
  })
  it('picks night more than 2h after sunset', () => {
    expect(pickTheme(new Date('2026-06-22T05:00:00Z'), sr, ss)).toBe('night')
  })
  it('picks night before sunrise', () => {
    expect(pickTheme(new Date('2026-06-21T05:00:00Z'), sr, ss)).toBe('night')
  })
})
