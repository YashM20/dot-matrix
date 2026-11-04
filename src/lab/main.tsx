import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../essay/essay.css'
import '../blog/blog.css'
import { Lab } from './Lab'
import { LAB } from './experiments'
import { flag } from '../site/flags'

document.title = LAB.title
// the lab is behind its flag (src/site/flags.ts): off, a visit goes home (`?flags=lab` brings it back)
if (!flag('lab')) location.replace('/')
else createRoot(document.getElementById('lab')!).render(<StrictMode><Lab /></StrictMode>)
