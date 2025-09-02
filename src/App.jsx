import { useState } from 'react'
import WelcomeScreen from './components/WelcomeScreen'
import Navbar from './components/Navbar'
import MainContent from './components/MainContent'

function App() {
  const [showWelcome, setShowWelcome] = useState(true)
  const [activeTab, setActiveTab] = useState('chart')

  if (showWelcome) {
    return <WelcomeScreen onDismiss={() => setShowWelcome(false)} />
  }

  return (
    <div className="h-screen w-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      <MainContent activeTab={activeTab} />
    </div>
  )
}

export default App