/**
 * The likes routes (#169) as plain `Request → Response` functions over injected `Deps`, so the checks run them
 * against the in-memory store. With likes off (`deps` null) every route is a cheap 404 that never reaches the store.
 *
 * | route | method | does | cache |
 * | `/api/like` | POST `{ item | program, on, key }` | like / unlike | none |
 * | `/api/visit` | POST `{ remember: true }` | issue the voter cookie, re-sign it once a day | none |
 * | `/api/forget` | POST `{}` | remove this browser's likes, clear the cookie | none |
 * | `/api/likes/widgets` | GET | every widget count | 5 min at the CDN, no cookie |
 * | `/api/likes/p/<64 hex>` | GET | one program's count | 5 min; a zero 10 min |
 * | `/api/likes/cron` | GET, `Authorization: Bearer $CRON_SECRET` | the daily job | none |
 *
 * Writes check `Origin` and `Sec-Fetch-Site: same-origin`, need `Content-Type: application/json`, cap the body at
 * 1 KB (4.5 KB with a program) and send no CORS headers. Errors are short JSON with no store details. Nothing here
 * logs a request, an IP, a cookie or a body.
 */
import { clearCookie, newVoter, readVoter, setCookie, visit } from './cookie.js'
import { hmac, sameString } from './crypto.js'
import { daily, forget, isRevoked, like, mayIssue, programCount, widgetCounts, type Deps } from './likes.js'
import { clientNetwork } from './net.js'
import { StoreError } from './store.js'

export type Route = 'like' | 'visit' | 'forget' | 'widgets' | 'program' | 'cron'

const MAX_BODY = 1024, MAX_PROGRAM_BODY = 4608
const KEY_RE = /^[A-Za-z0-9_-]{8,40}$/, WIDGET_RE = /^w:([0-9a-hjkmnp-tv-z]{8})$/, HEX_RE = /^[0-9a-f]{64}$/
const NO_STORE = 'no-store'
const CACHED = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600'

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': NO_STORE, ...headers } })
}
const fail = (status: number, error: string, headers?: Record<string, string>) => json(status, { error }, headers)
export const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=300' } })

/** Same-origin JSON write, or the error response. */
function writeCheck(req: Request): Response | null {
  if (req.method !== 'POST') return fail(405, 'method', { allow: 'POST' })
  const origin = req.headers.get('origin'), self = new URL(req.url).origin
  if (!origin || origin !== self || req.headers.get('sec-fetch-site') !== 'same-origin') return fail(403, 'origin')
  if (!/^application\/json(\s*;|$)/i.test(req.headers.get('content-type') ?? '')) return fail(415, 'type')
  return null
}

/** The body as text, or null past `max` bytes (stops reading there). */
async function body(req: Request, max: number): Promise<string | null> {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > max) return null
  if (!req.body) return ''
  const reader = req.body.getReader(), parts: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.length
    if (n > max) { await reader.cancel().catch(() => {}); return null }
    parts.push(value)
  }
  const all = new Uint8Array(n)
  let o = 0
  for (const p of parts) { all.set(p, o); o += p.length }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(all) } catch { return null }
}

async function jsonBody(req: Request, max: number): Promise<Record<string, unknown> | Response> {
  const text = await body(req, max)
  if (text === null) return fail(413, 'size')
  try {
    const o: unknown = JSON.parse(text)
    return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : fail(400, 'body')
  } catch { return fail(400, 'body') }
}

const hash = (d: Deps, kind: 'v' | 'n', s: string) => hmac(d.cfg.hashKey, `${kind}|${s}`, 22).then(h => `${kind}:${h}`)
const paused = () => fail(503, 'paused')

