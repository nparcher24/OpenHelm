import { ChartIcon, TopoIcon, GPSIcon, SettingsIcon } from './Icons'

function Navbar({ activeTab, onTabChange }) {
  const navItems = [
    { id: 'chart', label: 'Chart', icon: ChartIcon },
    { id: 'topo', label: 'Topo', icon: TopoIcon },
    { id: 'gps', label: 'GPS', icon: GPSIcon },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ]

  return (
    <nav className="bg-white dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-700 shadow-lg">
      <div className="flex h-16">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 flex flex-col items-center justify-center space-y-1 transition-colors touch-manipulation min-h-[64px] ${
              activeTab === id
                ? 'bg-marine-100 dark:bg-marine-900 text-marine-700 dark:text-marine-300 border-b-2 border-marine-600'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Icon className="w-6 h-6" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export default Navbar