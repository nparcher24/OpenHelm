import ChartView from './ChartView'
import TopoView from './TopoView'
import SettingsView from './SettingsView'
import GpsView from './GpsView'

function MainContent({ activeTab }) {
  const renderContent = () => {
    switch (activeTab) {
      case 'chart':
        return <ChartView />
      case 'topo':
        return <TopoView />
      case 'gps':
        return <GpsView />
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