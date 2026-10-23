import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './essay.css'
import { Essay } from './Essay'

createRoot(document.getElementById('essay')!).render(<StrictMode><Essay /></StrictMode>)
