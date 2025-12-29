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
              <div className="w-16 h-16 bg-marine-200 dark:bg-marine-800 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl">📍</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">GPS Status</h2>
              <div className="space-y-2">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Status</div>
                  <div className="text-lg text-red-500 font-semibold">No Signal</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Satellites</div>
                  <div className="text-lg text-slate-700 dark:text-slate-300">0/0</div>
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
    <main className="flex-1 bg-slate-50 dark:bg-slate-800">
      {renderContent()}
    </main>
  )
}

export default MainContent