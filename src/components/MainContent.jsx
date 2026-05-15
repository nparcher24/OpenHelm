import { useState } from 'react'
import ChartView from './ChartView'
import SettingsView from './SettingsView'
import GpsView from './GpsView'
import VesselView from './VesselView'

function MainContent({ activeTab }) {
  const [mountedTabs] = useState(() => new Set())
  mountedTabs.add(activeTab)
  return (
    <main className="flex-1 overflow-hidden relative" style={{ background: 'var(--bg)' }}>
      <div className={`absolute inset-0 ${activeTab === 'chart' ? '' : 'invisible pointer-events-none'}`}>
        {mountedTabs.has('chart') && <ChartView />}
      </div>
      {activeTab === 'gps' && <GpsView />}
      {activeTab === 'vessel' && <VesselView />}
      {activeTab === 'settings' && <SettingsView />}
    </main>
  )
}

export default MainContent
