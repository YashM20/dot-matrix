/**
 * Likes admin (#169), run on the owner's machine. It talks to Upstash directly with its own token; the site has no
 * admin endpoint. Set `LIKES_ADMIN_URL` and `LIKES_ADMIN_TOKEN` (the database's REST URL and a full-access token,
 * kept off Vercel). Items are `w:<uid>` or `p:<64 hex>`; a "who" is a ledger field, `v:<voter hash>` or
 * `n:<network hash>`, as `flagged` prints them.
 *
 *   npx tsx scripts/likes/admin.ts export [file]                  totals of every item, no voter data → JSON file
 *   npx tsx scripts/likes/admin.ts flagged [--item X]             flagged and burst-held likes
 *   npx tsx scripts/likes/admin.ts restore --item X | --who W     flagged → counted
 *   npx tsx scripts/likes/admin.ts purge --item X | --who W [--all]   remove flagged likes (any status with --all)
 *   npx tsx scripts/likes/admin.ts revoke v:<hash> [--purge]      this voter's cookie counts as Once from now on
 *   npx tsx scripts/likes/admin.ts recount <item>                 rebuild an item's totals from its ledger
 */
import { writeFileSync } from 'node:fs'
import { decode, encode, K, member, moveTotals, WEIGHT, type Entry } from '../../api/_lib/ledger'
import { hashOf, int, type Guard, type LikeStore, type Op } from '../../api/_lib/store'
import { UpstashStore } from '../../api/_lib/upstash'

interface Admin { store: LikeStore; scan(prefix: string): Promise<string[]> }

