/**
 * C10 "explorable layer" state: X-ray (per card + global), solo/mute per card, a renderer override,
 * the time machine (frozen shared clock) and a few app-wide toggles the ⌘K palette and the dot shell flip.
 * A tiny external store (no dependency): `useXR(select)` re-renders only when the selected slice changes.
 *
 * Nothing in here changes how a card renders while X-ray is off and every toggle is at its default.
 */
import { useSyncExternalStore } from 'react'
import { sharedClock } from '../../engine/clock'
import type { DotStyle, GridConfig, Layer, ThemeTokens } from '../../engine'
import type { WidgetContext, WidgetPreset } from '../../widgets/types'

export type RendererOverride = 'auto' | 'svg' | 'canvas' | 'webgl'
export interface XRState {
  /** X-ray every card. */
  global: boolean
  /** Card instances X-rayed one by one (instance keys). */
  on: ReadonlySet<string>
  /** The card the inspector panel shows (follows the hovered X-ray card). */
  active: string | null
  /** Per card instance: the one layer index shown alone. */
  solo: Readonly<Record<string, number | undefined>>
  /** Per card instance: hidden layer indexes. */
  muted: Readonly<Record<string, readonly number[]>>
  renderer: RendererOverride
  /** Time machine: the shared clock is paused and scrubbable. */
  frozen: boolean
  /** Placeholder for display skins (C7): the palette / shell set it, nothing reads it yet but `dot480:skin` listeners. */
  skin: string
  fpsHud: boolean
  toast: { text: string; id: number } | null
}

let state: XRState = { global: false, on: new Set(), active: null, solo: {}, muted: {}, renderer: 'auto', frozen: false, skin: 'none', fpsHud: false, toast: null }
const listeners = new Set<() => void>()
export const xrState = () => state
export function setXR(patch: Partial<XRState> | ((s: XRState) => Partial<XRState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export function useXR<T>(select: (s: XRState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state))
}

let toastId = 0
export function toast(text: string) {
  const id = ++toastId
  setXR({ toast: { text, id } })
  window.setTimeout(() => { if (state.toast?.id === id) setXR({ toast: null }) }, 2400)
}

// ── X-ray ───────────────────────────────────────────────────────────────────────────────
export const isXRay = (s: XRState, key: string) => s.global || s.on.has(key)
export function toggleCard(key: string) {
  setXR(s => {
    // under global X-ray, X on one card switches just that card off (the rest stay lit, one by one)
    if (s.global) return { global: false, on: new Set(cardKeys().filter(k => k !== key)), active: s.active === key ? null : s.active }
    const on = new Set(s.on)
    if (on.has(key)) on.delete(key); else on.add(key)
    return { on, active: on.has(key) ? key : s.active === key ? null : s.active }
  })
}
export function toggleGlobal(force?: boolean) {
  setXR(s => {
    const global = force ?? !(s.global || s.on.size > 0)
    return { global, on: new Set(), active: global ? s.active : null }
  })
}
export function soloLayer(key: string, i: number) {
  setXR(s => ({ solo: { ...s.solo, [key]: s.solo[key] === i ? undefined : i } }))
}
export function muteLayer(key: string, i: number) {
  setXR(s => {
    const m = s.muted[key] ?? []
    return { muted: { ...s.muted, [key]: m.includes(i) ? m.filter(x => x !== i) : [...m, i] } }
  })
}

/** Every mounted card instance (the DOM is the registry: `DotWidget` stamps `data-xr-key`). */
export const cardKeys = () => [...document.querySelectorAll<HTMLElement>('[data-xr-key]')].map(el => el.dataset.xrKey!)
export const cardElement = (key: string) => document.querySelector<HTMLElement>(`[data-xr-key="${CSS.escape(key)}"]`)
/** The card under the pointer, if any. */
export function hoveredCard(): HTMLElement | null {
  const hovered = document.querySelectorAll<HTMLElement>('[data-xr-key]:hover')
  return hovered[hovered.length - 1] ?? null
}

/** What an X-ray overlay knows about its card (read by the inspector; refreshed on the overlay's render). */
export interface CardProbe {
  key: string
  preset: WidgetPreset
  /** The card's full layer function (before solo/mute). */
  layers: (ctx: WidgetContext) => Layer[]
  data: Record<string, number>
  grid: GridConfig
  style: DotStyle
  theme: ThemeTokens
  animated: boolean
  fps: number
  /** Renderer the canvas last reported (`svg` / `canvas`, or whatever DotCanvas reports, e.g. `webgl`). */
  mode: () => string
  worker: () => boolean
  stats: { fps: number; dots: number; t: number }
}
export const probes = new Map<string, CardProbe>()

// ── time machine ────────────────────────────────────────────────────────────────────────
let watching = false
function watchVisibility() {
  if (watching || typeof document === 'undefined') return
  watching = true
  // the shared clock resumes itself when the tab comes back; a frozen board must stay frozen
  sharedClock()
  document.addEventListener('visibilitychange', () => { if (state.frozen) sharedClock().pause() })
}
export function freeze() {
  watchVisibility()
  sharedClock().pause()
  if (!state.frozen) setXR({ frozen: true })
}
export function resume() {
  if (!state.frozen) return
  setXR({ frozen: false })
  if (document.visibilityState !== 'hidden') sharedClock().resume()
}
/** Jump board time to `t` seconds (freezes first). */
export function scrub(t: number) {
  freeze()
  sharedClock().seek(Math.max(0, t))
}
export const boardTime = () => sharedClock().time()
