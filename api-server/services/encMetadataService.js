/**
 * ENC Metadata Service - Simplified SQLite database for ENC chart metadata
 */

import sqlite3Lib from 'sqlite3'
const sqlite3 = sqlite3Lib.verbose()
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class ENCMetadataService {
  constructor() {
    this.db = null
    this.dbPath = path.join(__dirname, '../../data/enc_metadata.db')
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
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('[ENC Metadata] Error opening database:', err)
          throw err
        }
        console.log('[ENC Metadata] Connected to SQLite database at:', this.dbPath)
      })

      // Create tables
      await this.createTables()
      
      console.log('[ENC Metadata] Database initialized successfully')
      return this.db
    } catch (error) {
      console.error('[ENC Metadata] Failed to initialize database:', error)
      throw error
    }
  }

  /**
   * Create database tables with optimized schema
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS enc_metadata (
          chart_id TEXT PRIMARY KEY,
          chart_name TEXT,
          edition TEXT,
          publication_date TEXT,
          last_updated TEXT,
          
          -- Geographic bounds
          bounds_north REAL,
          bounds_south REAL,
          bounds_east REAL,
          bounds_west REAL,
          
          -- Navigation metadata
          scale_denominator INTEGER,
          coast_guard_district TEXT,
          panel_info TEXT,
          
          -- Distribution
          download_url TEXT,
          file_size_mb REAL,
          zip_created TEXT,
          
          -- Status and maintenance
          status TEXT,
          maintenance_frequency TEXT,
          data_source TEXT,
          
          -- Organization
          organization TEXT,
          language TEXT,
          
          -- Processing metadata
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_chart_bounds ON enc_metadata(bounds_north, bounds_south, bounds_east, bounds_west);
        CREATE INDEX IF NOT EXISTS idx_chart_scale ON enc_metadata(scale_denominator);
        CREATE INDEX IF NOT EXISTS idx_publication_date ON enc_metadata(publication_date);
        CREATE INDEX IF NOT EXISTS idx_chart_name ON enc_metadata(chart_name);
      `

      this.db.exec(createTableSQL, (err) => {
        if (err) {
          console.error('[ENC Metadata] Error creating tables:', err)
          reject(err)
        } else {
          console.log('[ENC Metadata] Tables created successfully')
          resolve()
        }
      })
    })
  }

  /**
   * Insert or update chart metadata
   */
  async upsertMetadata(chartData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO enc_metadata (
          chart_id, chart_name, edition, publication_date, last_updated,
          bounds_north, bounds_south, bounds_east, bounds_west,
          scale_denominator, coast_guard_district, panel_info,
          download_url, file_size_mb, zip_created,
          status, maintenance_frequency, data_source,
          organization, language,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `

      const params = [
        chartData.chart_id,
        chartData.chart_name,
        chartData.edition,
        chartData.publication_date,
        chartData.last_updated,
        chartData.bounds_north,
        chartData.bounds_south,
        chartData.bounds_east,
        chartData.bounds_west,
        chartData.scale_denominator,
        chartData.coast_guard_district,
        chartData.panel_info,
        chartData.download_url,
        chartData.file_size_mb,
        chartData.zip_created,
        chartData.status,
        chartData.maintenance_frequency,
        chartData.data_source,
        chartData.organization,
        chartData.language
      ]

      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('[ENC Metadata] Error upserting metadata:', err)
          reject(err)
        } else {
          resolve({ id: chartData.chart_id, changes: this.changes })
        }
      })
    })
  }

  /**
   * Get all charts with optional filtering
   */
  async getCharts(filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM enc_metadata'
      const params = []
      const conditions = []

      if (filters.scale_min) {
        conditions.push('scale_denominator >= ?')
        params.push(filters.scale_min)
      }

      if (filters.scale_max) {
        conditions.push('scale_denominator <= ?')
        params.push(filters.scale_max)
      }

      if (filters.bounds) {
        conditions.push(`
          bounds_west <= ? AND bounds_east >= ? AND 
          bounds_south <= ? AND bounds_north >= ?
        `)
        params.push(filters.bounds.east, filters.bounds.west, filters.bounds.north, filters.bounds.south)
      }

      if (filters.search) {
        conditions.push('(chart_id LIKE ? OR chart_name LIKE ?)')
        const searchTerm = `%${filters.search}%`
        params.push(searchTerm, searchTerm)
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ')
      }

      sql += ' ORDER BY chart_id ASC'

      if (filters.limit) {
        sql += ' LIMIT ?'
        params.push(filters.limit)
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('[ENC Metadata] Error getting charts:', err)
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  /**
   * Get single chart metadata by ID
   */
  async getChart(chartId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM enc_metadata WHERE chart_id = ?'
      
      this.db.get(sql, [chartId], (err, row) => {
        if (err) {
          console.error('[ENC Metadata] Error getting chart:', err)
          reject(err)
        } else {
          resolve(row || null)
        }
      })
    })
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_charts,
          COUNT(CASE WHEN bounds_north IS NOT NULL THEN 1 END) as charts_with_bounds,
          MIN(publication_date) as oldest_chart,
          MAX(publication_date) as newest_chart,
          AVG(scale_denominator) as avg_scale,
          MIN(scale_denominator) as min_scale,
          MAX(scale_denominator) as max_scale,
          SUM(file_size_mb) as total_size_mb
        FROM enc_metadata
      `

      this.db.get(sql, [], (err, row) => {
        if (err) {
          console.error('[ENC Metadata] Error getting stats:', err)
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  }

  /**
   * Clear all metadata
   */
  async clearAll() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM enc_metadata', [], function(err) {
        if (err) {
          console.error('[ENC Metadata] Error clearing metadata:', err)
          reject(err)
        } else {
          console.log(`[ENC Metadata] Cleared ${this.changes} chart entries`)
          resolve(this.changes)
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
            console.error('[ENC Metadata] Error closing database:', err)
            reject(err)
          } else {
            console.log('[ENC Metadata] Database connection closed')
            resolve()
          }
        })
      })
    }
  }
}

export default new ENCMetadataService()