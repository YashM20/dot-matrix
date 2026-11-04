import '../site/clean-address' // first: `//path` → `/path` (#148)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../essay/essay.css'
import '../blog/blog.css'
import { Lab } from './Lab'
import { LAB } from './experiments'
import { RootBoundary } from '../site/RootBoundary'
import { flag } from '../site/flags'
import { replace } from '../site/safe-url'

document.title = LAB.title
// the lab is behind its flag (src/site/flags.ts): off, a visit goes home (`?flags=lab` brings it back)
if (!flag('lab')) replace('/')
else createRoot(document.getElementById('lab')!).render(<StrictMode><RootBoundary page="lab"><Lab /></RootBoundary></StrictMode>)
