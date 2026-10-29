/**
 * The switch moment (docs/LAYOUT-THEME-PLAN.md §4 Runtime path step 8, §1c #12): a visitor's theme or accent
 * choice lands as a halftone wipe that spreads from the pressed control, so dots near it turn first and the far
 * corner last (an Anime.js-style radial stagger, drawn as a dot lattice: solid inside, big → mid → small dots at
 * the front). It is a same-document view transition: the old page is a still, the new one is live under a CSS mask
 * (`html.theme-wipe::view-transition-new(root)` in App.css), so the cards re-sample once and show in that order.
 * Instant (no transition at all) under reduced motion (the OS setting or the palette's override, which wraps
 * `matchMedia`), without `document.startViewTransition`, or in a hidden tab. Not in first load: the picker, the
 * TOOLS sheet and the palette import it.
 */
import { resolveScheme, getTheme, setTheme, type ThemePrefs } from './theme'
import { isAccentChoice, isSchemePref, themeName } from './names'

export type WipeOrigin = Element | { x: number; y: number } | null | undefined
type VT = { finished: Promise<void> }
const PARAMS = ['theme', 'scheme', 'accent']

/** The centre of the pressed control (or a point); the middle of the screen when there is none. */
function centre(o: WipeOrigin): { x: number; y: number } {
  if (o && 'getBoundingClientRect' in o) {
    const r = o.getBoundingClientRect()
    if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  } else if (o) return o
  return { x: innerWidth / 2, y: innerHeight / 2 }
}

/** An explicit choice outranks the visit's `?theme=` / `?scheme=` / `?accent=`: drop them, so a reload keeps the choice. */
function dropUrlParams(): void {
  const q = new URLSearchParams(location.search)
  if (!PARAMS.some(p => q.has(p))) return
  for (const p of PARAMS) q.delete(p)
  const s = q.toString()
  history.replaceState(history.state, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`)
}

let seq = 0
/** Switch scheme and/or accent (persisted, as `setTheme`), with the wipe from `from` when there is motion to show. */
export function switchTheme(next: Partial<ThemePrefs>, from?: WipeOrigin): void {
  dropUrlParams()
  const now = getTheme()
  const scheme = isSchemePref(next.scheme) ? next.scheme : now.scheme, accent = isAccentChoice(next.accent) ? next.accent : now.accent
  const changes = themeName(resolveScheme(scheme, matchMedia('(prefers-color-scheme: light)').matches), accent) !== now.name
  const doc = document as Document & { startViewTransition?: (update: () => void) => VT }
  if (!changes || !doc.startViewTransition || document.visibilityState === 'hidden' || matchMedia('(prefers-reduced-motion: reduce)').matches) return setTheme(next)
  const root = document.documentElement, p = centre(from)
  // the front has to reach the farthest corner; its dithered band is ~8% of that (at least four lattice steps)
  const far = Math.hypot(Math.max(p.x, innerWidth - p.x), Math.max(p.y, innerHeight - p.y))
  const vars: [string, string][] = [['--wipe-x', `${Math.round(p.x)}px`], ['--wipe-y', `${Math.round(p.y)}px`], ['--wipe-far', `${Math.ceil(far)}px`], ['--wipe-band', `${Math.max(40, Math.round(far * 0.08))}px`]]
  for (const [k, v] of vars) root.style.setProperty(k, v)
  root.classList.add('theme-wipe')
  const id = ++seq
  // a second switch during the first skips it (its `finished` settles): only the latest one cleans up
  const done = () => { if (id !== seq) return; root.classList.remove('theme-wipe'); for (const [k] of vars) root.style.removeProperty(k) }
  try { doc.startViewTransition(() => setTheme(next)).finished.then(done, done) } catch { done(); setTheme(next) }
}
