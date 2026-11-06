/**
 * Analytics consent (#151): the visitor's choice, the banner, and the switch the TOOLS sheet and the palette show.
 * Loaded once the page is idle (`../analytics.ts`), and with the command layer.
 *
 * Off until the visitor clicks Allow. The choice is `localStorage['dot480:analytics']`: `on` or `off`; anything
 * else counts as no choice. Global Privacy Control or Do Not Track keep it off, with no banner. So do the
 * `analytics` flag off and a build with no project token.
 */
import { flag } from '../flags'
import { setSink } from '../analytics'

export const CONSENT_KEY = 'dot480:analytics'
const TOKEN = import.meta.env?.VITE_POSTHOG_PROJECT_TOKEN as string | undefined
const loadPostHog = import.meta.env?.VITE_FLAG_ANALYTICS === 'kill' || !import.meta.env?.VITE_POSTHOG_PROJECT_TOKEN ? null : () => import('./posthog')
const loadBanner = import.meta.env?.VITE_FLAG_ANALYTICS === 'kill' || !import.meta.env?.VITE_POSTHOG_PROJECT_TOKEN ? null : () => import('./banner')

/** `unavailable`: no token, killed or flagged off (no controls at all); `blocked`: GPC or DNT; `unset`: no choice yet. */
export type AnalyticsState = 'unavailable' | 'blocked' | 'unset' | 'on' | 'off'

/** The browser asks sites not to track: Global Privacy Control, or Do Not Track. */
export function privacySignal(): boolean {
  if (typeof navigator === 'undefined') return false
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }, w = globalThis as { doNotTrack?: string }
  return n.globalPrivacyControl === true || [n.doNotTrack, w.doNotTrack, n.msDoNotTrack].some(v => v === '1' || v === 'yes')
}

function stored(): 'on' | 'off' | null {
  try { const v = localStorage.getItem(CONSENT_KEY); return v === 'on' || v === 'off' ? v : null } catch { return null }
}

export function analyticsState(): AnalyticsState {
  if (!loadPostHog || !TOKEN || !flag('analytics')) return 'unavailable'
  if (privacySignal()) return 'blocked'
  return stored() ?? 'unset'
}

const listeners = new Set<() => void>()
export function subscribeAnalytics(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
const notify = () => listeners.forEach(l => l())

let closeBanner: (() => void) | null = null
let running = false
let started: ReturnType<NonNullable<typeof loadPostHog>> | null = null

/** Loads PostHog and starts it (`flush`: send what was queued before it loaded), or stops it. */
async function apply(flush: boolean) {
  const on = analyticsState() === 'on'
  if (on === running || !loadPostHog || !TOKEN) return
  running = on
  if (!on) { setSink(null); if (started) (await started).stop(); return }
  const ph = await (started ??= loadPostHog())
  if (!running) return // turned off while it loaded
  ph.start(TOKEN)
  setSink(ph.capture, flush)
}

/**
 * The visitor's choice, from the banner, TOOLS or the palette. Returns the line to show them. Under GPC or DNT it
 * stays off and says why.
 */
export function setAnalytics(on: boolean): string {
  const s = analyticsState()
  if (s === 'unavailable') return 'analytics is not part of this build'
  if (s === 'blocked') return 'analytics stays off: your browser asks sites not to track you'
  try { localStorage.setItem(CONSENT_KEY, on ? 'on' : 'off') } catch { /* private mode: this page only */ }
  closeBanner?.(); closeBanner = null
  void apply(false)
  notify()
  return on ? 'analytics on: anonymous page views and button names' : 'analytics off: nothing is sent, and its data here is deleted'
}

/** From `initAnalytics()`, once per page: start, stay off, or ask. */
export function start() {
  // a choice made in another tab
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== CONSENT_KEY && e.key !== null) return
    if (analyticsState() !== 'unset') { closeBanner?.(); closeBanner = null }
    void apply(false); notify()
  })
  const s = analyticsState()
  if (s === 'on') return void apply(true)
  setSink(null) // events from before a choice are dropped, not sent later
  if (s === 'unset' && loadBanner) void loadBanner().then(m => { if (analyticsState() === 'unset') closeBanner = m.showBanner(setAnalytics) })
}
