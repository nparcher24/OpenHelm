import { useState, useEffect, useRef } from 'react'

const WS_URL = 'ws://localhost:3002'
const API_BASE = 'http://localhost:3002'

export default function useVesselData() {
  const [vesselData, setVesselData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dataAge, setDataAge] = useState(null)
  const wsRef = useRef(null)
  const ageIntervalRef = useRef(null)

  // Update data age every second
  useEffect(() => {
    ageIntervalRef.current = setInterval(() => {
      if (vesselData?.timestamp) {
        setDataAge(Date.now() - vesselData.timestamp)
      }
    }, 1000)
    return () => clearInterval(ageIntervalRef.current)
  }, [vesselData?.timestamp])

  useEffect(() => {
    let mounted = true
    let reconnectTimeout = null

    const connect = () => {
      if (!mounted) return

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) return
        ws.send(JSON.stringify({ type: 'subscribe-vessel' }))
      }

      ws.onmessage = (event) => {
        if (!mounted) return
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'vessel') {
            setVesselData(message.data)
            setError(message.data.error || null)
            setLoading(false)
          }
        } catch (err) {
          // Ignore parse errors
        }
      }

      ws.onerror = () => {}

      ws.onclose = () => {
        if (!mounted) return
        reconnectTimeout = setTimeout(connect, 1000)
      }
    }

    // Fetch initial data via HTTP
    fetch(`${API_BASE}/api/vessel`)
      .then(res => res.json())
      .then(data => {
        if (!mounted) return
        setVesselData(data)
        setError(data.error || null)
        setLoading(false)
      })
      .catch(err => {
        if (!mounted) return
        setError(err.message)
        setLoading(false)
      })

    connect()

    return () => {
      mounted = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  return { vesselData, error, loading, dataAge }
}
