/**
 * Reduced motion, from one place (#351). The palette's setting (on, off, system) wins over the OS query both ways,
 * in JS and in CSS:
 * - JS asks `reducedMotion()` (and `scrollBehavior()` for smooth scrolls), and `onMotionChange` hears a change.
 * - CSS keys off `<html data-motion="reduce|full">`, which this module writes at boot and on every change. The
 *   reduced-motion rules sit under `:where([data-motion="reduce"])`; `src/site/app/a11y.css` keeps the media query
 *   as the fallback for the moment before this runs.
 * The setting persists in localStorage `dot480:motion` (`on` or `off`; system removes the key). It is read once, at
 * module load, before the first `changed()`, so the first paint already has the right `data-motion`. Any other
 * stored value counts as system.
 * Node-safe: without a window it answers false and writes nothing. `win` lets a module with an injected window
 * (`src/site/light.ts`) ask the same question.
 */
export type MotionSetting = 'system' | 'on' | 'off'

const QUERY = '(prefers-reduced-motion: reduce)', KEY = 'dot480:motion'
const store = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.localStorage ?? null } catch { return null } }
/** The stored setting as an override: `on` is true, `off` false, anything else (or no storage) null, the OS. */
const stored = (): boolean | null => {
  try { const v = store()?.getItem(KEY); return v === 'on' ? true : v === 'off' ? false : null } catch { return null }
}
let override: boolean | null = stored()
const listeners = new Set<() => void>()
type Win = Pick<Window, 'matchMedia'>
const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null

export const reducedMotion = (win?: Win | null): boolean => {
  if (override !== null) return override
  if (win === undefined) return !!mql?.matches
  try { return !!win?.matchMedia?.(QUERY).matches } catch { return false }
}
export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth')
export const motionSetting = (): MotionSetting => (override === null ? 'system' : override ? 'on' : 'off')

/** Hear the answer change (the setting or the OS query). Returns the unsubscribe. */
export function onMotionChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function changed() {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = reducedMotion() ? 'reduce' : 'full'
  for (const l of [...listeners]) l()
}

export function setReducedMotion(s: MotionSetting) {
  override = s === 'system' ? null : s === 'on'
  try { if (s === 'system') store()?.removeItem(KEY); else store()?.setItem(KEY, s) } catch { /* storage blocked: this page only */ }
  changed()
}

if (typeof mql?.addEventListener === 'function') mql.addEventListener('change', changed)
changed()
