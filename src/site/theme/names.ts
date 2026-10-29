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
