import { useNavigate, useLocation } from 'react-router-dom'
import { ChartIcon, GPSIcon, SettingsIcon } from './Icons'

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { id: 'chart', label: 'Chart', icon: ChartIcon, path: '/chart' },
    { id: 'gps', label: 'GPS', icon: GPSIcon, path: '/gps' },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings' }
  ]

  // Determine active tab from current location
  const activeTab = navItems.find(item => location.pathname === item.path)?.id || 'chart'

  return (
    <nav className="bg-terminal-surface border-b border-terminal-border">
      <div className="flex h-16">
        {navItems.map(({ id, label, icon: Icon, path }) => (
          <button
            key={id}
            onClick={() => navigate(path)}
            className={`flex-1 flex flex-col items-center justify-center space-y-1 transition-all touch-manipulation min-h-[64px] ${
              activeTab === id
                ? 'bg-terminal-green/10 text-terminal-green border-b-2 border-terminal-green shadow-glow-green-sm text-glow'
                : 'text-terminal-green-dim hover:bg-terminal-green/5 hover:text-terminal-green'
            }`}
          >
            <Icon className="w-6 h-6" />
            <span className="text-sm font-medium tracking-wider uppercase">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export default Navbar