/**
 * Stale deploys: Vercel serves only the current deploy's hashed `/assets/*`, so a tab opened before a deploy gets
 * 404s for chunks it has not fetched yet. Vite fires `vite:preloadError` when a lazy import fails; the page then
 * reloads once to pick up the new deploy. A sessionStorage stamp allows one reload per `GAP_MS`, so a chunk that
 * stays missing shows the page's error state (`LoadBoundary`, `RootBoundary`) instead of a reload loop.
 * Offline, a failed import is the network, not a deploy: a reload would only swap the page for the browser's
 * offline screen, so the page keeps its error state and the stamp stays unused (docs/STATE-MACHINES.md A2).
 * First-load code, kept tiny; each entry point imports it (src/main.tsx, src/blog/main.tsx, src/lab/main.tsx).
 */
const KEY = 'dot480:stale-reload'
const GAP_MS = 5 * 60_000

/** Reload once for a failed chunk; false when offline, or this tab already reloaded within `GAP_MS` (or storage is off). */
export function reloadForStaleChunk(now = Date.now()): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0
    if (now - last < GAP_MS) return false
    sessionStorage.setItem(KEY, String(now))
  } catch { return false }
  location.reload()
  return true
}

// the import still rejects (no preventDefault), so a page that can't reload shows its error state
if (typeof window !== 'undefined') window.addEventListener('vite:preloadError', () => { reloadForStaleChunk() })
