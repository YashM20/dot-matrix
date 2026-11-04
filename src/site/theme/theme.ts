/**
 * The theme store (docs/LAYOUT-THEME-PLAN.md §4 Runtime path, step 1; the `skins/store.ts` pattern, no React):
 * scheme (`system` / `dark` / `light`) × accent, one value for the whole site.
 *  - Sources, per field: `?scheme=` / `?accent=`, then `?theme=<scheme>_<accent>`, then localStorage
 *    `dot480:theme` (`{"scheme","accent","hue","css"}`), then `system` + `signal`. URL params apply to the visit
 *    and are never persisted (an embed's `?accent=` must not overwrite the visitor's choice); `setTheme` persists.
 *  - The custom accent (T6): any hue, generated in the browser by the lazy `custom.ts` (the same generator as the
 *    presets). Only the `hue` is read back from storage: its CSS (both schemes, in `<style id="theme-custom">`) is
 *    made again from the hue when the bundle runs, so a tampered entry can give nothing but a valid hue. The entry
 *    still carries that CSS (`css`) because the boot script paints from it before first paint; the store rewrites a
 *    stored copy that isn't the generator's, and drops one with no valid hue (`cleanStored`). As in the boot script,
 *    `custom` as the accent also needs a stored CSS string, so both pick the same accent.
 *  - `system` follows `prefers-color-scheme` live (a `matchMedia` listener while on `system`).
 *  - CONTRAST: MORE (`contrast: 'more'`, stored next to the theme, `?contrast=more` for a visit) puts
 *    `data-contrast="more"` on `<html>`: the roles of `prefers-contrast: more`, which still applies on its own. The
 *    boot script doesn't read it (it is inlined into every HTML entry), so the store sets it when the bundle runs.
 *  - `?hue=` (a shared custom theme): the visit shows that hue once the lazy generator (`custom.ts`) loads; like
 *    every URL param it is not stored.
 *  - `window.dot480.setTheme` (`consoleSetTheme`) takes `scheme`, `accent`, `contrast` and a `hue`, never CSS.
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
import { DEFAULT_ACCENT, DEFAULT_SCHEME, isAccent, isAccentChoice, isContrastPref, isSchemePref, parseHue, parseThemeName, themeName, type AccentChoice, type ContrastPref, type Scheme, type SchemePref, type ThemeKey } from './names'

export const STORAGE_KEY = 'dot480:theme'
/**
 * The custom hue and its theme CSS (both schemes; `customCss()` in accents.ts). `css` only ever comes from the generator
 * (`customHue()` in custom.ts), never from storage or the console; it is missing until the generator has run.
 */
export interface CustomHue { hue: number; css?: string }
export interface ThemePrefs { scheme: SchemePref; accent: AccentChoice; custom?: CustomHue; /** CONTRAST: MORE (absent: `system`). */ contrast?: ContrastPref }
export interface ThemeState extends ThemePrefs {
  /** `scheme` with `system` resolved. */ resolved: Scheme; name: ThemeKey
  /** The OS asks for more contrast (`prefers-contrast: more`). */ osMore: boolean
  /** More contrast is on: picked, or asked for by the OS. */ more: boolean
}
const CUSTOM_ID = 'theme-custom'
type CustomMod = typeof import('./custom')
/** The custom hue's generator, once loaded (lazy: the first load carries no colour maths). */
let gen: CustomMod | undefined
const loadCustom = (): Promise<CustomMod> => import('./custom').then(m => (gen = m))
/** `themeTokens()` per theme (declared before the module's first `customStyle`, which clears the custom entries). */
const memo = new Map<ThemeKey, ThemeTokens>()

/**
 * The visitor's choice from the URL query and the stored JSON (pure; the boot script does the same, and
 * `scripts/site/theme.ts` runs both on the same inputs). `fromUrl` tells whether the URL decided a field.
 */
