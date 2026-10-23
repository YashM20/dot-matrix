/**
 * The three live sources of the `live` board. Each has a pure `map*` (payload → data keys) and a
 * deterministic fixture built by running that same map over a fixed fixture payload, so the
 * offline frame, snapshots and goldens exercise the real mapping.
 */
import { hash01 } from '../engine/math'
import { createSource, fetchJson, HttpError, type Data, type Source, type SourceEnv, type Transport } from './source'
import { textId } from './text'
import { broadcast, mediaSession, poll, websocket } from './transports'

// ── weather: Open-Meteo (no key) ────────────────────────────────────────────
export const WX_HOURS = 12
export interface WeatherOptions { lat: number; lon: number; place: string; intervalMs?: number }
export interface OpenMeteo {
  current: { temperature_2m: number; weather_code: number; wind_speed_10m: number; is_day?: number }
  hourly?: { temperature_2m: number[] }
  daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] }
}
export const weatherUrl = ({ lat, lon }: Pick<WeatherOptions, 'lat' | 'lon'>) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
  `&current=temperature_2m,weather_code,wind_speed_10m,is_day&hourly=temperature_2m&forecast_hours=${WX_HOURS}` +
  `&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`
export function mapWeather(p: OpenMeteo, place: string): Data {
  const c = p.current, hours = p.hourly?.temperature_2m ?? [], out: Data = {
    wxPlace: textId(place), wxTemp: c.temperature_2m, wxCode: c.weather_code, wxWind: c.wind_speed_10m, wxDay: c.is_day ?? 1,
    wxHi: p.daily?.temperature_2m_max[0] ?? Math.max(c.temperature_2m, ...hours), wxLo: p.daily?.temperature_2m_min[0] ?? Math.min(c.temperature_2m, ...hours),
  }
  for (let i = 0; i < WX_HOURS; i++) out[`wxH${i}`] = hours[i] ?? hours[hours.length - 1] ?? c.temperature_2m
  return out
}
export const WEATHER_FIXTURE: OpenMeteo = {
  current: { temperature_2m: 18.4, weather_code: 2, wind_speed_10m: 11.2, is_day: 1 },
  hourly: { temperature_2m: [18.4, 19.1, 19.8, 20.2, 20.0, 19.3, 18.2, 17.0, 16.1, 15.4, 14.9, 14.6] },
  daily: { temperature_2m_max: [20.6], temperature_2m_min: [13.8] },
}
export function weatherSource(o: WeatherOptions, env?: SourceEnv | (() => SourceEnv)): Source<OpenMeteo> {
  const url = weatherUrl(o)
  return createSource({
    id: 'weather', statusKey: 'wxStatus', textKeys: ['wxPlace'], staleMs: 3 * (o.intervalMs ?? 10 * 60_000),
    fixture: mapWeather(WEATHER_FIXTURE, 'TOKYO'),
    map: p => mapWeather(p, o.place),
    transports: [poll(e => fetchJson<OpenMeteo>(e, url), o.intervalMs ?? 10 * 60_000), broadcast('weather')],
  }, env)
}

