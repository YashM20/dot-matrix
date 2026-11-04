import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../essay/essay.css'
import '../blog/blog.css'
import { Lab } from './Lab'
import { LAB } from './experiments'
import { initAnalytics } from '../site/analytics'

document.title = LAB.title
createRoot(document.getElementById('lab')!).render(<StrictMode><Lab /></StrictMode>)
initAnalytics()
