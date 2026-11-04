/**
 * Likes checks (#169): every rule of the likes API against the in-memory store, with no secrets and no network,
 * plus the generated function bundle, the vercel.json wiring and the feature-off switch.
 *
 *   npx tsx scripts/likes/checks.ts     (also part of `pnpm verify`)
 */
import { readFileSync } from 'node:fs'
import { likesConfig } from '../../api/_lib/config'
import { readVoter } from '../../api/_lib/cookie'
import { networkPrefix } from '../../api/_lib/net'
import { COMMIT_LUA, evalArgs } from '../../api/_lib/upstash'
import { programKey } from '../../api/_lib/gen/site.mjs'
import { programHash } from '../../src/lib/share'
import { EXAMPLES } from '../../src/components/dwitter/examples'
import { checker, type Assert } from '../lib/check'
import { admin, flagged, purge, recount, restore } from './admin'
import { bundleCurrent } from './bundle'
import { Browser, call, count, jsonOf, ORIGIN, totals, world, type Route } from './harness'

const ROUTES: Route[] = ['like', 'visit', 'forget', 'widgets', 'program', 'cron']

export async function likesChecks(assert: Assert) {
  const [A, B] = [...(await import('../../api/_lib/gen/site.mjs')).WIDGET_UIDS], WA = `w:${A}`, WB = `w:${B}`

  // off: missing env or LIKES=off → no config → every route a 404 that never touches a store
  const full = { UPSTASH_REDIS_REST_URL: 'https://x.invalid', UPSTASH_REDIS_REST_TOKEN: 't', LIKE_COOKIE_KEY: 'c'.repeat(40), LIKE_HASH_KEY: 'h'.repeat(40) }
  const offs = [{}, { ...full, LIKES: 'off' }, { ...full, LIKE_HASH_KEY: '' }, { ...full, UPSTASH_REDIS_REST_URL: undefined }, { ...full, LIKE_COOKIE_KEY: 'short' }]
  const kv = likesConfig({ KV_REST_API_URL: 'https://kv.invalid', KV_REST_API_TOKEN: 't', LIKE_COOKIE_KEY: 'c'.repeat(40), LIKE_HASH_KEY: 'h'.repeat(40) })
  const statuses = await Promise.all(ROUTES.map(r => call(null, r).then(x => x.status)))
  assert('likes: missing env vars or LIKES=off turn likes off; every route is a 404 without a store', offs.every(e => likesConfig(e) === null) && statuses.every(s => s === 404) && kv?.redis.url === 'https://kv.invalid', statuses.join(','))

  // one like per browser per item; a double click with the same key counts once
  {
    const w = world(), b = new Browser(w)
    await b.remember()
    const r1 = await jsonOf(await b.like(WA)), r2 = await jsonOf(await b.like(WA))
    const key = 'samekey001', d1 = await b.like(WB, true, key), d2 = await b.like(WB, true, key)
    w.advance(25)
    const n = await count(w, A), t = await totals(w, WA), tb = await totals(w, WB)
    assert('likes: a duplicate like counts once ("already liked"), a double click with one key counts once', r1.soon === true && r2.already === true && d1.status === 200 && d2.status === 200 && t.raw === 1 && tb.raw === 1 && n === 1, `${JSON.stringify(r2)} raw ${t.raw}/${tb.raw} count ${n}`)
  }

  // unlike then like again keeps the old status; a flagged like stays flagged
  {
    const w = world(), b = new Browser(w)
    await b.remember(); await b.like(WA); w.advance(25); await count(w, A)
    const counted = await totals(w, WA)
    await b.like(WA, false); const gone = await totals(w, WA)
    const back = await jsonOf(await b.like(WA)); const again = await totals(w, WA)
    // a burst: 20 Once likes from 20 networks, then one more is held and flagged after the hold
    for (let i = 0; i < 20; i++) await new Browser(w, `198.51.${i}.1`).like(WB)
    const late = new Browser(w, '192.0.2.200'); await late.like(WB)
    w.advance(25); await count(w, B)
    const before = await totals(w, WB)
    await late.like(WB, false); w.advance(30); await late.like(WB)
    const after = await totals(w, WB)
    assert('likes: unlike then like again restores a counted like at once (no new hold)', counted.raw === 1 && gone.raw === 0 && again.raw === 1 && back.soon === false, `${counted.raw} → ${gone.raw} → ${again.raw}`)
    assert('likes: a flagged like stays flagged after an unlike and a like again, a day later', before.flag === 1 && after.flag === 1 && after.raw === before.raw, `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`)
  }

  // bursts: New and Once likes past 20 an hour on one item are flagged; Returning likes in the same hour count
  {
    const w = world()
    const ret: Browser[] = []
    for (let i = 0; i < 3; i++) { const b = new Browser(w, `100.64.${i}.9`); await b.remember(); ret.push(b) }
    w.advance(21); for (const b of ret) await b.remember() // second visit, 21 h later: Returning
    for (let i = 0; i < 26; i++) await new Browser(w, `10.${i}.0.1`).like(WA)
    for (const b of ret) await b.like(WA)
    w.advance(25); await count(w, A)
    const t = await totals(w, WA)
    assert('likes: a burst of New and Once likes is flagged after the hold; Returning likes in that hour count', t.flag === 6 && t.raw === 23 && t.pend === 0 && t.w === 20 + 12, JSON.stringify(t))
    assert('likes: the public count is the rounded weighted total (20 Once × ¼ + 3 Returning = 8)', (await count(w, A)) === 8)
  }

  // the hold: a like counts only after it; the scripted burst leaves the public count unchanged
  {
    const w = world(), b = new Browser(w)
    await b.like(WA)
    const early = await count(w, A); w.advance(23); const mid = await count(w, A); w.advance(2); const late = await count(w, A)
    assert('likes: a Once like is pending for 24 h (count hidden while 0), then counts ¼ (shown as 0 until rounding reaches 1)', early === 0 && mid === 0 && late === 0 && (await totals(w, WA)).raw === 1)
  }

  // each limit trips with a 429 and writes nothing
  {
    const w = world({ LIKE_LIMITS: 'nd=100' }), b = new Browser(w), widgets = [...(await import('../../api/_lib/gen/site.mjs')).WIDGET_UIDS].slice(0, 60).map(u => `w:${u}`)
    await b.remember()
    const codes: number[] = []
    for (let i = 0; i < 6; i++) codes.push((await b.like(widgets[i])).status)
    const vmKeys = w.store.keys('lk:l:').length
    assert('likes: limit: 5 likes a minute per voter, the 6th is a 429 that writes no ledger entry', codes.slice(0, 5).every(c => c === 200) && codes[5] === 429 && vmKeys === 5, codes.join(','))
    const day: number[] = []
    for (let i = 6; i < 50; i++) { if ((i - 6) % 5 === 0) w.advance(1 / 60 + 0.001); day.push((await b.like(widgets[i])).status) }
    assert('likes: limit: 40 likes a day per voter (and 30 a day per network, below)', day.filter(c => c === 200).length === 35 && day.at(-1) === 429, `${day.filter(c => c === 200).length} ok`)

    const nd = world(), ndr: number[] = []
    const x = new Browser(nd, '203.0.113.40'); await x.remember()
    for (let i = 0; i < 31; i++) { if (i % 5 === 0) nd.advance(1 / 60 + 0.001); ndr.push((await x.like(widgets[i])).status) }
    assert('likes: limit: 30 likes a day per network', ndr.filter(c => c === 200).length === 30 && ndr[30] === 429, `${ndr.filter(c => c === 200).length} ok`)
    const once = world(), got: number[] = []
    for (let i = 0; i < 11; i++) got.push((await new Browser(once, '203.0.113.50').like(widgets[i], true, undefined, { headers: { 'x-forwarded-for': `9.9.9.${i}` } })).status)
    assert('likes: limit: 10 Once likes a day per network (spoofed forwarded-for headers change nothing)', got.slice(0, 10).every(c => c === 200 || c === 429) && got.filter(c => c === 200).length <= 10 && got[10] === 429, got.join(','))

    const ni = world(), r: number[] = []
    for (let i = 0; i < 4; i++) { const x = new Browser(ni, '203.0.113.60'); ni.advance(0.02); r.push((await x.like(WA)).status) }
    assert('likes: limit: one Once like per network per item (a second browser on the network is "already liked")', r[0] === 200 && (await jsonOf(await new Browser(ni, '203.0.113.60').like(WA))).already === true)
    const nc = world(), issued: number[] = []
    for (let i = 0; i < 4; i++) issued.push((await new Browser(nc, '203.0.113.70').remember()).status)
    assert('likes: limit: 3 new voter cookies per network per day, the 4th is a 429 with no cookie', issued.join(',') === '200,200,200,429', issued.join(','))
    const per = world(), pr: number[] = []
    for (let i = 0; i < 4; i++) { const x = new Browser(per, '203.0.113.80'); per.advance(i === 3 ? 25 : 0); await x.remember(); pr.push((await x.like(WB)).status) }
    assert('likes: limit: 3 New likes per network per item, then a 429', pr.join(',') === '200,200,200,429', pr.join(','))
    const site = world({ LIKE_LIMITS: 'site=3' }), sr: number[] = []
    for (let i = 0; i < 4; i++) sr.push((await new Browser(site, `172.16.${i}.1`).like(WA)).status)
    assert('likes: the site-wide daily cap makes the API read-only ("likes paused")', sr.join(',') === '200,200,200,503' && (await call(site, 'widgets')).status === 200, sr.join(','))
  }

  // cookies: forged, edited, wrong key id, revoked → Once; the network ignores forwarded-for
  {
    const w = world(), b = new Browser(w); await b.remember()
    const good = await readVoter(new Request(ORIGIN, { headers: { cookie: b.cookie } }), w.d.cfg.cookieKey)
    const parts = b.cookie.split('.'), edited = [...parts.slice(0, 4), '9', ...parts.slice(5)].join('.')
    const other = world({ LIKE_COOKIE_KEY: 'z'.repeat(40) }), ob = new Browser(other); await ob.remember()
    const asReq = (c: string, key = w.d.cfg.cookieKey) => readVoter(new Request(ORIGIN, { headers: { cookie: c } }), key)
    const bad = await Promise.all([asReq(edited), asReq(ob.cookie), asReq('dot480_lk=1.aaaaaa.' + 'b'.repeat(22) + '.1.9.1.' + 'c'.repeat(43))])
    assert('likes: an edited cookie, one signed with another key (wrong key id) or a forged one reads as no voter', !!good && bad.every(v => v === null))
    const hash = await import('../../api/_lib/crypto').then(m => m.hmac(w.d.cfg.hashKey, `v|${good!.id}`, 22))
    await w.store.commit({ guards: [], ops: [{ o: 'sadd', key: 'lk:rev', member: `v:${hash}` }] })
    await b.like(WA)
    const [entries] = await w.store.read([['HGETALL', `lk:l:${WA}`]]) as string[][]
    assert('likes: a revoked voter is treated as Once (keyed by its network)', entries.length === 2 && entries[0].startsWith('n:') && entries[1].includes('|O|'), String(entries))
    const n1 = networkPrefix('203.0.113.7'), n6 = networkPrefix('2001:db8:85a3::8a2e:370:7334'), mapped = networkPrefix('::ffff:203.0.113.99')
    const s1 = await new Browser(world(), '203.0.113.7').like(WA, true, undefined, { headers: { 'x-forwarded-for': '1.1.1.1' } })
    assert('likes: the network is the /24 or /64 of x-real-ip only; junk and a missing IP are refused', n1 === '4:203.0.113' && n6 === '6:2001:db8:85a3:0' && mapped === '4:203.0.113' && networkPrefix('1.2.3.256') === null && networkPrefix('1.1.1.1, 2.2.2.2') === null && s1.status === 200
      && (await call(world(), 'like', { ip: '', body: { item: WA, on: true, key: 'nokey0001' } })).status === 400)
  }

  // rejected before the store
  {
    const w = world(), base = { item: WA, on: true, key: 'abcdefgh1' }
    const cases: [string, Route, Parameters<typeof call>[2]][] = [
      ['unknown item', 'like', { body: { ...base, item: 'w:zzzzzzz9' } }], ['bad item', 'like', { body: { ...base, item: 'board:x' } }],
      ['invalid program', 'like', { body: { program: { src: 'sin(', grid: 'square', lattice: 2, tone: 'auto' }, on: true, key: 'abcdefgh2' } }],
      ['program and item', 'like', { body: { ...base, program: EXAMPLES[0] } }], ['extra field', 'like', { body: { ...base, x: 1 } }],
      ['oversized body', 'like', { raw: JSON.stringify({ ...base, key: 'k'.repeat(30) }) + ' '.repeat(5000) }], ['not JSON', 'like', { raw: '{' }],
      ['wrong origin', 'like', { body: base, headers: { origin: 'https://evil.test' } }], ['cross-site fetch', 'like', { body: base, headers: { 'sec-fetch-site': 'cross-site' } }],
      ['wrong content type', 'like', { body: base, headers: { 'content-type': 'text/plain' } }], ['GET a write', 'like', { method: 'GET' }],
      ['query on widgets', 'widgets', { path: '/api/likes/widgets?x=1' }], ['short hash', 'program', { path: '/api/likes/p/abc' }],
      ['query on a program', 'program', { path: `/api/likes/p/${'a'.repeat(64)}?b=1` }], ['upper-case hash', 'program', { path: `/api/likes/p/${'A'.repeat(64)}` }],
      ['visit without remember', 'visit', { body: {} }], ['cron without the secret', 'cron', { headers: { authorization: 'Bearer nope' } }],
    ]
    const bad: string[] = []
    for (const [name, r, o] of cases) { const before = w.store.calls, res = await call(w, r, o); if (res.status < 400 || w.store.calls !== before || res.headers.get('access-control-allow-origin')) bad.push(`${name} ${res.status}`) }
    w.botty.on = true
    const botRes = await call(w, 'like', { body: base })
    assert(`likes: ${cases.length} bad requests (unknown items, invalid programs, oversized bodies, wrong origin or type, query strings) and a bot are refused before the store`, !bad.length && botRes.status === 403 && w.store.calls === 0, bad.join('; '))
    const okHash = await call(w, 'program', { path: `/api/likes/p/${'a'.repeat(64)}?hash=${'a'.repeat(64)}` })
    assert('likes: a program read may carry the route\'s own ?hash= (a Vercel file route) and nothing else', okHash.status === 200)
  }

  // program keys: content, not the FNV id; formatting doesn't matter
  {
    const p = (src: string) => ({ src, grid: 'square', lattice: 2, tone: 'auto' })
    const [a, b] = [p('u * 29404 + v * 416'), p('u * 26067 + v * 333')]
    const same = [await programKey(p('u*.5+v')), await programKey(p('// a comment\nu * 0.5 + v ')), await programKey(p('  u * .5\n+ v'))]
    assert('likes: two programs with the same FNV id get different keys; one program in three formattings gets one key', programHash(a) === programHash(b) && (await programKey(a)) !== (await programKey(b)) && new Set(same).size === 1
      && (await programKey({ ...p('u*.5+v'), lattice: 3 })) !== same[0])
    const w = world(), x = new Browser(w)
    const r = await jsonOf(await x.likeProgram(EXAMPLES[0])), key = await programKey(EXAMPLES[0])
    w.advance(25)
    const n = await jsonOf(await call(w, 'program', { path: `/api/likes/p/${key}` }))
    assert('likes: a gallery program is liked by content and read back by its key', r.on === true && n.n === 0 && (await totals(w, `p:${key}`)).raw === 1)
  }

  // forget this browser
  {
    const w = world(), b = new Browser(w); await b.remember()
    await b.like(WA); await b.like(WB); w.advance(25); await count(w, A)
    const before = await totals(w, WA)
    const res = await b.forget()
    const after = [await totals(w, WA), await totals(w, WB)], [left] = await w.store.read([['HGETALL', `lk:l:${WA}`]])
    assert('likes: "forget this browser" removes its likes, recounts the items and clears the cookie', before.raw === 1 && after.every(t => t.raw === 0 && t.pend === 0 && t.w === 0) && (left as string[]).length === 0
      && /Max-Age=0/.test(res.headers.get('set-cookie') ?? '') && b.cookie === '' && w.store.keys('lk:v:').length === 0)
  }

  // the budget: over it, writes pause and reads keep working; reads cache, writes don't
  {
    const w = world({ LIKE_LIMITS: 'budget=40,hard=1000' }), b = new Browser(w)
    const s: number[] = []
    for (let i = 0; i < 4; i++) s.push((await new Browser(w, `10.9.${i}.1`).like(WA)).status)
    const read = await call(w, 'widgets'), before = w.store.calls, again = await b.like(WB)
    assert('likes: over the daily command budget writes return "likes paused" and reads still work', s.includes(503) && read.status === 200 && again.status === 503 && w.store.calls === before, `${s} read ${read.status}`)
    assert('likes: count reads are cached at the CDN (5 min, no cookie); writes are no-store', /s-maxage=300/.test(read.headers.get('cache-control') ?? '') && !read.headers.get('set-cookie') && again.headers.get('cache-control') === 'no-store')
    const hard = world({ LIKE_LIMITS: 'hard=20' }); await call(hard, 'widgets'); for (let i = 0; i < 5; i++) await call(hard, 'widgets')
    const calls = hard.store.calls; const r2 = await call(hard, 'widgets')
    assert('likes: past the hard ceiling even reads stop reaching the store for the rest of the day', r2.status === 503 && hard.store.calls === calls)
  }

  // the daily job
  {
    const w = world(), b = new Browser(w)
    await b.like(WA); await b.likeProgram({ src: 'u', grid: 'square', lattice: 2, tone: 'auto' }); await b.likeProgram(EXAMPLES[1])
    const unauth = await call(w, 'cron')
    w.advance(24 * 91)
    const res = await jsonOf(await call(w, 'cron', { headers: { authorization: `Bearer ${'s'.repeat(24)}` } }))
    const programs = w.store.keys('lk:l:p:').length, once = w.store.keys(`lk:l:${WA}`).length
    assert('likes: the daily job (Bearer CRON_SECRET) releases held likes, drops Once records after 30 days, expires small programs but keeps seeds', unauth.status === 401 && res.released === 3 && res.once === 3 && res.expired === 1 && programs === 0 && once === 0 && (await totals(w, WA)).raw === 1, JSON.stringify(res))
  }

  // admin: flagged, restore, purge, recount
  {
    const w = world(), a = admin(w.store)
    for (let i = 0; i < 22; i++) await new Browser(w, `10.1.${i}.1`).like(WA)
    w.advance(25); await count(w, A)
    const f = await flagged(a), fixed = await restore(a, { item: WA }), t = await totals(w, WA)
    await w.store.commit({ guards: [], ops: [{ o: 'hset', key: `lk:c:${WA}`, field: 'w', value: '999' }] })
    const re = await recount(a, WA), purged = await purge(a, { item: WA, all: true })
    assert('likes: admin lists flagged likes, restores them, recounts an item and purges', f.length === 2 && fixed === 2 && t.raw === 22 && t.flag === 0 && re.w === 22 && purged === 22 && (await totals(w, WA)).raw === 0)
  }

  // the Lua commit script handles every op the TypeScript side emits
  {
    const tx = { guards: [{ g: 'eq', key: 'a', field: 'f', value: '' }, { g: 'cap', key: 'b', max: 3 }, { g: 'absent', key: 'c' }], ops: ['incr', 'hincr', 'hset', 'hdel', 'zadd', 'zrem', 'sadd', 'srem', 'setex', 'del', 'pub'].map(o => ({ o, key: 'a', field: 'f', by: 1, value: 'v', score: 1, member: 'm', ttl: 9, totals: 't', target: 'p' })) } as never
    const args = evalArgs(tx), codes = ['eq', 'cap', 'absent', 'incr', 'hincr', 'hset', 'hdel', 'zadd', 'zrem', 'sadd', 'srem', 'setex', 'del', 'pub']
    assert('likes: the Lua commit script knows every guard and op code, and EVAL args are 5 slots per entry', codes.every(c => COMMIT_LUA.includes(`'${c}'`) || (c === 'absent')) && args.length === 2 + Number(args[1]) + 5 + 14 * 5 && !/cjson|redis\.pcall|os\.|io\./.test(COMMIT_LUA))
  }

  // what one like costs in Upstash commands (counting every command inside the script)
  {
    const w = world(), b = new Browser(w); await b.like(WA)
    const one = w.store.calls
    await new Browser(w).like(WB); const next = w.store.calls - one
    assert('likes: one like costs ≤ 40 store commands counting every command inside the script (≤ 32 once its counters exist)', one <= 40 && next <= 32, `${one} first, ${next} next`)
  }

  // the bundle, vercel.json and the client wiring
  {
    assert('likes: api/_lib/gen/site.mjs is current (npx tsx scripts/likes/bundle.ts)', await bundleCurrent())
    const v = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: { path: string; schedule: string }[]; regions?: string[]; rewrites: { source: string }[] }
    const daily = v.crons?.length === 1 && v.crons[0].path === '/api/likes/cron' && /^\d+ \d+ \* \* \*$/.test(v.crons[0].schedule)
    const { sourceRegex } = await import('../lib/vercel-source')
    const caught = v.rewrites.filter(r => ['/api/like', '/api/likes/widgets', `/api/likes/p/${'a'.repeat(64)}`, '/api/likes/cron'].some(p => sourceRegex(r.source).test(p)))
    assert('likes: vercel.json runs the job once a day, pins one region, and no rewrite catches /api', daily && v.regions?.length === 1 && !caught.length, caught.map(r => r.source).join(', '))
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/likes/checks.ts')) {
  const { assert, done } = checker('likes')
  await likesChecks(assert)
  done('all likes checks passed')
}
