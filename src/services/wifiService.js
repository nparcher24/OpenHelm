import { API_BASE } from '../utils/apiConfig.js'

async function jsonOrThrow(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

export async function getStatus() {
  const res = await fetch(`${API_BASE}/api/wifi/status`)
  return jsonOrThrow(res)
}

export async function listNetworks({ scan = true } = {}) {
  const url = `${API_BASE}/api/wifi/networks${scan ? '' : '?scan=false'}`
  const data = await jsonOrThrow(await fetch(url))
  return data.networks || []
}

export async function rescan() {
  const data = await jsonOrThrow(await fetch(`${API_BASE}/api/wifi/scan`, { method: 'POST' }))
  return data.networks || []
}

export async function connect(ssid, password) {
  const body = password ? { ssid, password } : { ssid }
  const res = await fetch(`${API_BASE}/api/wifi/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function disconnect() {
  const res = await fetch(`${API_BASE}/api/wifi/disconnect`, { method: 'POST' })
  return jsonOrThrow(res)
}

export async function getSaved() {
  const data = await jsonOrThrow(await fetch(`${API_BASE}/api/wifi/saved`))
  return data.saved || []
}

export async function forget(ssid) {
  const res = await fetch(`${API_BASE}/api/wifi/saved/${encodeURIComponent(ssid)}`, {
    method: 'DELETE',
  })
  return jsonOrThrow(res)
}
