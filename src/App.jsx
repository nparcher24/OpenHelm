import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import MainContent from './components/MainContent'
import BlueTopoTilesView from './components/BlueTopoTilesView'
import BlueTopoDownloader from './components/BlueTopoDownloader'

function App() {
  return (
    <div className="h-screen w-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col">
      <Routes>
        {/* Special routes without navbar */}
        <Route path="/bluetopo-tiles" element={<BlueTopoTilesView />} />
        <Route path="/bluetopo-downloader" element={<BlueTopoDownloader />} />

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