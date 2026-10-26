/**
 * Pro mode (docs/UX-PLAN.md §3, §5.5): one persistent switch for power users. On when the URL has
 * `?pro=1` or `localStorage['dot480:pro'] === 'on'` (`?pro=0` forces it off for this page load).
 * Pro opens every MAKE "More" fold by default. Shaped for `useSyncExternalStore(subscribePro, isPro)`.
 * Plain module, no React: a palette command / help-sheet switch can call `setPro` / `togglePro`.
 */
const KEY = 'dot480:pro'
const listeners = new Set<() => void>()

function stored(): boolean {
  try { return localStorage.getItem(KEY) === 'on' } catch { return false }
}
function fromUrl(): boolean | undefined {
  if (typeof location === 'undefined') return undefined
  const p = new URLSearchParams(location.search).get('pro')
  return p === '1' || p === 'on' ? true : p === '0' || p === 'off' ? false : undefined
}

let value = typeof window === 'undefined' ? false : fromUrl() ?? stored()

export const isPro = (): boolean => value

/** Turns Pro on or off for this visitor (persists in localStorage) and notifies subscribers. */
export function setPro(on: boolean) {
  try { if (on) localStorage.setItem(KEY, 'on'); else localStorage.removeItem(KEY) } catch { /* private mode: this page only */ }
  if (on === value) return
  value = on
  listeners.forEach(l => l())
}
export const togglePro = () => setPro(!value)

// another tab flipped the switch
const onStorage = (e: StorageEvent) => {
  if (e.key !== KEY) return
  const next = e.newValue === 'on'
  if (next !== value) { value = next; listeners.forEach(l => l()) }
}

export function subscribePro(listener: () => void) {
  if (!listeners.size && typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
