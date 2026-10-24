/**
 * Live data checks (P4-E): fixture determinism, backoff, poll retry/caching/pause and rate limits,
 * push and websocket transports, all against a fake env (manual clock, fake fetch / storage /
 * socket) — never the network. `pnpm verify` runs them through `liveChecks()`.
 *
 *   npx tsx scripts/live.ts
 */
import { pathToFileURL } from 'node:url'
import { backoff, createSource, fetchJson, type FetchResponse, type SocketLike, type SourceEnv } from '../src/data/source'
import { poll, websocket } from '../src/data/transports'
import { CONTRIB_FIXTURE_NOW, GH_WEEKS, WEATHER_FIXTURE, contribFixture, mapContribs, mapNowPlaying, mapWeather, weatherSource, NOW_PLAYING_FIXTURE } from '../src/data/sources'
import { textId, textOf } from '../src/data/text'
import { liveBoard } from '../src/widgets/boards/live'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome } from '../src/widgets'

type Assert = (name: string, cond: boolean, detail?: string) => void

/** Manual clock + timers, in-memory storage, scripted fetch responses, controllable visibility. */
function fakeEnv(responses: (() => FetchResponse | Error)[] = []) {
  let now = 1_000_000, seq = 0, hidden = false
  const timers = new Map<number, { at: number; fn: () => void }>(), store = new Map<string, string>(), visibility = new Set<() => void>()
  const calls: { url: string; at: number }[] = [], sockets: FakeSocket[] = []
  class FakeSocket implements SocketLike {
    onopen: (() => void) | null = null; onmessage: ((e: { data: unknown }) => void) | null = null
    onclose: (() => void) | null = null; onerror: (() => void) | null = null; closed = false
    constructor(readonly url: string) { sockets.push(this) }
    close() { this.closed = true }
  }
  const env: SourceEnv = {
    fetch: async url => { calls.push({ url, at: now }); const r = responses.shift()?.() ?? new Error('offline'); if (r instanceof Error) throw r; return r },
    now: () => now,
    setTimeout: (fn, ms) => { timers.set(++seq, { at: now + ms, fn }); return seq },
    clearTimeout: h => { timers.delete(h as number) },
    storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v) } },
    hidden: () => hidden,
    onVisibility: cb => { visibility.add(cb); return () => visibility.delete(cb) },
    random: () => 1,
    WebSocket: FakeSocket,
  }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  /** Advance the clock by `ms`, firing due timers in order (and letting their promises settle). */
  const advance = async (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0]); now = Math.max(now, due[1].at); due[1].fn(); await flush()
    }
    now = end; await flush()
  }
  const setHidden = (h: boolean) => { hidden = h; for (const cb of visibility) cb() }
  return { env, advance, calls, store, sockets, setHidden, pending: () => timers.size }
}
const ok = (body: unknown): FetchResponse => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body })
const limited = (resetS: number): FetchResponse => ({ ok: false, status: 403, headers: { get: (h: string) => (h === 'x-ratelimit-remaining' ? '0' : h === 'x-ratelimit-reset' ? String(resetS) : null) }, json: async () => ({}) })

