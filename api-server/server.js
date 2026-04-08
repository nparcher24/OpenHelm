#!/usr/bin/env node
/**
 * OpenHelm API Server
 * Handles backend requests to external services like NOAA
 */

import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import encRoutes from './routes/enc.js'
import encMetadataRoutes from './routes/encMetadata.js'
import blueTopoRoutes from './routes/bluetopo.js'
import cuspRoutes from './routes/cusp.js'
import gpsRoutes from './routes/gps.js'
import { setGpsUpdateCallback, startGpsService, startGpsWatcher } from './services/gpsService.js'
import { startSimulator, stopSimulator, isSimulatorRunning } from './services/gpsSimulator.js'
import vesselRoutes from './routes/vessel.js'
import { setVesselUpdateCallback, startNmea2000Service } from './services/nmea2000Service.js'
import waypointRoutes from './routes/waypoints.js'
import driftRoutes from './routes/drift.js'
import ncdsRoutes from './routes/ncds.js'
import s57Routes from './routes/s57.js'
import satelliteRoutes from './routes/satellite.js'
import weatherRoutes from './routes/weather.js'
import updateRoutes from './routes/update.js'

const app = express()
const PORT = 3002

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.text())

// Static file serving for PBF font glyphs (MapLibre text rendering)
app.use('/fonts', express.static(path.join(process.cwd(), 'tiles', 'fonts'), {
  maxAge: '30d',
  etag: true
}))

// Static file serving for tiles (BlueTopo, etc.)
// Serves /tiles/bluetopo/{tile_id}/{z}/{x}/{y}.png
app.use('/tiles', express.static(path.join(process.cwd(), 'tiles'), {
  maxAge: '1d', // Cache tiles for 1 day
  etag: true,
  lastModified: true
}))

// Satellite tiles stored separately to avoid interfering with Martin tileserver
// Serves /satellite-tiles/{z}/{x}/{y}.png
app.use('/satellite-tiles', express.static(path.join(process.cwd(), 'satellite-tiles'), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'openhelm-api', port: PORT })
})

// Logging endpoint for frontend
app.post('/api/log', async (req, res) => {
  try {
    const logEntry = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    const logPath = path.join(process.cwd(), 'openhelm.log')
    
    // Append log entry to file
    await fs.appendFile(logPath, logEntry, 'utf8')
    
    res.status(200).send('OK')
  } catch (error) {
    console.error('Failed to write log:', error.message)
    res.status(500).send('Failed to write log')
  }
})

// API routes
app.use('/api/enc', encRoutes)
app.use('/api/enc-metadata', encMetadataRoutes)
app.use('/api/bluetopo', blueTopoRoutes)
app.use('/api/cusp', cuspRoutes)
app.use('/api/gps', gpsRoutes)
app.use('/api/vessel', vesselRoutes)
app.use('/api/waypoints', waypointRoutes)
app.use('/api/drift', driftRoutes)
app.use('/api/ncds', ncdsRoutes)
app.use('/api/s57', s57Routes)
app.use('/api/satellite', satelliteRoutes)
app.use('/api/weather', weatherRoutes)
app.use('/api/update', updateRoutes)

// Static file serving for weather data
app.use('/weather-data', express.static(path.join(process.cwd(), 'weather-data'), {
  maxAge: '1h',
  etag: true,
  lastModified: true
}))

// Exit kiosk mode - kills Chromium, restores desktop, keeps backend running
app.post('/api/system/exit-kiosk', (req, res) => {
  console.log('Exit kiosk mode requested from UI')
  res.json({ status: 'exiting_kiosk' })

  setTimeout(async () => {
    const { exec } = await import('child_process')
    exec('/home/hic/OpenHelm/exit-kiosk.sh', (error, stdout, stderr) => {
      if (error) {
        console.error('exit-kiosk.sh error:', error.message)
      } else {
        console.log('Kiosk exited, desktop restored')
      }
    })
  }, 500)
})

