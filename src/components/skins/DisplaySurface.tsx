/**
 * The C7 display stage around one card surface (DotCanvas wraps its canvas / SVG in this, nothing else).
 * Skin `oled` = `display: contents` and no overlay: the card is exactly as before, and the stage code
 * (`SkinOverlay` + `src/engine/display`) is not even loaded. The first other skin lazy-loads the overlay,
 * which mounts next to the card inside this same wrapper, so the card surface itself never remounts.
 */
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { useDisplaySkin } from './store'
import type { SkinSurfaceProps } from './SkinOverlay'

const SkinOverlay = lazy(() => import('./SkinOverlay').then(m => ({ default: m.SkinOverlay })))

export interface DisplaySurfaceProps extends SkinSurfaceProps { children: ReactNode }

export function DisplaySurface({ children, ...props }: DisplaySurfaceProps) {
  const skin = useDisplaySkin()
  const wrapRef = useRef<HTMLDivElement>(null)
  // once a skin was used the overlay stays mounted, so switching back to OLED can play its wipe-off
  const [used, setUsed] = useState(skin !== 'oled')
  if (skin !== 'oled' && !used) setUsed(true)
  return (
    <div ref={wrapRef} className="skin-surface" data-skin="oled">
      {children}
      {used && <Suspense fallback={null}><SkinOverlay wrapRef={wrapRef} {...props} /></Suspense>}
    </div>
  )
}
