/**
 * Stale deploys: Vercel serves only the current deploy's hashed `/assets/*`, so a tab opened before a deploy gets
 * 404s for chunks it has not fetched yet. Vite fires `vite:preloadError` when a lazy import fails; the page then
 * reloads once to pick up the new deploy. A sessionStorage stamp allows one reload per `GAP_MS`, so a chunk that
 * stays missing shows the page's error state (`LoadBoundary`, `RootBoundary`) instead of a reload loop.
 * First-load code, kept tiny; each entry point imports it (src/main.tsx, src/blog/main.tsx, src/lab/main.tsx).
 */
const KEY = 'dot480:stale-reload'
const GAP_MS = 5 * 60_000

/** Reload once for a failed chunk; false when this tab already reloaded within `GAP_MS` (or storage is off). */
export function reloadForStaleChunk(now = Date.now()): boolean {
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
