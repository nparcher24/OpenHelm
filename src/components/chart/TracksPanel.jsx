import { useMemo } from 'react'
import { Glass, Toggle } from '../../ui/primitives'

function fmtDistance(m) {
  if (m == null || !isFinite(m)) return '—'
  const nm = m / 1852
  if (nm >= 0.1) return `${nm.toFixed(1)} nm`
  return `${Math.round(m)} m`
}

function fmtDuration(ms) {
  if (ms == null || !isFinite(ms) || ms <= 0) return '—'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtDate(epochMs) {
  if (!epochMs) return ''
  return new Date(epochMs).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isoDateLocal(epochMs) {
  const d = new Date(epochMs)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

function epochFromIsoDate(isoDate, endOfDay = false) {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const date = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0)
  return date.getTime()
}

const Row = ({ children, last }) => (
  <div style={{
    padding: '18px 22px',
    borderBottom: last ? 'none' : '0.5px solid var(--bg-hairline)',
  }}>{children}</div>
)

const SectionHeader = ({ children }) => (
  <div style={{
    padding: '18px 22px 8px',
    fontSize: 16, fontWeight: 600, letterSpacing: 0.6,
    color: 'var(--fg3)', textTransform: 'uppercase',
  }}>{children}</div>
)

function ModeRadio({ value, current, label, onSelect }) {
  const active = value === current
  return (
    <button onClick={() => onSelect(value)} style={{
      display: 'flex', alignItems: 'center', gap: 14, width: '100%',
      padding: '14px 22px', minHeight: 56,
      background: active ? 'var(--fill-1)' : 'transparent',
      border: 0, color: 'var(--fg1)', fontSize: 20, cursor: 'pointer',
      textAlign: 'left',
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: 999,
        border: '2px solid var(--fg3)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {active && <span style={{
          width: 14, height: 14, borderRadius: 999, background: 'var(--signal)',
        }}/>}
      </span>
      {label}
    </button>
  )
}

export function TracksPanel({
  open,
  visible, onVisibleChange,
  mode, onModeChange,
  dateFrom, dateTo, onDateChange,
  trips, selectedTripIds, onSelectedTripsChange,
  colorMode, onColorModeChange,
  recording, currentTrip, onEndTrip,
}) {
  if (!open) return null

  const tripStats = useMemo(() => {
    if (!currentTrip) return null
    const startedAt = currentTrip.started_at
    const endedAt = currentTrip.ended_at
    const now = Date.now()
    return {
      durationMs: (endedAt ?? now) - startedAt,
      distanceM: currentTrip.distance_m,
      pointCount: currentTrip.point_count,
      label: `Trip #${currentTrip.id}`,
    }
  }, [currentTrip])

  const fromIso = dateFrom != null ? isoDateLocal(dateFrom) : ''
  const toIso = dateTo != null ? isoDateLocal(dateTo) : ''

  return (
    <Glass radius={18} style={{
      position: 'absolute', top: 96, right: 0, width: 480, zIndex: 1000,
      maxHeight: 'calc(100vh - 130px)', overflowY: 'auto',
      background: 'var(--bg-elev)',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      animation: 'oh-slide 220ms var(--ease-out)',
    }}>
      <div style={{
        padding: '18px 22px 14px', borderBottom: '0.5px solid var(--bg-hairline)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 22, fontWeight: 600 }}>Tracks</span>
      </div>

      <Row>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, fontSize: 20, color: 'var(--fg1)' }}>Show on chart</div>
          <Toggle on={!!visible} onChange={onVisibleChange}/>
        </div>
      </Row>

      <SectionHeader>View</SectionHeader>
      <div style={{ borderBottom: '0.5px solid var(--bg-hairline)' }}>
        <ModeRadio value="current" current={mode} onSelect={onModeChange} label="Current trip only"/>
        <ModeRadio value="date"    current={mode} onSelect={onModeChange} label="By date"/>
        {mode === 'date' && (
          <div style={{ padding: '10px 22px 18px', display: 'grid', gridTemplateColumns: '70px 1fr', rowGap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 18, color: 'var(--fg3)' }}>From</span>
            <input type="date" value={fromIso}
                   onChange={(e) => onDateChange?.({ from: epochFromIsoDate(e.target.value, false), to: dateTo })}
                   style={{
                     minHeight: 56, padding: '12px 14px', fontSize: 20,
                     borderRadius: 10, border: '0.5px solid var(--bg-hairline-strong)',
                     background: 'var(--fill-0)', color: 'var(--fg1)',
                   }}/>
            <span style={{ fontSize: 18, color: 'var(--fg3)' }}>To</span>
            <input type="date" value={toIso}
                   onChange={(e) => onDateChange?.({ from: dateFrom, to: epochFromIsoDate(e.target.value, true) })}
                   style={{
                     minHeight: 56, padding: '12px 14px', fontSize: 20,
                     borderRadius: 10, border: '0.5px solid var(--bg-hairline-strong)',
                     background: 'var(--fill-0)', color: 'var(--fg1)',
                   }}/>
          </div>
        )}
        <ModeRadio value="trip" current={mode} onSelect={onModeChange} label="Pick trips"/>
        {mode === 'trip' && (
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0 12px' }}>
            {trips.length === 0 && (
              <div style={{ padding: '12px 22px', fontSize: 18, color: 'var(--fg3)' }}>No trips recorded yet.</div>
            )}
            {trips.map((t) => {
              const checked = selectedTripIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    const next = checked
                      ? selectedTripIds.filter((id) => id !== t.id)
                      : [...selectedTripIds, t.id]
                    onSelectedTripsChange?.(next)
                  }}
                  style={{
                    width: '100%', minHeight: 56, padding: '12px 22px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: checked ? 'var(--fill-1)' : 'transparent',
                    border: 0, color: 'var(--fg1)', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 6,
                    border: '2px solid var(--fg3)',
                    background: checked ? 'var(--signal)' : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, color: '#fff', fontSize: 18, fontWeight: 700,
                  }}>{checked ? '✓' : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20 }}>{fmtDate(t.started_at)}</div>
                    <div style={{ fontSize: 16, color: 'var(--fg3)' }}>
                      {fmtDistance(t.distance_m)} · {t.point_count} pts{t.ended_at == null ? ' · live' : ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <SectionHeader>Color</SectionHeader>
      <Row>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => onColorModeChange?.('solid')} style={{
            flex: 1, minHeight: 56, padding: '12px 16px', borderRadius: 10,
            background: colorMode === 'solid' ? 'var(--fill-1)' : 'transparent',
            border: '0.5px solid var(--bg-hairline-strong)',
            color: 'var(--fg1)', fontSize: 20, cursor: 'pointer',
          }}>Solid</button>
          <button onClick={() => onColorModeChange?.('speed')} style={{
            flex: 1, minHeight: 56, padding: '12px 16px', borderRadius: 10,
            background: colorMode === 'speed' ? 'var(--fill-1)' : 'transparent',
            border: '0.5px solid var(--bg-hairline-strong)',
            color: 'var(--fg1)', fontSize: 20, cursor: 'pointer',
          }}>By speed</button>
        </div>
      </Row>

      <SectionHeader>Recording</SectionHeader>
      <Row last>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20, color: 'var(--fg1)' }}>
            <span style={{
              width: 14, height: 14, borderRadius: 999,
              background: recording && currentTrip ? 'var(--signal)' : 'var(--fg3)',
            }}/>
            {recording && currentTrip
              ? `${tripStats.label}`
              : recording ? 'Waiting for fix…' : 'Recorder offline'}
          </div>
          {tripStats && (
            <div style={{ fontSize: 17, color: 'var(--fg3)' }}>
              {fmtDistance(tripStats.distanceM)} · {fmtDuration(tripStats.durationMs)} · {tripStats.pointCount} pts
            </div>
          )}
          {tripStats && (
            <button
              onClick={onEndTrip}
              style={{
                marginTop: 8, minHeight: 56, padding: '14px 16px',
                background: 'var(--fill-1)', border: '0.5px solid var(--bg-hairline-strong)',
                borderRadius: 10, color: 'var(--fg1)', fontSize: 20, cursor: 'pointer',
              }}
            >End trip</button>
          )}
          <div style={{ marginTop: 10, fontSize: 16, color: 'var(--fg3)' }}>
            Tracks are stored only on this device.
          </div>
        </div>
      </Row>
    </Glass>
  )
}