export function resolvePrefs(search: string, stored: string | null): ThemePrefs & { fromUrl: boolean; hue?: number } {
  const q = new URLSearchParams(search), t = parseThemeName(q.get('theme')), j = storedObject(stored)
  const sq = q.get('scheme'), aq = q.get('accent')
  // the custom hue: a valid stored `hue` (the stored CSS is never read back). `custom` as the accent also needs a stored
  // CSS string, which the boot script paints from (a link's ?accent=custom without one falls through to the next source)
  const sh = typeof j.hue === 'number' ? parseHue(String(j.hue)) : undefined
  const custom: CustomHue | undefined = sh === undefined ? undefined : { hue: sh }
  const ok = (x: unknown): x is AccentChoice => isAccentChoice(x) && (x !== 'custom' || (!!custom && typeof j.css === 'string'))
  const scheme = [sq, t?.[0], j.scheme].find(isSchemePref) ?? DEFAULT_SCHEME
  const accent = [aq, t?.[1], j.accent].find(ok) ?? DEFAULT_ACCENT
  const contrast = [q.get('contrast'), j.contrast].find(isContrastPref) ?? 'system'
  // ?hue= asks for that custom hue, unless the URL names a preset accent (the store applies it after boot)
  const hue = isAccent(aq) || isAccent(t?.[1]) ? undefined : parseHue(q.get('hue'))
  return { scheme, accent, ...(custom ? { custom } : {}), ...(contrast === 'more' ? { contrast } : {}), ...(hue === undefined ? {} : { hue }),
    fromUrl: isSchemePref(sq) || isAccentChoice(aq) || !!t || isContrastPref(q.get('contrast')) || hue !== undefined }
}
export const resolveScheme = (pref: SchemePref, prefersLight: boolean): Scheme => (pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref)
/** The stored entry as an object (`{}` when missing, corrupt or not an object). */
function storedObject(stored: string | null): Record<string, unknown> {
  try { const j: unknown = JSON.parse(stored ?? 'null'); return j && typeof j === 'object' ? j as Record<string, unknown> : {} } catch { return {} }
}
/** The entry `setTheme` stores. The boot script reads `scheme`, `accent` and `css`; the store reads back all but `css`. */
const serialize = (p: ThemePrefs): string => JSON.stringify({ scheme: p.scheme, accent: p.accent, ...(p.custom ? { hue: p.custom.hue, ...(p.custom.css ? { css: p.custom.css } : {}) } : {}), ...(p.contrast === 'more' ? { contrast: p.contrast } : {}) })
/**
 * The stored entry the next boot should read, given the generator (`css`): the stored hue's CSS made again, or the CSS
 * dropped when there is no valid hue; `null` when the entry has no CSS or already has the generator's. Pure (the
 * check feeds it tampered entries).
 */
export function cleanStored(stored: string | null, css: (hue: number) => string): string | null {
  if (!('css' in storedObject(stored))) return null
  const p = prefsOf(resolvePrefs('', stored)), next = serialize(p.custom ? { ...p, custom: { hue: p.custom.hue, css: css(p.custom.hue) } } : p)
  return next === stored ? null : next
}

const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined'
const LIGHT_QUERY = '(prefers-color-scheme: light)'
const mq = hasDom && typeof matchMedia === 'function' ? matchMedia(LIGHT_QUERY) : undefined
const mqMore = hasDom && typeof matchMedia === 'function' ? matchMedia('(prefers-contrast: more)') : undefined
const readStored = (): string | null => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } }
const writeStored = (s: string): void => { try { localStorage.setItem(STORAGE_KEY, s) } catch { /* storage blocked */ } }

/** The prefs without the `fromUrl` flag. */
const prefsOf = (r: ThemePrefs): ThemePrefs => ({ scheme: r.scheme, accent: r.accent, ...(r.custom ? { custom: r.custom } : {}), ...(r.contrast === 'more' ? { contrast: r.contrast } : {}) })
const first = hasDom ? resolvePrefs(location.search, readStored()) : undefined
let prefs: ThemePrefs = first ? prefsOf(first) : { scheme: DEFAULT_SCHEME, accent: DEFAULT_ACCENT }
let state: ThemeState = derive(prefs)
const listeners = new Set<() => void>()
/** `setTheme` calls so far: a pick made before a `?hue=` link's generator arrives wins. */
let picks = 0

