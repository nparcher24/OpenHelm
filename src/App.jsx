import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import MainContent from './components/MainContent'
import BlueTopoTilesView from './components/BlueTopoTilesView'

const MAIN_TABS = new Set(['chart', 'gps', 'vessel', 'settings'])

function App() {
  const location = useLocation()

  // Prevent context menu globally
  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    return false
  }

  // Check if current route is a special (non-tabbed) page
  const path = location.pathname
  const isSpecialRoute = path === '/bluetopo-tiles'

  // Derive active tab from URL
  const activeTab = path.replace('/', '') || 'chart'
  const resolvedTab = MAIN_TABS.has(activeTab) ? activeTab : 'chart'

  return (
    <div
      className="h-screen w-screen bg-terminal-bg text-terminal-green font-mono flex flex-col"
      onContextMenu={handleContextMenu}
    >
      {isSpecialRoute ? (
        <Routes>
          <Route path="/bluetopo-tiles" element={<BlueTopoTilesView />} />
        </Routes>
      ) : (
        <>
          <Navbar />
          <MainContent activeTab={resolvedTab} />
          {/* Handle redirect for bare / path */}
          <Routes>
            <Route path="/" element={<Navigate to="/chart" replace />} />
            <Route path="*" element={null} />
          </Routes>
        </>
      )}
    </div>
  )
}

export default App