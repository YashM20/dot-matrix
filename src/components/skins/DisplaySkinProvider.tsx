import { useEffect, type ReactNode } from 'react'
import { SKIN_NAMES } from '../../engine/display/skins'
import { setSkin, useDisplaySkin } from './store'

/**
 * Global display skin (C7). Mirrors the current skin on `<html data-skin>` and `.skin-<name>` (page-level
 * CSS hooks), follows `?skin=` on back/forward, and exposes `window.dot480.setSkin` for consoles and
 * tooling. Cards read the skin themselves (`DisplaySurface`), so this never re-renders a board.
 */
export function DisplaySkinProvider({ children }: { children?: ReactNode }) {
  const skin = useDisplaySkin()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.skin = skin
    for (const s of SKIN_NAMES) root.classList.toggle(`skin-${s}`, s === skin)
  }, [skin])
  useEffect(() => {
    const onPop = () => setSkin(new URLSearchParams(window.location.search).get('skin') ?? 'oled')
    window.addEventListener('popstate', onPop)
    const w = window as unknown as { dot480?: Record<string, unknown> }
    w.dot480 = { ...w.dot480, setSkin }
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return <>{children}</>
}
