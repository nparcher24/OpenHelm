import { useState, useEffect, useCallback } from 'react'
import { Glass, Pill, Badge } from '../../ui/primitives'
import {
  getStatus,
  listNetworks,
  rescan,
  connect,
  disconnect,
  forget,
  getSaved,
} from '../../services/wifiService.js'

/* ---------- Section heading chip (matches DisplaySettings style) ---------- */
function SectionLabel({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{
        fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--fg3)',
      }}>
        {children}
      </div>
      {right}
    </div>
  )
}

/* ---------- Signal-bars glyph (1-4 bars based on signal strength) ---------- */
function SignalBars({ signal }) {
  // nmcli signal is 0-100. Map to 4 bars.
  const bars = signal == null ? 0
    : signal >= 75 ? 4
    : signal >= 50 ? 3
    : signal >= 25 ? 2
    : signal > 0 ? 1
    : 0
  const heights = [6, 10, 14, 18]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          width: 4, height: h, borderRadius: 1,
          background: i < bars ? 'var(--fg1)' : 'var(--fg3)',
          opacity: i < bars ? 1 : 0.35,
        }} />
      ))}
    </div>
  )
}

/* ---------- Lock glyph (SVG, no extra deps) ---------- */
function LockIcon({ open = false }) {
  return open ? (
    <span style={{ color: 'var(--fg3)', fontSize: 14, fontWeight: 600 }}>open</span>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         style={{ color: 'var(--fg2)' }}>
      <path d="M6 10V8a6 6 0 1 1 12 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/* ---------- Status row ---------- */
function StatusCard({ status, busy, onScan, onDisconnect }) {
  const connected = status?.connected
  return (
    <Glass radius={14} style={{ padding: 24, display: 'grid', gap: 16 }}>
      <SectionLabel
        right={
          <div style={{ display: 'flex', gap: 10 }}>
            <Pill size="sm" onClick={onScan} active={false} tone="signal" style={{ minWidth: 0 }}>
              {busy ? 'Scanning…' : 'Rescan'}
            </Pill>
            {connected && (
              <Pill size="sm" onClick={onDisconnect} active={false} tone="signal" style={{ minWidth: 0 }}>
                Disconnect
              </Pill>
            )}
          </div>
        }
      >
        Wifi Status
      </SectionLabel>

      {status == null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge tone="neutral" dot>Loading…</Badge>
          <div style={{ color: 'var(--fg3)', fontSize: 16 }}>
            Reading current connection…
          </div>
        </div>
      ) : connected ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SignalBars signal={status.signal} />
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg1)' }}>
              {status.ssid || status.profile || '(unknown)'}
            </div>
            <Badge tone="safe" dot>Connected</Badge>
            {status.security && status.security !== 'open' && (
              <Badge tone="info">{status.security}</Badge>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 24px', color: 'var(--fg2)', fontSize: 16 }}>
            {status.addresses?.[0] && <div><span style={{ color: 'var(--fg3)' }}>IP </span>{status.addresses[0]}</div>}
            {status.gateway && <div><span style={{ color: 'var(--fg3)' }}>Gateway </span>{status.gateway}</div>}
            {status.signal != null && <div><span style={{ color: 'var(--fg3)' }}>Signal </span>{status.signal}%</div>}
            {status.freqMhz && <div><span style={{ color: 'var(--fg3)' }}>Channel </span>{status.freqMhz} MHz</div>}
            {status.dns?.length > 0 && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--fg3)' }}>DNS </span>{status.dns.join(', ')}</div>}
            {status.mac && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--fg3)' }}>MAC </span>{status.mac}</div>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge tone="warn" dot>{status.state || 'Disconnected'}</Badge>
          <div style={{ color: 'var(--fg2)', fontSize: 16 }}>
            Not currently connected to a network.
          </div>
        </div>
      )}
    </Glass>
  )
}

/* ---------- Network list row ---------- */
function NetworkRow({ network, onClick, busy }) {
  const isOpen = network.security === 'open' || !network.security
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr auto',
        alignItems: 'center', gap: 16,
        padding: '14px 18px', borderRadius: 12,
        background: 'transparent',
        border: '0.5px solid var(--bg-hairline)',
        color: 'var(--fg1)', fontSize: 17, textAlign: 'left',
        cursor: busy ? 'wait' : 'pointer',
        minHeight: 64, touchAction: 'manipulation',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <SignalBars signal={network.signal} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {network.ssid}
        </div>
        {network.inUse && <Badge tone="safe" dot>Active</Badge>}
        {network.saved && !network.inUse && <Badge tone="info">Saved</Badge>}
        {!isOpen && <LockIcon />}
        {isOpen && <LockIcon open />}
      </div>
      <div style={{ color: 'var(--fg3)', fontSize: 14 }}>
        {network.signal}%{network.security && network.security !== 'open' ? ` · ${network.security}` : ''}
      </div>
    </button>
  )
}

