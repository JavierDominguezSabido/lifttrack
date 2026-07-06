import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { WorkoutProvider } from './context/WorkoutProvider'
import './index.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WorkoutProvider>
        <App />
      </WorkoutProvider>
    </BrowserRouter>
  </StrictMode>
)
