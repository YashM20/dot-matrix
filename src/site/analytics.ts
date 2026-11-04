/**
 * Analytics (#151), the eager part: `track()` and `initAnalytics()`, and nothing else in first-load JS. PostHog is
 * opt-in: `./analytics/consent.ts` loads once the page is idle, shows the banner or reads the stored choice, and only
 * after Allow does `./analytics/posthog.ts` load `posthog-js` (its own chunk) and send anything.
 *
 * With no `VITE_POSTHOG_PROJECT_TOKEN` (local builds, CI, forks), or with `VITE_FLAG_ANALYTICS=kill`, both tests
 * below are constants: the bundler drops the lazy chunks and `track()` does nothing. The test stays inline at the
 * import so the bundler sees it.
 */
export type TrackProps = Record<string, string | number | boolean | undefined>
type Sink = (name: string, props?: TrackProps) => void

const load = import.meta.env?.VITE_FLAG_ANALYTICS === 'kill' || !import.meta.env?.VITE_POSTHOG_PROJECT_TOKEN ? null : () => import('./analytics/consent')
const queue: [string, TrackProps | undefined][] = []
let sink: Sink | null = null

/** One event: a fixed name and ids only (`./analytics/sanitize.ts` drops anything else). Queued (40 at most) until PostHog is ready. */
export function track(name: string, props?: TrackProps) {
  if (!load) return
  if (sink) sink(name, props)
  else if (queue.length < 40) queue.push([name, props])
}

/** For the consent module: route events to `next` (`flush`: send the queued ones first), or drop them all (`null`). */
export function setSink(next: Sink | null, flush = false) {
  const q = queue.splice(0)
  sink = next ?? (() => {})
  if (next && flush) for (const [n, p] of q) next(n, p)
}

/** Called once by each page's entry (the app, the blog, the lab). */
export function initAnalytics() {
  if (!load || typeof window === 'undefined') return
  const go = () => void load().then(m => m.start(), () => {})
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}
