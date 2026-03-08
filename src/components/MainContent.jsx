import { useState } from 'react'
import ChartView from './ChartView'
import SettingsView from './SettingsView'
import GpsView from './GpsView'
import VesselView from './VesselView'

function MainContent({ activeTab }) {
  // Track which tabs have been visited so we mount them lazily but keep them alive
  const [mountedTabs] = useState(() => new Set())
  mountedTabs.add(activeTab)

  return (
    <main className="flex-1 bg-terminal-bg overflow-hidden relative">
      {/* ChartView stays mounted once visited — preserves MapLibre map + loaded GeoJSON */}
      <div className={`absolute inset-0 ${activeTab === 'chart' ? '' : 'invisible pointer-events-none'}`}>
        {mountedTabs.has('chart') && <ChartView />}
      </div>

      {/* Other tabs mount/unmount normally */}
      {activeTab === 'gps' && <GpsView />}
      {activeTab === 'vessel' && <VesselView />}
      {activeTab === 'settings' && <SettingsView />}
    </main>
  )
}

export default MainContent