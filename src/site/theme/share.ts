/**
 * Share-link opt-in (docs/LAYOUT-THEME-PLAN.md §4 Picker › Links): when the visitor turns it on (THEME popover,
 * TOOLS › THEME), the links the site copies or shares (⌘K "Copy deep link", TOOLS › SHARE, the card's LINK, the
 * widget page's LINK / SHORT / SHARE) carry `?theme=<scheme>_<accent>`: the theme they see, `system` resolved. A custom
 * hue's links carry `?scheme=<scheme>&hue=<0-359>` (the recipient's store makes the same CSS from the hue), and a
 * picked CONTRAST: MORE adds `&contrast=more` (the OS setting stays the recipient's own).
 * Off by default, so a plain link opens in the recipient's own theme. Persisted in localStorage `dot480:share-theme`.
 */
import { getTheme } from './theme'

const KEY = 'dot480:share-theme'
let on = (() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })()
const listeners = new Set<() => void>()

export const shareTheme = (): boolean => on
export function subscribeShareTheme(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }
export function setShareTheme(next: boolean): void {
  on = next
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* storage blocked */ }
  for (const l of listeners) l()
}

/** `url` as it should be shared: with the visitor's theme when they opted in (replacing any theme params), else as is. */
export function withTheme(url: string): string {
  if (!on) return url
  const u = new URL(url, location.href)
  const t = getTheme()
  for (const p of ['scheme', 'accent', 'theme', 'hue', 'contrast']) u.searchParams.delete(p)
  if (t.accent === 'custom' && t.custom) { u.searchParams.set('scheme', t.resolved); u.searchParams.set('hue', String(t.custom.hue)) }
  else u.searchParams.set('theme', t.name)
  if (t.contrast === 'more') u.searchParams.set('contrast', 'more')
  return u.toString()
}
