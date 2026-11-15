/**
 * The global display skin (C7): one value for the whole site. A `?skin=` link decides, else localStorage
 * `dot480:skin`, default `oled` (`pickSkin`: a link or save naming an unknown or removed skin opens on OLED, no error).
 * `setSkin(name)` is the public entry point (switcher, command palette, a terminal `skin crt`); it keeps the
 * URL and storage in sync.
 */
import { useSyncExternalStore } from 'react'
import { isSkinName, pickSkin, type SkinName } from '../../engine/display/names'
import { replaceUrl } from '../../site/safe-url'

const KEY = 'dot480:skin'

function initialSkin(): SkinName {
  if (typeof window === 'undefined') return 'oled'
  let stored: string | null = null
  try { stored = localStorage.getItem(KEY) } catch { /* storage blocked */ }
  return pickSkin(new URLSearchParams(window.location.search).get('skin'), stored)
}

let skin: SkinName = initialSkin()
/** Seconds (performance clock) of the last switch: cards time their refresh from it. */
let changedAt = 0
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

export const getSkin = (): SkinName => skin
export const skinChangedAt = (): number => changedAt
export function subscribeSkin(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Switch every board to `name` (ignored if unknown). Updates `?skin=` (dropped for the default) and localStorage. */
export function setSkin(name: string): void {
  if (!isSkinName(name) || name === skin) return
  skin = name
  changedAt = performance.now() / 1000
  try { localStorage.setItem(KEY, name) } catch { /* storage blocked */ }
  try {
    const url = new URL(window.location.href)
    if (name === 'oled') url.searchParams.delete('skin'); else url.searchParams.set('skin', name)
    replaceUrl(url)
  } catch { /* no history (sandboxed frame) */ }
  emit()
}

export const useDisplaySkin = (): SkinName => useSyncExternalStore(subscribeSkin, getSkin, () => 'oled')