/* ---------- Connect dialog (password prompt) ---------- */
function ConnectDialog({ network, onCancel, onConnect, busy, error }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const requiresPassword = network.security !== 'open' && network.security
  const canSubmit = !requiresPassword || password.length >= 8

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 24,
    }} onClick={onCancel}>
      <Glass radius={16}
        style={{ padding: 24, maxWidth: 480, width: '100%', display: 'grid', gap: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>
            Connect
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg1)', display: 'flex', alignItems: 'center', gap: 10 }}>
            {network.ssid}
            {network.security && network.security !== 'open' && (
              <Badge tone="info">{network.security}</Badge>
            )}
          </div>
        </div>

        {requiresPassword && (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--fg3)' }}>Password</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="Network password"
                style={{
                  flex: 1, padding: '14px 16px', fontSize: 18,
                  background: 'var(--bg-chrome)', color: 'var(--fg1)',
                  border: '0.5px solid var(--bg-hairline-strong)', borderRadius: 10,
                  outline: 'none',
                }}
              />
              <Pill size="md" onClick={() => setShow(s => !s)} style={{ minWidth: 0 }}>
                {show ? 'Hide' : 'Show'}
              </Pill>
            </div>
            <span style={{ fontSize: 13, color: 'var(--fg3)' }}>Minimum 8 characters for WPA/WPA2/WPA3.</span>
          </label>
        )}

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(229,72,72,0.10)', border: '0.5px solid rgba(229,72,72,0.30)',
            color: '#E54848', fontSize: 15,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <Pill size="md" onClick={onCancel}>Cancel</Pill>
          <Pill
            size="md"
            tone="signal"
            active={canSubmit && !busy}
            onClick={() => canSubmit && !busy && onConnect(password || undefined)}
            style={{ opacity: canSubmit && !busy ? 1 : 0.5, cursor: canSubmit && !busy ? 'pointer' : 'not-allowed' }}
          >
            {busy ? 'Connecting…' : 'Connect'}
          </Pill>
        </div>
      </Glass>
    </div>
  )
}

/* ---------- Saved networks panel ---------- */
function SavedPanel({ saved, onForget, busyName }) {
  if (saved.length === 0) {
    return (
      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Saved Networks</SectionLabel>
        <div style={{ color: 'var(--fg3)', fontSize: 16 }}>No saved networks.</div>
      </Glass>
    )
  }
  return (
    <Glass radius={14} style={{ padding: 24 }}>
      <SectionLabel>Saved Networks</SectionLabel>
      <div style={{ display: 'grid', gap: 8 }}>
        {saved.map(s => (
          <div key={s.uuid} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderRadius: 10,
            border: '0.5px solid var(--bg-hairline)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--fg1)', fontSize: 17 }}>
                {/* Profile names from netplan get a "netplan-wlp2s0-" prefix; strip it for display */}
                {s.name.replace(/^netplan-wlp2s0-/, '')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--fg3)' }}>{s.name}</div>
            </div>
            <Pill
              size="sm"
              onClick={() => onForget(s)}
              style={{ minWidth: 0, opacity: busyName === s.name ? 0.5 : 1 }}
            >
              {busyName === s.name ? '…' : 'Forget'}
            </Pill>
          </div>
        ))}
      </div>
    </Glass>
  )
}

/* ============================
   MAIN COMPONENT
   ============================ */
