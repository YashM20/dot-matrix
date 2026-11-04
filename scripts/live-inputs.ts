/**
 * Live board inputs (#147): the URL config and every outside payload, fed straight through the
 * parsers and through sources on a fake env (scripts/live.ts), never the network.
 * - URL: no parameter names a host (a hostile `?np=` is ignored), `?place=` is capped and only
 *   font glyphs, `?lat=`/`?lon=` finite and in range, `?gh=` follows GitHub's username rule.
 * - Payloads: malformed or oversized Open-Meteo, contributions, events and now-playing payloads
 *   throw a `ShapeError` before any map or spread, and a source fed one stays offline or cached.
 * - The websocket transport never throws on a bad URL; the cache ignores entries this code
 *   could not have written.
 * Called from verify.ts (`liveInputChecks(assert)`); also runnable alone: `npx tsx scripts/live-inputs.ts`.
 */
import { readFileSync } from 'node:fs'
import { bitmapFont } from '../src/engine/fields/bitmapFont'
import { GH_MAX_DAYS, GH_MAX_EVENTS, NP_TEXT_MAX, PLACE_MAX, ShapeError, WX_MAX_HOURS, parseContribApi, parseContribs, parseGhEvents, parseLiveConfig, parseNowPlaying, parseOpenMeteo, type LiveConfig } from '../src/data/parse'
import { createSource, type SocketLike, type SourceEnv } from '../src/data/source'
import { CONTRIB_FIXTURE_NOW, NOW_PLAYING_FIXTURE, WEATHER_FIXTURE, contribFixture, contribSource, fetchContribs, mapContribs, mapNowPlaying, mapWeather, nowPlayingSource, weatherSource } from '../src/data/sources'
import { textOf } from '../src/data/text'
import { websocket } from '../src/data/transports'
import type { Assert } from './lib/check'
import { fakeEnv, ok } from './live'

const D: LiveConfig = { lat: 35.68, lon: 139.69, place: 'Tokyo', user: 'YashM20' }
const cfg = (q: string) => parseLiveConfig(q, D)
/** True when `f` throws a ShapeError (and nothing else). */
const rejects = (f: () => unknown) => { try { f(); return false } catch (e) { return e instanceof ShapeError } }
const big = (n: number, v: unknown) => Array.from({ length: n }, () => v)

