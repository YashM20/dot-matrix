/**
 * Theme names (docs/LAYOUT-THEME-PLAN.md §4 Model): theme = scheme × accent, named `${scheme}_${accent}`
 * (Tamagui style: dark_signal, light_cobalt). Tiny on purpose: the store and the boot script read only this.
 */
export const SCHEMES = ['dark', 'light'] as const
export type Scheme = (typeof SCHEMES)[number]
export type SchemePref = Scheme | 'system'
export const ACCENTS = ['signal', 'amber', 'phosphor', 'cyan', 'cobalt', 'vite', 'magenta'] as const
export type AccentId = (typeof ACCENTS)[number]
export type ThemeName = `${Scheme}_${AccentId}`
/** The accent choice: a preset, or `custom` (any hue, generated in the browser: `custom.ts`, T6). */
export type AccentChoice = AccentId | 'custom'
/** A preset theme name, or `dark_custom` / `light_custom`. */
export type ThemeKey = `${Scheme}_${AccentChoice}`

export const DEFAULT_SCHEME: SchemePref = 'system'
export const DEFAULT_ACCENT: AccentId = 'signal'
/** The canonical theme: goldens, OG images and the no-JS fallback. */
export const CANONICAL: ThemeName = 'dark_signal'

export const isScheme = (s: unknown): s is Scheme => s === 'dark' || s === 'light'
export const isSchemePref = (s: unknown): s is SchemePref => s === 'system' || isScheme(s)
export const isAccent = (s: unknown): s is AccentId => (ACCENTS as readonly unknown[]).includes(s)
export const isAccentChoice = (s: unknown): s is AccentChoice => s === 'custom' || isAccent(s)
export function themeName(scheme: Scheme, accent: AccentId): ThemeName
export function themeName(scheme: Scheme, accent: AccentChoice): ThemeKey
export function themeName(scheme: Scheme, accent: AccentChoice): ThemeKey { return `${scheme}_${accent}` }
/** `light_cobalt` → `['light', 'cobalt']` (also accepts `system_cobalt` and `dark_custom`); undefined when either half is unknown. */
export function parseThemeName(s: string | null | undefined): [SchemePref, AccentChoice] | undefined {
  const [a, b] = (s ?? '').split('_')
  return isSchemePref(a) && isAccentChoice(b) ? [a, b] : undefined
}

/**
 * CONTRAST (THEME and TOOLS › THEME): `more` puts `data-contrast="more"` on `<html>`, which takes the same raised
 * roles as the OS `prefers-contrast: more`; `system` leaves it to the OS (which is honoured either way).
 */
export type ContrastPref = 'system' | 'more'
export const isContrastPref = (s: unknown): s is ContrastPref => s === 'system' || s === 'more'
/**
 * A theme rule's selector under CONTRAST: MORE: `<html data-contrast="more">` and everything inside it, at the
 * specificity of the rule itself (the scope goes in `:where()`), so the block written after the base rules wins as the
 * `@media (prefers-contrast: more)` block does.
 */
export const moreSelector = (sel: string): string => sel.split(/,\s*/).map(s => s === ':where(:root)' ? ':where(:root[data-contrast="more"])' : `:where([data-contrast="more"], [data-contrast="more"] *)${s}`).join(', ')
/** `?hue=` of a shared custom theme: a number of degrees (up to 4 digits, decimals rounded), wrapped into 0–359; else undefined. */
export function parseHue(s: string | null | undefined): number | undefined {
  const v = (s ?? '').trim()
  if (!/^-?\d{1,4}(?:\.\d+)?$/.test(v)) return undefined
  return ((Math.round(+v) % 360) + 360) % 360
}