// System shutdown endpoint
app.post('/api/system/shutdown', (req, res) => {
  console.log('🛑 Shutdown requested from UI')
  res.json({ status: 'shutting_down' })

  // Give response time to send, then kill all OpenHelm processes
  setTimeout(async () => {
    const { exec } = await import('child_process')
    // Close Chromium first (handles both binary names)
    exec("pkill -f 'chromium-browser|chromium'", () => {
      // Stop backend via systemd (falls back to pkill if not using systemd)
      exec("sudo systemctl stop openhelm-backend 2>/dev/null || pkill -f 'start-openhelm|martin'", () => {
        // Exit the API server itself
        process.exit(0)
      })
    })
  }, 500)
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err.message)
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  })
})

// Serve SPA from dist/ (eliminates need for vite preview server)
const distPath = path.join(process.cwd(), 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath, {
    maxAge: '1h',
    etag: true,
    lastModified: true
  }))
  console.log(`📦 Serving SPA from ${distPath}`)
}

// Simulator API routes (must be before the API 404 catch-all)
app.post('/api/gps/simulator/start', (req, res) => {
  if (isSimulatorRunning()) {
    return res.json({ status: 'already running' })
  }
  // broadcastSimGps is defined later after WebSocket setup — use a wrapper
  startSimulator((gpsData) => broadcastSimGps(gpsData))
  res.json({ status: 'started' })
})

app.post('/api/gps/simulator/stop', (req, res) => {
  stopSimulator()
  res.json({ status: 'stopped' })
})

app.get('/api/gps/simulator/status', (req, res) => {
  res.json({ running: isSimulatorRunning() })
})

// API 404 for unmatched /api/ routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' })
})

// SPA fallback - serve index.html for all other routes (client-side routing)
app.use('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html')
  if (existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(404).json({ error: 'SPA not built. Run: npm run build' })
  }
})

// Create HTTP server and WebSocket server
const server = createServer(app)
const wss = new WebSocketServer({ server })

// Global progress tracking and WebSocket management
global.progressTrackers = new Map() // jobId -> { progress, status, clients }
global.activeJobs = new Map() // jobId -> { controller, startTime, status }

// GPS WebSocket subscribers
const gpsSubscribers = new Set()

// Vessel WebSocket subscribers
const vesselSubscribers = new Set()

// Set up GPS real-time streaming (throttled to 5 Hz)
let lastGpsBroadcast = 0
setGpsUpdateCallback((gpsData) => {
  if (gpsSubscribers.size === 0) return

  const now = Date.now()
  if (now - lastGpsBroadcast < 200) return  // 5 Hz max
  lastGpsBroadcast = now

  const message = JSON.stringify({
    type: 'gps',
    data: gpsData,
    timestamp: Date.now()
  })

  gpsSubscribers.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(message)
      } catch (error) {
        gpsSubscribers.delete(ws)
      }
    } else {
      gpsSubscribers.delete(ws)
    }
  })
})

// GPS Simulator broadcast — uses the same gpsSubscribers channel
function broadcastSimGps(gpsData) {
  if (gpsSubscribers.size === 0) return
  const message = JSON.stringify({
    type: 'gps',
    data: gpsData,
    timestamp: Date.now()
  })
  gpsSubscribers.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(message) } catch { gpsSubscribers.delete(ws) }
    } else {
      gpsSubscribers.delete(ws)
    }
  })
}

// Set up vessel real-time streaming (throttled to 5 Hz)
let lastVesselBroadcast = 0
setVesselUpdateCallback((vesselData) => {
  if (vesselSubscribers.size === 0) return

  const now = Date.now()
  if (now - lastVesselBroadcast < 200) return  // 5 Hz max
  lastVesselBroadcast = now

  const message = JSON.stringify({
    type: 'vessel',
    data: vesselData,
    timestamp: Date.now()
  })

  vesselSubscribers.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(message)
      } catch (error) {
        vesselSubscribers.delete(ws)
      }
    } else {
      vesselSubscribers.delete(ws)
    }
  })
})

