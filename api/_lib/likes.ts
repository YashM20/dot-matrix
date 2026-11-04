/**
 * The like rules (#169), store-agnostic: each flow is one read pipeline and one atomic commit (`./store.ts`).
 * Limits are `cap` guards plus `incr` ops in the same commit, so going over one writes nothing. Pending likes are
 * released on every like, on uncached count reads and by the daily job. A visitor never learns a like was flagged.
 */
import type { Limits, LikesConfig } from './config.js'
import { active, decode, encode, HOLD, K, member, moveTotals, ONCE_KEEP_S, RESTORE_S, splitMember, type Entry, type Tier } from './ledger.js'
import { hashOf, int, str, type Cmd, type Guard, type LikeStore, type Op, type Tx } from './store.js'

export interface Site {
  /** `p:` key hex of a program; throws on anything `checkShared` or the IR parser refuses. */
  programKey(x: unknown): Promise<string>
  /** Widget uids that can be liked (current widgets; a removed one keeps its count frozen). */
  widgetUids: ReadonlySet<string>
  /** Keys of the 8 seed programs, which never expire. */
  seedKeys: readonly string[]
}

export interface Deps {
  store: LikeStore
  cfg: LikesConfig
  now: () => number
  /** True when the request looks automated (BotID on Vercel). */
  bot: (req: Request) => Promise<boolean>
  site: Site
  /** UTC days on which this instance already saw the budget spent: skip the store until the next day. */
  memo: { write: number; read: number }
}

export type Outcome = { k: 'ok'; on: boolean; soon: boolean; already?: boolean } | { k: 'limit' } | { k: 'paused' } | { k: 'busy' }

const DAY_TTL = 2 * 86400
const RATE_TTL = { vm: 120, day: DAY_TTL, ni: ONCE_KEEP_S, burst: 7200 }
const sec = (d: Deps) => Math.floor(d.now() / 1000)
const budgetOf = (s: number): Tx['budget'] => ({ key: K.budget(s), extra: 0, ttl: DAY_TTL })
const RELEASE_PER_REQUEST = 5

export interface LikeArgs { item: string; on: boolean; key: string; net: string; voter: { field: string; days: number } | null }

/** Like or unlike an item. */
export async function like(d: Deps, a: LikeArgs, retry = true): Promise<Outcome> {
  const s = sec(d), L = d.cfg.limits, today = Math.floor(s / 86400)
  if (d.memo.write === today) return { k: 'paused' }
  const ledger = K.ledger(a.item), idemKey = K.idem(a.voter?.field ?? a.net, a.key), burstKey = K.rate('burst', a.item, Math.floor(s / 3600))
  const reads: Cmd[] = [
    ['GET', K.budget(s)], ['GET', K.site(s)], ['GET', idemKey], ['GET', burstKey],
    ['ZRANGEBYSCORE', K.pending, '-inf', s, 'LIMIT', 0, RELEASE_PER_REQUEST],
    ['HGET', ledger, a.net], ...(a.voter ? [['HGET', ledger, a.voter.field], ['SISMEMBER', K.revoked, a.voter.field]] : []),
  ]
  const r = await d.store.read(reads)
  const [budget, site, idem, burst, due, netRaw, voterRaw, revoked] = r
  if (int(budget) >= L.budget) { d.memo.write = today; return { k: 'paused' } }
  if (str(idem)) return { k: 'ok', on: str(idem)[0] === '1', soon: str(idem)[1] === '1' }
  if (a.on && int(site) >= L.site) return { k: 'paused' }

  const voter = a.voter && int(revoked) !== 1 ? a.voter : null
  const tier: Tier = voter ? (voter.days >= 2 ? 'R' : 'N') : 'O'
  const field = voter ? voter.field : a.net, raw = str(voter ? voterRaw : netRaw), entry = decode(raw)

  let to: Entry, fresh = false
  if (a.on) {
    if (entry && active(entry)) return { k: 'ok', on: true, soon: entry.s !== 'c', already: true }
    if (entry && entry.prev !== '-' && (entry.prev === 'f' || s - entry.rm < RESTORE_S)) to = { ...entry, s: entry.prev, rm: 0, prev: '-' }
    else { fresh = true; to = { s: tier !== 'R' && int(burst) >= L.burst ? 'b' : 'p', t: tier, at: s, rm: 0, prev: '-' } }
  } else {
    if (!entry || !active(entry)) return { k: 'ok', on: false, soon: false }
    to = { ...entry, s: 'r', rm: s, prev: entry.s }
  }

  const guards: Guard[] = [{ g: 'eq', key: ledger, field, value: raw }, { g: 'cap', key: K.budget(s), max: L.budget }]
  const why: Outcome['k'][] = ['busy', 'paused']
  const ops: Op[] = []
  const cap = (key: string, max: number, ttl: number, w: Outcome['k'] = 'limit') => { guards.push({ g: 'cap', key, max }); why.push(w); ops.push({ o: 'incr', key, ttl }) }
  cap(K.rate('vm', field, Math.floor(s / 60)), L.vm, RATE_TTL.vm)
  cap(K.rate('vd', field, today), L.vd, RATE_TTL.day)
  cap(K.rate('nd', a.net, today), L.nd, RATE_TTL.day)
  if (tier === 'O') cap(K.rate('no', a.net, today), L.no, RATE_TTL.day)
  if (fresh && tier !== 'R') cap(K.rate('ni', a.net, a.item), L.ni, RATE_TTL.ni)
  if (a.on) cap(K.site(s), L.site, DAY_TTL, 'paused')

  const m = member(a.item, field), pend = (x: Entry | null) => x?.s === 'p' || x?.s === 'b'
  ops.push({ o: 'hset', key: ledger, field, value: encode(to) }, ...moveTotals(a.item, to.t, entry?.s ?? null, to.s))
  if (pend(to)) ops.push({ o: 'zadd', key: K.pending, score: to.at + HOLD[to.t], member: m })
  else if (pend(entry)) ops.push({ o: 'zrem', key: K.pending, member: m })
  if (fresh) {
    if (tier !== 'R') ops.push({ o: 'incr', key: burstKey, ttl: RATE_TTL.burst })
    if (tier === 'O') ops.push({ o: 'zadd', key: K.once, score: s, member: m })
    else ops.push({ o: 'sadd', key: K.voter(field), member: a.item })
    if (a.item.startsWith('p:')) ops.push({ o: 'zadd', key: K.programs, score: 0, member: a.item, nx: true }, { o: 'zadd', key: K.programsAt, score: s, member: a.item, nx: true })
  }
  const soon = to.s !== 'c'
  ops.push({ o: 'setex', key: idemKey, value: `${a.on ? 1 : 0}${soon ? 1 : 0}`, ttl: 600 })

  const res = await d.store.commit({ guards, ops, budget: { ...budgetOf(s)!, extra: reads.length } })
  if (!res.ok) {
    const w = why[res.failed]
    if (w === 'busy' && retry) return like(d, a, false)
    if (w === 'paused' && res.failed === 1) d.memo.write = today
    return { k: w } as Outcome
  }
  const dueList = (Array.isArray(due) ? due : []).map(String)
  if (dueList.length) await release(d, dueList).catch(() => 0)
  return { k: 'ok', on: a.on, soon }
}

