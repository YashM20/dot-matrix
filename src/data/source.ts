/**
 * Live data binding layer (P4-E). A `Source` turns a transport's payloads into card `data` keys:
 *
 *   transport (poll | push | websocket) → payload → map(payload) → { key: number } → board → cards
 *
 * - Starts from the last good value cached in localStorage (`cached`), else from its deterministic
 *   `fixture` (`offline`). Snapshots, goldens and tests only ever see the fixture: cards use it as
 *   their `defaults`, and nothing here runs until a board subscribes in the browser.
 * - Failures back off exponentially (with jitter, capped, honouring rate-limit hints) and keep the
 *   last good value on screen (status `cached`). Transports pause while the tab is hidden.
 * - No tokens, no credentials: only public, unauthenticated endpoints. The cache holds mapped
 *   numbers (and the strings behind text ids), nothing else.
 * Plain TypeScript, no framework; `env` is injectable so tests drive time, fetch and storage.
 */
import { textId, textOf } from './text'

export type Data = Record<string, number>
export type SourceStatus = 'live' | 'cached' | 'offline'
/** Status as a data number (cards read `data[statusKey]`). */
export const STATUS_CODE: Record<SourceStatus, number> = { offline: 0, cached: 1, live: 2 }
export const statusName = (code: number | undefined): SourceStatus => (code === 2 ? 'live' : code === 1 ? 'cached' : 'offline')

