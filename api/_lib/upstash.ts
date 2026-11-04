/**
 * `LikeStore` over the Upstash Redis REST API (#169), plain `fetch`, no SDK. Reads are one `/pipeline` request;
 * a commit is one `EVAL` of `COMMIT_LUA`, which checks every guard before it writes anything (so the limits, the
 * ledger and the totals change together) and adds its own command count to the day's budget key.
 * Each request times out after `timeoutMs` (1.5 s for the site) and is never retried: the caller says "likes paused".
 */
import { StoreError, type Cmd, type CommitResult, type Guard, type LikeStore, type Op, type Tx } from './store.js'

/**
 * The commit script. ARGV: guard count, op count, budget key index (0 = none), reads before it, budget ttl, then 5
 * slots per entry: code, key index (into KEYS), x, y, z. Returns {0, calls} on success, {i, calls} when guard i
 * (1-based) failed and nothing was written. Kept to Lua 5.1 and plain redis.call; `../../scripts/likes/checks.ts`
 * checks that `MemoryStore.commit` follows it step for step.
 */
export const COMMIT_LUA = `local ng, no, bk, extra, bttl = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local calls = 1
local function c(...) calls = calls + 1; return redis.call(...) end
local function e(i, j) return ARGV[5 + (i - 1) * 5 + j] end
local function spend()
  if bk > 0 then
    redis.call('INCRBY', KEYS[bk], calls + extra + 1)
    if redis.call('TTL', KEYS[bk]) < 0 then redis.call('EXPIRE', KEYS[bk], bttl) end
  end
end
for i = 1, ng do
  local g, k, fail = e(i, 1), KEYS[tonumber(e(i, 2))], false
  if g == 'eq' then fail = (c('HGET', k, e(i, 3)) or '') ~= e(i, 4)
  elseif g == 'cap' then fail = tonumber(c('GET', k) or '0') >= tonumber(e(i, 3))
  else fail = c('EXISTS', k) == 1 end
  if fail then spend(); return {i, calls} end
end
for i = ng + 1, ng + no do
  local o, k, x, y, z = e(i, 1), KEYS[tonumber(e(i, 2))], e(i, 3), e(i, 4), e(i, 5)
  if o == 'incr' then if c('INCR', k) == 1 then c('EXPIRE', k, x) end
  elseif o == 'hincr' then c('HINCRBY', k, x, y)
  elseif o == 'hset' then c('HSET', k, x, y)
  elseif o == 'hdel' then c('HDEL', k, x)
  elseif o == 'zadd' then if z == '1' then c('ZADD', k, 'NX', x, y) else c('ZADD', k, x, y) end
  elseif o == 'zrem' then c('ZREM', k, x)
  elseif o == 'sadd' then c('SADD', k, x)
  elseif o == 'srem' then c('SREM', k, x)
  elseif o == 'setex' then c('SET', k, x, 'EX', y)
  elseif o == 'del' then c('DEL', k)
  elseif o == 'pub' then
    local n = math.floor((tonumber(c('HGET', k, 'w') or '0') + 2) / 4)
    local t = KEYS[tonumber(x)]
    if z == '1' then c('ZADD', t, n, y) elseif n > 0 then c('HSET', t, y, n) else c('HDEL', t, y) end
  end
end
spend()
return {0, calls}`

/** A transaction as EVAL arguments: [script, numkeys, ...keys, ...argv]. Exported for the checks. */
export function evalArgs(tx: Tx): (string | number)[] {
  const keys: string[] = [], at = new Map<string, number>()
  const k = (key: string) => { let i = at.get(key); if (i === undefined) { keys.push(key); i = keys.length; at.set(key, i) } return i }
  const slot = (code: string, key: string, x: string | number = '', y: string | number = '', z: string | number = '') => [code, k(key), x, y, z]
  const guard = (g: Guard) => g.g === 'eq' ? slot('eq', g.key, g.field, g.value) : g.g === 'cap' ? slot('cap', g.key, g.max) : slot('absent', g.key)
  const op = (o: Op) => {
    switch (o.o) {
      case 'incr': return slot('incr', o.key, o.ttl)
      case 'hincr': return slot('hincr', o.key, o.field, o.by)
      case 'hset': return slot('hset', o.key, o.field, o.value)
      case 'hdel': return slot('hdel', o.key, o.field)
      case 'zadd': return slot('zadd', o.key, o.score, o.member, o.nx ? 1 : 0)
      case 'zrem': return slot('zrem', o.key, o.member)
      case 'sadd': return slot('sadd', o.key, o.member)
      case 'srem': return slot('srem', o.key, o.member)
      case 'setex': return slot('setex', o.key, o.value, o.ttl)
      case 'del': return slot('del', o.key)
      case 'pub': return slot('pub', o.totals, k(o.target), o.member, o.zset ? 1 : 0)
    }
  }
  const entries = [...tx.guards.map(guard), ...tx.ops.map(op)].flat()
  const head = [tx.guards.length, tx.ops.length, tx.budget ? k(tx.budget.key) : 0, tx.budget?.extra ?? 0, tx.budget?.ttl ?? 0]
  return [COMMIT_LUA, keys.length, ...keys, ...head, ...entries]
}

export class UpstashStore implements LikeStore {
  private url: string
  private token: string
  private timeoutMs: number
  constructor(url: string, token: string, timeoutMs = 1500) { this.url = url; this.token = token; this.timeoutMs = timeoutMs }

  private async call(path: string, body: unknown): Promise<unknown> {
    let res: Response
    try {
      res = await fetch(this.url.replace(/\/+$/, '') + path, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch { throw new StoreError('store unreachable') }
    if (!res.ok) throw new StoreError(`store answered ${res.status}`)
    try { return await res.json() } catch { throw new StoreError('store reply unreadable') }
  }

  async read(cmds: Cmd[]): Promise<unknown[]> {
    if (!cmds.length) return []
    const out = await this.call('/pipeline', cmds.map(c => c.map(String)))
    if (!Array.isArray(out) || out.length !== cmds.length) throw new StoreError('bad pipeline reply')
    return out.map(r => { const o = r as { result?: unknown; error?: string }; if (o?.error) throw new StoreError('command failed'); return o?.result ?? null })
  }

  async commit(tx: Tx): Promise<CommitResult> {
    const out = await this.call('', ['EVAL', ...evalArgs(tx).map(String)]) as { result?: unknown; error?: string }
    const r = out?.result
    if (out?.error || !Array.isArray(r) || r.length !== 2) throw new StoreError('commit failed')
    const [i, calls] = r.map(Number)
    return i === 0 ? { ok: true, calls } : { ok: false, failed: i - 1, calls }
  }
}
