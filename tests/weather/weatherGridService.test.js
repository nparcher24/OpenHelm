import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateGridPoints, writeGridGeoJSON } from '../../api-server/services/weatherGridService.js'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('weatherGridService', () => {
  describe('generateGridPoints', () => {
    it('should generate correct grid for small bounding box', () => {
      const bounds = [-76, 36, -75, 37] // 1x1 degree
      const points = generateGridPoints(bounds, 0.5)

      // Expected: 3 lats (36, 36.5, 37) x 3 lons (-76, -75.5, -75) = 9 points
      expect(points).toHaveLength(9)
      expect(points[0]).toEqual({ lat: 36, lon: -76 })
      expect(points[points.length - 1]).toEqual({ lat: 37, lon: -75 })
    })

    it('should default to 0.05 degree resolution', () => {
      const bounds = [-76, 36, -75, 37]
      const points = generateGridPoints(bounds)

      // 1 degree / 0.05 = 21 lats x 21 lons = 441 points
      expect(points).toHaveLength(441)
    })

    it('should handle small regions', () => {
      const bounds = [-76.1, 36.0, -76.0, 36.1]
      const points = generateGridPoints(bounds, 0.25)

      // Only 1 point at -76.1, 36.0
      expect(points.length).toBeGreaterThanOrEqual(1)
    })

    it('should return empty for degenerate bounds', () => {
      // South > North — no valid points
      const bounds = [-76, 37, -75, 36]
      const points = generateGridPoints(bounds, 0.25)
      expect(points).toHaveLength(0)
    })
  })

  describe('writeGridGeoJSON', () => {
    let tmpDir

    beforeEach(async () => {
      tmpDir = path.join(os.tmpdir(), `weather-test-${Date.now()}`)
      await fs.mkdir(tmpDir, { recursive: true })
    })

    it('should write per-timestamp GeoJSON files', async () => {
      const timestamps = ['2026-03-26T12:00', '2026-03-26T13:00']
      const pointData = new Map()
      pointData.set('36,76', {
        lat: 36, lon: -76,
        windSpeed: [10, 15],
        windDir: [180, 200],
        windGust: [15, 20],
        temp: [65, 66],
        pressure: [1013, 1012]
      })

      const result = await writeGridGeoJSON(timestamps, pointData, 'wind', tmpDir)

      expect(result).toHaveLength(2)

      // Check first timestamp file exists
      const safeTs = timestamps[0].replace(/:/g, '-')
      const fileContent = await fs.readFile(path.join(tmpDir, `wind-${safeTs}.geojson`), 'utf-8')
      const geojson = JSON.parse(fileContent)

      expect(geojson.type).toBe('FeatureCollection')
      expect(geojson.features).toHaveLength(1)
      expect(geojson.features[0].properties.speed).toBe(10)
      expect(geojson.features[0].properties.direction).toBe(180)

      // Check timestamps index
      const indexContent = await fs.readFile(path.join(tmpDir, 'wind-timestamps.json'), 'utf-8')
      const index = JSON.parse(indexContent)
      expect(index).toEqual(timestamps)
    })

    it('should skip timestamps with no valid data', async () => {
      const timestamps = ['2026-03-26T12:00']
      const pointData = new Map()
      pointData.set('36,76', {
        lat: 36, lon: -76,
        windSpeed: [null],
        windDir: [null]
      })

      const result = await writeGridGeoJSON(timestamps, pointData, 'wind', tmpDir)
      expect(result).toHaveLength(0)
    })
  })
})
