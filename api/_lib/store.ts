/**
 * The store likes use (#169). Two calls cover everything:
 *  - `read(cmds)`: one pipeline of read commands (GET, HGET, HGETALL, ZRANGEBYSCORE, ...), results in order;
 *  - `commit(tx)`: one atomic write. Every guard is checked first; if any fails, nothing is written and the
 *    guard's index comes back. Otherwise every op runs. On Upstash this is one Lua script (`./upstash.ts`); the
 *    in-memory store (`./memory.ts`) runs the same steps in TypeScript for the tests.
 * The rules (who may like, what a like does to the totals) live in `./likes.ts` and only build these transactions,
 * so both stores share them. Each commit also adds its own command count to the daily budget key.
 */

/** A guard: `eq` the hash field holds `value` ('' = absent); `cap` the counter is below `max`; `absent` no such key. */
export type Guard =
  | { g: 'eq'; key: string; field: string; value: string }
  | { g: 'cap'; key: string; max: number }
  | { g: 'absent'; key: string }

/** An op. `ttl` in seconds. `pub` rewrites an item's public count (round(weight / 4)) from its totals hash. */
export type Op =
  | { o: 'incr'; key: string; ttl: number }
  | { o: 'hincr'; key: string; field: string; by: number }
  | { o: 'hset'; key: string; field: string; value: string }
  | { o: 'hdel'; key: string; field: string }
  | { o: 'zadd'; key: string; score: number; member: string; nx?: boolean }
  | { o: 'zrem'; key: string; member: string }
  | { o: 'sadd'; key: string; member: string }
  | { o: 'srem'; key: string; member: string }
  | { o: 'setex'; key: string; value: string; ttl: number }
  | { o: 'del'; key: string }
  | { o: 'pub'; totals: string; target: string; member: string; zset?: boolean }

export interface Tx {
  guards: Guard[]
  ops: Op[]
  /** The day's command budget key: the commit adds every command it ran, plus `extra` (the reads before it). */
  budget?: { key: string; extra: number; ttl: number }
}

/** `ok`, or the index (into `guards`) of the first guard that failed. `calls` is the commands the commit ran. */
export type CommitResult = { ok: true; calls: number } | { ok: false; failed: number; calls: number }

export type Cmd = (string | number)[]

export interface LikeStore {
  read(cmds: Cmd[]): Promise<unknown[]>
  commit(tx: Tx): Promise<CommitResult>
}

/** The store failed (down, slow, out of budget at Upstash): the API answers "likes paused". */
export class StoreError extends Error { constructor(message: string) { super(message); this.name = 'StoreError' } }

/** A Redis reply as a string ('' for nil). */
export const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
export const int = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0 }
/** HGETALL as an object: Upstash returns a flat [field, value, ...] list. */
export function hashOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (Array.isArray(v)) for (let i = 0; i + 1 < v.length; i += 2) out[String(v[i])] = String(v[i + 1])
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) out[k] = String(x)
  return out
}
