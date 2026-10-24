/**
 * App-level reduced-motion override for the palette ("reduced motion: on / off / system"). Every card
 * reads `matchMedia('(prefers-reduced-motion: reduce)')`; this wraps that one query so its `matches`
 * follows the override and its listeners hear the change. Any other query goes straight through, and
 * with the override at `system` (the default) the wrapped query answers exactly like the real one.
 */
const QUERY = '(prefers-reduced-motion:reduce)'
type Listener = (e: MediaQueryListEvent) => void
let override: boolean | null = null
const listeners = new Set<Listener>()

function install() {
  if (typeof window === 'undefined') return
  const w = window as Window & { __dotRM?: boolean }
  if (w.__dotRM) return
  w.__dotRM = true
  const real = window.matchMedia.bind(window)
  window.matchMedia = (query: string): MediaQueryList => {
    const mql = real(query)
    if (query.replace(/\s+/g, '') !== QUERY) return mql
    const wrapped: MediaQueryList = {
      media: mql.media,
      get matches() { return override ?? mql.matches },
      onchange: null,
      addEventListener(type: string, cb: EventListenerOrEventListenerObject) { if (type === 'change' && typeof cb === 'function') listeners.add(cb as Listener); mql.addEventListener(type, cb) },
      removeEventListener(type: string, cb: EventListenerOrEventListenerObject) { if (typeof cb === 'function') listeners.delete(cb as Listener); mql.removeEventListener(type, cb) },
      addListener(cb: ((this: MediaQueryList, e: MediaQueryListEvent) => void) | null) { if (cb) { listeners.add(cb as Listener); mql.addListener(cb) } },
      removeListener(cb: ((this: MediaQueryList, e: MediaQueryListEvent) => void) | null) { if (cb) { listeners.delete(cb as Listener); mql.removeListener(cb) } },
      dispatchEvent: e => mql.dispatchEvent(e),
    } as MediaQueryList
    return wrapped
  }
}
install()

export type MotionSetting = 'system' | 'on' | 'off'
export const motionSetting = (): MotionSetting => (override === null ? 'system' : override ? 'on' : 'off')
export function setReducedMotion(s: MotionSetting) {
  override = s === 'system' ? null : s === 'on'
  const matches = window.matchMedia(QUERY).matches
  for (const l of [...listeners]) l({ matches, media: QUERY } as MediaQueryListEvent)
}