export async function liveInputChecks(assert: Assert) {
  // ── URL config ────────────────────────────────────────────────────────────
  const hostile = cfg('?np=wss://evil.example/x&gh=YashM20')
  const board = readFileSync(new URL('../src/widgets/boards/live.ts', import.meta.url), 'utf8')
  assert('live inputs: ?np= is ignored (the config has no socket URL; the board reads no np param and passes no url)',
    !('np' in hostile) && !JSON.stringify(hostile).includes('evil') && !/get\(\s*['"]np['"]/.test(board) && !/nowPlayingSource\(\{[^}]*url/.test(board))
  const long = cfg(`?place=${'A'.repeat(5000)}`), odd = cfg(`?place=${encodeURIComponent('<script>São Paulo ☃ {}</script>')}`)
  const drawable = (s: string) => [...s].every(ch => ch === ' ' || !!bitmapFont[ch])
  assert(`live inputs: ?place= capped at ${PLACE_MAX} and only glyphs the font draws; empty falls back`,
    long.place.length === PLACE_MAX && drawable(long.place) && drawable(odd.place) && odd.place.includes('SAO PAULO') && cfg('?place=%E2%98%83').place === 'Tokyo', `${odd.place}`)
  const ll = (q: string) => { const c = cfg(q); return `${c.lat},${c.lon}` }
  assert('live inputs: ?lat=/?lon= finite and in range, else the default',
    ll('?lat=51.51&lon=-0.13') === '51.51,-0.13' && ll('?lat=91&lon=-181') === '35.68,139.69' && ll('?lat=Infinity&lon=NaN') === '35.68,139.69' && ll('?lat=&lon=1e400') === '35.68,139.69' && ll('?lat=-90&lon=180') === '-90,180')
  const gh = (u: string) => cfg(`?gh=${encodeURIComponent(u)}`).user
  const badUsers = ['-lead', 'trail-', 'a--b', 'x'.repeat(40), '../../etc', 'a b', 'a_b', 'ü', '']
  assert('live inputs: ?gh= follows GitHub\'s username rule (1–39 letters, digits, single inner hyphens)',
    badUsers.every(u => gh(u) === 'YashM20') && gh('octo-cat') === 'octo-cat' && gh('x'.repeat(39)) === 'x'.repeat(39) && gh('A1') === 'A1', badUsers.filter(u => gh(u) !== 'YashM20').join(' '))

  // ── Open-Meteo ────────────────────────────────────────────────────────────
  const cur = WEATHER_FIXTURE.current, wx = (patch: Record<string, unknown>) => () => parseOpenMeteo({ ...WEATHER_FIXTURE, ...patch })
  assert('live inputs: Open-Meteo fixture parses to the same mapping',
    JSON.stringify(mapWeather(parseOpenMeteo(WEATHER_FIXTURE), 'Tokyo')) === JSON.stringify(mapWeather(WEATHER_FIXTURE, 'Tokyo')))
  assert(`live inputs: Open-Meteo malformed or oversized → ShapeError (non-object, missing current, string or infinite temperature, bad code, hourly over ${WX_MAX_HOURS})`,
    [() => parseOpenMeteo(null), () => parseOpenMeteo([]), () => parseOpenMeteo({}), wx({ current: { ...cur, temperature_2m: 'hot' } }), wx({ current: { ...cur, temperature_2m: Infinity } }),
      wx({ current: { ...cur, weather_code: 2.5 } }), wx({ current: { ...cur, wind_speed_10m: -1 } }), wx({ hourly: { temperature_2m: big(200_000, 20) } }), wx({ hourly: { temperature_2m: [20, null] } }),
      wx({ daily: { temperature_2m_max: 'x', temperature_2m_min: [] } })].every(rejects))
  {
    const f = fakeEnv([() => ok({ current: { ...cur, temperature_2m: 'hot' } }), () => ok(WEATHER_FIXTURE), () => ok({ ...WEATHER_FIXTURE, hourly: { temperature_2m: big(500_000, 1) } })])
    const src = weatherSource({ lat: 1, lon: 2, place: 'Testville', intervalMs: 60_000 }, f.env)
    const off = src.subscribe(() => {})
    await f.advance(0)
    const first = src.snapshot()
    await f.advance(5_000)
    const good = src.snapshot().data.wxTemp
    await f.advance(60_000)
    const after = src.snapshot()
    src.push({ hourly: 'nope' })
    assert('live inputs: weather source fed a malformed response stays offline on the fixture; an oversized one after a good one keeps the good value (cached)',
      first.status === 'offline' && first.data.wxTemp === src.fixture.wxTemp && good === cur.temperature_2m && after.status === 'cached' && after.data.wxTemp === good && src.snapshot().data.wxTemp === good, `${first.status} → ${after.status}`)
    off()
  }

  // ── contributions proxy + events fallback ─────────────────────────────────
  const day = { date: '2026-10-23', count: 3, level: 2 }
  assert('live inputs: contributions fixture parses to the same mapping',
    JSON.stringify(mapContribs(parseContribs(contribFixture()), CONTRIB_FIXTURE_NOW)) === JSON.stringify(mapContribs(contribFixture(), CONTRIB_FIXTURE_NOW)) && parseContribApi({ contributions: [day] })[0].level === 2)
  assert(`live inputs: contributions malformed or oversized → ShapeError (days over ${GH_MAX_DAYS}, bad date, negative or fractional count, level 9, non-array)`,
    [{ contributions: big(GH_MAX_DAYS + 1, day) }, { contributions: [{ ...day, date: '23/10/2026' }] }, { contributions: [{ ...day, count: -1 }] }, { contributions: [{ ...day, count: 1.5 }] },
      { contributions: [{ ...day, level: 9 }] }, { contributions: 'all of them' }, null, []].every(p => rejects(() => parseContribApi(p)))
    && rejects(() => parseContribs({ user: 'x', days: big(1e6, day) })) && rejects(() => parseContribs({ user: 5, days: [] })))
  const ev = { type: 'PushEvent', created_at: '2026-10-23T10:00:00Z', payload: { size: 2 } }
  assert(`live inputs: events malformed or oversized → ShapeError (over ${GH_MAX_EVENTS}, bad time, huge push size, non-array); good ones keep only what's used`,
    [big(GH_MAX_EVENTS + 1, ev), [{ ...ev, created_at: 'soon' }], [{ ...ev, payload: { size: 1e9 } }], [{ ...ev, type: 7 }], { events: [] }].every(p => rejects(() => parseGhEvents(p)))
    && JSON.stringify(parseGhEvents([{ ...ev, actor: { login: 'x' } }, { type: 'WatchEvent', created_at: ev.created_at, payload: {} }])) === JSON.stringify([ev, { type: 'WatchEvent', created_at: ev.created_at }]))
  {
    const fallback = fakeEnv([() => ok({ contributions: big(10_000, day) }), () => ok([ev])])
    const viaEvents = await fetchContribs(fallback.env, 'someone')
    const both = fakeEnv([() => ok({ contributions: null }), () => ok(big(100_000, ev))])
    const err = await fetchContribs(both.env, 'someone').then(() => null, (e: unknown) => e)
    const f = fakeEnv([() => ok({ contributions: [{ ...day, count: 'many' }] }), () => ok('nope')])
    const src = contribSource({ user: 'someone' }, f.env)
    const off = src.subscribe(() => {}); await f.advance(0)
    src.push({ user: 'someone', days: big(GH_MAX_DAYS + 1, day) })
    assert('live inputs: a malformed proxy falls back to events; both malformed → the fetch rejects and the card stays offline on the fixture',
      viaEvents.days.length === 1 && viaEvents.days[0].count === 2 && err instanceof ShapeError && src.snapshot().status === 'offline' && src.snapshot().data.ghGrid === src.fixture.ghGrid)
    off()
  }

  // ── now playing (push, socket) ────────────────────────────────────────────
  assert(`live inputs: now playing malformed → ShapeError; long text cut to ${NP_TEXT_MAX}; fixture unchanged`,
    [null, 'Low Tide', { title: 5 }, { title: 'x', duration: Infinity }, { title: 'x', position: -1 }, { title: 'x', playing: 'yes' }, { title: 'x', artist: {} }].every(p => rejects(() => parseNowPlaying(p)))
    && parseNowPlaying({ title: 'T'.repeat(1e5) }).title.length === NP_TEXT_MAX && JSON.stringify(mapNowPlaying(parseNowPlaying(NOW_PLAYING_FIXTURE))) === JSON.stringify(mapNowPlaying(NOW_PLAYING_FIXTURE)))
  {
    const f = fakeEnv(), src = nowPlayingSource({}, f.env)
    const off = src.subscribe(() => {})
    for (const p of [{ title: 5 }, null, { title: 'x', duration: 1e300 }]) src.push(p as never)
    const junk = src.snapshot()
    src.push({ title: 'Fine', duration: 10, position: 5 })
    assert('live inputs: now-playing source ignores malformed pushes (offline, fixture kept), then takes a good one',
      junk.status === 'offline' && junk.data.npTitle === src.fixture.npTitle && textOf(src.snapshot().data.npTitle) === 'FINE' && src.snapshot().data.npPos === .5)
    off()
  }

  // ── websocket: a bad URL never throws ─────────────────────────────────────
  {
    const f = fakeEnv()
    class Throwing implements SocketLike {
      onopen = null; onmessage = null; onclose = null; onerror = null
      constructor() { throw new DOMException('blocked', 'SecurityError') }
      close() {}
    }
    const env: SourceEnv = { ...f.env, WebSocket: Throwing }
    const statuses: (string | null)[] = []
    let threw = false
    for (const url of ['not a url', 'javascript:alert(1)', 'https://example.com', 'wss://blocked.example']) {
      try {
        const src = createSource({ id: `ws:${url}`, statusKey: 's', fixture: { x: 0 }, map: (p: { x: number }) => ({ x: p.x }), transports: [websocket<{ x: number }>(url)] }, env)
        const off = src.subscribe(() => {}); statuses.push(`${src.snapshot().status}/${src.snapshot().retryInMs}`); off()
      } catch { threw = true }
    }
    const g = fakeEnv(), src = createSource({ id: 'ws-msg', statusKey: 's', fixture: mapNowPlaying(NOW_PLAYING_FIXTURE), map: (p: unknown) => mapNowPlaying(parseNowPlaying(p)), transports: [websocket('wss://bridge.example')] }, g.env)
    const off = src.subscribe(() => {})
    for (const data of ['{', 'null', JSON.stringify({ title: 1 }), JSON.stringify({ title: 'x', artist: 'y'.repeat(1e5) })]) g.sockets[0].onmessage?.({ data })
    assert('live inputs: websocket with a bad, non-socket or refused URL never throws, reports offline and does not retry; junk messages do not crash',
      !threw && statuses.every(s => s === 'offline/null') && f.pending() === 0 && textOf(src.snapshot().data.npArtist).length === NP_TEXT_MAX, statuses.join(' '))
    off()
  }

  // ── cache: only entries this code could have written ──────────────────────
  {
    const f = fakeEnv([() => new Error('down')])
    f.store.set('dot480:live:weather', JSON.stringify({ v: 1, at: 999_000, data: { wxTemp: '99', wxWind: Infinity, wxCode: 3 }, text: { wxPlace: `evil${'x'.repeat(1e4)}` } }))
    const src = weatherSource({ lat: 1, lon: 2, place: 'Testville' }, f.env)
    const off = src.subscribe(() => {}); await f.advance(0)
    const s = src.snapshot()
    const g = fakeEnv([() => new Error('down')]); g.store.set('dot480:live:weather', 'null')
    const nul = weatherSource({ lat: 1, lon: 2, place: 'Testville' }, g.env), off2 = nul.subscribe(() => {}); await g.advance(0)
    assert('live inputs: cache skips non-numbers, overlong or unsanitized text and a null entry',
      s.status === 'cached' && s.data.wxCode === 3 && s.data.wxTemp === src.fixture.wxTemp && s.data.wxWind === src.fixture.wxWind && nul.snapshot().status === 'offline')
    off(); off2()
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('live-inputs')
  await liveInputChecks(assert)
  done()
}
