/**
 * In-memory `LikeStore` (#169): a small Redis subset on Maps with a fake clock, for the tests and the browser probe.
 * `commit` runs the same steps as the Lua script in `./upstash.ts`, in the same order, and counts the same commands.
 * `calls` totals every command, so a test can check a request never reached the store.
 */
import { StoreError, type Cmd, type CommitResult, type LikeStore, type Tx } from './store.js'

type Value = string | Map<string, string> | Set<string> | Map<string, number>
interface Slot { kind: 'str' | 'hash' | 'set' | 'zset'; v: Value; exp?: number }

export class MemoryStore implements LikeStore {
  private data = new Map<string, Slot>()
  /** Commands run so far (reads and commit steps). */
  calls = 0
  /** Make the next calls throw, as a down Redis would. */
  down = false

  now: () => number
  constructor(now: () => number = () => Date.now()) { this.now = now }

  private get(key: string): Slot | undefined {
    const s = this.data.get(key)
    if (s?.exp !== undefined && s.exp <= this.now()) { this.data.delete(key); return undefined }
    return s
  }
  private of<K extends Slot['kind']>(key: string, kind: K): Slot {
    let s = this.get(key)
    if (s && s.kind !== kind) throw new StoreError(`WRONGTYPE ${key}`)
    if (!s) { s = { kind, v: kind === 'str' ? '' : kind === 'set' ? new Set<string>() : new Map() }; this.data.set(key, s) }
    return s
  }
  private hash = (key: string) => this.of(key, 'hash').v as Map<string, string>
  private zset = (key: string) => this.of(key, 'zset').v as Map<string, number>
  private set = (key: string) => this.of(key, 'set').v as Set<string>
  private drop(key: string) { const s = this.get(key); if (s && s.kind !== 'str' && (s.v as Map<string, string>).size === 0) this.data.delete(key) }

  /** Every live key (tests and the admin script). */
  keys(prefix = ''): string[] { return [...this.data.keys()].filter(k => k.startsWith(prefix) && this.get(k)) }