async function onLike(req: Request, d: Deps): Promise<Response> {
  const b = await jsonBody(req, MAX_PROGRAM_BODY)
  if (b instanceof Response) return b
  const keys = Object.keys(b)
  if (keys.some(k => !['item', 'program', 'on', 'key'].includes(k)) || typeof b.on !== 'boolean' || typeof b.key !== 'string' || !KEY_RE.test(b.key)) return fail(400, 'body')
  let item: string
  if (typeof b.item === 'string' && b.program === undefined) {
    const m = WIDGET_RE.exec(b.item)
    if (!m || !d.site.widgetUids.has(m[1])) return fail(400, 'item')
    if (JSON.stringify(b).length > MAX_BODY) return fail(413, 'size')
    item = b.item
  } else if (b.item === undefined && b.program && typeof b.program === 'object') {
    try { item = `p:${await d.site.programKey(b.program)}` } catch { return fail(400, 'program') }
  } else return fail(400, 'item')
  const net = clientNetwork(req)
  if (!net) return fail(400, 'network')
  if (d.cfg.botid && await d.bot(req)) return fail(403, 'bot')
  const v = await readVoter(req, d.cfg.cookieKey)
  const out = await like(d, { item, on: b.on, key: b.key, net: await hash(d, 'n', net), voter: v ? { field: await hash(d, 'v', v.id), days: v.days } : null })
  if (out.k === 'ok') return json(200, { on: out.on, soon: out.soon, ...(out.already && { already: true }) })
  return out.k === 'limit' ? fail(429, 'limit') : out.k === 'busy' ? fail(409, 'busy') : paused()
}

async function onVisit(req: Request, d: Deps): Promise<Response> {
  const b = await jsonBody(req, MAX_BODY)
  if (b instanceof Response) return b
  if (b.remember !== true || Object.keys(b).length !== 1) return fail(400, 'body')
  const now = d.now(), v = await readVoter(req, d.cfg.cookieKey)
  if (v && !(await isRevoked(d, await hash(d, 'v', v.id)))) {
    const next = visit(v, now)
    return json(200, { ok: true }, next ? { 'set-cookie': await setCookie(d.cfg.cookieKey, next) } : {})
  }
  const net = clientNetwork(req)
  if (!net) return fail(400, 'network')
  if (d.cfg.botid && await d.bot(req)) return fail(403, 'bot')
  const may = await mayIssue(d, await hash(d, 'n', net))
  if (may !== 'ok') return may === 'limit' ? fail(429, 'limit') : paused()
  return json(200, { ok: true }, { 'set-cookie': await setCookie(d.cfg.cookieKey, newVoter(now)) })
}

async function onForget(req: Request, d: Deps): Promise<Response> {
  const b = await jsonBody(req, MAX_BODY)
  if (b instanceof Response) return b
  const v = await readVoter(req, d.cfg.cookieKey)
  if (v && (await forget(d, await hash(d, 'v', v.id))) === 'paused') return paused()
  return json(200, { ok: true }, { 'set-cookie': clearCookie() })
}

/** The likes route `r` for `req`; `deps` null means likes are off. */
export async function handle(r: Route, req: Request, d: Deps | null): Promise<Response> {
  if (!d) return notFound()
  const url = new URL(req.url)
  try {
    switch (r) {
      case 'like': return writeCheck(req) ?? await onLike(req, d)
      case 'visit': return writeCheck(req) ?? await onVisit(req, d)
      case 'forget': return writeCheck(req) ?? await onForget(req, d)
      case 'widgets': {
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'method', { allow: 'GET' })
        if (url.pathname.replace(/\/$/, '') !== '/api/likes/widgets' || url.search) return fail(400, 'query')
        const w = await widgetCounts(d)
        return w === 'paused' ? fail(503, 'paused', { 'cache-control': 'public, max-age=0, s-maxage=60' }) : json(200, { w }, { 'cache-control': CACHED })
      }
      case 'program': {
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'method', { allow: 'GET' })
        const m = /^\/api\/likes\/p\/([^/]+)\/?$/.exec(url.pathname), hex = m?.[1] ?? ''
        // Vercel may pass the file route's `[hash]` segment back as `?hash=`: that one is allowed, nothing else
        const q = [...url.searchParams]
        if (!HEX_RE.test(hex) || (url.search && !(q.length === 1 && q[0][0] === 'hash' && q[0][1] === hex))) return fail(400, 'query')
        const n = await programCount(d, hex)
        return n === 'paused' ? fail(503, 'paused', { 'cache-control': 'public, max-age=0, s-maxage=60' })
          : json(200, { n }, { 'cache-control': n > 0 ? CACHED : 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' })
      }
      case 'cron': {
        const want = d.cfg.cronSecret
        if (!want) return notFound()
        if (!sameString(req.headers.get('authorization') ?? '', `Bearer ${want}`)) return fail(401, 'auth')
        return json(200, await daily(d))
      }
    }
  } catch (e) {
    return e instanceof StoreError ? paused() : fail(500, 'error')
  }
}
