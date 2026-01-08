/**
 * Custom hook for tracking job progress with WebSocket and polling fallback
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { logInfo, logError, logWarn } from '../utils/logger.js'
import { getJobStatus as getENCJobStatus } from '../services/encCatalogueService.js'

export function useJobProgress(jobId, enabled = true, customStatusFetcher = null) {
  // Use custom status fetcher if provided, otherwise use default ENC fetcher
  const getJobStatus = customStatusFetcher || getENCJobStatus
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('waiting')
  const [message, setMessage] = useState('')
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [tiles, setTiles] = useState(null)
  
  const wsRef = useRef(null)
  const pollingRef = useRef(null)
  const componentId = useRef(Date.now().toString(36) + Math.random().toString(36).substr(2))
  
  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!jobId || !enabled) return
    
    try {
      logInfo(`[JobProgress] [${componentId.current}] Connecting to WebSocket for job: ${jobId}`)
      
      const wsUrl = 'ws://localhost:3002'
      const ws = new WebSocket(wsUrl)
      
      ws.onopen = () => {
        logInfo(`[JobProgress] [${componentId.current}] WebSocket connected`)
        setConnected(true)
        setError(null)
        
        // Subscribe to job updates
        ws.send(JSON.stringify({
          type: 'subscribe',
          jobId: jobId
        }))
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'progress' && data.jobId === jobId) {
            logInfo(`[JobProgress] [${componentId.current}] Progress update: ${data.progress}% - ${data.status}`)

            setProgress(data.progress)
            setStatus(data.status)
            setMessage(data.message || '')
            setEstimatedTimeLeft(data.estimatedTimeLeft || null)

            // Update tiles array for detailed metrics
            if (data.tiles) {
              setTiles(data.tiles)
            }

            // Update summary if provided
            if (data.summary) {
              // Summary contains completedTiles, failedTiles, etc.
            }

            // If job is completed, try to get final result
            if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
              logInfo(`[JobProgress] [${componentId.current}] Job ${data.status}, fetching final result...`)
              getJobStatus(jobId).then(statusResult => {
                if (statusResult.result) {
                  setResult(statusResult.result)
                }
                if (statusResult.tiles) {
                  setTiles(statusResult.tiles)
                }
              }).catch(err => {
                logError(`[JobProgress] [${componentId.current}] Error fetching final result:`, err)
              })
            }
          }
        } catch (error) {
          logError(`[JobProgress] [${componentId.current}] Error parsing WebSocket message:`, error)
        }
      }
      
      ws.onclose = (event) => {
        logWarn(`[JobProgress] [${componentId.current}] WebSocket closed (code: ${event.code})`)
        setConnected(false)
        
        // Try to reconnect after delay if not explicitly closed
        if (event.code !== 1000 && enabled) {
          setTimeout(() => {
            if (enabled && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
              logInfo(`[JobProgress] [${componentId.current}] Attempting WebSocket reconnection...`)
              connectWebSocket()
            }
          }, 3000)
        }
      }
      
      ws.onerror = (error) => {
        logError(`[JobProgress] [${componentId.current}] WebSocket error:`, error)
        setError('WebSocket connection failed')
      }
      
      wsRef.current = ws
      
    } catch (error) {
      logError(`[JobProgress] [${componentId.current}] Failed to create WebSocket:`, error)
      setError('Failed to connect to progress updates')
    }
  }, [jobId, enabled])
  
  // Polling fallback
  const startPolling = useCallback(() => {
    if (!jobId || !enabled) return
    
    const poll = async () => {
      try {
        const statusResult = await getJobStatus(jobId)
        
        setProgress(statusResult.progress || 0)
        setStatus(statusResult.status)
        setMessage(statusResult.message || '')

        if (statusResult.result) {
          setResult(statusResult.result)
        }

        if (statusResult.tiles) {
          setTiles(statusResult.tiles)
        }
        
        // Stop polling if job is done
        if (['completed', 'failed', 'cancelled'].includes(statusResult.status)) {
          logInfo(`[JobProgress] [${componentId.current}] Job ${statusResult.status}, stopping polling`)
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
        }
        
      } catch (error) {
        logError(`[JobProgress] [${componentId.current}] Polling error:`, error)
        setError(error.message)
      }
    }
    
    // Initial poll
    poll()
    
    // Set up interval
    pollingRef.current = setInterval(poll, 2000) // Poll every 2 seconds
    logInfo(`[JobProgress] [${componentId.current}] Started polling for job: ${jobId}`)
  }, [jobId, enabled])
  
  // Initialize connection
  useEffect(() => {
    if (!jobId || !enabled) {
      return
    }
    
    // Try WebSocket first
    connectWebSocket()
    
    // Start polling as fallback after short delay
    const fallbackTimer = setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        logWarn(`[JobProgress] [${componentId.current}] WebSocket not connected, falling back to polling`)
        startPolling()
      }
    }, 1000)
    
    return () => {
      clearTimeout(fallbackTimer)
      
      // Cleanup WebSocket
      if (wsRef.current) {
        wsRef.current.close(1000) // Normal closure
        wsRef.current = null
      }
      
      // Cleanup polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      
      logInfo(`[JobProgress] [${componentId.current}] Cleaned up progress tracking`)
    }
  }, [jobId, enabled])
  
  return {
    progress,
    status,
    message,
    estimatedTimeLeft,
    result,
    error,
    connected,
    tiles,
    isComplete: ['completed', 'failed', 'cancelled'].includes(status),
    isActive: ['running', 'processing', 'downloading', 'parsing', 'cleaning', 'finalizing'].includes(status),
    isError: status === 'failed',
    isCancelled: status === 'cancelled'
  }
}