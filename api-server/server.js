#!/usr/bin/env node
/**
 * OpenHelm API Server
 * Handles backend requests to external services like NOAA
 */

import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import encRoutes from './routes/enc.js'
import encMetadataRoutes from './routes/encMetadata.js'
import blueTopoRoutes from './routes/bluetopo.js'

const app = express()
const PORT = 3002

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.text())

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err.message)
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' })
})

// Create HTTP server and WebSocket server
const server = createServer(app)
const wss = new WebSocketServer({ server })

// Global progress tracking and WebSocket management
global.progressTrackers = new Map() // jobId -> { progress, status, clients }
global.activeJobs = new Map() // jobId -> { controller, startTime, status }

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('🔌 WebSocket client connected from:', req.socket.remoteAddress)
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString())
      
      if (data.type === 'subscribe' && data.jobId) {
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
  
  const update = {
    type: 'progress',
    jobId,
    progress,
    status,
    message,
    estimatedTimeLeft,
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