export async function liveChecks(assert: Assert) {
  // fixtures: the same payload maps to the same numbers on every run; text ids round-trip
  const a = JSON.stringify(mapContribs(contribFixture(), CONTRIB_FIXTURE_NOW)), b = JSON.stringify(mapContribs(contribFixture(), CONTRIB_FIXTURE_NOW))
  const gh = mapContribs(contribFixture(), CONTRIB_FIXTURE_NOW), grid = textOf(gh.ghGrid)
  assert('live fixture: contributions map deterministically; grid = 52 weeks + today (Fri), levels 0–4, today active',
    a === b && grid.length === 7 * GH_WEEKS + 5 + 1 && gh.ghDow === 5 && /^[0-4]+$/.test(grid) && grid.at(-1) !== '0' && gh.ghToday === 6, `${gh.ghTotal} total, streak ${gh.ghStreak}`)
  const wx = mapWeather(WEATHER_FIXTURE, 'Tokyo'), np = mapNowPlaying(NOW_PLAYING_FIXTURE)
  assert('live fixture: weather + now playing map deterministically (12 hourly keys, sanitized text, position 0–1)',
    JSON.stringify(wx) === JSON.stringify(mapWeather(WEATHER_FIXTURE, 'Tokyo')) && textOf(wx.wxPlace) === 'TOKYO' && wx.wxH11 === 14.6 && textOf(np.npTitle) === 'LOW TIDE SIGNAL' && Math.abs(np.npPos - 102 / 238) < 1e-9)
  assert('live text: ids are stable FNV hashes; unsupported glyphs and accents are folded', textId('Café ☃ Ñ') === textId('CAFE N') && textOf(textId('Café ☃ Ñ')) === 'CAFE N' && textId('') === 0)
  const frame = () => liveBoard.map(p => JSON.stringify(sampleLayers(withChrome(p)({ t: 0, data: p.defaults ?? {} }), p.grid, p.style, dot480))).join()
  assert('live board: every card declares its source status key in its defaults (the board only passes declared keys)', liveBoard.every(p => ['wxStatus', 'npStatus', 'ghStatus'].some(k => p.defaults?.[k] === 0)))
  assert('live board: fixture frames are identical across samples (goldens never see the network)', frame() === frame())

  // backoff: doubles from base, capped, jitter in [0.5, 1]
  const seq = [0, 1, 2, 3, 20].map(n => backoff(n, 1, { baseMs: 1000, maxMs: 30_000 }))
  assert('live backoff: 1 s, 2 s, 4 s, 8 s … capped at 30 s; jitter halves at most', seq.join() === '1000,2000,4000,8000,30000' && backoff(2, 0, { baseMs: 1000 }) === 2000)

  // poll: two failures back off (5 s, 10 s), then success → live + cached; next poll at the interval
  {
    const f = fakeEnv([() => new Error('down'), () => new Error('down'), () => ok(WEATHER_FIXTURE), () => ok({ ...WEATHER_FIXTURE, current: { ...WEATHER_FIXTURE.current, temperature_2m: 3 } })])
    const src = weatherSource({ lat: 1, lon: 2, place: 'Testville', intervalMs: 60_000 }, f.env)
    const off = src.subscribe(() => {})
    await f.advance(0)
    const afterFail = src.snapshot().status
    await f.advance(5_000); await f.advance(10_000)
    const live = src.snapshot()
    await f.advance(60_000)
    const at = f.calls.map(c => c.at - f.calls[0].at)
    const cached = JSON.parse(f.store.get('dot480:live:weather') ?? '{}')
    assert('live poll: failure → offline (fixture kept), retries at +5 s, +15 s, success → live, then every interval',
      afterFail === 'offline' && at.join() === '0,5000,15000,75000' && live.status === 'live' && textOf(live.data.wxPlace) === 'TESTVILLE' && src.snapshot().data.wxTemp === 3, at.join())
    assert('live cache: last good value persisted with its text', cached.data?.wxTemp === 3 && cached.text?.wxPlace === 'TESTVILLE')
    // hidden tab: no requests; visible again → the due poll runs at once
    f.setHidden(true)
    const before = f.calls.length
    await f.advance(5 * 60_000)
    const whileHidden = f.calls.length - before
    f.setHidden(false); await f.advance(0)
    assert('live pause: no requests while hidden, one on return', whileHidden === 0 && f.calls.length === before + 1, `hidden ${whileHidden}`)
    off()
    assert('live stop: last unsubscribe clears every timer', f.pending() === 0)
    // a fresh source on the same storage starts from the cache, then keeps it through failures
    const f2 = fakeEnv([() => new Error('down')]); for (const [k, v] of f.store) f2.store.set(k, v)
    const again = weatherSource({ lat: 1, lon: 2, place: 'Testville' }, f2.env)
    const off2 = again.subscribe(() => {}); await f2.advance(0)
    assert('live cache: restart → cached value with status cached, kept through a failed fetch', again.snapshot().status === 'cached' && again.snapshot().data.wxTemp === 3 && again.snapshot().data.wxStatus === 1)
    off2()
  }

  // rate limit: a 403 with X-RateLimit-Reset waits until the reset, not the short backoff
  {
    const f = fakeEnv([() => limited((1_000_000 + 600_000) / 1000)]) // fake clock starts at 1e6 ms
    const src = createSource({ id: 'rl', statusKey: 's', fixture: { x: 0 }, map: (p: { x: number }) => ({ x: p.x }), transports: [poll(e => fetchJson<{ x: number }>(e, 'https://x'), 60_000)] }, f.env)
    let retry: number | null = null
    const off = src.subscribe(s => { retry = s.retryInMs })
    await f.advance(0)
    assert('live rate limit: retry waits for X-RateLimit-Reset (10 min)', retry === 600_000, String(retry))
    off()
  }

  // push + websocket: payloads go live; a dropped socket reconnects on backoff
  {
    const f = fakeEnv()
    const src = createSource({ id: 'np', statusKey: 'npStatus', fixture: mapNowPlaying(NOW_PLAYING_FIXTURE), map: mapNowPlaying, transports: [websocket('ws://bridge')] }, f.env)
    const off = src.subscribe(() => {})
    src.push({ title: 'Pushed', duration: 100, position: 50 })
    const pushed = src.snapshot()
    f.sockets[0].onopen?.(); f.sockets[0].onmessage?.({ data: JSON.stringify({ title: 'From socket', playing: false }) })
    const viaWs = src.snapshot()
    f.sockets[0].onclose?.(); await f.advance(2_000)
    assert('live push: Source.push maps and goes live', pushed.status === 'live' && textOf(pushed.data.npTitle) === 'PUSHED' && pushed.data.npPos === .5)
    assert('live websocket: message → data; close → reconnect after 2 s backoff', textOf(viaWs.data.npTitle) === 'FROM SOCKET' && viaWs.data.npPlay === 0 && f.sockets.length === 2)
    f.setHidden(true)
    assert('live websocket: hidden tab closes the socket', f.sockets[1].closed)
    off()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let failures = 0
  await liveChecks((name, cond, detail = '') => { if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`); else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ } })
  if (failures) process.exit(1)
}
