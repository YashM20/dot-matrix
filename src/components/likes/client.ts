/**
 * The likes client (#169): API calls, this browser's choice and its own likes. Plain module, no React.
 *  - Every call times out after 1.5 s (a like or visit gets 2.5 s more for BotID's challenge, which runs first) and
 *    is never retried; after a failure the API rests (15 s, doubling, ≤ 5 min).
 *  - Counts load once per page view: one cached read for every widget, one per program.
 *  - `localStorage['dot480:likes']` keeps the remember choice ("r" / "o"), the last day a remembered browser
 *    checked in, and the items liked here (so a like shows at once). The voter cookie itself is HttpOnly and set by
 *    the server; this module never sees it. Every change is a read-modify-write of what is stored now (`updateLocal`),
 *    and a `storage` event from another tab drops the cached copy, so two tabs never write over each other's likes
 *    (docs/STATE-MACHINES.md A5).
 *  - BotID loads on first use (`ensureBot`), not in the first load.
 */
import type { SharedProgram } from '../../lib/share'

export type Fail = 'off' | 'paused' | 'limit'
export type Result<T> = { ok: true; body: T } | { ok: false; why: Fail }
export type Program = Pick<SharedProgram, 'src' | 'grid' | 'lattice' | 'tone'>

const KEY = 'dot480:likes', TIMEOUT_MS = 1500, CHALLENGE_MS = 2500
let restUntil = 0, failures = 0

async function api<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  if (Date.now() < restUntil) return { ok: false, why: 'paused' }
  try {
    const ms = TIMEOUT_MS + (init?.method === 'POST' ? CHALLENGE_MS : 0)
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('timeout')), ms) })
    const res = await Promise.race([fetch(`/api/${path}`, { ...init, credentials: 'same-origin', signal: AbortSignal.timeout(ms) }), late]).finally(() => clearTimeout(timer))
    if (res.status === 404) return { ok: false, why: 'off' }
    if (res.status === 429) return { ok: false, why: 'limit' }
    if (!res.ok) throw new Error(String(res.status))
    failures = 0
    return { ok: true, body: await res.json() as T }
  } catch {
    failures++
    restUntil = Date.now() + Math.min(300_000, 15_000 * 2 ** (failures - 1))
    return { ok: false, why: 'paused' }
  }
}
const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

let widgets: Promise<Result<{ w: Record<string, number> }>> | undefined
const programs = new Map<string, Promise<Result<{ n: number }>>>()

/** An item's public count: `w:<uid>` from the one widgets read, `p:<hex>` from its own read. */
export async function countOf(item: string): Promise<Result<number>> {
  if (item.startsWith('w:')) {
    const r = await (widgets ??= api('likes/widgets'))
    if (!r.ok) widgets = undefined
    return r.ok ? { ok: true, body: Number(r.body.w?.[item.slice(2)] ?? 0) || 0 } : r
  }
  const hex = item.slice(2)
  let p = programs.get(hex)
  if (!p) programs.set(hex, p = api(`likes/p/${hex}`))
  const r = await p
  if (!r.ok) programs.delete(hex)
  return r.ok ? { ok: true, body: Number(r.body.n) || 0 } : r
}

/** `p:<hex>` for a program (loads the IR parser, already in the editor's chunk). */
export const programItem = (p: Program) => import('../../lib/likes/site').then(m => m.programKey(p)).then(k => `p:${k}`)

const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20)

export function sendLike(target: { item: string } | { program: Program }, on: boolean) {
  const body = 'item' in target ? { item: target.item, on, key: randomKey() } : { program: { src: target.program.src, grid: target.program.grid, lattice: target.program.lattice, tone: target.program.tone }, on, key: randomKey() }
  return post<{ on: boolean; soon: boolean; already?: boolean }>('like', body)
}
export const sendVisit = () => post<{ ok: true }>('visit', { remember: true })
export const sendForget = () => post<{ ok: true }>('forget', {})

// ── this browser ──
export interface Local { c?: 'r' | 'o'; d?: number; mine: Record<string, number> }
const listeners = new Set<() => void>()
let cache: Local | undefined

export function local(): Local {
  if (cache) return cache
  let v: Local = { mine: {} }
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Local>
    const mine: Record<string, number> = {}
    if (o.mine && typeof o.mine === 'object') for (const [k, n] of Object.entries(o.mine)) if (/^(w:[0-9a-z]{8}|p:[0-9a-f]{64})$/.test(k) && Number.isFinite(n)) mine[k] = Math.max(0, Math.floor(Number(n)))
    v = { ...(o.c === 'r' || o.c === 'o' ? { c: o.c } : {}), ...(Number.isInteger(o.d) ? { d: o.d } : {}), mine }
  } catch { /* a broken entry counts as none */ }
  return (cache = v)
}
export function setLocal(next: Local | null) {
  cache = next ?? { mine: {} }
  try { if (next) localStorage.setItem(KEY, JSON.stringify(next)); else localStorage.removeItem(KEY) } catch { /* private mode: this page only */ }
  listeners.forEach(l => l())
}
export const subscribeLocal = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
/** Change the record as it is stored now, not as this tab last read it (another tab may have liked or forgotten since). */
export function updateLocal(f: (l: Local) => Local | null) {
  cache = undefined
  setLocal(f(local()))
}
// another tab liked, unliked, chose or forgot: read the record again and re-render
if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if (e.key !== KEY && e.key !== null) return
  cache = undefined
  listeners.forEach(l => l())
})

/** Global Privacy Control: skip the sheet, every like is "just this once". */
export const gpc = () => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
export const today = () => Math.floor(Date.now() / 864e5)

/** A remembered browser checks in at most once a day (the server re-signs its cookie when a day has passed). */
export function dailyVisit() {
  const l = local()
  if (l.c !== 'r' || l.d === today()) return
  updateLocal(x => ({ ...x, d: today() }))
  void ensureBot().then(sendVisit)
}

let bot: Promise<void> | undefined
/** BotID (`botid/client/core`), loaded when a like button first appears; it tags the like and visit requests. */
export function ensureBot(): Promise<void> {
  return bot ??= import('botid/client/core').then(m => {
    m.initBotId({ protect: [{ path: '/api/like', method: 'POST' }, { path: '/api/visit', method: 'POST' }] })
  }, () => undefined)
}
