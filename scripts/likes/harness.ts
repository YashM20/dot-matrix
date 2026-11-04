/**
 * Test harness for the likes routes (#169): the routes over a `MemoryStore` with a fake clock, a fake BotID, and
 * "browsers" that keep their own cookie and send same-origin JSON requests from an IP. No network, no secrets.
 */
import { likesConfig } from '../../api/_lib/config'
import { release, type Deps } from '../../api/_lib/likes'
import { MemoryStore } from '../../api/_lib/memory'
import { handle, type Route } from '../../api/_lib/routes'
import { SEED_KEYS, WIDGET_UIDS, programKey } from '../../api/_lib/gen/site.mjs'

export const ORIGIN = 'https://matrix.test'
export const T0 = Date.UTC(2026, 10, 4, 12)
const ENV = { UPSTASH_REDIS_REST_URL: 'https://example.invalid', UPSTASH_REDIS_REST_TOKEN: 'test', LIKE_COOKIE_KEY: 'c'.repeat(40), LIKE_HASH_KEY: 'h'.repeat(40), CRON_SECRET: 's'.repeat(24) }

export interface World { d: Deps; store: MemoryStore; clock: { t: number }; botty: { on: boolean }; advance(h: number): void }

export function world(env: Record<string, string> = {}): World {
  const clock = { t: T0 }, botty = { on: false }
  const store = new MemoryStore(() => clock.t)
  const cfg = likesConfig({ ...ENV, ...env })!
  const d: Deps = { store, cfg, now: () => clock.t, bot: async () => botty.on, site: { programKey, widgetUids: WIDGET_UIDS, seedKeys: SEED_KEYS }, memo: { write: -1, read: -1 } }
  return { d, store, clock, botty, advance: h => { clock.t += h * 36e5 } }
}

export const PATHS: Record<Route, string> = { like: '/api/like', visit: '/api/visit', forget: '/api/forget', widgets: '/api/likes/widgets', program: '/api/likes/p/', cron: '/api/likes/cron' }

export interface Opts { method?: string; body?: unknown; raw?: string; headers?: Record<string, string>; ip?: string; cookie?: string; path?: string }

export function request(r: Route, o: Opts = {}): Request {
  const write = r === 'like' || r === 'visit' || r === 'forget'
  const headers: Record<string, string> = {
    ...(write && { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }),
    ...(o.ip !== '' && { 'x-real-ip': o.ip ?? '203.0.113.7' }),
    ...(o.cookie && { cookie: o.cookie }),
    ...o.headers,
  }
  const method = o.method ?? (write ? 'POST' : 'GET')
  const body = method === 'GET' || method === 'HEAD' ? undefined : o.raw ?? JSON.stringify(o.body ?? {})
  return new Request(ORIGIN + (o.path ?? PATHS[r]), { method, headers, body })
}

export const call = (w: World | null, r: Route, o: Opts = {}) => handle(r, request(r, o), w?.d ?? null)
export const jsonOf = async (res: Response) => { try { return await res.clone().json() as Record<string, unknown> } catch { return {} } }

let keySeq = 0
export const freshKey = () => `k${String(++keySeq).padStart(8, '0')}`

/** A browser: its IP, its voter cookie (after `remember`), and like / unlike / counts helpers. */
export class Browser {
  cookie = ''
  constructor(public w: World, public ip = '203.0.113.7') {}
  private keep(res: Response) {
    const c = res.headers.get('set-cookie')
    if (c) this.cookie = /Max-Age=0/.test(c) ? '' : c.split(';')[0]
    return res
  }
  remember() { return call(this.w, 'visit', { ip: this.ip, cookie: this.cookie, body: { remember: true } }).then(r => this.keep(r)) }
  forget() { return call(this.w, 'forget', { ip: this.ip, cookie: this.cookie, body: {} }).then(r => this.keep(r)) }
  like(item: string, on = true, key = freshKey(), extra: Opts = {}) { return call(this.w, 'like', { ip: this.ip, cookie: this.cookie, body: { item, on, key }, ...extra }) }
  likeProgram(program: unknown, on = true) { return call(this.w, 'like', { ip: this.ip, cookie: this.cookie, body: { program, on, key: freshKey() } }) }
}

/** Release every like whose hold is over (what a day of reads and the daily job do together). */
export async function releaseAll(w: World) { while ((await release(w.d, undefined, 50)) > 0) { /* next batch */ } }

/** A widget's public count after its due likes were released (an uncached read). */
export async function count(w: World, uid: string): Promise<number> {
  await releaseAll(w)
  const b = await jsonOf(await call(w, 'widgets'))
  return Number((b.w as Record<string, number> | undefined)?.[uid] ?? 0)
}
export const totals = async (w: World, item: string) => {
  const [h] = await w.store.read([['HGETALL', `lk:c:${item}`]])
  const o: Record<string, number> = {}
  for (let i = 0; i + 1 < (h as string[]).length; i += 2) o[(h as string[])[i]] = Number((h as string[])[i + 1])
  return { w: o.w ?? 0, raw: o.raw ?? 0, pend: o.pend ?? 0, flag: o.flag ?? 0 }
}
