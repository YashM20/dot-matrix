import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../essay/essay.css'
import './blog.css'
import { Blog } from './Blog'
import { ESSAY_SLUG, isEssayAlias, postPath } from './posts'
import { initAnalytics } from '../site/analytics'

// the essay's old addresses (`/essay`, `/essay/`, `/essay.html`) show its post under its canonical URL; Vercel
// redirects them before this runs, a dev or preview server serves this page for them (vite.config.ts)
if (isEssayAlias(location.pathname)) history.replaceState(null, '', postPath(ESSAY_SLUG) + location.search + location.hash)

createRoot(document.getElementById('blog')!).render(<StrictMode><Blog /></StrictMode>)
initAnalytics()
