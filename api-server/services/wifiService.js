/**
 * WiFi management service.
 *
 * Wraps `nmcli` (NetworkManager CLI) to expose status, scan, connect,
 * disconnect, and forget operations to the OpenHelm UI. The api-server runs
 * as user `hic`; nmcli is invoked via passwordless `sudo -n` per
 * /etc/sudoers.d/openhelm-nmcli. The wifi adapter is named `wlp2s0` (see
 * /etc/netplan and /etc/NetworkManager/conf.d/openhelm-wifi-managed.conf).
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const WIFI_IFACE = 'wlp2s0'
const NMCLI = '/usr/bin/nmcli'

// nmcli -t escapes ":" as "\:" inside fields. This unescapes a single field.
function unescapeField(s) {
  return s == null ? '' : s.replace(/\\:/g, ':').replace(/\\\\/g, '\\')
}

// Split a -t (terse) line into fields, honoring nmcli's `\:` and `\\` escaping.
function splitTerseLine(line) {
  const fields = []
  let cur = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '\\' && i + 1 < line.length) {
      cur += line[i + 1]
      i++
    } else if (c === ':') {
      fields.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  fields.push(cur)
  return fields
}

async function runNmcli(args, { timeoutMs = 30000 } = {}) {
  // sudo -n: never prompt; fail fast if sudoers rule isn't in place.
  const { stdout, stderr } = await execFileAsync(
    'sudo',
    ['-n', NMCLI, ...args],
    { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }
  )
  return { stdout, stderr }
}

/**
 * Parse the output of `nmcli -t -f IN-USE,BSSID,SSID,MODE,CHAN,FREQ,RATE,SIGNAL,SECURITY device wifi list`.
 * Exported for tests.
 */
export function parseWifiList(stdout) {
  const lines = stdout.split('\n').filter(l => l.length > 0)
  const networks = []
  for (const line of lines) {
    const fields = splitTerseLine(line)
    if (fields.length < 9) continue
    const [inUse, bssid, ssid, mode, chan, freq, rate, signal, security] = fields
    networks.push({
      inUse: inUse === '*',
      bssid: bssid || null,
      ssid: ssid || null, // null for hidden networks
      mode,
      channel: chan ? parseInt(chan, 10) : null,
      freqMhz: freq ? parseInt(freq, 10) : null,
      rate: rate || null,
      signal: signal ? parseInt(signal, 10) : 0,
      security: security || 'open',
    })
  }
  return networks
}

/**
 * Collapse multiple BSSIDs (rows) for the same SSID into a single network
 * entry, keeping the strongest signal. Hidden networks (null SSID) are dropped.
 * Exported for tests.
 */
export function dedupeNetworks(networks) {
  const bySsid = new Map()
  for (const n of networks) {
    if (!n.ssid) continue
    const existing = bySsid.get(n.ssid)
    const inUse = (existing?.inUse ?? false) || n.inUse
    if (!existing || n.signal > existing.signal) {
      bySsid.set(n.ssid, { ...n, inUse })
    } else if (inUse !== existing.inUse) {
      bySsid.set(n.ssid, { ...existing, inUse })
    }
  }
  return Array.from(bySsid.values()).sort((a, b) => b.signal - a.signal)
}

/**
 * Parse `nmcli -t -f NAME,TYPE,AUTOCONNECT,UUID connection show`.
 * Returns only wifi connections. Exported for tests.
 */
export function parseSavedConnections(stdout) {
  const lines = stdout.split('\n').filter(l => l.length > 0)
  const out = []
  for (const line of lines) {
    const fields = splitTerseLine(line)
    if (fields.length < 4) continue
    const [name, type, autoconnect, uuid] = fields
    if (type !== '802-11-wireless') continue
    out.push({ name, uuid, autoconnect: autoconnect === 'yes' })
  }
  return out
}

/**
 * Parse `nmcli -t -f GENERAL.CONNECTION,GENERAL.STATE,IP4.ADDRESS,IP4.GATEWAY,
 * IP4.DNS,GENERAL.HWADDR device show wlp2s0`. Exported for tests.
 */
export function parseDeviceShow(stdout) {
  const out = {
    connection: null,
    state: null,
    stateCode: null,
    addresses: [],
    gateway: null,
    dns: [],
    mac: null,
  }
  const lines = stdout.split('\n')
  for (const line of lines) {
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx)
    const val = unescapeField(line.slice(idx + 1))
    if (key === 'GENERAL.CONNECTION') {
      out.connection = val === '--' ? null : val
    } else if (key === 'GENERAL.STATE') {
      // Format: "100 (connected)"
      const m = val.match(/^(\d+)\s*\((.+)\)$/)
      if (m) {
        out.stateCode = parseInt(m[1], 10)
        out.state = m[2]
      } else {
        out.state = val
      }
    } else if (key.startsWith('IP4.ADDRESS')) {
      out.addresses.push(val)
    } else if (key === 'IP4.GATEWAY') {
      out.gateway = val === '--' ? null : val
    } else if (key.startsWith('IP4.DNS')) {
      out.dns.push(val)
    } else if (key === 'GENERAL.HWADDR') {
      out.mac = val
    }
  }
  return out
}

