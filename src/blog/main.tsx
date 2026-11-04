import '../site/clean-address' // first: `//path` → `/path` (#148)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../essay/essay.css'
import './blog.css'
import { Blog } from './Blog'
import { ESSAY_SLUG, isEssayAlias, postPath } from './posts'
import { RootBoundary } from '../site/RootBoundary'
import { replaceUrl } from '../site/safe-url'

// the essay's old addresses (`/essay`, `/essay/`, `/essay.html`) show its post under its canonical URL; Vercel
// redirects them before this runs, a dev or preview server serves this page for them (vite.config.ts)
if (isEssayAlias(location.pathname)) replaceUrl(postPath(ESSAY_SLUG) + location.search + location.hash, null)

createRoot(document.getElementById('blog')!).render(<StrictMode><RootBoundary page="blog"><Blog /></RootBoundary></StrictMode>)
