/**
 * The theme store (docs/LAYOUT-THEME-PLAN.md §4 Runtime path, step 1; the `skins/store.ts` pattern, no React):
 * scheme (`system` / `dark` / `light`) × accent, one value for the whole site.
 *  - Sources, per field: `?scheme=` / `?accent=`, then `?theme=<scheme>_<accent>`, then localStorage
 *    `dot480:theme` (`{"scheme","accent"}`), then `system` + `signal`. URL params apply to the visit and are
 *    never persisted (an embed's `?accent=` must not overwrite the visitor's choice); `setTheme` persists.
 *  - `system` follows `prefers-color-scheme` live (a `matchMedia` listener while on `system`).
 *  - Writes `data-scheme` (resolved: `dark` / `light`) and `data-accent` on `<html>`, the same attributes the
 *    inline boot script (`boot.ts`) set before first paint, with `.no-transition` on `<html>` for the switch;
 *    the `color-scheme` meta, and the `theme-color` meta as the theme's exact `--bg` (the boot script can only
 *    give the scheme's).
 *  - `themeTokens()` gives canvas readers the engine `ThemeTokens` of the current (or a named) theme, read from
 *    the theme CSS (themes.css, already on the page), so the first load carries no colour table:
 *    `dark_signal` is `dot480` itself, so today's cards and their caches are untouched. `tokens.ts` has the
 *    same values from the generated table for scripts (no DOM).
 * `useTheme()` / `useThemeTokens()` (React) live in `useTheme.ts` next to this file.
 */
import type { ThemeTokens } from '../../engine/types'
import { dot480 } from '../../engine/theme/tokens'
import { DEFAULT_ACCENT, DEFAULT_SCHEME, isAccent, isSchemePref, parseThemeName, themeName, type AccentId, type Scheme, type SchemePref, type ThemeName } from './names'

export const STORAGE_KEY = 'dot480:theme'
export interface ThemePrefs { scheme: SchemePref; accent: AccentId }
export interface ThemeState extends ThemePrefs { /** `scheme` with `system` resolved. */ resolved: Scheme; name: ThemeName }

/**
 * The visitor's choice from the URL query and the stored JSON (pure; the boot script does the same, and
 * `scripts/site/theme.ts` runs both on the same inputs). `fromUrl` tells whether the URL decided a field.
 */
export function resolvePrefs(search: string, stored: string | null): ThemePrefs & { fromUrl: boolean } {
  const q = new URLSearchParams(search), t = parseThemeName(q.get('theme'))
  let j: Partial<Record<keyof ThemePrefs, unknown>> = {}
  try { j = (JSON.parse(stored ?? 'null') as typeof j) || {} } catch { /* corrupt entry: defaults */ }
  const sq = q.get('scheme'), aq = q.get('accent')
  const scheme = [sq, t?.[0], j.scheme].find(isSchemePref) ?? DEFAULT_SCHEME
  const accent = [aq, t?.[1], j.accent].find(isAccent) ?? DEFAULT_ACCENT
  return { scheme, accent, fromUrl: isSchemePref(sq) || isAccent(aq) || !!t }
}
export const resolveScheme = (pref: SchemePref, prefersLight: boolean): Scheme => (pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref)

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined'
const LIGHT_QUERY = '(prefers-color-scheme: light)'
const mq = hasDom && typeof matchMedia === 'function' ? matchMedia(LIGHT_QUERY) : undefined
const readStored = (): string | null => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } }

let prefs: ThemePrefs = hasDom ? resolvePrefs(location.search, readStored()) : { scheme: DEFAULT_SCHEME, accent: DEFAULT_ACCENT }
let state: ThemeState = derive(prefs)
const listeners = new Set<() => void>()

function derive(p: ThemePrefs): ThemeState {
  const resolved = resolveScheme(p.scheme, !!mq?.matches)
  return { scheme: p.scheme, accent: p.accent, resolved, name: themeName(resolved, p.accent) }
}

/** `<html data-scheme data-accent>`; `.no-transition` holds every CSS transition off for the frame of the swap. */
function apply(s: ThemeState, animate = false): void {
  if (!hasDom) return
  const root = document.documentElement
  if (root.dataset.scheme === s.resolved && root.dataset.accent === s.accent) return
  if (!animate) root.classList.add('no-transition')
  root.dataset.scheme = s.resolved
  root.dataset.accent = s.accent
  metas(s)
  if (!animate) {
    void getComputedStyle(root).color // flush styles with transitions off
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transition')))
  }
}

