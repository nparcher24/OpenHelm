import { useState, useEffect } from 'react'
import { API_BASE } from '../utils/apiConfig.js'
import { useSearchParams } from 'react-router-dom'
import BlueTopoDownloader from './BlueTopoDownloader'
import CuspDownloader from './CuspDownloader'
import ENCDownloader from './ENCDownloader'
import S57Downloader from './S57Downloader'
import WaypointManager from './WaypointManager'
import SatelliteDownloader from './SatelliteDownloader'
import WeatherDownloader from './WeatherDownloader'
import ErrorBoundary from './ErrorBoundary'
import UpdateManager from './UpdateManager'
import { version as appVersion } from '../../package.json'
import { DisplaySettings } from './settings/DisplaySettings.jsx'
import { TopBar, Glass, Pill, Toggle, Badge } from '../ui/primitives'

/* ---------- Section label chip ---------- */
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

/* ---------- Styled select ---------- */
function StyledSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        background: 'var(--bg-chrome)', color: 'var(--fg1)',
        border: '0.5px solid var(--bg-hairline-strong)', borderRadius: 10,
        padding: '12px 16px', fontSize: 18, fontWeight: 500, outline: 'none',
        cursor: 'pointer', minHeight: 56,
      }}
    >
      {children}
    </select>
  )
}

/* ---------- Danger button ---------- */
function DangerBtn({ onClick, children, tone = 'warn' }) {
  const colors = tone === 'caution'
    ? { bg: 'rgba(232,185,58,0.12)', border: 'rgba(232,185,58,0.35)', fg: '#E8B93A', hover: 'rgba(232,185,58,0.22)' }
    : { bg: 'rgba(229,72,72,0.12)', border: 'rgba(229,72,72,0.35)', fg: '#E54848', hover: 'rgba(229,72,72,0.22)' }
  return (
    <button
      onClick={onClick}
      style={{
        padding: '16px 28px', borderRadius: 12, border: `0.5px solid ${colors.border}`,
        background: colors.bg, color: colors.fg, fontSize: 18, fontWeight: 600,
        cursor: 'pointer', minHeight: 56, touchAction: 'manipulation',
      }}
      onMouseEnter={e => e.currentTarget.style.background = colors.hover}
      onMouseLeave={e => e.currentTarget.style.background = colors.bg}
    >
      {children}
    </button>
  )
}

/* ---------- Cancel button ---------- */
function CancelBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '16px 28px', borderRadius: 12,
        border: '0.5px solid var(--bg-hairline-strong)',
        background: 'transparent', color: 'var(--fg2)', fontSize: 18, fontWeight: 600,
        cursor: 'pointer', minHeight: 56, touchAction: 'manipulation',
      }}
    >
      Cancel
    </button>
  )
}

/* ============================
   SECTION RENDERERS
   ============================ */

function GeneralSection() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Application</SectionLabel>
        <div style={{ fontSize: 17, color: 'var(--fg2)', lineHeight: 1.7, fontFamily: 'var(--font-mono, monospace)' }}>
          <div>Version: {appVersion}</div>
          <div>Build: 2024-12-28</div>
        </div>
      </Glass>
      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Units</SectionLabel>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, color: 'var(--fg1)', fontWeight: 500 }}>Distance</span>
            <StyledSelect>
              <option>Nautical Miles</option>
              <option>Kilometers</option>
              <option>Miles</option>
            </StyledSelect>
          </div>
          <div style={{ height: 0.5, background: 'var(--bg-hairline)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, color: 'var(--fg1)', fontWeight: 500 }}>Speed</span>
            <StyledSelect>
              <option>Knots</option>
              <option>km/h</option>
              <option>mph</option>
            </StyledSelect>
          </div>
        </div>
      </Glass>
    </div>
  )
}

function GPSSection() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Connection Status</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Badge tone="alarm" dot>NOT CONNECTED</Badge>
        </div>
        <div style={{ fontSize: 17, color: 'var(--fg3)' }}>No GPS receiver detected</div>
      </Glass>
      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Receiver Settings</SectionLabel>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, color: 'var(--fg1)', fontWeight: 500 }}>Port</span>
            <StyledSelect>
              <option>/dev/ttyUSB0</option>
              <option>/dev/ttyUSB1</option>
              <option>/dev/ttyACM0</option>
              <option>Auto-detect</option>
            </StyledSelect>
          </div>
          <div style={{ height: 0.5, background: 'var(--bg-hairline)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, color: 'var(--fg1)', fontWeight: 500 }}>Baud Rate</span>
            <StyledSelect>
              <option>4800</option>
              <option>9600</option>
              <option>38400</option>
            </StyledSelect>
          </div>
        </div>
      </Glass>
    </div>
  )
}