/** Everything a source touches in the outside world. `browserEnv()` in the app, a fake in tests. */
export interface SourceEnv {
  fetch: (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchResponse>
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null
  hidden: () => boolean
  /** Calls `cb` when visibility changes; returns the unsubscribe. */
  onVisibility: (cb: () => void) => () => void
  random: () => number
  WebSocket?: new (url: string) => SocketLike
  BroadcastChannel?: new (name: string) => ChannelLike
}
export interface FetchResponse { ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }
export interface SocketLike { onopen: (() => void) | null; onmessage: ((e: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null; close(): void }
export interface ChannelLike { onmessage: ((e: { data: unknown }) => void) | null; close(): void }

export function browserEnv(): SourceEnv {
  const g = globalThis as unknown as Window & typeof globalThis
  let storage: SourceEnv['storage'] = null
  try { storage = g.localStorage ?? null } catch { /* storage blocked (privacy mode) */ }
  return {
    fetch: (url, init) => g.fetch(url, init) as Promise<FetchResponse>,
    now: () => Date.now(),
    setTimeout: (fn, ms) => g.setTimeout(fn, ms),
    clearTimeout: h => g.clearTimeout(h as number),
    storage,
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    onVisibility: cb => {
      if (typeof document === 'undefined') return () => {}
      document.addEventListener('visibilitychange', cb)
      return () => document.removeEventListener('visibilitychange', cb)
    },
    random: Math.random,
    WebSocket: g.WebSocket as unknown as SourceEnv['WebSocket'],
    BroadcastChannel: g.BroadcastChannel as unknown as SourceEnv['BroadcastChannel'],
  }
}

/** A fetch failure; `retryAfterMs` comes from Retry-After / X-RateLimit-Reset (rate limits). */
export class HttpError extends Error {
  readonly status: number
  readonly retryAfterMs: number
  constructor(status: number, retryAfterMs = 0) { super(`HTTP ${status}`); this.status = status; this.retryAfterMs = retryAfterMs }
}
/** GET `url` as JSON; non-2xx throws an `HttpError` carrying any rate-limit wait. */
export async function fetchJson<T>(env: SourceEnv, url: string, headers?: Record<string, string>): Promise<T> {
  const res = await env.fetch(url, headers ? { headers } : undefined)
  if (!res.ok) {
    const after = Number(res.headers.get('retry-after')), reset = Number(res.headers.get('x-ratelimit-reset'))
    const remaining = res.headers.get('x-ratelimit-remaining')
    const wait = after > 0 ? after * 1000 : remaining === '0' && reset > 0 ? reset * 1000 - env.now() : 0
    throw new HttpError(res.status, Math.max(0, wait))
  }
  return res.json() as Promise<T>
}

export interface BackoffOptions { baseMs?: number; maxMs?: number }
/** Delay before retry `attempt` (0-based): base·2^attempt capped at max, scaled by a jitter in [0.5, 1]. */
export function backoff(attempt: number, random: number, { baseMs = 5_000, maxMs = 15 * 60_000 }: BackoffOptions = {}): number {
  return Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 30)) * (0.5 + 0.5 * random)
}

/** What a transport reports back to its source. */
export interface Link<P> {
  env: SourceEnv
  emit(payload: P): void
  /** A failed attempt; `retryInMs` is when the transport will try again (for the record). */
  fail(error: unknown, retryInMs: number): void
}
export interface Connection { close(): void; pause?(): void; resume?(): void }
export interface Transport<P> { kind: 'poll' | 'push' | 'websocket' | 'media'; open(link: Link<P>): Connection }

export interface Snapshot { data: Data; status: SourceStatus; updatedAt: number | null; error: string | null; retryInMs: number | null }

export interface SourceSpec<P> {
  /** Stable id: the localStorage cache key and the BroadcastChannel / `dot480Live` push name. */
  id: string
  transports: Transport<P>[]
  /** Payload → data keys. Pure: same payload (and `now`), same numbers. */
  map: (payload: P, now: number) => Data
  /** Deterministic offline data, used until a good value arrives. `Source.fixture` adds the status key: use it as the cards' defaults. */
  fixture: Data
  /** Data key carrying the status code (`STATUS_CODE`). */
  statusKey: string
  /** Data keys holding `textId`s: their strings are cached with the numbers. */
  textKeys?: string[]
  /** A live value older than this reads as `cached` (default: never). */
  staleMs?: number
  /** Cached values older than this are ignored at start (default 7 days). */
  cacheMaxAgeMs?: number
}

export interface Source<P = unknown> {
  readonly id: string
  readonly keys: string[]
  readonly fixture: Data
  snapshot(): Snapshot
  /** First subscriber starts the transports, the last one stops them. Returns the unsubscribe. */
  subscribe(listener: (s: Snapshot) => void): () => void
  /** Webhook-style entry point: feed a payload directly (also reachable via BroadcastChannel). */
  push(payload: P): void
}

const CACHE_PREFIX = 'dot480:live:'
interface CacheEntry { v: 1; at: number; data: Data; text?: Record<string, string> }

export function createSource<P>(spec: SourceSpec<P>, envArg?: SourceEnv | (() => SourceEnv)): Source<P> {
  const { id, fixture, statusKey } = spec
  const keys = Object.keys(fixture)
  const withStatus = (data: Data, status: SourceStatus): Data => ({ ...data, [statusKey]: STATUS_CODE[status] })
  let env: SourceEnv | null = null
  let snap: Snapshot = { data: withStatus(fixture, 'offline'), status: 'offline', updatedAt: null, error: null, retryInMs: null }
  const listeners = new Set<(s: Snapshot) => void>()
  let conns: Connection[] = [], unVisibility: (() => void) | null = null, staleTimer: unknown = null, loaded = false

  const set = (patch: Partial<Snapshot>) => {
    const status = patch.status ?? snap.status
    snap = { ...snap, ...patch, status, data: withStatus(patch.data ?? snap.data, status) }
    for (const l of listeners) l(snap)
  }
  const loadCache = (e: SourceEnv) => {
    if (loaded) return
    loaded = true
    try {
      const raw = e.storage?.getItem(CACHE_PREFIX + id)
      if (!raw) return
      const c = JSON.parse(raw) as CacheEntry
      if (c.v !== 1 || e.now() - c.at > (spec.cacheMaxAgeMs ?? 7 * 86_400_000)) return
      for (const k of spec.textKeys ?? []) if (c.text?.[k] !== undefined) textId(c.text[k], true)
      const data: Data = { ...fixture }
      for (const k of keys) if (typeof c.data[k] === 'number') data[k] = c.data[k]
      snap = { ...snap, data: withStatus(data, 'cached'), status: 'cached', updatedAt: c.at }
    } catch { /* corrupt cache: start from the fixture */ }
  }
  const save = (e: SourceEnv, data: Data, at: number) => {
    const text: Record<string, string> = {}
    for (const k of spec.textKeys ?? []) text[k] = textOf(data[k])
    try { e.storage?.setItem(CACHE_PREFIX + id, JSON.stringify({ v: 1, at, data, text } satisfies CacheEntry)) } catch { /* quota */ }
  }
  const accept = (payload: P) => {
    const e = env ?? resolveEnv()
    let mapped: Data
    try { mapped = spec.map(payload, e.now()) } catch (err) { set({ error: String(err) }); return }
    const data: Data = { ...fixture }
    for (const k of keys) if (typeof mapped[k] === 'number' && Number.isFinite(mapped[k])) data[k] = mapped[k]
    const at = e.now()
    save(e, data, at)
    set({ data, status: 'live', updatedAt: at, error: null, retryInMs: null })
    if (spec.staleMs) {
      if (staleTimer !== null) e.clearTimeout(staleTimer)
      staleTimer = e.setTimeout(() => { staleTimer = null; if (snap.status === 'live') set({ status: 'cached' }) }, spec.staleMs)
    }
  }
  const resolveEnv = () => (env ??= typeof envArg === 'function' ? envArg() : envArg ?? browserEnv())
  const link: Link<P> = {
    get env() { return resolveEnv() },
    emit: accept,
    // keep the last good value on screen; only the status says it is no longer fresh
    fail: (err, retryInMs) => set({ status: snap.updatedAt === null ? 'offline' : 'cached', error: err instanceof Error ? err.message : String(err), retryInMs }),
  }
  const start = () => {
    const e = resolveEnv()
    loadCache(e)
    conns = spec.transports.map(t => t.open(link))
    const sync = () => { for (const c of conns) (e.hidden() ? c.pause : c.resume)?.call(c) }
    unVisibility = e.onVisibility(sync)
    if (e.hidden()) sync()
  }
  const stop = () => {
    for (const c of conns) c.close()
    conns = []
    unVisibility?.(); unVisibility = null
    if (staleTimer !== null && env) { env.clearTimeout(staleTimer); staleTimer = null }
  }
  return {
    id, keys,
    // the status key is part of the fixture, so cards declaring these defaults receive it
    fixture: withStatus(fixture, 'offline'),
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      listener(snap)
      return () => { if (listeners.delete(listener) && listeners.size === 0) stop() }
    },
    push: accept,
  }
}
