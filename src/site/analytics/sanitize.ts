/**
 * What may leave the browser (#151). Plain functions, no DOM: `scripts/site/analytics.ts` runs them in Node.
 *  - URLs keep their origin, their path (capped) and a few view params with id-like values. Everything else goes:
 *    `?p=` programs, `?make&d=` drawings, `?flags`, theme params, the hash.
 *  - A referrer keeps only its origin.
 *  - Event properties keep short ids, numbers and booleans. Free text can't pass the id pattern.
 */
import type { TrackProps } from '../analytics'

/** The query params a page view keeps: which view, board and card it shows. */
export const KEEP_PARAMS = ['board', 'tab', 'make', 'card', 'about'] as const
const PARAM_VALUE = /^[\w-]{0,40}$/
const ID = /^[\w.:@/-]{1,80}$/
const NAME = /^[a-z][a-z_]{0,39}$/

/** `raw` with its query cut to `KEEP_PARAMS` (id-like values only) and no hash; '' when it doesn't parse. */
export function cleanUrl(raw: string): string {
  let u: URL
  try { u = new URL(raw) } catch { return '' }
  if (!/^https?:$/.test(u.protocol)) return ''
  const q = new URLSearchParams()
  for (const k of KEEP_PARAMS) { const v = u.searchParams.get(k); if (v !== null && PARAM_VALUE.test(v)) q.set(k, v) }
  const s = q.toString()
  return u.origin + u.pathname.slice(0, 200) + (s ? `?${s}` : '')
}

/** A referrer as its origin only ('$direct' when there is none, as PostHog writes it). */
export function cleanReferrer(raw: string): string {
  if (!raw || raw === '$direct') return '$direct'
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.origin : '$direct' } catch { return '$direct' }
}

/** Event properties: id-shaped strings, finite numbers and booleans under short snake_case keys; the rest dropped. */
export function cleanProps(p: TrackProps | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!p || typeof p !== 'object') return out
  for (const [k, v] of Object.entries(p)) {
    if (!NAME.test(k)) continue
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && ID.test(v))) out[k] = v
  }
  return out
}

export const isEventName = (n: unknown): n is string => typeof n === 'string' && NAME.test(n)

type Bag = Record<string, unknown>
/** Every URL-like value PostHog adds itself (`$current_url`, `$referrer`, the `$initial_…` and `$session_entry_…` copies). */
function scrubBag(o: unknown) {
  if (!o || typeof o !== 'object') return
  const b = o as Bag
  for (const [k, v] of Object.entries(b)) {
    if (typeof v !== 'string') continue
    if (/referrer/i.test(k)) b[k] = cleanReferrer(v)
    else if (/url/i.test(k) || /^https?:\/\//i.test(v)) b[k] = cleanUrl(v)
    else if (/pathname/i.test(k)) b[k] = v.split(/[?#]/)[0].slice(0, 200)
  }
}

/** PostHog's `before_send`: scrubs the event's own properties and its `$set` / `$set_once`. */
export function scrubEvent<T extends { properties?: unknown; $set?: unknown; $set_once?: unknown } | null>(ev: T): T {
  if (!ev) return ev
  scrubBag(ev.properties)
  scrubBag(ev.$set)
  scrubBag(ev.$set_once)
  if (ev.properties && typeof ev.properties === 'object') for (const k of ['$set', '$set_once']) scrubBag((ev.properties as Bag)[k])
  return ev
}

/** PostHog's own keys in this browser's storage (`ph_<token>_posthog`, `__ph_opt_in_out_<token>`, …). */
export const isPostHogKey = (k: string) => /^(_{0,2}ph_|posthog)/i.test(k)