function SystemSection({ simRunning, simLoading, toggleSimulator, showExitKioskConfirm, setShowExitKioskConfirm,
                         handleExitKiosk, showQuitConfirm, setShowQuitConfirm, handleQuit }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Hardware</SectionLabel>
        <div style={{ fontSize: 17, color: 'var(--fg2)', lineHeight: 1.7, fontFamily: 'var(--font-mono, monospace)' }}>
          <div>Platform: Raspberry Pi 5</div>
          <div>Memory: 8GB RAM</div>
          <div>Storage: 64GB microSD</div>
        </div>
      </Glass>

      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Software</SectionLabel>
        <div style={{ fontSize: 17, color: 'var(--fg2)', lineHeight: 1.7, fontFamily: 'var(--font-mono, monospace)' }}>
          <div>OpenHelm: v{appVersion}</div>
          <div>Martin Tiles: v0.18.1</div>
          <div>OS: Raspberry Pi OS</div>
        </div>
      </Glass>

      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>GPS Signal Source</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontSize: 17, color: 'var(--fg2)' }}>
            {simRunning
              ? <Badge tone="caution">Simulator Active — looping N→E→S→W offshore VA Beach</Badge>
              : <Badge tone="safe">Hardware GPS (USB Serial)</Badge>}
          </div>
          <Pill
            onClick={toggleSimulator}
            active={simRunning}
            tone={simRunning ? 'beacon' : 'neutral'}
            style={{ minWidth: 140, opacity: simLoading ? 0.5 : 1, pointerEvents: simLoading ? 'none' : 'auto' }}
          >
            {simLoading ? '...' : simRunning ? 'Stop Simulator' : 'Start Simulator'}
          </Pill>
        </div>
      </Glass>

      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Kiosk Mode</SectionLabel>
        {showExitKioskConfirm ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 17, color: 'var(--fg2)' }}>
              Exit fullscreen? OpenHelm services will keep running. You can relaunch from the desktop.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <DangerBtn tone="caution" onClick={handleExitKiosk}>Confirm Exit</DangerBtn>
              <CancelBtn onClick={() => setShowExitKioskConfirm(false)} />
            </div>
          </div>
        ) : (
          <DangerBtn tone="caution" onClick={() => setShowExitKioskConfirm(true)}>Exit to Desktop</DangerBtn>
        )}
      </Glass>

      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Application</SectionLabel>
        {showQuitConfirm ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 17, color: 'var(--fg2)' }}>
              Are you sure you want to quit OpenHelm? All services will be stopped.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <DangerBtn tone="warn" onClick={handleQuit}>Confirm Quit</DangerBtn>
              <CancelBtn onClick={() => setShowQuitConfirm(false)} />
            </div>
          </div>
        ) : (
          <DangerBtn tone="warn" onClick={() => setShowQuitConfirm(true)}>Quit OpenHelm</DangerBtn>
        )}
      </Glass>
    </div>
  )
}

/* ============================
   MAIN COMPONENT
   ============================ */

