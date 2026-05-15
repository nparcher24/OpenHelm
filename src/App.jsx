import { Routes, Route, Navigate } from 'react-router-dom'
import MainContent from './components/MainContent'
import BlueTopoTilesView from './components/BlueTopoTilesView'
import SatelliteRegionSelector from './components/SatelliteRegionSelector'
import WeatherRegionSelector from './components/WeatherRegionSelector'

function App() {
  const handleContextMenu = (e) => {
    e.preventDefault(); e.stopPropagation(); return false
  }

  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--fg1)', fontFamily: 'var(--font-ui)' }}
      onContextMenu={handleContextMenu}
    >
      <Routes>
        <Route path="/bluetopo-tiles"   element={<BlueTopoTilesView />} />
        <Route path="/satellite-region" element={<SatelliteRegionSelector />} />
        <Route path="/weather-region"   element={<WeatherRegionSelector />} />
        <Route path="/chart"    element={<MainContent activeTab="chart" />} />
        <Route path="/gps"      element={<MainContent activeTab="gps" />} />
        <Route path="/vessel"   element={<MainContent activeTab="vessel" />} />
        <Route path="/settings" element={<MainContent activeTab="settings" />} />
        <Route path="/"         element={<Navigate to="/chart" replace />} />
        <Route path="*"         element={<Navigate to="/chart" replace />} />
      </Routes>
    </div>
  )
}

export default App
