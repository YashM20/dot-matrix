import '../site/clean-address' // first: `//path` → `/path` (#148)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../essay/essay.css'
import '../blog/blog.css'
import { Lab } from './Lab'
import { LAB } from './experiments'
import { RootBoundary } from '../site/RootBoundary'

document.title = LAB.title
createRoot(document.getElementById('lab')!).render(<StrictMode><RootBoundary page="lab"><Lab /></RootBoundary></StrictMode>)
