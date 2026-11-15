/**
 * Stale deploys: Vercel serves only the current deploy's hashed `/assets/*`, so a tab opened before a deploy gets
 * 404s for chunks it has not fetched yet. Vite fires `vite:preloadError` when a lazy import fails; the page then
 * reloads once to pick up the new deploy. A sessionStorage stamp allows one reload per `GAP_MS`, so a chunk that
 * stays missing shows the page's error state (`LoadBoundary`, `RootBoundary`) instead of a reload loop.
 * Offline, a failed import is the network, not a deploy: a reload would only swap the page for the browser's
 * offline screen, so the page keeps its error state and the stamp stays unused (docs/STATE-MACHINES.md A2).
 * A prefetch (src/site/prefetch.ts) runs inside `prefetching`: while one is loading, a failed chunk reloads nothing, so a
 * stale tab never reloads under a hover. The prefetch leaves no failure behind, so the open fetches the chunk again,
 * and that failure reloads as before.
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

let quiet = 0
/** Load a chunk ahead of an open: a `vite:preloadError` while it runs reloads nothing (the open decides). */
export function prefetching<T>(load: () => Promise<T>): Promise<T> {
  quiet++
  const p = Promise.resolve().then(load), end = () => { quiet-- }
  // Vite fires the event inside the import's own chain, so it lands before `end`
  p.then(end, end)
  return p
}

// the import still rejects (no preventDefault), so a page that can't reload shows its error state
if (typeof window !== 'undefined') window.addEventListener('vite:preloadError', () => { if (!quiet) reloadForStaleChunk() })
