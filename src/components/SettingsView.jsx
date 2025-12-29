import { useState } from 'react'
import ChartManager from './ChartManager'
import ErrorBoundary from './ErrorBoundary'

function SettingsView() {
  const [activeSection, setActiveSection] = useState('general')

  const sections = [
    { id: 'general', name: 'General', icon: '⚙️' },
    { id: 'charts', name: 'Chart Manager', icon: '🗺️' },
    { id: 'gps', name: 'GPS/AHRS', icon: '📍' },
    { id: 'display', name: 'Display', icon: '🖥️' },
    { id: 'system', name: 'System', icon: '💾' }
  ]

  const renderContent = () => {
    switch (activeSection) {
      case 'charts':
        return (
          <ErrorBoundary>
            <ChartManager />
          </ErrorBoundary>
        )
      
      case 'general':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">General Settings</h2>
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Application</h3>
                <div className="text-sm text-slate-600 dark:text-slate-300">Version: 1.0.0</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Build: 2024-12-28</div>
              </div>
              
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Units</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">Distance</span>
                    <select className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-1 text-slate-800 dark:text-slate-100">
                      <option>Nautical Miles</option>
                      <option>Kilometers</option>
                      <option>Miles</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">Speed</span>
                    <select className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-1 text-slate-800 dark:text-slate-100">
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
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">GPS/AHRS Settings</h2>
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Connection Status</h3>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-slate-700 dark:text-slate-200">Not Connected</span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">No GPS receiver detected</div>
              </div>
              
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Receiver Settings</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">Port</span>
                    <select className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-1 text-slate-800 dark:text-slate-100">
                      <option>/dev/ttyUSB0</option>
                      <option>/dev/ttyUSB1</option>
                      <option>/dev/ttyACM0</option>
                      <option>Auto-detect</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">Baud Rate</span>
                    <select className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-1 text-slate-800 dark:text-slate-100">
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
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Display Settings</h2>
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Theme</h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3">
                    <input type="radio" name="theme" value="auto" defaultChecked className="text-marine-600" />
                    <span className="text-slate-700 dark:text-slate-200">Auto (follows system)</span>
                  </label>
                  <label className="flex items-center space-x-3">
                    <input type="radio" name="theme" value="light" className="text-marine-600" />
                    <span className="text-slate-700 dark:text-slate-200">Light</span>
                  </label>
                  <label className="flex items-center space-x-3">
                    <input type="radio" name="theme" value="dark" className="text-marine-600" />
                    <span className="text-slate-700 dark:text-slate-200">Dark</span>
                  </label>
                </div>
              </div>
              
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Brightness</h3>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  defaultValue="80" 
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                />
              </div>
            </div>
          </div>
        )

      case 'system':
        return (
          <div className="p-6">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">System Information</h2>
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Hardware</h3>
                <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <div>Platform: Raspberry Pi 5</div>
                  <div>Memory: 8GB RAM</div>
                  <div>Storage: 64GB microSD</div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Software</h3>
                <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
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
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Settings</h2>
            <p className="text-slate-600 dark:text-slate-300">Select a section from the sidebar</p>
          </div>
        )
    }
  }

  return (
    <div className="h-full flex bg-slate-50 dark:bg-slate-800">
      {/* Settings Sidebar */}
      <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Settings</h2>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors touch-manipulation ${
                  activeSection === section.id
                    ? 'bg-marine-100 dark:bg-marine-900 text-marine-700 dark:text-marine-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-lg">{section.icon}</span>
                <span className="font-medium">{section.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  )
}

export default SettingsView