// Auto-start GPS hot-plug watcher on server startup. The watcher will scan
// for the GPS, auto-detect its baud rate, and reconnect if it is unplugged
// and re-inserted on any USB port.
startGpsWatcher()
console.log('🛰️ GPS watcher auto-started (will detect device on any USB port)')

// Auto-start NMEA 2000 service on server startup
startNmea2000Service().then(() => {
  console.log('⚓ NMEA 2000 service auto-started')
}).catch(err => {
  console.log('⚠️ NMEA 2000 service not available:', err.message)
})

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket client connected from:', req.socket.remoteAddress)
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString())

      if (data.type === 'subscribe-gps') {
        // Subscribe client to GPS updates
        gpsSubscribers.add(ws)
        console.log(`🛰️ Client subscribed to GPS stream`)
      } else if (data.type === 'unsubscribe-gps') {
        gpsSubscribers.delete(ws)
        console.log(`🛰️ Client unsubscribed from GPS stream`)
      } else if (data.type === 'subscribe-vessel') {
        vesselSubscribers.add(ws)
        console.log(`⚓ Client subscribed to vessel stream`)
      } else if (data.type === 'unsubscribe-vessel') {
        vesselSubscribers.delete(ws)
        console.log(`⚓ Client unsubscribed from vessel stream`)
      } else if (data.type === 'subscribe' && data.jobId) {
        // Subscribe client to specific job updates
        if (!global.progressTrackers.has(data.jobId)) {
          global.progressTrackers.set(data.jobId, { progress: 0, status: 'waiting', clients: new Set() })
        }

        global.progressTrackers.get(data.jobId).clients.add(ws)
        console.log(`📡 Client subscribed to job: ${data.jobId}`)

        // Send current status immediately
        const tracker = global.progressTrackers.get(data.jobId)
        ws.send(JSON.stringify({
          type: 'progress',
          jobId: data.jobId,
          progress: tracker.progress,
          status: tracker.status,
          timestamp: Date.now()
        }))
      }
    } catch (error) {
      console.error('WebSocket message error:', error.message)
    }
  })
  
  ws.on('close', () => {
    // Remove client from GPS and vessel subscriptions
    gpsSubscribers.delete(ws)
    vesselSubscribers.delete(ws)
    // Remove client from all job subscriptions
    for (const [jobId, tracker] of global.progressTrackers.entries()) {
      tracker.clients.delete(ws)
    }
    console.log('🔌 WebSocket client disconnected')
  })
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message)
  })
})

// Utility function to broadcast progress updates
global.broadcastProgress = (jobId, progress, status, message = '', estimatedTimeLeft = null) => {
  const tracker = global.progressTrackers.get(jobId)
  if (!tracker) return

  tracker.progress = progress
  tracker.status = status

  // Get tiles and summary from active job for detailed metrics
  const job = global.activeJobs?.get(jobId)
  const tiles = job?.tiles || null
  const summary = job?.summary || null

  const update = {
    type: 'progress',
    jobId,
    progress,
    status,
    message,
    estimatedTimeLeft,
    tiles,
    summary,
    timestamp: Date.now()
  }

  // Broadcast to all subscribed clients
  tracker.clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(update))
      } catch (error) {
        console.error('Error sending WebSocket message:', error.message)
        tracker.clients.delete(ws)
      }
    } else {
      tracker.clients.delete(ws)
    }
  })

  console.log(`📡 Broadcasted progress: ${jobId} - ${progress}% - ${status}`)
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚢 OpenHelm API Server running on http://localhost:${PORT}`)
  console.log(`📡 Health check: http://localhost:${PORT}/health`)
  console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 OpenHelm API Server shutting down...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('🛑 OpenHelm API Server shutting down...')
  process.exit(0)
})