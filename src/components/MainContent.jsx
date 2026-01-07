import ChartView from './ChartView'
import TopoView from './TopoView'
import SettingsView from './SettingsView'

function MainContent({ activeTab }) {
  const renderContent = () => {
    switch (activeTab) {
      case 'chart':
        return <ChartView />
      case 'topo':
        return <TopoView />
      case 'gps':
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-terminal-surface border border-terminal-border rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl text-terminal-green">[GPS]</span>
              </div>
              <h2 className="text-2xl font-bold text-terminal-green text-glow uppercase tracking-wider">GPS Status</h2>
              <div className="space-y-2">
                <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                  <div className="text-sm text-terminal-green-dim uppercase tracking-wide">Status</div>
                  <div className="text-lg text-terminal-red font-semibold">NO SIGNAL</div>
                </div>
                <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
                  <div className="text-sm text-terminal-green-dim uppercase tracking-wide">Satellites</div>
                  <div className="text-lg text-terminal-green font-semibold">0/0</div>
                </div>
              </div>
            </div>
          </div>
        )
      case 'settings':
        return <SettingsView />
      default:
        return null
    }
  }

  return (
    <main className="flex-1 bg-terminal-bg overflow-hidden">
      {renderContent()}
    </main>
  )
}

export default MainContent