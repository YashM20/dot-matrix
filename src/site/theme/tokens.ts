/**
 * Engine tokens of a named theme from the generated table (`dots.ts`), without a DOM: for the scripts
 * (`golden --theme-parity`, `scripts/site/theme.ts`, the browser probe's expected values) and for any lazy
 * code that wants a theme the page doesn't show. The site's first load doesn't import this: `themeTokens()`
 * in `theme.ts` reads the same values from the theme CSS (themes.css), which the page already has.
 */
import type { ThemeTokens } from '../../engine/types'
import { dot480 } from '../../engine/theme/tokens'
import { DOT_TABLE, PAPER } from './dots'
import { themeName, type AccentId, type Scheme, type ThemeName } from './names'

const memo = new Map<ThemeName, ThemeTokens>()
/** The scheme's preset (`dot480` dark, `PAPER` light) with the theme's accent and tinted surfaces; `dark_signal` is `dot480` itself. */
export function tokensOf(scheme: Scheme, accent: AccentId): ThemeTokens {
  const name = themeName(scheme, accent)
  if (name === 'dark_signal') return dot480
  let t = memo.get(name)
  if (!t) memo.set(name, t = { ...(scheme === 'dark' ? dot480 : PAPER), ...DOT_TABLE[name] })
  return t
}
