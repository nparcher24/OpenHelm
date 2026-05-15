/**
 * Track Database Service — SQLite for vessel breadcrumb tracks.
 *
 * Separate from `data/enc_charts.db` because the access pattern is very
 * different: ~1 Hz append, range scans by time, occasional bulk delete.
 * Keeping it isolated avoids bloating the chart catalogue and lets us tune
 * pragmas independently.
 */

import sqlite3Lib from 'sqlite3'
const sqlite3 = sqlite3Lib.verbose()
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

class TrackDatabaseService {
  constructor() {
    this.db = null
    this.dbPath = path.join(__dirname, '../../data/tracks.db')
    this._ready = null
  }

  initialize() {
    if (this._ready) return this._ready
    this._ready = new Promise((resolve, reject) => {
      try {
        const dataDir = path.dirname(this.dbPath)
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('[Tracks] Error opening database:', err)
            reject(err)
            return
          }
          console.log('[Tracks] Connected to SQLite database at:', this.dbPath)

          this.db.run('PRAGMA journal_mode=WAL', (e) => {
            if (e) console.warn('[Tracks] Failed to enable WAL mode:', e.message)
            this.db.run('PRAGMA foreign_keys=ON', () => {
              this.createTables().then(() => {
                this.closeOrphanTrips()
                  .then(() => resolve(this.db))
                  .catch(reject)
              }).catch(reject)
            })
          })
        })
      } catch (err) {
        reject(err)
      }
    })
    return this._ready
  }

  createTables() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS trips (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at   INTEGER NOT NULL,
          ended_at     INTEGER,
          point_count  INTEGER NOT NULL DEFAULT 0,
          distance_m   REAL    NOT NULL DEFAULT 0,
          start_lat    REAL,
          start_lon    REAL,
          end_lat      REAL,
          end_lon      REAL,
          source       TEXT,
          label        TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_trips_started_at ON trips(started_at);
        CREATE INDEX IF NOT EXISTS idx_trips_ended_at   ON trips(ended_at);

        CREATE TABLE IF NOT EXISTS track_points (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          trip_id   INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          ts        INTEGER NOT NULL,
          lat       REAL    NOT NULL,
          lon       REAL    NOT NULL,
          cog       REAL,
          sog       REAL,
          heading   REAL,
          source    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_track_points_trip_ts ON track_points(trip_id, ts);
        CREATE INDEX IF NOT EXISTS idx_track_points_ts      ON track_points(ts);
      `
      this.db.exec(sql, (err) => {
        if (err) {
          console.error('[Tracks] Error creating tables:', err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * On boot, close any trip left open by a crash. Use the trip's last point
   * timestamp (or its `started_at` when it has zero points). We don't try to
   * resume — a restart usually means we lost continuity.
   */
  closeOrphanTrips() {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE trips
        SET ended_at = COALESCE(
          (SELECT MAX(ts) FROM track_points WHERE trip_id = trips.id),
          started_at
        )
        WHERE ended_at IS NULL
      `
      this.db.run(sql, [], function (err) {
        if (err) {
          console.error('[Tracks] Error closing orphan trips:', err)
          reject(err)
        } else {
          if (this.changes > 0) {
            console.log(`[Tracks] Closed ${this.changes} orphan trip(s) on boot`)
          }
          resolve(this.changes)
        }
      })
    })
  }

  // ─── Trips ────────────────────────────────────────────────────────────

  createTrip({ startedAt, lat, lon, source }) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO trips (started_at, ended_at, point_count, distance_m,
                           start_lat, start_lon, end_lat, end_lon, source)
        VALUES (?, NULL, 0, 0, ?, ?, ?, ?, ?)
      `
      this.db.run(sql, [startedAt, lat, lon, lat, lon, source], function (err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  /**
   * Update rolling trip stats after each accepted point.
   * `ended_at` stays null for active trips; we keep it as the rolling tail
   * via `MAX(ts)` lookups instead of writing it on every insert.
   */
  updateTripStats(tripId, { addedDistance, lat, lon, source }) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE trips
        SET point_count = point_count + 1,
            distance_m  = distance_m + ?,
            end_lat     = ?,
            end_lon     = ?,
            source      = COALESCE(?, source)
        WHERE id = ?
      `
      this.db.run(sql, [addedDistance, lat, lon, source, tripId], (err) =>
        err ? reject(err) : resolve()
      )
    })
  }

  closeTrip(tripId, endedAt) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE trips SET ended_at = ? WHERE id = ? AND ended_at IS NULL`
      this.db.run(sql, [endedAt, tripId], function (err) {
        if (err) reject(err)
        else resolve(this.changes > 0)
      })
    })
  }

  getTrip(tripId) {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM trips WHERE id = ?`, [tripId], (err, row) =>
        err ? reject(err) : resolve(row || null)
      )
    })
  }

  /**
   * List trips, optionally filtered by time window. Window semantics: any trip
   * that overlaps [from, to] — i.e. started before `to` AND
   * (still open OR ended after `from`).
   */
  listTrips({ from, to, limit = 100 } = {}) {
    return new Promise((resolve, reject) => {
      const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000)
      const conds = []
      const params = []
      if (to != null) {
        conds.push('started_at <= ?')
        params.push(to)
      }
      if (from != null) {
        conds.push('(ended_at IS NULL OR ended_at >= ?)')
        params.push(from)
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
      const sql = `SELECT * FROM trips ${where} ORDER BY started_at DESC LIMIT ?`
      params.push(cap)
      this.db.all(sql, params, (err, rows) =>
        err ? reject(err) : resolve(rows || [])
      )
    })
  }

  deleteTrip(tripId) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM trips WHERE id = ?`, [tripId], function (err) {
        if (err) reject(err)
        else resolve(this.changes > 0)
      })
    })
  }

  /**
   * Find the open (in-progress) trip if any. Used by the recorder on boot
   * after a restart and by the routes to surface "current trip".
   */
  getOpenTrip() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM trips WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
        [],
        (err, row) => (err ? reject(err) : resolve(row || null))
      )
    })
  }

  /**
   * Compute the dominant point source for a trip. Called at trip close so the
   * recorded `source` reflects which provider produced most of the points.
   */
  computeDominantSource(tripId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT source, COUNT(*) AS n FROM track_points
        WHERE trip_id = ? AND source IS NOT NULL
        GROUP BY source ORDER BY n DESC LIMIT 1
      `
      this.db.get(sql, [tripId], (err, row) =>
        err ? reject(err) : resolve(row?.source || null)
      )
    })
  }

  setTripSource(tripId, source) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE trips SET source = ? WHERE id = ?`,
        [source, tripId],
        (err) => (err ? reject(err) : resolve())
      )
    })
  }

  // ─── Track points ─────────────────────────────────────────────────────

  insertPoint(tripId, { ts, lat, lon, cog, sog, heading, source }) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO track_points (trip_id, ts, lat, lon, cog, sog, heading, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      this.db.run(
        sql,
        [tripId, ts, lat, lon, cog ?? null, sog ?? null, heading ?? null, source ?? null],
        function (err) {
          if (err) reject(err)
          else resolve(this.lastID)
        }
      )
    })
  }

  getPoints(tripId, { sinceId } = {}) {
    return new Promise((resolve, reject) => {
      const params = [tripId]
      let sql = `SELECT id, ts, lat, lon, cog, sog, heading, source
                 FROM track_points WHERE trip_id = ?`
      if (sinceId != null) {
        sql += ` AND id > ?`
        params.push(sinceId)
      }
      sql += ` ORDER BY ts ASC, id ASC`
      this.db.all(sql, params, (err, rows) =>
        err ? reject(err) : resolve(rows || [])
      )
    })
  }

  getLastPoint(tripId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT id, ts, lat, lon FROM track_points
         WHERE trip_id = ? ORDER BY ts DESC, id DESC LIMIT 1`,
        [tripId],
        (err, row) => (err ? reject(err) : resolve(row || null))
      )
    })
  }

  close() {
    if (!this.db) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.db.close((err) => (err ? reject(err) : resolve()))
    })
  }
}

const trackDatabaseService = new TrackDatabaseService()
export default trackDatabaseService