export function WifiSettings() {
  const [status, setStatus] = useState(null)
  const [networks, setNetworks] = useState([])
  const [saved, setSaved] = useState([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // { network, busy, error }
  const [forgetBusy, setForgetBusy] = useState(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await getStatus()
      setStatus(s)
      // A successful read means the api is back; clear any stale error banner.
      setError(null)
      return s
    } catch (e) {
      setError(e.message)
      return null
    }
  }, [])

  const loadSaved = useCallback(async () => {
    try { setSaved(await getSaved()) } catch {}
  }, [])

  // Initial load + polling. While we still don't have a status reading, retry
  // every 1.5s (covers transient api-down windows from a kiosk restart). Once
  // we have a status, poll at 5s for normal refreshes.
  useEffect(() => {
    let cancelled = false
    let timer = null

    const tick = async () => {
      if (cancelled) return
      const s = await loadStatus()
      if (cancelled) return
      timer = setTimeout(tick, s == null ? 1500 : 5000)
    }

    tick()
    listNetworks({ scan: false }).then(setNetworks).catch(e => setError(e.message))
    loadSaved()
    handleScan()

    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleScan() {
    setScanning(true)
    setError(null)
    try {
      const list = await rescan()
      setNetworks(list)
      await loadStatus()
    } catch (e) {
      setError(e.message)
    } finally {
      setScanning(false)
    }
  }

  async function handleNetworkClick(net) {
    if (net.inUse) return // already connected
    if (net.saved || net.security === 'open' || !net.security) {
      // Try connecting directly; nmcli will use saved creds or skip secrets for open APs.
      setScanning(true)
      try {
        await connect(net.ssid)
        await loadStatus()
        await handleScan()
      } catch (e) {
        // Fall back to password prompt if NM says secrets are required
        setDialog({ network: net, busy: false, error: e.message })
      } finally {
        setScanning(false)
      }
    } else {
      setDialog({ network: net, busy: false, error: null })
    }
  }

  async function handleConnectSubmit(password) {
    setDialog(d => ({ ...d, busy: true, error: null }))
    try {
      await connect(dialog.network.ssid, password)
      setDialog(null)
      await loadStatus()
      await loadSaved()
      await handleScan()
    } catch (e) {
      setDialog(d => ({ ...d, busy: false, error: e.message }))
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect()
      await loadStatus()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleForget(profile) {
    setForgetBusy(profile.name)
    try {
      // Resolve SSID via the api: the route's :ssid param expects an SSID, but
      // we only have the profile name here. Strip the netplan- prefix, then
      // treat the remainder as the SSID. For non-netplan profiles, use the name.
      const ssid = profile.name.replace(/^netplan-wlp2s0-/, '')
      await forget(ssid)
      await loadSaved()
      await handleScan()
    } catch (e) {
      setError(e.message)
    } finally {
      setForgetBusy(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && (
        <Glass radius={14} style={{
          padding: '14px 18px',
          background: 'rgba(229,72,72,0.10)',
          border: '0.5px solid rgba(229,72,72,0.30)',
        }}>
          <div style={{ color: '#E54848', fontSize: 15 }}>{error}</div>
        </Glass>
      )}

      <StatusCard
        status={status}
        busy={scanning}
        onScan={handleScan}
        onDisconnect={handleDisconnect}
      />

      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel
          right={<div style={{ fontSize: 14, color: 'var(--fg3)' }}>{networks.length} visible</div>}
        >
          Available Networks
        </SectionLabel>

        {networks.length === 0 && !scanning && (
          <div style={{ color: 'var(--fg3)', fontSize: 16, padding: 12 }}>
            No networks found. Tap Rescan above.
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {networks.map(n => (
            <NetworkRow
              key={n.bssid || n.ssid}
              network={n}
              busy={scanning && !n.inUse}
              onClick={() => handleNetworkClick(n)}
            />
          ))}
        </div>
      </Glass>

      <SavedPanel saved={saved} onForget={handleForget} busyName={forgetBusy} />

      {dialog && (
        <ConnectDialog
          network={dialog.network}
          busy={dialog.busy}
          error={dialog.error}
          onCancel={() => setDialog(null)}
          onConnect={handleConnectSubmit}
        />
      )}
    </div>
  )
}
