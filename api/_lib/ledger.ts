/**
 * Ledger entries, tiers and Redis keys for likes (#169).
 *
 * An item's ledger `lk:l:<item>` is a hash of `v:<voter hash>` (remembered browsers) or `n:<network hash>` (Once)
 * to `status|tier|liked at|removed at|status before removal`, times in seconds. Statuses: `p` pending, `b` pending
 * in a burst (flagged when its hold ends), `c` counted, `f` flagged, `r` removed. Nothing is deleted straight away.
 * The totals `lk:c:<item>` hold `w` (counted weight in quarters, so the maths stays in integers), `raw` (counted
 * likes), `pend` and `flag`. The public count is round(w / 4): `lk:pub` (widgets, one hash for one read) or the
 * program index `lk:idx:p`.
 */
import type { Op } from './store.js'

export type Tier = 'R' | 'N' | 'O'
export type Status = 'p' | 'b' | 'c' | 'f' | 'r'
/** Weight in quarters: Returning 1, New 0.5, Once 0.25. */
export const WEIGHT: Record<Tier, number> = { R: 4, N: 2, O: 1 }
/** Hold before a like counts, seconds: Returning 1 h, the others 24 h. */
export const HOLD: Record<Tier, number> = { R: 3600, N: 86400, O: 86400 }
/** Liking again within this many seconds of an unlike restores the old status. */
export const RESTORE_S = 86400
export const ONCE_KEEP_S = 30 * 86400

export interface Entry { s: Status; t: Tier; at: number; rm: number; prev: Status | '-' }

export const encode = (e: Entry) => `${e.s}|${e.t}|${e.at}|${e.rm}|${e.prev}`
export function decode(v: unknown): Entry | null {
  const m = typeof v === 'string' ? /^([pbcfr])\|([RNO])\|(\d{1,12})\|(\d{1,12})\|([pbcfr-])$/.exec(v) : null
  return m ? { s: m[1] as Status, t: m[2] as Tier, at: Number(m[3]), rm: Number(m[4]), prev: m[5] as Status | '-' } : null
}
export const active = (e: Entry | null): boolean => !!e && e.s !== 'r'

export const day = (s: number) => Math.floor(s / 86400)
export const K = {
  budget: (s: number) => `lk:budget:${day(s)}`,
  site: (s: number) => `lk:site:${day(s)}`,
  ledger: (item: string) => `lk:l:${item}`,
  totals: (item: string) => `lk:c:${item}`,
  pub: 'lk:pub',
  programs: 'lk:idx:p',
  programsAt: 'lk:idx:pt',
  pending: 'lk:pend',
  once: 'lk:once',
  revoked: 'lk:rev',
  voter: (voter: string) => `lk:v:${voter}`,
  idem: (who: string, key: string) => `lk:idem:${who}:${key}`,
  rate: (name: string, ...parts: (string | number)[]) => `lk:rl:${name}:${parts.join(':')}`,
}
/** A pending-set member: the item and the ledger field. */
export const member = (item: string, who: string) => `${item}|${who}`
export const splitMember = (m: string): [string, string] | null => { const i = m.indexOf('|'); return i > 0 ? [m.slice(0, i), m.slice(i + 1)] : null }

/** The ops that move an item's totals from one status to another (and keep its public count current). */
export function moveTotals(item: string, tier: Tier, from: Status | null, to: Status | null): Op[] {
  if (from === to) return []
  const t = K.totals(item), w = WEIGHT[tier], ops: Op[] = []
  const field = (s: Status | null) => s === 'c' ? 'raw' : s === 'p' || s === 'b' ? 'pend' : s === 'f' ? 'flag' : null
  const a = field(from), b = field(to)
  if (a) ops.push({ o: 'hincr', key: t, field: a, by: -1 })
  if (b) ops.push({ o: 'hincr', key: t, field: b, by: 1 })
  if (from === 'c' || to === 'c') {
    ops.push({ o: 'hincr', key: t, field: 'w', by: to === 'c' ? w : -w })
    ops.push(item.startsWith('w:') ? { o: 'pub', totals: t, target: K.pub, member: item } : { o: 'pub', totals: t, target: K.programs, member: item, zset: true })
  }
  return ops
}
