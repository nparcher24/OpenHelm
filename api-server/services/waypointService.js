/**
 * Waypoint Service - SQLite database for waypoint storage
 */

import sqlite3Lib from 'sqlite3'
const sqlite3 = sqlite3Lib.verbose()
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class WaypointService {
  constructor() {
    this.db = null
    this.dbPath = path.join(__dirname, '../../data/waypoints.db')
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }

      // Open database connection
      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('[Waypoints] Error opening database:', err)
            reject(err)
            return
          }
          console.log('[Waypoints] Connected to SQLite database at:', this.dbPath)

          // Enable WAL mode for better concurrent access
          this.db.run('PRAGMA journal_mode=WAL', (err) => {
            if (err) {
              console.warn('[Waypoints] Failed to enable WAL mode:', err)
            }

            // Create tables
            this.createTables()
              .then(() => {
                console.log('[Waypoints] Database initialized successfully')
                resolve(this.db)
              })
              .catch(reject)
          })
        })
      })
    } catch (error) {
      console.error('[Waypoints] Failed to initialize database:', error)
      throw error
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS waypoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          icon TEXT DEFAULT 'map-pin',
          color TEXT DEFAULT '#00ff00',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_waypoints_coords ON waypoints(latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_waypoints_name ON waypoints(name);
      `

      this.db.exec(createTableSQL, (err) => {
        if (err) {
          console.error('[Waypoints] Error creating tables:', err)
          reject(err)
        } else {
          console.log('[Waypoints] Tables created successfully')
          resolve()
        }
      })
    })
  }

  /**
   * Get all waypoints
   */
  async getAllWaypoints() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM waypoints ORDER BY created_at DESC'

      this.db.all(sql, [], (err, rows) => {
        if (err) {
          console.error('[Waypoints] Error getting waypoints:', err)
          reject(err)
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  /**
   * Get waypoint by ID
   */
  async getWaypointById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM waypoints WHERE id = ?'

      this.db.get(sql, [id], (err, row) => {
        if (err) {
          console.error('[Waypoints] Error getting waypoint:', err)
          reject(err)
        } else {
          resolve(row || null)
        }
      })
    })
  }

  /**
   * Create a new waypoint
   */
  async createWaypoint(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO waypoints (name, description, latitude, longitude, icon, color)
        VALUES (?, ?, ?, ?, ?, ?)
      `

      const params = [
        data.name,
        data.description || null,
        data.latitude,
        data.longitude,
        data.icon || 'map-pin',
        data.color || '#00ff00'
      ]

      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('[Waypoints] Error creating waypoint:', err)
          reject(err)
        } else {
          console.log(`[Waypoints] Created waypoint ${this.lastID}: ${data.name}`)
          resolve({ id: this.lastID, ...data })
        }
      })
    })
  }

  /**
   * Update an existing waypoint
   */
  async updateWaypoint(id, data) {
    return new Promise((resolve, reject) => {
      // Build dynamic update SQL based on provided fields
      const fields = []
      const params = []

      if (data.name !== undefined) {
        fields.push('name = ?')
        params.push(data.name)
      }
      if (data.description !== undefined) {
        fields.push('description = ?')
        params.push(data.description)
      }
      if (data.latitude !== undefined) {
        fields.push('latitude = ?')
        params.push(data.latitude)
      }
      if (data.longitude !== undefined) {
        fields.push('longitude = ?')
        params.push(data.longitude)
      }
      if (data.icon !== undefined) {
        fields.push('icon = ?')
        params.push(data.icon)
      }
      if (data.color !== undefined) {
        fields.push('color = ?')
        params.push(data.color)
      }

      if (fields.length === 0) {
        resolve({ id, changes: 0 })
        return
      }

      fields.push("updated_at = datetime('now')")
      params.push(id)

      const sql = `UPDATE waypoints SET ${fields.join(', ')} WHERE id = ?`

      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('[Waypoints] Error updating waypoint:', err)
          reject(err)
        } else {
          console.log(`[Waypoints] Updated waypoint ${id}, changes: ${this.changes}`)
          resolve({ id, changes: this.changes })
        }
      })
    })
  }

  /**
   * Delete a waypoint
   */
  async deleteWaypoint(id) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM waypoints WHERE id = ?'

      this.db.run(sql, [id], function(err) {
        if (err) {
          console.error('[Waypoints] Error deleting waypoint:', err)
          reject(err)
        } else {
          console.log(`[Waypoints] Deleted waypoint ${id}, changes: ${this.changes}`)
          resolve({ id, deleted: this.changes > 0 })
        }
      })
    })
  }

  /**
   * Delete multiple waypoints
   */
  async deleteWaypointsBatch(ids) {
    if (!ids || ids.length === 0) {
      return { deleted: [], failed: [] }
    }

    const deleted = []
    const failed = []

    for (const id of ids) {
      try {
        const result = await this.deleteWaypoint(id)
        if (result.deleted) {
          deleted.push(id)
        } else {
          failed.push({ id, error: 'Not found' })
        }
      } catch (error) {
        failed.push({ id, error: error.message })
      }
    }

    console.log(`[Waypoints] Batch delete: ${deleted.length} deleted, ${failed.length} failed`)
    return { deleted, failed }
  }

  /**
   * Export all waypoints to CSV format
   */
  async exportToCSV() {
    const waypoints = await this.getAllWaypoints()

    const headers = ['name', 'description', 'latitude', 'longitude', 'icon', 'color', 'created_at']
    const rows = waypoints.map(wp => [
      `"${(wp.name || '').replace(/"/g, '""')}"`,
      `"${(wp.description || '').replace(/"/g, '""')}"`,
      wp.latitude,
      wp.longitude,
      wp.icon,
      wp.color,
      wp.created_at
    ])

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    return csv
  }

  /**
   * Get waypoint count
   */
  async getCount() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM waypoints'

      this.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err)
        } else {
          resolve(row.count)
        }
      })
    })
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            console.error('[Waypoints] Error closing database:', err)
            reject(err)
          } else {
            console.log('[Waypoints] Database connection closed')
            resolve()
          }
        })
      })
    }
  }
}

// Export singleton instance
const waypointService = new WaypointService()

// Initialize on import
waypointService.initialize().catch(err => {
  console.error('[Waypoints] Failed to initialize:', err)
})

export default waypointService
