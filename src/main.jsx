import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Globally prevent context menu on all touch/right-click events
document.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  e.stopPropagation()
  return false
}, { capture: true })

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)