// ── GitHub contributions (public, no token) ────────────────────────────────
/** One grid column per week: 52 full weeks + the current one, Sunday first (GitHub's layout). */
export const GH_WEEKS = 52
export interface ContribDay { date: string; count: number; level?: number }
/** The contributions proxy's shape (github-contributions-api.jogruber.de/v4), also what the events fallback builds. */
export interface Contribs { user: string; days: ContribDay[] }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Count → level 0–4 by quartiles of the non-zero days (GitHub's scheme when the API gives no level). */
const levelsOf = (counts: number[]) => {
  const nz = counts.filter(c => c > 0).sort((a, b) => a - b), q = (f: number) => nz[Math.min(nz.length - 1, Math.floor(f * nz.length))] ?? 1
  const [a, b, c] = [q(.25), q(.5), q(.75)]
  return counts.map(n => (n <= 0 ? 0 : n <= a ? 1 : n <= b ? 2 : n <= c ? 3 : 4))
}
/**
 * Payload → data: `ghGrid` is the levels '0'–'4' oldest → newest, starting on the Sunday 52 weeks
 * back and ending today (length 7·52 + weekday + 1), so column = ⌊i/7⌋ and row = i mod 7.
 * `now` picks "today" (local date); days after it are ignored, missing days are 0.
 */
export function mapContribs(p: Contribs, now: number): Data {
  const today = new Date(now), dow = today.getDay(), n = 7 * GH_WEEKS + dow + 1
  const byDate = new Map(p.days.map(d => [d.date, d]))
  const days: ContribDay[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i), key = iso(d)
    days.push(byDate.get(key) ?? { date: key, count: 0 })
  }
  const counts = days.map(d => d.count), auto = levelsOf(counts)
  const levels = days.map((d, i) => Math.max(0, Math.min(4, d.level ?? auto[i])))
  let streak = 0
  for (let i = n - 1; i >= 0 && (counts[i] > 0 || (i === n - 1)); i--) if (counts[i] > 0) streak++
  return {
    ghUser: textId(p.user), ghGrid: textId(levels.join(''), true), ghDow: dow,
    ghTotal: counts.reduce((a, b) => a + b, 0), ghToday: counts[n - 1], ghStreak: streak, ghBest: Math.max(0, ...counts),
    ghYear: today.getFullYear(), ghMonth: today.getMonth(), ghDay: today.getDate(),
  }
}
/** Fixed fixture "today": Fri 23 Oct 2026, noon local. */
export const CONTRIB_FIXTURE_NOW = new Date(2026, 9, 23, 12).getTime()
/** A plausible, deterministic year: weekday-weighted, bursty, quiet weeks, active today. */
export function contribFixture(user = 'dot480'): Contribs {
  const end = new Date(CONTRIB_FIXTURE_NOW), days: ContribDay[] = []
  for (let i = 0; i < 7 * GH_WEEKS + 7; i++) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i), w = Math.floor(i / 7)
    const weekday = d.getDay() > 0 && d.getDay() < 6, busy = .45 + .55 * hash01(w, 11), quiet = hash01(w, 23) < .07
    const r = hash01(i, 5), count = quiet ? 0 : r < (weekday ? .92 : .4) * busy ? Math.round(1 + 14 * hash01(i, 7) ** 1.6 * busy) : 0
    days.push({ date: iso(d), count: i === 0 ? 6 : count })
  }
  return { user, days }
}
interface GhEvent { type: string; created_at: string; payload?: { size?: number } }
/** Proxy first (a full year); on failure the public events API (90 days, 60 req/h unauthenticated). */
export async function fetchContribs(env: SourceEnv, user: string): Promise<Contribs> {
  const u = encodeURIComponent(user)
  try {
    const p = await fetchJson<{ contributions: ContribDay[] }>(env, `https://github-contributions-api.jogruber.de/v4/${u}?y=last`)
    return { user, days: p.contributions }
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) throw err
    const events = await fetchJson<GhEvent[]>(env, `https://api.github.com/users/${u}/events/public?per_page=100`, { Accept: 'application/vnd.github+json' })
    const counts = new Map<string, number>()
    for (const e of events) { const k = iso(new Date(e.created_at)); counts.set(k, (counts.get(k) ?? 0) + (e.type === 'PushEvent' ? Math.max(1, e.payload?.size ?? 1) : 1)) }
    return { user, days: [...counts].map(([date, count]) => ({ date, count })) }
  }
}
export interface ContribOptions { user: string; intervalMs?: number }
export function contribSource(o: ContribOptions, env?: SourceEnv | (() => SourceEnv)): Source<Contribs> {
  return createSource({
    id: `contribs:${o.user}`, statusKey: 'ghStatus', textKeys: ['ghUser', 'ghGrid'], staleMs: 3 * (o.intervalMs ?? 30 * 60_000),
    fixture: mapContribs(contribFixture(), CONTRIB_FIXTURE_NOW),
    map: mapContribs,
    transports: [poll(e => fetchContribs(e, o.user), o.intervalMs ?? 30 * 60_000, { baseMs: 30_000, maxMs: 60 * 60_000 }), broadcast(`contribs:${o.user}`)],
  }, env)
}

// ── now playing (push / websocket / this page's Media Session) ──────────────
/** What a feeder pushes. `position`/`duration` in seconds. */
export interface NowPlaying { title: string; artist?: string; album?: string; position?: number; duration?: number; playing?: boolean }
export function mapNowPlaying(p: NowPlaying): Data {
  const dur = Math.max(0, p.duration ?? 0)
  return {
    npTitle: textId(p.title), npArtist: textId(p.artist ?? ''), npAlbum: textId(p.album ?? ''), npPlay: p.playing === false ? 0 : 1,
    npDur: dur, npPos: dur > 0 ? Math.max(0, Math.min(1, (p.position ?? 0) / dur)) : 0,
  }
}
export const NOW_PLAYING_FIXTURE: NowPlaying = { title: 'Low Tide Signal', artist: 'Field Recordings', album: 'Dot / 480', position: 102, duration: 238, playing: true }
export interface NowPlayingOptions { channel?: string; url?: string; mediaSession?: boolean }
export function nowPlayingSource(o: NowPlayingOptions = {}, env?: SourceEnv | (() => SourceEnv)): Source<NowPlaying> {
  const channel = o.channel ?? 'now-playing'
  return createSource<NowPlaying>({
    id: channel, statusKey: 'npStatus', textKeys: ['npTitle', 'npArtist', 'npAlbum'], staleMs: 5 * 60_000,
    fixture: mapNowPlaying(NOW_PLAYING_FIXTURE),
    map: mapNowPlaying,
    transports: [
      broadcast(channel),
      ...(o.url ? [websocket<NowPlaying>(o.url)] : []),
      ...(o.mediaSession ? [mediaSession() as Transport<NowPlaying>] : []),
    ],
  }, env)
}
