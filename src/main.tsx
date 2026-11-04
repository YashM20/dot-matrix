import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DisplaySkinProvider } from './components/skins/DisplaySkinProvider'
import { initAnalytics } from './site/analytics'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DisplaySkinProvider><App /></DisplaySkinProvider>
  </StrictMode>,
)
initAnalytics()
