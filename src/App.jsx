import { useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import WelcomeScreen from './components/WelcomeScreen'
import Navbar from './components/Navbar'
import MainContent from './components/MainContent'
import BlueTopoTilesView from './components/BlueTopoTilesView'

function App() {
  const [showWelcome, setShowWelcome] = useState(true)
  const [activeTab, setActiveTab] = useState('chart')
  const navigate = useNavigate()
  const location = useLocation()

  // Update active tab when URL changes
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    navigate('/')
  }

  if (showWelcome) {
    return <WelcomeScreen onDismiss={() => setShowWelcome(false)} />
  }

  return (
    <div className="h-screen w-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col">
      <Routes>
        <Route path="/bluetopo-tiles" element={<BlueTopoTilesView />} />
        <Route path="/" element={
          <>
            <Navbar activeTab={activeTab} onTabChange={handleTabChange} />
            <MainContent activeTab={activeTab} />
          </>
        } />
      </Routes>
    </div>
  )
}

export default App