function derive(p: ThemePrefs): ThemeState {
  const resolved = resolveScheme(p.scheme, !!mq?.matches), osMore = !!mqMore?.matches
  return { ...p, resolved, name: themeName(resolved, p.accent), osMore, more: osMore || p.contrast === 'more' }
}

/**
 * The custom hue's generated CSS into `<style id="theme-custom">` (where the boot script put the stored copy when the
 * stored accent is custom); true when the text changed.
 */
function customStyle(css: string | undefined): boolean {
  if (!hasDom || css === undefined) return false
  let el = document.getElementById(CUSTOM_ID)
  if (!el) { el = Object.assign(document.createElement('style'), { id: CUSTOM_ID }); document.head.appendChild(el) }
  if (el.textContent === css) return false
  el.textContent = css
  for (const k of memo.keys()) if (k.endsWith('_custom')) memo.delete(k)
  return true
}

/** `<html data-scheme data-accent data-contrast>`; `.no-transition` holds every CSS transition off for the frame of the swap. */
function apply(s: ThemeState, animate = false): void {
  if (!hasDom) return
  const root = document.documentElement, contrast = s.contrast === 'more' ? 'more' : undefined
  if (root.dataset.scheme === s.resolved && root.dataset.accent === s.accent && root.dataset.contrast === contrast) return
  if (!animate) root.classList.add('no-transition')
  root.dataset.scheme = s.resolved
  root.dataset.accent = s.accent
  if (contrast) root.dataset.contrast = contrast; else delete root.dataset.contrast
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
  const s = derive(next), restyled = customStyle(next.custom?.css)
  prefs = next
  if (!restyled && s.name === state.name && s.scheme === state.scheme && s.custom?.hue === state.custom?.hue && s.custom?.css === state.custom?.css && s.contrast === state.contrast && s.more === state.more) return
  // the raised roles change the hairline the canvas readers take (`--line`): read every theme again
  if (s.more !== state.more) memo.clear()
  state = s
  apply(state)
  // new custom CSS under the same attributes: the exact theme-color again
  if (restyled) metas(state)
  for (const l of listeners) l()
}
/** A custom hue without its CSS (read from storage, or handed over by the console) gets the generator's; true if it did. */
function fill(m: CustomMod): boolean {
  const c = prefs.custom
  if (!c || c.css) return false
  update({ ...prefs, custom: m.customHue(c.hue) })
  return true
}

mq?.addEventListener?.('change', () => { if (prefs.scheme === 'system') update({ ...prefs }) })
mqMore?.addEventListener?.('change', () => update({ ...prefs }))
// the boot script set the attributes already (this only repairs a page whose boot script was blocked); the exact
// theme-color needs the CSS, which has loaded by the time the bundle runs
apply(state)
if (hasDom) {
  metas(state)
  // the custom CSS the boot script copied from storage: without a valid stored hue behind it, it goes at once; with
  // one, the generator's CSS for that hue replaces it, and the stored copy is rewritten to match (`cleanStored`)
  if (!prefs.custom) document.getElementById(CUSTOM_ID)?.remove()
  const raw = readStored(), h = first?.hue
  if (prefs.custom || h !== undefined || 'css' in storedObject(raw)) void loadCustom().then(m => {
    const clean = cleanStored(raw, x => m.customHue(x).css)
    // unless a pick stored something else meanwhile
    if (clean !== null && readStored() === raw) writeStored(clean)
    // ?hue=: the shared custom hue for this visit (a pick before the generator arrives wins)
    if (h !== undefined && !picks) update({ ...prefs, accent: 'custom', custom: m.customHue(h) })
    else fill(m)
  }, () => { /* offline: the boot theme stays */ })
}

export const getTheme = (): ThemeState => state
export function subscribeTheme(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }

/**
 * Switch scheme and/or accent (unknown values ignored) and persist the choice. `custom` needs a hue (given here, or
 * stored from an earlier pick); its CSS is the generator's (`customHue()`), made here when the hue comes without it.
 * A picked preset keeps the stored custom hue, so the custom swatch remembers it.
 */