/** Count the pending likes whose hold is over (`due`, or the oldest `limit`); returns how many were looked at. */
export async function release(d: Deps, due?: string[], limit = RELEASE_PER_REQUEST): Promise<number> {
  const s = sec(d)
  const members = due ?? (await d.store.read([['ZRANGEBYSCORE', K.pending, '-inf', s, 'LIMIT', 0, limit]]))[0] as string[]
  const pairs = (members ?? []).map(m => [m, splitMember(String(m))] as const)
  if (!pairs.length) return 0
  const vals = await d.store.read(pairs.map(([, p]) => p ? ['HGET', K.ledger(p[0]), p[1]] : ['EXISTS', 'lk:none']))
  const guards: Guard[] = [{ g: 'cap', key: K.budget(s), max: d.cfg.limits.budget }], ops: Op[] = []
  pairs.forEach(([m, p], i) => {
    ops.push({ o: 'zrem', key: K.pending, member: m })
    const e = decode(vals[i])
    if (!p || !e || (e.s !== 'p' && e.s !== 'b')) return
    const to: Entry = { ...e, s: e.s === 'p' ? 'c' : 'f' }
    guards.push({ g: 'eq', key: K.ledger(p[0]), field: p[1], value: str(vals[i]) })
    ops.push({ o: 'hset', key: K.ledger(p[0]), field: p[1], value: encode(to) }, ...moveTotals(p[0], e.t, e.s, to.s))
  })
  const res = await d.store.commit({ guards, ops, budget: { ...budgetOf(s)!, extra: due ? 1 : 2 } })
  return res.ok ? pairs.length : 0
}

/** "Forget this browser": remove this voter's likes everywhere and recount those items. */
export async function forget(d: Deps, voterField: string): Promise<'ok' | 'paused'> {
  const s = sec(d)
  const [budget, items] = await d.store.read([['GET', K.budget(s)], ['SMEMBERS', K.voter(voterField)]])
  if (int(budget) >= d.cfg.limits.budget) return 'paused'
  const list = (Array.isArray(items) ? items : []).map(String).slice(0, 200)
  const vals = list.length ? await d.store.read(list.map(item => ['HGET', K.ledger(item), voterField])) : []
  const guards: Guard[] = [], ops: Op[] = []
  list.forEach((item, i) => {
    const e = decode(vals[i])
    ops.push({ o: 'srem', key: K.voter(voterField), member: item })
    if (!e) return
    guards.push({ g: 'eq', key: K.ledger(item), field: voterField, value: str(vals[i]) })
    ops.push({ o: 'hdel', key: K.ledger(item), field: voterField }, ...moveTotals(item, e.t, e.s, null))
    if (e.s === 'p' || e.s === 'b') ops.push({ o: 'zrem', key: K.pending, member: member(item, voterField) })
  })
  const res = await d.store.commit({ guards, ops, budget: { ...budgetOf(s)!, extra: 2 + list.length } })
  return res.ok ? 'ok' : 'paused'
}

