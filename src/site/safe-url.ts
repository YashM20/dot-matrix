/**
 * Same-origin navigation and safe URL decoding (#148). Every `location.assign` / `location.replace` /
 * `history.pushState` / `history.replaceState` and every `decodeURIComponent` on URL input in `src/` goes through
 * here; `scripts/site/urls.ts` (in `pnpm check`) fails on a raw call anywhere else.
 *
 * A path that starts with two slashes (`//evil.example`, or `/\evil.example`, which a browser reads the same way) is
 * another host to the URL parser: `location.assign(location.pathname + query)` on such a page leaves the site, and
 * `history.replaceState` with it throws. `localUrl` collapses the leading slashes, resolves the target against the
 * page, and falls back to `/` for anything that still names another origin.
 */

/** The browser's URL parser drops tabs and newlines anywhere and C0 controls / spaces at the ends: so do we, first. */
function strip(s: string) {
  s = s.replace(/[\t\n\r]/g, '')
  let a = 0, b = s.length
  while (a < b && s.charCodeAt(a) <= 0x20) a++
  while (b > a && s.charCodeAt(b - 1) <= 0x20) b--
  return s.slice(a, b)
}
/** `//a`, `/\a`, `\\a` → `/a` (a path's leading run of slashes, either way round, as one). */
const collapse = (path: string) => path.replace(/^[\\/]+/, '/')

/**
 * `target` (a path, `?query`, `#hash`, or a URL) as a same-origin `path?query#hash`, resolved against `base` (the
 * page). A target on another origin, or one the parser rejects, gives `fallback`.
 */
export function localUrl(target: string | URL, base: string = location.href, fallback = '/'): string {
  try {
    const here = new URL(base)
    const u = new URL(collapse(strip(String(target))), here.origin + collapse(here.pathname) + here.search)
    if (u.origin !== here.origin) return fallback
    return collapse(u.pathname) + u.search + u.hash
  } catch { return fallback }
}

/** `location.assign` / `location.replace` to a same-origin URL only. */
export const assign = (to: string | URL) => location.assign(localUrl(to))
export const replace = (to: string | URL) => location.replace(localUrl(to))
/** `history.pushState` / `replaceState` to a same-origin URL only (`state` as in the History API). */
export const pushUrl = (to: string | URL, state: unknown = null) => history.pushState(state, '', localUrl(to))
export const replaceUrl = (to: string | URL, state: unknown = history.state) => history.replaceState(state, '', localUrl(to))

/** A page opened at `//path` or `/\path`: show it at `/path` before anything reads `location.pathname`. */
export function cleanAddress() {
  if (!/^[\\/]{2}/.test(location.pathname)) return
  try { replaceUrl(location.href) } catch { /* no history (a sandboxed frame) */ }
}

/** `decodeURIComponent`, or `undefined` for a bad escape (`%E0`, `%zz`) instead of a throw. */
export function safeDecode(s: string): string | undefined {
  try { return decodeURIComponent(s) } catch { return undefined }
}

/** Scrolls to the element a `#hash` names (decoded); a bad escape or a missing id does nothing. */
export function scrollToHash(hash: string = location.hash) {
  const id = hash.length > 1 ? safeDecode(hash.slice(1)) : undefined
  if (id) document.getElementById(id)?.scrollIntoView()
}