export function setTheme(next: Partial<ThemePrefs>): void {
  picks++
  const given = next.custom ?? prefs.custom, custom = given && !given.css && gen ? gen.customHue(given.hue) : given
  const accent = isAccentChoice(next.accent) && (next.accent !== 'custom' || custom) ? next.accent : prefs.accent
  const contrast = isContrastPref(next.contrast) ? next.contrast : prefs.contrast
  const p: ThemePrefs = { scheme: isSchemePref(next.scheme) ? next.scheme : prefs.scheme, accent, ...(custom ? { custom } : {}), ...(contrast === 'more' ? { contrast } : {}) }
  writeStored(serialize(p))
  update(p)
  // the generator hasn't loaded yet: the hue gets its CSS (and is stored with it, for the boot script) when it does
  if (custom && !custom.css) { const h = custom.hue; void loadCustom().then(m => { if (prefs.custom?.hue === h && fill(m)) writeStored(serialize(prefs)) }, () => { /* offline */ }) }
}
export const setScheme = (scheme: SchemePref) => setTheme({ scheme })
export const setAccent = (accent: AccentChoice) => setTheme({ accent })
/** CONTRAST: MORE on (`more`) or off (`system`: the OS decides); persisted with the theme. */
export const setContrast = (contrast: ContrastPref) => setTheme({ contrast })

/** Engine token ← the CSS variable it is read from (scripts/site/theme.ts `ENGINE_VARS` checks themes.css declares them all). */
const VARS: [keyof ThemeTokens, string][] = [['bg', '--bg'], ['surface', '--surface'], ['surfaceRaised', '--raised'], ['hairline', '--line'], ['dotIdle', '--dot-idle'], ['dotMid', '--dot-mid'], ['dotFaint', '--dot-faint'], ['value', '--value'], ['dotActive', '--red'], ['dotActiveDim', '--red-dim']]
/** The tokens of a theme as its CSS declares them: read off `<html>` when it shows that theme, else off a hidden probe. */
function fromCss(scheme: Scheme, accent: AccentChoice): ThemeTokens | undefined {
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
 * per-theme caches keyed on the object stay stable (a new custom hue drops the custom entries); `dark_signal` (and
 * anything without a DOM) is `dot480` itself.
 */
export function themeTokens(scheme: Scheme = state.resolved, accent: AccentChoice = state.accent): ThemeTokens {
  const name = themeName(scheme, accent)
  if (name === 'dark_signal' || !hasDom) return dot480
  let t = memo.get(name)
  if (!t) { t = fromCss(scheme, accent); if (!t) return dot480; memo.set(name, t) }
  return t
}

/**
 * `window.dot480.setTheme` for consoles and probes: `scheme`, `accent`, `contrast` and a custom `hue` in degrees (as
 * `?hue=`). Nothing else is read, so no `css` and no `custom` object: the hue's CSS always comes from the generator.
 */
export function consoleSetTheme(next?: unknown): void {
  const n = (next && typeof next === 'object' ? next : {}) as Record<string, unknown>
  const hue = typeof n.hue === 'number' ? parseHue(String(n.hue)) : undefined
  const p: Partial<ThemePrefs> = {
    ...(isSchemePref(n.scheme) ? { scheme: n.scheme } : {}), ...(isAccentChoice(n.accent) ? { accent: n.accent } : {}), ...(isContrastPref(n.contrast) ? { contrast: n.contrast } : {}),
    ...(hue === undefined ? {} : { custom: prefs.custom?.hue === hue ? prefs.custom : { hue } }),
  }
  if (Object.keys(p).length) setTheme(p)
}

// consoles, probes and the shell: `dot480.setTheme({ scheme: 'light', accent: 'custom', hue: 212 })`
if (hasDom) { const w = window as unknown as { dot480?: Record<string, unknown> }; w.dot480 = { ...w.dot480, setTheme: consoleSetTheme, themeTokens, getTheme } }
