import './site/clean-address' // first: `//path` → `/path` before anything reads the address (#148)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DisplaySkinProvider } from './components/skins/DisplaySkinProvider'
import { RootBoundary } from './site/RootBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary page="app"><DisplaySkinProvider><App /></DisplaySkinProvider></RootBoundary>
  </StrictMode>,
)
