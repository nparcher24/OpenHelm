import { describe, it, expect } from 'vitest'
import { validateParams } from '../../api-server/services/weatherDownloadService.js'

describe('weatherDownloadService', () => {
  describe('validateParams', () => {
    it('should accept valid parameters', () => {
      const result = validateParams('Test Region', [-76, 36, -75, 37], 7)
      expect(result.valid).toBe(true)
    })

    it('should reject empty name', () => {
      const result = validateParams('', [-76, 36, -75, 37], 7)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Name')
    })

    it('should reject null name', () => {
      const result = validateParams(null, [-76, 36, -75, 37], 7)
      expect(result.valid).toBe(false)
    })

    it('should reject invalid bounds array', () => {
      const result = validateParams('Test', [1, 2], 7)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Bounds')
    })

    it('should reject west >= east', () => {
      const result = validateParams('Test', [-75, 36, -76, 37], 7)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('West')
    })

    it('should reject south >= north', () => {
      const result = validateParams('Test', [-76, 37, -75, 36], 7)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('South')
    })

    it('should reject out of range bounds', () => {
      const result = validateParams('Test', [-200, 36, -75, 37], 7)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('range')
    })

    it('should reject invalid forecast days', () => {
      const result = validateParams('Test', [-76, 36, -75, 37], 5)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Forecast days')
    })

    it('should accept 3, 7, and 14 day forecasts', () => {
      expect(validateParams('T', [-76, 36, -75, 37], 3).valid).toBe(true)
      expect(validateParams('T', [-76, 36, -75, 37], 7).valid).toBe(true)
      expect(validateParams('T', [-76, 36, -75, 37], 14).valid).toBe(true)
    })
  })
})
