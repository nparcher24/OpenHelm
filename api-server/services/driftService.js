/**
 * Drift Service - SQLite storage for drift calibration measurements
 *
 * Each row captures a single "Calculate Drift" session from the GPS page:
 * the fitted drift vector, the centroid location where the measurement was
 * taken, and the time span / sample count of the fit. The front-end only
 * ever needs the most recent row, so reads are always ORDER BY created_at
 * DESC LIMIT 1.
 *
 * Mirrors the singleton/WAL pattern used by waypointService.js.
 */

import sqlite3Lib from 'sqlite3'
const sqlite3 = sqlite3Lib.verbose()
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class DriftService {
  constructor() {
    this.db = null
    this.dbPath = path.join(__dirname, '../../data/drift.db')
  }

  async initialize() {
    try {
      const dataDir = path.dirname(this.dbPath)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }

      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('[Drift] Error opening database:', err)
            reject(err)
            return
          }
          console.log('[Drift] Connected to SQLite database at:', this.dbPath)

          this.db.run('PRAGMA journal_mode=WAL', (err) => {
            if (err) {
              console.warn('[Drift] Failed to enable WAL mode:', err)
            }
            this.createTables()
              .then(() => {
                console.log('[Drift] Database initialized successfully')
                resolve(this.db)
              })
              .catch(reject)
          })
        })
      })
    } catch (error) {
      console.error('[Drift] Failed to initialize database:', error)
      throw error
    }
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS drift_calculations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          drift_speed_mps REAL NOT NULL,
          drift_bearing_deg REAL NOT NULL,
          duration_s REAL NOT NULL,
          sample_count INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_drift_created
          ON drift_calculations(created_at DESC);
      `
      this.db.exec(sql, (err) => {
        if (err) {
          console.error('[Drift] Error creating tables:', err)
          reject(err)
        } else {
          console.log('[Drift] Tables created successfully')
          resolve()
        }
      })
    })
  }

  /**
   * Insert a new drift calibration. Returns the created row including id
   * and created_at.
   */
  async createDrift(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO drift_calculations
          (latitude, longitude, drift_speed_mps, drift_bearing_deg, duration_s, sample_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      const params = [
        data.latitude,
        data.longitude,
        data.driftSpeedMps,
        data.driftBearingDeg,
        data.durationS,
        data.sampleCount
      ]

      const svc = this
      this.db.run(sql, params, function (err) {
        if (err) {
          console.error('[Drift] Error creating drift:', err)
          reject(err)
          return
        }
        const id = this.lastID
        console.log(
          `[Drift] Created drift ${id}: speed=${data.driftSpeedMps.toFixed(3)} m/s bearing=${data.driftBearingDeg.toFixed(1)}°`
        )
        svc
          .getDriftById(id)
          .then(resolve)
          .catch(reject)
      })
    })
  }

  async getDriftById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM drift_calculations WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err)
          else resolve(row || null)
        }
      )
    })
  }

  async getLatestDrift() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM drift_calculations ORDER BY created_at DESC, id DESC LIMIT 1',
        [],
        (err, row) => {
          if (err) reject(err)
          else resolve(row || null)
        }
      )
    })
  }

  async getAllDrifts(limit = 50) {
    return new Promise((resolve, reject) => {
      const cappedLimit = Math.max(1, Math.min(500, Number(limit) || 50))
      this.db.all(
        'SELECT * FROM drift_calculations ORDER BY created_at DESC, id DESC LIMIT ?',
        [cappedLimit],
        (err, rows) => {
          if (err) reject(err)
          else resolve(rows || [])
        }
      )
    })
  }

  async deleteDrift(id) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM drift_calculations WHERE id = ?',
        [id],
        function (err) {
          if (err) reject(err)
          else resolve({ id, deleted: this.changes > 0 })
        }
      )
    })
  }

  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }
}

const driftService = new DriftService()

driftService.initialize().catch((err) => {
  console.error('[Drift] Failed to initialize:', err)
})

export default driftService
