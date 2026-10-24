import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DisplaySkinProvider } from './components/skins/DisplaySkinProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DisplaySkinProvider><App /></DisplaySkinProvider>
  </StrictMode>,
)