/** May this network get a new voter cookie today? */
export async function mayIssue(d: Deps, net: string): Promise<'ok' | 'limit' | 'paused'> {
  const s = sec(d), L: Limits = d.cfg.limits, key = K.rate('nc', net, Math.floor(s / 86400))
  const res = await d.store.commit({ guards: [{ g: 'cap', key: K.budget(s), max: L.budget }, { g: 'cap', key, max: L.nc }], ops: [{ o: 'incr', key, ttl: DAY_TTL }], budget: budgetOf(s) })
  return res.ok ? 'ok' : res.failed === 0 ? 'paused' : 'limit'
}

export const isRevoked = async (d: Deps, voterField: string) => int((await d.store.read([['SISMEMBER', K.revoked, voterField]]))[0]) === 1

/** A count read: one pipeline (budget, due likes, the data, the budget charge); releases due likes after. */
async function countRead(d: Deps, data: Cmd): Promise<unknown | 'paused'> {
  const s = sec(d), today = Math.floor(s / 86400), L = d.cfg.limits
  if (d.memo.read === today) return 'paused'
  const reads: Cmd[] = [['GET', K.budget(s)], ['ZRANGEBYSCORE', K.pending, '-inf', s, 'LIMIT', 0, RELEASE_PER_REQUEST], data]
  // the day's key gets its expiry from the next commit (a like, a release or the daily job)
  const [budget, due, value] = await d.store.read([...reads, ['INCRBY', K.budget(s), reads.length + 1]])
  if (int(budget) >= L.hard) d.memo.read = today
  const dueList = (Array.isArray(due) ? due : []).map(String)
  if (dueList.length && int(budget) < L.budget) await release(d, dueList).catch(() => 0)
  return value
}

/** Every widget's public count, `{ uid: n }`. */
export async function widgetCounts(d: Deps): Promise<Record<string, number> | 'paused'> {
  const v = await countRead(d, ['HGETALL', K.pub])
  if (v === 'paused') return v
  const out: Record<string, number> = {}
  for (const [item, n] of Object.entries(hashOf(v))) if (item.startsWith('w:') && int(n) > 0) out[item.slice(2)] = int(n)
  return out
}

/** One program's public count. */
export async function programCount(d: Deps, hex: string): Promise<number | 'paused'> {
  const v = await countRead(d, ['HGET', K.totals(`p:${hex}`), 'w'])
  return v === 'paused' ? v : Math.floor((int(v) + 2) / 4)
}

/** The daily job: release every due like, drop Once records past 30 days, expire and cap program keys. */
export async function daily(d: Deps): Promise<Record<string, number>> {
  const s = sec(d), out = { released: 0, once: 0, expired: 0, trimmed: 0 }
  for (let i = 0; i < 20; i++) { const n = await release(d, undefined, 50); out.released += n; if (n < 50) break }
  const budget = { ...budgetOf(s)!, extra: 1 }, under: Guard = { g: 'cap', key: K.budget(s), max: d.cfg.limits.budget }

  const old = (await d.store.read([['ZRANGEBYSCORE', K.once, '-inf', s - ONCE_KEEP_S, 'LIMIT', 0, 500]]))[0] as string[]
  if (old?.length) {
    const ops: Op[] = old.flatMap(m => { const p = splitMember(String(m)); return [{ o: 'zrem', key: K.once, member: String(m) } as Op, ...(p ? [{ o: 'hdel', key: K.ledger(p[0]), field: p[1] } as Op] : [])] })
    if ((await d.store.commit({ guards: [under], ops, budget })).ok) out.once = old.length
  }

  const seeds = new Set(d.site.seedKeys.map(k => `p:${k}`))
  const drop = (item: string): Op[] => [{ o: 'del', key: K.ledger(item) }, { o: 'del', key: K.totals(item) }, { o: 'zrem', key: K.programs, member: item }, { o: 'zrem', key: K.programsAt, member: item }]
  const aged = ((await d.store.read([['ZRANGEBYSCORE', K.programsAt, '-inf', s - 90 * 86400, 'LIMIT', 0, 200]]))[0] as string[] ?? []).map(String)
  if (aged.length) {
    const scores = await d.store.read(aged.map(item => ['ZSCORE', K.programs, item]))
    const ops: Op[] = aged.flatMap((item, i): Op[] => seeds.has(item) || int(scores[i]) >= 3 ? [{ o: 'zadd', key: K.programsAt, score: s, member: item }] : (out.expired++, drop(item)))
    if (!(await d.store.commit({ guards: [under], ops, budget })).ok) out.expired = 0
  }

  const total = int((await d.store.read([['ZCARD', K.programs]]))[0]), cap = 10000
  if (total > cap) {
    const low = ((await d.store.read([['ZRANGE', K.programs, 0, Math.min(total - cap, 500) - 1]]))[0] as string[] ?? []).map(String).filter(i => !seeds.has(i))
    if (low.length && (await d.store.commit({ guards: [under], ops: low.flatMap(drop), budget })).ok) out.trimmed = low.length
  }
  return out
}