/** The browser chrome follows the theme: `color-scheme` (native controls, scrollbars) and `theme-color` (the bar). */
function metas(s: ThemeState): void {
  const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name=${name}]`)
  const cs = meta('color-scheme'), tc = meta('theme-color'), bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (cs) cs.content = s.resolved
  if (tc && bg) tc.content = bg
}

function update(next: ThemePrefs): void {
  const s = derive(next)
  prefs = next
  if (s.name === state.name && s.scheme === state.scheme) return
  state = s
  apply(state)
  for (const l of listeners) l()
}

mq?.addEventListener?.('change', () => { if (prefs.scheme === 'system') update({ ...prefs }) })
// the boot script set the attributes already (this only repairs a page whose boot script was blocked); the exact
// theme-color needs the CSS, which has loaded by the time the bundle runs
apply(state)
if (hasDom) metas(state)

export const getTheme = (): ThemeState => state
export function subscribeTheme(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Switch scheme and/or accent (unknown values ignored) and persist the choice. */
export function setTheme(next: Partial<ThemePrefs>): void {
  const p: ThemePrefs = { scheme: isSchemePref(next.scheme) ? next.scheme : prefs.scheme, accent: isAccent(next.accent) ? next.accent : prefs.accent }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* storage blocked */ }
  update(p)
}
export const setScheme = (scheme: SchemePref) => setTheme({ scheme })
export const setAccent = (accent: AccentId) => setTheme({ accent })

/** Engine token ← the CSS variable it is read from (scripts/site/theme.ts `ENGINE_VARS` checks themes.css declares them all). */
const VARS: [keyof ThemeTokens, string][] = [['bg', '--bg'], ['surface', '--surface'], ['surfaceRaised', '--raised'], ['hairline', '--line'], ['dotIdle', '--dot-idle'], ['dotMid', '--dot-mid'], ['dotFaint', '--dot-faint'], ['value', '--value'], ['dotActive', '--red'], ['dotActiveDim', '--red-dim']]
const memo = new Map<ThemeName, ThemeTokens>()
/** The tokens of a theme as its CSS declares them: read off `<html>` when it shows that theme, else off a hidden probe. */
function fromCss(scheme: Scheme, accent: AccentId): ThemeTokens | undefined {
  const root = document.documentElement, own = root.dataset.scheme === scheme && root.dataset.accent === accent
  const el = own ? root : Object.assign(document.createElement('i'), { hidden: true })
  if (!own) { el.dataset.scheme = scheme; el.dataset.accent = accent; (document.body ?? root).appendChild(el) }
  const cs = getComputedStyle(el), t: ThemeTokens = { ...dot480 }
  // --red-dim exists only in themes.css: without it the theme CSS isn't applied yet, so don't memoise a guess
  const ok = !!cs.getPropertyValue('--red-dim').trim()
  for (const [k, v] of VARS) { const x = cs.getPropertyValue(v).trim(); if (x) (t as unknown as Record<string, unknown>)[k] = x }
  if (!own) el.remove()
  return ok ? t : undefined
}
/**
 * Engine tokens of a theme (default: the current one): the scheme's neutral preset (`dot480` dark, the paper
 * preset light) with the accent and the tinted surfaces, as the theme CSS declares them. Memoised per name, so
 * per-theme caches keyed on the object stay stable; `dark_signal` (and anything without a DOM) is `dot480` itself.
 */
export function themeTokens(scheme: Scheme = state.resolved, accent: AccentId = state.accent): ThemeTokens {
  const name = themeName(scheme, accent)
  if (name === 'dark_signal' || !hasDom) return dot480
  let t = memo.get(name)
  if (!t) { t = fromCss(scheme, accent); if (!t) return dot480; memo.set(name, t) }
  return t
}

// consoles, probes and the shell: `dot480.setTheme({ scheme: 'light', accent: 'cobalt' })`
if (hasDom) { const w = window as unknown as { dot480?: Record<string, unknown> }; w.dot480 = { ...w.dot480, setTheme, themeTokens, getTheme } }
