/**
 * Analytics check (#151), in `pnpm check`. No browser and no network: the real modules (`src/site/analytics.ts`,
 * `src/site/analytics/*`) and the real `posthog-js` run through Vite's SSR loader with a fake project token, on fake
 * browser globals whose `fetch` records every `/ingest` request and answers it. Checks:
 *  - the sanitizer: query strings cut to the view params, payloads (`?p=`, `?make&d=`), `?flags` and hashes gone,
 *    referrers cut to their origin, event properties limited to ids;
 *  - nothing is requested or stored before Allow, nor with Global Privacy Control or Do Not Track (no banner then);
 *  - after Allow: one page view on start and one per navigation (a replaceState that only tidies the URL is not
 *    one), with clean URLs; `track()` sends ids only;
 *  - turning it off stops requests and deletes PostHog's storage; the choice is `dot480:analytics`;
 *  - vercel.json proxies `/ingest` ahead of the page rewrites, and the CSP gains no host.
 * Never talks to PostHog: the fake `fetch` answers everything, and `api_host` is this site's `/ingest`.
 *
 *   npx tsx scripts/site/analytics.ts   → exit 1 on a failure
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createServer } from 'vite'
import { checker } from '../lib/check'
import { cleanProps, cleanReferrer, cleanUrl, scrubEvent } from '../../src/site/analytics/sanitize'

const { assert, done } = checker('analytics')
const ORIGIN = 'https://matrix.test'

// ── the sanitizer ──
assert('analytics: cleanUrl keeps the path and the view params, drops ?p=, ?make&d=, ?flags, theme params and the hash',
  cleanUrl(`${ORIGIN}/light/?board=light&p=SECRET&flags=xray&theme=dark_cyan#x`) === `${ORIGIN}/light/?board=light`
  && cleanUrl(`${ORIGIN}/?make=draw&d=FRAMES`) === `${ORIGIN}/?make=draw` && cleanUrl(`${ORIGIN}/?card=a%20b`) === `${ORIGIN}/`
  && cleanUrl('javascript:alert(1)') === '' && cleanUrl('not a url') === '', cleanUrl(`${ORIGIN}/light/?board=light&p=SECRET#x`))
assert('analytics: a referrer keeps only its origin', cleanReferrer('https://news.example/item?id=1&q=me') === 'https://news.example' && cleanReferrer('') === '$direct' && cleanReferrer('file:///c/x') === '$direct')
const props = cleanProps({ card: 'lv-queen', n: 3, ok: true, text: 'hello there', long: 'x'.repeat(81), Bad: 'a', obj: {} as never, nan: NaN })
assert('analytics: event properties keep ids, numbers and booleans; free text, long strings, odd keys and objects go', JSON.stringify(props) === '{"card":"lv-queen","n":3,"ok":true}', JSON.stringify(props))
const ev = scrubEvent({ properties: { $current_url: `${ORIGIN}/x?p=1`, $referrer: 'https://a.example/q?s=me', $pathname: '/x?p=1', $set_once: { $initial_current_url: `${ORIGIN}/?d=2` } }, $set_once: { $initial_referrer: 'https://b.example/?q=1' } })
assert('analytics: before_send scrubs $current_url, $referrer, $pathname and the $set_once copies',
  JSON.stringify(ev) === JSON.stringify({ properties: { $current_url: `${ORIGIN}/x`, $referrer: 'https://a.example', $pathname: '/x', $set_once: { $initial_current_url: `${ORIGIN}/` } }, $set_once: { $initial_referrer: 'https://b.example' } }), JSON.stringify(ev))

// no token (local builds, CI, forks): nothing at all, before any browser global exists
const bare = await import('../../src/site/analytics/consent')
assert('analytics: with no project token it is unavailable: no banner, no switch, Allow does nothing', bare.analyticsState() === 'unavailable' && /not part of this build/.test(bare.setAnalytics(true)))

// ── a fake browser ──
const g = globalThis as Record<string, unknown>
const store = () => { const m = new Map<string, string>(); return new Proxy({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size } }, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, k) => (typeof k === 'string' && m.has(k) ? { value: m.get(k), enumerable: true, configurable: true } : Reflect.getOwnPropertyDescriptor(t, k)) }) }
const requests: { url: string; body: string }[] = []
const loc = new URL(`${ORIGIN}/light/?flags=xray`)
const listeners = new Map<string, Set<(e: unknown) => void>>()
const el = (): Record<string, unknown> => ({ style: {}, dataset: {}, setAttribute() {}, addEventListener() {}, remove() {}, append() {}, offsetHeight: 120, className: '', innerHTML: '' })
const nav = { userAgent: 'Mozilla/5.0 (probe) Chrome/130', language: 'en', languages: ['en'], doNotTrack: null as string | null, globalPrivacyControl: false, onLine: true }
const location = { get href() { return loc.href }, get pathname() { return loc.pathname }, get search() { return loc.search }, get hash() { return loc.hash }, get host() { return loc.host }, get hostname() { return loc.hostname }, get origin() { return loc.origin }, get protocol() { return loc.protocol }, port: '' }
const history = { state: null, length: 1, pushState(_s: unknown, _t: string, u?: string) { if (u) loc.href = new URL(u, loc.href).href }, replaceState(_s: unknown, _t: string, u?: string) { if (u) loc.href = new URL(u, loc.href).href } }
let banners = 0
const document = { cookie: '', title: 'MATRIX', referrer: 'https://news.example/item?id=1', readyState: 'complete', visibilityState: 'visible', hidden: false, location,
  body: { append() { banners++ } }, documentElement: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementsByTagName: () => [], addEventListener() {}, removeEventListener() {} }
const fakeFetch = async (url: string | URL, init?: { body?: unknown }) => {
  const b = init?.body
  // a batch is JSON, gzipped (the SDK's native gzip, sent as an ArrayBuffer) or not
  const bytes = typeof b === 'string' ? Buffer.from(b) : b instanceof ArrayBuffer ? Buffer.from(b) : ArrayBuffer.isView(b) ? Buffer.from(b.buffer, b.byteOffset, b.byteLength) : Buffer.alloc(0)
  requests.push({ url: String(url), body: (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString() })
  return new Response('{"status":1}', { status: 200, headers: { 'Content-Type': 'application/json' } })
}
Object.assign(g, { window: g, self: g, document, location, history, localStorage: store(), sessionStorage: store(), screen: { width: 1440, height: 900 }, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  addEventListener: (t: string, f: (e: unknown) => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(f) },
  removeEventListener: (t: string, f: (e: unknown) => void) => listeners.get(t)?.delete(f), dispatchEvent: () => true,
  requestIdleCallback: (f: () => void) => setTimeout(f, 0), XMLHttpRequest: undefined })
Object.defineProperty(g, 'navigator', { value: nav, configurable: true, writable: true })
g.fetch = fakeFetch

const ingest = () => requests.filter(r => new URL(r.url, ORIGIN).pathname.startsWith('/ingest'))
/** The events in the recorded batches (a body is JSON, or `data=` base64 JSON). */
function events(): { event: string; properties: Record<string, unknown> }[] {
  return ingest().flatMap(r => {
    let t = r.body
    if (t.startsWith('data=')) t = Buffer.from(decodeURIComponent(t.slice(5)), 'base64').toString()
    try { const j = JSON.parse(t); return Array.isArray(j) ? j : j.batch ?? [j] } catch { return [] }
  })
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const settle = async (n: number) => { const end = Date.now() + 6000; while (Date.now() < end && events().filter(e => e.event === '$pageview').length < n) await sleep(100) }
const phKeys = () => Object.keys(g.localStorage as object).filter(k => !k.startsWith('dot480:'))

process.env.VITE_POSTHOG_PROJECT_TOKEN = 'phc_probe_not_a_real_token'
const vite = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  type Consent = typeof import('../../src/site/analytics/consent')
  type Shim = typeof import('../../src/site/analytics')
  const shim = await vite.ssrLoadModule('/src/site/analytics.ts') as Shim
  const consent = await vite.ssrLoadModule('/src/site/analytics/consent.ts') as Consent

  // GPC, then DNT: off, no banner, nothing sent or stored
  nav.globalPrivacyControl = true
  assert('analytics: GPC: blocked, and Allow is refused', consent.analyticsState() === 'blocked' && /stays off/.test(consent.setAnalytics(true)))
  nav.globalPrivacyControl = false; nav.doNotTrack = '1'
  consent.start(); shim.track('card_action', { card: 'x' }); await sleep(300)
  assert('analytics: DNT: blocked, no banner, nothing requested or stored', consent.analyticsState() === 'blocked' && banners === 0 && !ingest().length && !phKeys().length && (g.localStorage as Storage).getItem(consent.CONSENT_KEY) === null)
  nav.doNotTrack = null

  // no choice yet: the banner, and nothing else
  consent.start(); shim.track('card_action', { card: 'x' }); await sleep(500)
  assert('analytics: before Allow: the banner shows, nothing is requested or stored', consent.analyticsState() === 'unset' && banners === 1 && !requests.length && !phKeys().length, `${requests.length} requests, keys ${phKeys()}`)

  // Allow
  consent.setAnalytics(true)
  await settle(1)
  history.replaceState(null, '', '/light/') // the app tidying ?flags away: not a navigation
  history.pushState(null, '', '/lock/?board=lock&p=PROGRAM#frag')
  history.pushState(null, '', '/?make=draw&d=FRAMES')
  shim.track('card_action', { action: 'link', card: 'lv-queen', note: 'typed text here' })
  await settle(3); await sleep(3500)
  const pv = events().filter(e => e.event === '$pageview').map(e => String(e.properties.$current_url))
  assert('analytics: after Allow: one page view on start and one per navigation, the URL tidy skipped', JSON.stringify(pv) === JSON.stringify([`${ORIGIN}/light/`, `${ORIGIN}/lock/?board=lock`, `${ORIGIN}/?make=draw`]), pv.join(' '))
  const urls = events().flatMap(e => Object.entries(e.properties).filter(([k, v]) => typeof v === 'string' && /url|referrer/i.test(k)).map(([, v]) => v as string))
  assert('analytics: no sent URL or referrer has a payload, ?flags or a hash', urls.length > 0 && urls.every(u => !/[?&](p|d|flags)=|#|item\?id/.test(u)), [...new Set(urls)].join(' '))
  const ca = events().find(e => e.event === 'card_action')
  assert('analytics: track() sends the event with ids only (no free text), and the stored choice is dot480:analytics=on', ca?.properties.card === 'lv-queen' && ca.properties.action === 'link' && !('note' in ca.properties) && (g.localStorage as Storage).getItem('dot480:analytics') === 'on', `${ca?.properties.action} ${ca?.properties.card}`)
  assert('analytics: requests go to this site\'s /ingest only, with no /flags call or script', requests.every(r => r.url.startsWith('/ingest/') || r.url.startsWith(`${ORIGIN}/ingest/`)) && !requests.some(r => /\/flags|\/decide|\/static\/|\.js\b/.test(r.url)), [...new Set(requests.map(r => new URL(r.url, ORIGIN).pathname))].join(' '))
  assert('analytics: after Allow PostHog keeps its state in localStorage, with no cookie', phKeys().length > 0 && !/ph_/.test(document.cookie), phKeys().join(' '))

  // off
  consent.setAnalytics(false); await sleep(200)
  const before = requests.length
  history.pushState(null, '', '/levels/'); shim.track('board_changed', { board: 'levels' }); await sleep(3800)
  assert('analytics: turning it off stops requests and deletes PostHog\'s storage', requests.length === before && !phKeys().length && (g.localStorage as Storage).getItem('dot480:analytics') === 'off', `${requests.length - before} new, keys ${phKeys()}`)
} finally {
  await vite.close()
}

// ── vercel.json ──
interface Rule { source: string; destination: string }
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Rule[]; headers: { headers: { key: string; value: string }[] }[] }
const at = (s: string) => vercel.rewrites.findIndex(r => r.source === s)
assert('analytics: vercel.json proxies /ingest/static and /ingest to PostHog US, ahead of every other rewrite',
  at('/ingest/static/:path*') === 0 && at('/ingest/:path*') === 1 && vercel.rewrites[0].destination === 'https://us-assets.i.posthog.com/static/:path*' && vercel.rewrites[1].destination === 'https://us.i.posthog.com/:path*')
const csp = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')?.value ?? ''
assert('analytics: the CSP names no PostHog host (the proxy keeps it same-origin)', !/posthog/i.test(csp))

done('all analytics checks passed')