  /** One command, Redis semantics for the subset the likes code and the admin script use. */
  run(cmd: Cmd): unknown {
    if (this.down) throw new StoreError('store down')
    this.calls++
    const [name, ...a] = cmd.map(String)
    const n = name.toUpperCase()
    switch (n) {
      case 'GET': { const s = this.get(a[0]); return s?.kind === 'str' ? s.v : null }
      case 'EXISTS': return this.get(a[0]) ? 1 : 0
      case 'DEL': { const had = this.get(a[0]) ? 1 : 0; this.data.delete(a[0]); return had }
      case 'TTL': { const s = this.get(a[0]); return !s ? -2 : s.exp === undefined ? -1 : Math.ceil((s.exp - this.now()) / 1000) }
      case 'EXPIRE': { const s = this.get(a[0]); if (!s) return 0; s.exp = this.now() + Number(a[1]) * 1000; return 1 }
      case 'SET': {
        const nx = a.includes('NX'), ex = a.indexOf('EX')
        if (nx && this.get(a[0])) return null
        this.data.set(a[0], { kind: 'str', v: a[1], ...(ex > 0 && { exp: this.now() + Number(a[ex + 1]) * 1000 }) })
        return 'OK'
      }
      case 'INCR': case 'INCRBY': {
        const s = this.of(a[0], 'str'), v = (Number(s.v) || 0) + (n === 'INCR' ? 1 : Number(a[1]))
        s.v = String(v); return v
      }
      case 'HGET': { const s = this.get(a[0]); return s?.kind === 'hash' ? (s.v as Map<string, string>).get(a[1]) ?? null : null }
      case 'HGETALL': { const s = this.get(a[0]); return s?.kind === 'hash' ? [...(s.v as Map<string, string>)].flat() : [] }
      case 'HLEN': { const s = this.get(a[0]); return s?.kind === 'hash' ? (s.v as Map<string, string>).size : 0 }
      case 'HSET': { const h = this.hash(a[0]); let added = 0; for (let i = 1; i + 1 < a.length; i += 2) { if (!h.has(a[i])) added++; h.set(a[i], a[i + 1]) } return added }
      case 'HDEL': { const h = this.hash(a[0]), had = h.delete(a[1]) ? 1 : 0; this.drop(a[0]); return had }
      case 'HINCRBY': { const h = this.hash(a[0]), v = (Number(h.get(a[1])) || 0) + Number(a[2]); h.set(a[1], String(v)); return v }
      case 'SADD': { const s = this.set(a[0]), had = s.has(a[1]); s.add(a[1]); return had ? 0 : 1 }
      case 'SREM': { const s = this.set(a[0]), had = s.delete(a[1]) ? 1 : 0; this.drop(a[0]); return had }
      case 'SISMEMBER': { const s = this.get(a[0]); return s?.kind === 'set' && (s.v as Set<string>).has(a[1]) ? 1 : 0 }
      case 'SMEMBERS': { const s = this.get(a[0]); return s?.kind === 'set' ? [...(s.v as Set<string>)] : [] }
      case 'ZADD': {
        const nx = a[1] === 'NX', z = this.zset(a[0]), [score, member] = nx ? [a[2], a[3]] : [a[1], a[2]]
        if (nx && z.has(member)) return 0
        const added = z.has(member) ? 0 : 1; z.set(member, Number(score)); return added
      }
      case 'ZREM': { const z = this.zset(a[0]), had = z.delete(a[1]) ? 1 : 0; this.drop(a[0]); return had }
      case 'ZSCORE': { const s = this.get(a[0]); const v = s?.kind === 'zset' ? (s.v as Map<string, number>).get(a[1]) : undefined; return v === undefined ? null : String(v) }
      case 'ZCARD': { const s = this.get(a[0]); return s?.kind === 'zset' ? (s.v as Map<string, number>).size : 0 }
      case 'ZRANGE': case 'ZRANGEBYSCORE': {
        const s = this.get(a[0])
        const all = s?.kind === 'zset' ? [...(s.v as Map<string, number>)].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1)) : []
        if (n === 'ZRANGE') { const stop = Number(a[2]); return all.slice(Number(a[1]), stop < 0 ? all.length + stop + 1 : stop + 1).map(e => e[0]) }
        const lo = a[1] === '-inf' ? -Infinity : Number(a[1]), hi = a[2] === '+inf' ? Infinity : Number(a[2]), lim = a.indexOf('LIMIT')
        const hit = all.filter(e => e[1] >= lo && e[1] <= hi).map(e => e[0])
        return lim > 0 ? hit.slice(Number(a[lim + 1]), Number(a[lim + 1]) + Number(a[lim + 2])) : hit
      }
      case 'SCAN': { const m = a.indexOf('MATCH'), prefix = m > 0 ? a[m + 1].replace(/\*$/, '') : ''; return ['0', this.keys(prefix)] }
      default: throw new StoreError(`unsupported command ${n}`)
    }
  }

  async read(cmds: Cmd[]): Promise<unknown[]> { return cmds.map(c => this.run(c)) }

  async commit(tx: Tx): Promise<CommitResult> {
    if (this.down) throw new StoreError('store down')
    this.calls++ // the EVAL itself
    let calls = 1
    const r = (c: Cmd) => { calls++; return this.run(c) }
    const spend = () => { if (tx.budget) { this.run(['INCRBY', tx.budget.key, calls + tx.budget.extra + 1]); if (Number(this.run(['TTL', tx.budget.key])) < 0) this.run(['EXPIRE', tx.budget.key, tx.budget.ttl]) } }
    for (let i = 0; i < tx.guards.length; i++) {
      const g = tx.guards[i]
      const fail = g.g === 'eq' ? String(r(['HGET', g.key, g.field]) ?? '') !== g.value
        : g.g === 'cap' ? (Number(r(['GET', g.key])) || 0) >= g.max
        : Number(r(['EXISTS', g.key])) === 1
      if (fail) { spend(); return { ok: false, failed: i, calls } }
    }
    for (const op of tx.ops) {
      switch (op.o) {
        case 'incr': if (Number(r(['INCR', op.key])) === 1) r(['EXPIRE', op.key, op.ttl]); break
        case 'hincr': r(['HINCRBY', op.key, op.field, op.by]); break
        case 'hset': r(['HSET', op.key, op.field, op.value]); break
        case 'hdel': r(['HDEL', op.key, op.field]); break
        case 'zadd': r(op.nx ? ['ZADD', op.key, 'NX', op.score, op.member] : ['ZADD', op.key, op.score, op.member]); break
        case 'zrem': r(['ZREM', op.key, op.member]); break
        case 'sadd': r(['SADD', op.key, op.member]); break
        case 'srem': r(['SREM', op.key, op.member]); break
        case 'setex': r(['SET', op.key, op.value, 'EX', op.ttl]); break
        case 'del': r(['DEL', op.key]); break
        case 'pub': {
          const n = Math.floor(((Number(r(['HGET', op.totals, 'w'])) || 0) + 2) / 4)
          if (op.zset) r(['ZADD', op.target, n, op.member])
          else if (n > 0) r(['HSET', op.target, op.member, n])
          else r(['HDEL', op.target, op.member])
          break
        }
      }
    }
    spend()
    return { ok: true, calls }
  }
}
