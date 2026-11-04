import '../site/clean-address' // first: `//path` → `/path` (#148)
import '../lib/trusted' // the Trusted Types policies (#149), before any worker starts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../essay/essay.css'
import '../blog/blog.css'
import { Lab } from './Lab'
import { LAB } from './experiments'
import { initAnalytics } from '../site/analytics'
import { RootBoundary } from '../site/RootBoundary'
import { flag } from '../site/flags'
import { replace } from '../site/safe-url'

document.title = LAB.title
// the lab is behind its flag (src/site/flags.ts): off, a visit goes home (`?flags=lab` brings it back)
if (!flag('lab')) replace('/')
else {
  createRoot(document.getElementById('lab')!).render(<StrictMode><RootBoundary page="lab"><Lab /></RootBoundary></StrictMode>)
  initAnalytics()
}