/**
 * For a connection NAME (nmcli profile), look up the configured SSID.
 * Returns null if not a wifi profile. Exported for tests.
 */
export function parseSsidFromConnection(stdout) {
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx)
    const val = unescapeField(line.slice(idx + 1))
    if (key === '802-11-wireless.ssid') return val || null
  }
  return null
}

// ---------- High-level API ----------

export async function getStatus() {
  const { stdout } = await runNmcli([
    '-t',
    '-f', 'GENERAL.CONNECTION,GENERAL.STATE,IP4.ADDRESS,IP4.GATEWAY,IP4.DNS,GENERAL.HWADDR',
    'device', 'show', WIFI_IFACE,
  ])
  const dev = parseDeviceShow(stdout)

  // Resolve current SSID + signal/security via the live wifi list (the IN-USE row).
  let activeNetwork = null
  try {
    const { stdout: listOut } = await runNmcli([
      '-t',
      '-f', 'IN-USE,BSSID,SSID,MODE,CHAN,FREQ,RATE,SIGNAL,SECURITY',
      'device', 'wifi', 'list', 'ifname', WIFI_IFACE,
    ])
    const all = parseWifiList(listOut)
    activeNetwork = all.find(n => n.inUse) || null
  } catch {
    // Listing can fail if rfkill is on or the device is reconfiguring; status
    // should still return something useful from device show alone.
  }

  return {
    interface: WIFI_IFACE,
    connected: dev.stateCode === 100,
    state: dev.state,
    stateCode: dev.stateCode,
    profile: dev.connection,
    ssid: activeNetwork?.ssid ?? null,
    signal: activeNetwork?.signal ?? null,
    security: activeNetwork?.security ?? null,
    freqMhz: activeNetwork?.freqMhz ?? null,
    rate: activeNetwork?.rate ?? null,
    bssid: activeNetwork?.bssid ?? null,
    addresses: dev.addresses,
    gateway: dev.gateway,
    dns: dev.dns,
    mac: dev.mac,
  }
}

/**
 * Trigger a fresh scan, then return the deduped list of visible networks.
 * `force` waits for the rescan to complete before listing; default true.
 */
export async function scanAndList({ force = true } = {}) {
  if (force) {
    try {
      await runNmcli(['device', 'wifi', 'rescan', 'ifname', WIFI_IFACE], { timeoutMs: 20000 })
    } catch (err) {
      // nmcli throws if a rescan was requested too recently. That's not fatal —
      // we just skip the rescan and return the cached list.
      const msg = String(err.stderr || err.message || '')
      if (!/Scanning not allowed/i.test(msg) && !/immediately after/i.test(msg)) {
        throw err
      }
    }
  }
  const { stdout } = await runNmcli([
    '-t',
    '-f', 'IN-USE,BSSID,SSID,MODE,CHAN,FREQ,RATE,SIGNAL,SECURITY',
    'device', 'wifi', 'list', 'ifname', WIFI_IFACE,
  ])

  const all = parseWifiList(stdout)
  const visible = dedupeNetworks(all)

  // Cross-reference saved connections so the UI can render a "saved" badge.
  const saved = await getSaved()
  const savedSsids = new Set()
  for (const s of saved) {
    const ssid = await getConnectionSsid(s.name).catch(() => null)
    if (ssid) savedSsids.add(ssid)
  }

  return visible.map(n => ({ ...n, saved: savedSsids.has(n.ssid) }))
}

export async function getSaved() {
  const { stdout } = await runNmcli([
    '-t',
    '-f', 'NAME,TYPE,AUTOCONNECT,UUID',
    'connection', 'show',
  ])
  return parseSavedConnections(stdout)
}

async function getConnectionSsid(connectionName) {
  const { stdout } = await runNmcli([
    '-t',
    '-f', '802-11-wireless.ssid',
    'connection', 'show', connectionName,
  ])
  return parseSsidFromConnection(stdout)
}

/**
 * Connect to an SSID. If `password` is provided, it's used (and stored in
 * the new NM profile). If a saved connection for the SSID already exists,
 * nmcli will reuse it when password is omitted.
 */
export async function connect({ ssid, password }) {
  if (!ssid || typeof ssid !== 'string') {
    throw new Error('ssid is required')
  }
  const args = ['device', 'wifi', 'connect', ssid, 'ifname', WIFI_IFACE]
  if (password) args.push('password', password)
  const { stdout, stderr } = await runNmcli(args, { timeoutMs: 60000 })
  return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() }
}

export async function disconnect() {
  const { stdout, stderr } = await runNmcli(['device', 'disconnect', WIFI_IFACE], { timeoutMs: 20000 })
  return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() }
}

/**
 * Forget a saved network by SSID. Looks up the matching wifi profile(s) and
 * deletes them. Returns the list of profile names removed.
 */
export async function forget({ ssid }) {
  if (!ssid) throw new Error('ssid is required')
  const saved = await getSaved()
  const removed = []
  for (const s of saved) {
    const profileSsid = await getConnectionSsid(s.name).catch(() => null)
    if (profileSsid === ssid) {
      await runNmcli(['connection', 'delete', s.name])
      removed.push(s.name)
    }
  }
  if (removed.length === 0) {
    throw new Error(`No saved connection found for SSID: ${ssid}`)
  }
  return { ok: true, removed }
}
