import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the isInBounds logic (extracted for testing)
function isInBounds(station, bounds) {
  const [west, south, east, north] = bounds
  const lat = parseFloat(station.lat)
  const lng = parseFloat(station.lng)
  return lat >= south && lat <= north && lng >= west && lng <= east
}

describe('weatherStationService', () => {
  describe('isInBounds', () => {
    const chesapeakeBounds = [-76.5, 36.5, -75.5, 37.5]

    it('should include station inside bounds', () => {
      const station = { lat: 37.0, lng: -76.0 }
      expect(isInBounds(station, chesapeakeBounds)).toBe(true)
    })

    it('should include station on bounds edge', () => {
      const station = { lat: 36.5, lng: -76.5 }
      expect(isInBounds(station, chesapeakeBounds)).toBe(true)
    })

    it('should exclude station outside bounds', () => {
      const station = { lat: 35.0, lng: -76.0 }
      expect(isInBounds(station, chesapeakeBounds)).toBe(false)
    })

    it('should exclude station east of bounds', () => {
      const station = { lat: 37.0, lng: -74.0 }
      expect(isInBounds(station, chesapeakeBounds)).toBe(false)
    })

    it('should handle string coordinates', () => {
      const station = { lat: '37.0', lng: '-76.0' }
      expect(isInBounds(station, chesapeakeBounds)).toBe(true)
    })
  })

  describe('formatDate', () => {
    function formatDate(date) {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}${m}${d}`
    }

    it('should format date correctly', () => {
      const date = new Date('2026-03-26T00:00:00')
      expect(formatDate(date)).toBe('20260326')
    })

    it('should pad single-digit month', () => {
      const date = new Date('2026-01-05T00:00:00')
      expect(formatDate(date)).toBe('20260105')
    })
  })
})