/** Every key under `prefix` (SCAN, 500 at a time). */
export async function scanKeys(store: LikeStore, prefix: string): Promise<string[]> {
  const out = new Set<string>()
  let cursor = '0'
  do {
    const [r] = await store.read([['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 500]])
    const [next, keys] = r as [string, string[]]
    cursor = String(next); for (const k of keys ?? []) out.add(String(k))
  } while (cursor !== '0')
  return [...out]
}
const admin = (store: LikeStore): Admin => ({ store, scan: p => scanKeys(store, p) })

export async function ledgerOf(store: LikeStore, item: string): Promise<[string, Entry, string][]> {
  const [h] = await store.read([['HGETALL', K.ledger(item)]])
  return Object.entries(hashOf(h)).flatMap(([who, raw]) => { const e = decode(raw); return e ? [[who, e, raw] as [string, Entry, string]] : [] })
}

/** Apply status changes to one item's ledger (null removes the entry), guarded against concurrent likes. */
async function change(store: LikeStore, item: string, list: { who: string; raw: string; from: Entry; to: Entry | null }[]) {
  if (!list.length) return 0
  const guards: Guard[] = [], ops: Op[] = []
  for (const { who, raw, from, to } of list) {
    guards.push({ g: 'eq', key: K.ledger(item), field: who, value: raw })
    ops.push(to ? { o: 'hset', key: K.ledger(item), field: who, value: encode(to) } : { o: 'hdel', key: K.ledger(item), field: who }, ...moveTotals(item, from.t, from.s, to?.s ?? null))
    if ((from.s === 'p' || from.s === 'b') && to?.s !== 'p' && to?.s !== 'b') ops.push({ o: 'zrem', key: K.pending, member: member(item, who) })
  }
  const r = await store.commit({ guards, ops })
  if (!r.ok) throw new Error(`${item}: changed while updating, run it again`)
  return list.length
}

const items = async (a: Admin, item?: string) => item ? [item] : (await a.scan('lk:l:')).map(k => k.slice(5))

export async function flagged(a: Admin, item?: string) {
  const out: { item: string; who: string; status: string; tier: string; at: string }[] = []
  for (const it of await items(a, item)) for (const [who, e] of await ledgerOf(a.store, it))
    if (e.s === 'f' || e.s === 'b') out.push({ item: it, who, status: e.s === 'f' ? 'flagged' : 'burst, held', tier: e.t, at: new Date(e.at * 1000).toISOString() })
  return out
}

export async function restore(a: Admin, by: { item?: string; who?: string }) {
  let n = 0
  for (const it of await items(a, by.item)) n += await change(a.store, it, (await ledgerOf(a.store, it)).filter(([w, e]) => e.s === 'f' && (!by.who || w === by.who)).map(([who, e, raw]) => ({ who, raw, from: e, to: { ...e, s: 'c' } })))
  return n
}

export async function purge(a: Admin, by: { item?: string; who?: string; all?: boolean }) {
  let n = 0
  for (const it of await items(a, by.item)) n += await change(a.store, it, (await ledgerOf(a.store, it)).filter(([w, e]) => (by.all || e.s === 'f' || e.s === 'b') && (!by.who || w === by.who)).map(([who, e, raw]) => ({ who, raw, from: e, to: null })))
  return n
}

export async function recount(a: Admin, item: string) {
  const t = { w: 0, raw: 0, pend: 0, flag: 0 }
  for (const [, e] of await ledgerOf(a.store, item)) {
    if (e.s === 'c') { t.w += WEIGHT[e.t]; t.raw++ } else if (e.s === 'p' || e.s === 'b') t.pend++; else if (e.s === 'f') t.flag++
  }
  const ops: Op[] = (Object.keys(t) as (keyof typeof t)[]).map(f => ({ o: 'hset', key: K.totals(item), field: f, value: String(t[f]) }))
  ops.push(item.startsWith('w:') ? { o: 'pub', totals: K.totals(item), target: K.pub, member: item } : { o: 'pub', totals: K.totals(item), target: K.programs, member: item, zset: true })
  await a.store.commit({ guards: [], ops })
  return t
}

export async function exportTotals(a: Admin) {
  const keys = (await a.scan('lk:c:')).sort()
  const vals = keys.length ? await a.store.read(keys.map(k => ['HGETALL', k])) : []
  return Object.fromEntries(keys.map((k, i) => { const h = hashOf(vals[i]); return [k.slice(5), { w: int(h.w) / 4, raw: int(h.raw), pend: int(h.pend), flag: int(h.flag) }] }))
}

export { admin }

async function main(argv: string[]) {
  const url = process.env.LIKES_ADMIN_URL, token = process.env.LIKES_ADMIN_TOKEN
  if (!url || !token) { console.error('set LIKES_ADMIN_URL and LIKES_ADMIN_TOKEN'); process.exit(2) }
  const a = admin(new UpstashStore(url, token, 15000))
  const opt = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined }
  const [cmd, arg] = argv
  switch (cmd) {
    case 'export': {
      const file = arg && !arg.startsWith('--') ? arg : `likes-export-${new Date().toISOString().slice(0, 10)}.json`
      const t = await exportTotals(a); writeFileSync(file, JSON.stringify(t, null, 2) + '\n'); console.log(`${Object.keys(t).length} items → ${file}`); break
    }
    case 'flagged': console.table(await flagged(a, opt('item'))); break
    case 'restore': case 'purge': {
      const by = { item: opt('item'), who: opt('who'), all: argv.includes('--all') }
      if (!by.item && !by.who) { console.error(`${cmd} needs --item or --who`); process.exit(2) }
      console.log(`${cmd}: ${cmd === 'restore' ? await restore(a, by) : await purge(a, by)} likes`); break
    }
    case 'revoke': {
      if (!/^v:[A-Za-z0-9_-]{22}$/.test(arg ?? '')) { console.error('revoke needs a voter, v:<hash>'); process.exit(2) }
      await a.store.commit({ guards: [], ops: [{ o: 'sadd', key: K.revoked, member: arg }] })
      console.log(`revoked ${arg}${argv.includes('--purge') ? `, purged ${await purge(a, { who: arg, all: true })} likes` : ''}`); break
    }
    case 'recount': { if (!arg) { console.error('recount needs an item'); process.exit(2) } console.log(arg, await recount(a, arg)); break }
    default: console.log('commands: export, flagged, restore, purge, revoke, recount (see the header of scripts/likes/admin.ts)')
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/likes/admin.ts')) await main(process.argv.slice(2))
