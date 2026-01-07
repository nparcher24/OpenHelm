import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import MainContent from './components/MainContent'
import BlueTopoTilesView from './components/BlueTopoTilesView'

function App() {
  return (
    <div className="h-screen w-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col">
      <Routes>
        {/* Special routes without navbar */}
        <Route path="/bluetopo-tiles" element={<BlueTopoTilesView />} />
        {/* Redirect old bluetopo-downloader route to settings BlueTopo section */}
        <Route path="/bluetopo-downloader" element={<Navigate to="/settings?section=bluetopo" replace />} />

        {/* Main app routes with navbar */}
        <Route path="/chart" element={
          <>
            <Navbar />
            <MainContent activeTab="chart" />
          </>
        } />
        <Route path="/topo" element={
          <>
            <Navbar />
            <MainContent activeTab="topo" />
          </>
        } />
        <Route path="/gps" element={
          <>
            <Navbar />
            <MainContent activeTab="gps" />
          </>
        } />
        <Route path="/settings" element={
          <>
            <Navbar />
            <MainContent activeTab="settings" />
          </>
        } />

        {/* Default redirect to chart */}
        <Route path="/" element={<Navigate to="/chart" replace />} />
      </Routes>
    </div>
  )
}

export default App