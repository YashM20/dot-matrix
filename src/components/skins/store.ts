/**
 * The global display skin (C7): one value for the whole site. Read from `?skin=` first, then
 * localStorage `dot480:skin`, default `oled`. `setSkin(name)` is the public entry point (switcher,
 * command palette, a terminal `skin crt`); it keeps the URL and storage in sync.
 */
import { useSyncExternalStore } from 'react'
import { isSkinName, type SkinName } from '../../engine/display/names'

const KEY = 'dot480:skin', CLACK_KEY = 'dot480:clack'

function initialSkin(): SkinName {
  if (typeof window === 'undefined') return 'oled'
  const q = new URLSearchParams(window.location.search).get('skin')
  if (isSkinName(q)) return q
  try { const s = localStorage.getItem(KEY); if (isSkinName(s)) return s } catch { /* storage blocked */ }
  return 'oled'
}

let skin: SkinName = initialSkin()
/** Seconds (performance clock) of the last switch: cards time their refresh from it. */
let changedAt = 0
// same rule as `clackEnabled()` in src/media/clack.ts, inlined so the switcher doesn't pull the audio module in
const clackEnabled = (): boolean => {
  if (typeof location === 'undefined') return false
  try { return new URLSearchParams(location.search).get('clack') === '1' || localStorage.getItem('dot480:clack') === '1' } catch { return false }
}
let clack = clackEnabled()
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
    window.history.replaceState(window.history.state, '', url)
  } catch { /* no history (sandboxed frame) */ }
  emit()
}

export const getClack = (): boolean => clack
/** Flip-disc clack on/off (muted by default; `?clack=1` or the switcher's toggle). */
export function setClack(on: boolean): void {
  clack = on
  try { localStorage.setItem(CLACK_KEY, on ? '1' : '0') } catch { /* storage blocked */ }
  emit()
}

export const useDisplaySkin = (): SkinName => useSyncExternalStore(subscribeSkin, getSkin, () => 'oled')
export const useClack = (): boolean => useSyncExternalStore(subscribeSkin, getClack, () => false)
