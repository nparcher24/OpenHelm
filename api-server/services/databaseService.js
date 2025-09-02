/**
 * Database Service - SQLite database for ENC chart data storage
 */

import sqlite3Lib from 'sqlite3'
const sqlite3 = sqlite3Lib.verbose()
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class DatabaseService {
  constructor() {
    this.db = null
    this.dbPath = path.join(__dirname, '../../data/enc_charts.db')
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
          console.error('[Database] Error opening database:', err)
          throw err
        }
        console.log('[Database] Connected to SQLite database at:', this.dbPath)
      })

      // Create tables
      await this.createTables()
      
      console.log('[Database] Database initialized successfully')
      return this.db
    } catch (error) {
      console.error('[Database] Failed to initialize database:', error)
      throw error
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS enc_charts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          title TEXT,
          abstract TEXT,
          
          -- Geographic bounds
          west_bound REAL,
          east_bound REAL,
          south_bound REAL,
          north_bound REAL,
          center_lat REAL,
          center_lon REAL,
          
          -- Scale and resolution
          scale_denominator INTEGER,
          scale_text TEXT,
          spatial_resolution TEXT,
          
          -- Classification
          chart_type TEXT,
          status TEXT,
          language TEXT,
          
          -- Dates
          publication_date TEXT,
          revision_date TEXT,
          date_stamp TEXT,
          
          -- Distribution
          download_url TEXT,
          file_format TEXT,
          file_size INTEGER,
          
          -- Keywords and metadata
          keywords TEXT, -- JSON array of keywords
          organization TEXT,
          contact_role TEXT,
          
          -- Quality info
          lineage TEXT,
          data_quality TEXT,
          
          -- Processing metadata
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          -- Full XML data for debugging
          raw_xml_data TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_enc_charts_bounds ON enc_charts(west_bound, east_bound, south_bound, north_bound);
        CREATE INDEX IF NOT EXISTS idx_enc_charts_type ON enc_charts(chart_type);
        CREATE INDEX IF NOT EXISTS idx_enc_charts_scale ON enc_charts(scale_denominator);
        CREATE INDEX IF NOT EXISTS idx_enc_charts_publication_date ON enc_charts(publication_date);
        CREATE INDEX IF NOT EXISTS idx_enc_charts_name ON enc_charts(name);
      `

      this.db.exec(createTableSQL, (err) => {
        if (err) {
          console.error('[Database] Error creating tables:', err)
          reject(err)
        } else {
          console.log('[Database] Tables created successfully')
          resolve()
        }
      })
    })
  }

  /**
   * Insert or update ENC chart data
   */
  async upsertChart(chartData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO enc_charts (
          id, name, title, abstract,
          west_bound, east_bound, south_bound, north_bound, center_lat, center_lon,
          scale_denominator, scale_text, spatial_resolution,
          chart_type, status, language,
          publication_date, revision_date, date_stamp,
          download_url, file_format, file_size,
          keywords, organization, contact_role,
          lineage, data_quality,
          updated_at, raw_xml_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `

      const params = [
        chartData.id,
        chartData.name,
        chartData.title,
        chartData.abstract,
        chartData.westBound,
        chartData.eastBound,
        chartData.southBound,
        chartData.northBound,
        chartData.centerLat,
        chartData.centerLon,
        chartData.scaleDenominator,
        chartData.scaleText,
        chartData.spatialResolution,
        chartData.chartType,
        chartData.status,
        chartData.language,
        chartData.publicationDate,
        chartData.revisionDate,
        chartData.dateStamp,
        chartData.downloadUrl,
        chartData.fileFormat,
        chartData.fileSize,
        JSON.stringify(chartData.keywords || []),
        chartData.organization,
        chartData.contactRole,
        chartData.lineage,
        chartData.dataQuality,
        JSON.stringify(chartData.rawXmlData || {})
      ]

      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('[Database] Error upserting chart:', err)
          reject(err)
        } else {
          resolve({ id: chartData.id, changes: this.changes })
        }
      })
    })
  }

  /**
   * Get all charts with optional filtering
   */
  async getCharts(filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM enc_charts'
      const params = []
      const conditions = []

      if (filters.chartType) {
        conditions.push('chart_type = ?')
        params.push(filters.chartType)
      }

      if (filters.bounds) {
        conditions.push(`
          west_bound <= ? AND east_bound >= ? AND 
          south_bound <= ? AND north_bound >= ?
        `)
        params.push(filters.bounds.east, filters.bounds.west, filters.bounds.north, filters.bounds.south)
      }

      if (filters.search) {
        conditions.push('(name LIKE ? OR title LIKE ? OR abstract LIKE ?)')
        const searchTerm = `%${filters.search}%`
        params.push(searchTerm, searchTerm, searchTerm)
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ')
      }

      sql += ' ORDER BY name ASC'

      if (filters.limit) {
        sql += ' LIMIT ?'
        params.push(filters.limit)
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('[Database] Error getting charts:', err)
          reject(err)
        } else {
          // Parse JSON fields
          const charts = rows.map(row => ({
            ...row,
            keywords: JSON.parse(row.keywords || '[]'),
            rawXmlData: JSON.parse(row.raw_xml_data || '{}')
          }))
          resolve(charts)
        }
      })
    })
  }

  /**
   * Get chart by ID
   */
  async getChart(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM enc_charts WHERE id = ?'
      
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          console.error('[Database] Error getting chart:', err)
          reject(err)
        } else if (row) {
          const chart = {
            ...row,
            keywords: JSON.parse(row.keywords || '[]'),
            rawXmlData: JSON.parse(row.raw_xml_data || '{}')
          }
          resolve(chart)
        } else {
          resolve(null)
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
          COUNT(DISTINCT chart_type) as chart_types,
          MIN(publication_date) as oldest_chart,
          MAX(publication_date) as newest_chart,
          AVG(scale_denominator) as avg_scale
        FROM enc_charts
      `

      this.db.get(sql, [], (err, row) => {
        if (err) {
          console.error('[Database] Error getting stats:', err)
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  }

  /**
   * Clear all chart data
   */
  async clearCharts() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM enc_charts', [], function(err) {
        if (err) {
          console.error('[Database] Error clearing charts:', err)
          reject(err)
        } else {
          console.log(`[Database] Cleared ${this.changes} charts`)
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
            console.error('[Database] Error closing database:', err)
            reject(err)
          } else {
            console.log('[Database] Database connection closed')
            resolve()
          }
        })
      })
    }
  }
}

export default new DatabaseService()