function SettingsView() {
  const [searchParams] = useSearchParams()

  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [showExitKioskConfirm, setShowExitKioskConfirm] = useState(false)
  const [simRunning, setSimRunning] = useState(false)
  const [simLoading, setSimLoading] = useState(false)

  // Load last active section from localStorage or URL params, default to 'general'
  const [activeSection, setActiveSection] = useState(() => {
    const urlSection = searchParams.get('section')
    if (urlSection) return urlSection
    return localStorage.getItem('settingsActiveSection') || 'general'
  })

  // Check for URL section parameter on mount and when URL changes
  useEffect(() => {
    const urlSection = searchParams.get('section')
    if (urlSection) {
      setActiveSection(urlSection)
    }
  }, [searchParams])

  // Save active section to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('settingsActiveSection', activeSection)
    setShowQuitConfirm(false)
    setShowExitKioskConfirm(false)
  }, [activeSection])

  // Check GPS simulator status on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/gps/simulator/status`)
      .then(r => r.json())
      .then(d => setSimRunning(d.running))
      .catch(() => {})
  }, [])

  const toggleSimulator = async () => {
    setSimLoading(true)
    try {
      const endpoint = simRunning ? 'stop' : 'start'
      const res = await fetch(`${API_BASE}/api/gps/simulator/${endpoint}`, { method: 'POST' })
      if (res.ok) setSimRunning(!simRunning)
    } catch (err) {
      console.error('Simulator toggle failed:', err)
    }
    setSimLoading(false)
  }

  const handleExitKiosk = async () => {
    try {
      await fetch(`${API_BASE}/api/system/exit-kiosk`, { method: 'POST' })
    } catch {
      // Expected - Chromium closes before response completes
    }
  }

  const handleQuit = async () => {
    try {
      await fetch(`${API_BASE}/api/system/shutdown`, { method: 'POST' })
    } catch {
      // Expected - server shuts down before response completes
    }
  }

  const sections = [
    { id: 'general',   label: 'General' },
    { id: 'display',   label: 'Display' },
    { id: 'waypoints', label: 'Waypoints' },
    { id: 's57',       label: 'Vector Charts' },
    { id: 'enc',       label: 'Raster Charts' },
    { id: 'bluetopo',  label: 'BlueTopo' },
    { id: 'satellite', label: 'Satellite' },
    { id: 'weather',   label: 'Weather' },
    { id: 'cusp',      label: 'Coastline' },
    { id: 'gps',       label: 'GPS / AHRS' },
    { id: 'update',    label: 'Updates' },
    { id: 'system',    label: 'System' },
  ]

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSection />

      case 'display':
        return <DisplaySettings />

      case 'gps':
        return <GPSSection />

      case 'waypoints':
        return (
          <ErrorBoundary>
            <WaypointManager />
          </ErrorBoundary>
        )

      case 's57':
        return (
          <ErrorBoundary>
            <S57Downloader />
          </ErrorBoundary>
        )

      case 'enc':
        return (
          <ErrorBoundary>
            <ENCDownloader />
          </ErrorBoundary>
        )

      case 'bluetopo':
        return (
          <ErrorBoundary>
            <BlueTopoDownloader />
          </ErrorBoundary>
        )

      case 'satellite':
        return (
          <ErrorBoundary>
            <SatelliteDownloader />
          </ErrorBoundary>
        )

      case 'weather':
        return (
          <ErrorBoundary>
            <WeatherDownloader />
          </ErrorBoundary>
        )

      case 'cusp':
        return (
          <ErrorBoundary>
            <CuspDownloader />
          </ErrorBoundary>
        )

      case 'update':
        return (
          <ErrorBoundary>
            <UpdateManager />
          </ErrorBoundary>
        )

      case 'system':
        return (
          <SystemSection
            simRunning={simRunning}
            simLoading={simLoading}
            toggleSimulator={toggleSimulator}
            showExitKioskConfirm={showExitKioskConfirm}
            setShowExitKioskConfirm={setShowExitKioskConfirm}
            handleExitKiosk={handleExitKiosk}
            showQuitConfirm={showQuitConfirm}
            setShowQuitConfirm={setShowQuitConfirm}
            handleQuit={handleQuit}
          />
        )

      default:
        return null
    }
  }

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative', background: 'var(--bg)', color: 'var(--fg1)' }}>
      <TopBar title="Settings" />
      <div style={{
        position: 'absolute', inset: '114px 0 0 0',
        display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24,
        padding: 24, overflow: 'hidden',
      }}>
        {/* Left nav rail */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '16px 18px', borderRadius: 12, textAlign: 'left',
                background: activeSection === s.id ? 'var(--fill-1)' : 'transparent',
                color: activeSection === s.id ? 'var(--fg1)' : 'var(--fg2)',
                fontSize: 18, fontWeight: activeSection === s.id ? 600 : 500,
                border: 0, cursor: 'pointer', transition: 'all 150ms',
                minHeight: 56,
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Right content pane */}
        <main style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {renderSection()}
        </main>
      </div>
    </div>
  )
}

export default SettingsView
