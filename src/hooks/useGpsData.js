import { useState, useEffect, useRef } from 'react'

const WS_URL = 'ws://localhost:3002'
const API_BASE = 'http://localhost:3002'

function isValidCoordinate(lat, lon) {
  return lat != null && lon != null &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
}

export default function useGpsData() {
  const [gpsData, setGpsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const wsRef = useRef(null)

  useEffect(() => {
    let mounted = true
    let reconnectTimeout = null

    const connect = () => {
      if (!mounted) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) return
        ws.send(JSON.stringify({ type: 'subscribe-gps' }))
      }

      ws.onmessage = (event) => {
        if (!mounted) return
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'gps' && isValidCoordinate(message.data.latitude, message.data.longitude)) {
            setGpsData(prev => {
              if (prev?.latitude === message.data.latitude &&
                  prev?.longitude === message.data.longitude &&
                  prev?.heading === message.data.heading) {
                return prev
              }
              return message.data
            })
            setLoading(false)
          }
        } catch (err) {
          // Parse error, ignore
        }
      }

      ws.onclose = () => {
        if (!mounted) return
        reconnectTimeout = setTimeout(connect, 1000)
      }

      ws.onerror = () => {}
    }

    // Fetch initial data via HTTP
    fetch(`${API_BASE}/api/gps`)
      .then(res => res.json())
      .then(data => {
        if (mounted && isValidCoordinate(data.latitude, data.longitude)) {
          setGpsData(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })

    connect()

    return () => {
      mounted = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  return { gpsData, loading }
}
