#!/usr/bin/env node
/**
 * OpenHelm API Server
 * Handles backend requests to external services like NOAA
 */

import express from 'express'
import cors from 'cors'
import encRoutes from './routes/enc.js'
import encMetadataRoutes from './routes/encMetadata.js'

const app = express()
const PORT = 3002

// Middleware
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'openhelm-api', port: PORT })
})

// API routes
app.use('/api/enc', encRoutes)
app.use('/api/enc-metadata', encMetadataRoutes)

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚢 OpenHelm API Server running on http://localhost:${PORT}`)
  console.log(`📡 Health check: http://localhost:${PORT}/health`)
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