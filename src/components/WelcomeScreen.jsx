import { useState, useEffect } from 'react'

function WelcomeScreen({ onDismiss }) {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const dismissTimer = setTimeout(() => {
      onDismiss()
    }, 3000)
    
    return () => clearTimeout(dismissTimer)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-50 h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-marine-50 dark:from-marine-900 dark:via-slate-900 dark:to-marine-800 animate-fade-in">
      <div className="text-center space-y-8 px-8">
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <img 
              src="/assets/logo.png" 
              alt="Parritec Logo" 
              className="w-32 h-32 object-contain"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
            <div>
              <h1 className="text-6xl font-bold text-slate-900 dark:text-white tracking-wider">
                OpenHelm
              </h1>
              <p className="text-xl text-slate-700 dark:text-marine-200 mt-2">
                Marine Navigation System
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-black/20 backdrop-blur-sm rounded-2xl p-6 border border-slate-300/50 dark:border-marine-500/30 min-w-[300px] shadow-lg">
          <div className="text-2xl font-mono text-slate-800 dark:text-marine-100 mb-2">
            {currentTime.toLocaleTimeString()}
          </div>
          <div className="text-base text-slate-600 dark:text-marine-300">
            {currentTime.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeScreen