import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChartManager from './ChartManager'
import BlueTopoDownloader from './BlueTopoDownloader'
import CuspDownloader from './CuspDownloader'
import ErrorBoundary from './ErrorBoundary'

function SettingsView() {
  const [searchParams] = useSearchParams()

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
  }, [activeSection])

  const sections = [
    { id: 'general', name: 'General', icon: '[>]' },
    { id: 'charts', name: 'Chart Manager', icon: '[M]' },
    { id: 'bluetopo', name: 'BlueTopo', icon: '[~]' },
    { id: 'cusp', name: 'Coastline', icon: '[/]' },
    { id: 'gps', name: 'GPS/AHRS', icon: '[*]' },
    { id: 'display', name: 'Display', icon: '[#]' },
    { id: 'system', name: 'System', icon: '[S]' }
  ]

  const renderContent = () => {
    switch (activeSection) {
      case 'charts':
        return (
          <ErrorBoundary>
            <ChartManager />
          </ErrorBoundary>
        )

      case 'bluetopo':
        return (
          <ErrorBoundary>
            <BlueTopoDownloader />
          </ErrorBoundary>
        )

      case 'cusp':
        return (
          <ErrorBoundary>
            <CuspDownloader />
          </ErrorBoundary>
        )

      case 'general':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-terminal-green text-glow mb-6 uppercase tracking-wider">General Settings</h2>
            <div className="space-y-6">
              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Application</h3>
                <div className="text-sm text-terminal-green-dim">Version: 1.0.0</div>
                <div className="text-sm text-terminal-green-dim">Build: 2024-12-28</div>
              </div>

              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Units</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-terminal-green">Distance</span>
                    <select className="bg-terminal-bg border border-terminal-border rounded px-3 py-1 text-terminal-green focus:border-terminal-green focus:shadow-glow-green-sm outline-none">
                      <option>Nautical Miles</option>
                      <option>Kilometers</option>
                      <option>Miles</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-terminal-green">Speed</span>
                    <select className="bg-terminal-bg border border-terminal-border rounded px-3 py-1 text-terminal-green focus:border-terminal-green focus:shadow-glow-green-sm outline-none">
                      <option>Knots</option>
                      <option>km/h</option>
                      <option>mph</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'gps':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-terminal-green text-glow mb-6 uppercase tracking-wider">GPS/AHRS Settings</h2>
            <div className="space-y-4">
              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Connection Status</h3>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-3 h-3 bg-terminal-red rounded-full shadow-glow-red"></div>
                  <span className="text-terminal-red">NOT CONNECTED</span>
                </div>
                <div className="text-sm text-terminal-green-dim">No GPS receiver detected</div>
              </div>

              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Receiver Settings</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-terminal-green">Port</span>
                    <select className="bg-terminal-bg border border-terminal-border rounded px-3 py-1 text-terminal-green focus:border-terminal-green focus:shadow-glow-green-sm outline-none">
                      <option>/dev/ttyUSB0</option>
                      <option>/dev/ttyUSB1</option>
                      <option>/dev/ttyACM0</option>
                      <option>Auto-detect</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-terminal-green">Baud Rate</span>
                    <select className="bg-terminal-bg border border-terminal-border rounded px-3 py-1 text-terminal-green focus:border-terminal-green focus:shadow-glow-green-sm outline-none">
                      <option>4800</option>
                      <option>9600</option>
                      <option>38400</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'display':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-terminal-green text-glow mb-6 uppercase tracking-wider">Display Settings</h2>
            <div className="space-y-4">
              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Theme</h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="radio" name="theme" value="auto" defaultChecked className="accent-terminal-green" />
                    <span className="text-terminal-green">Auto (follows system)</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="radio" name="theme" value="light" className="accent-terminal-green" />
                    <span className="text-terminal-green">Light</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input type="radio" name="theme" value="dark" className="accent-terminal-green" />
                    <span className="text-terminal-green">Dark</span>
                  </label>
                </div>
              </div>

              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Brightness</h3>
                <input
                  type="range"
                  min="10"
                  max="100"
                  defaultValue="80"
                  className="w-full h-2 bg-terminal-border rounded-lg appearance-none cursor-pointer accent-terminal-green"
                />
              </div>
            </div>
          </div>
        )

      case 'system':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-terminal-green text-glow mb-6 uppercase tracking-wider">System Information</h2>
            <div className="space-y-4">
              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Hardware</h3>
                <div className="space-y-1 text-sm text-terminal-green-dim font-mono">
                  <div>Platform: Raspberry Pi 5</div>
                  <div>Memory: 8GB RAM</div>
                  <div>Storage: 64GB microSD</div>
                </div>
              </div>

              <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                <h3 className="font-semibold text-terminal-green mb-2 uppercase tracking-wide">Software</h3>
                <div className="space-y-1 text-sm text-terminal-green-dim font-mono">
                  <div>OpenHelm: v1.0.0</div>
                  <div>Martin Tiles: v0.18.1</div>
                  <div>OS: Raspberry Pi OS</div>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-terminal-green text-glow uppercase tracking-wider">Settings</h2>
            <p className="text-terminal-green-dim">Select a section from the sidebar</p>
          </div>
        )
    }
  }

  return (
    <div className="h-full flex bg-terminal-bg overflow-hidden">
      {/* Settings Sidebar */}
      <div className="w-64 bg-terminal-surface border-r border-terminal-border flex-shrink-0 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-terminal-green text-glow mb-4 uppercase tracking-wider">Settings</h2>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-all touch-manipulation ${
                  activeSection === section.id
                    ? 'bg-terminal-green/10 text-terminal-green shadow-glow-green-sm border border-terminal-green/30'
                    : 'text-terminal-green-dim hover:bg-terminal-green/5 hover:text-terminal-green border border-transparent'
                }`}
              >
                <span className="text-sm font-mono">{section.icon}</span>
                <span className="font-medium">{section.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Settings Content */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain'
        }}
      >
        {renderContent()}
      </div>
    </div>
  )
}

export default SettingsView