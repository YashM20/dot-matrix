/**
 * Shape checks for everything that reaches the live board from outside the page: its URL config,
 * the three APIs' responses and pushed now-playing payloads. Each `parse*` returns a fresh typed
 * value or throws a `ShapeError`, so a malformed or oversized response counts as a failed request
 * and the card keeps its cached value or its offline fixture. Arrays are length-capped before
 * anything maps or spreads them; display strings are cut to a cap.
 */
import type { ContribDay, Contribs, NowPlaying, OpenMeteo } from './sources'
import { sanitize } from './text'

export class ShapeError extends Error {}
const bad = (what: string): never => { throw new ShapeError(`bad payload: ${what}`) }

type Obj = Record<string, unknown>
const obj = (v: unknown, what: string): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Obj : bad(what))
const num = (v: unknown, what: string, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : bad(what)
const int = (v: unknown, what: string, min: number, max: number): number => (Number.isInteger(num(v, what, min, max)) ? v as number : bad(what))
const opt = <T>(v: unknown, check: (v: unknown) => T): T | undefined => (v === undefined || v === null ? undefined : check(v))
/** A structural string (a date, an event type): over `max` is malformed. */
const str = (v: unknown, what: string, max: number): string => (typeof v === 'string' && v.length <= max ? v : bad(what))
/** A display string: cut to `max` (the card fits far fewer glyphs anyway). */
const label = (v: unknown, what: string, max: number): string => (typeof v === 'string' ? v.slice(0, max) : bad(what))
const list = (v: unknown, what: string, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : bad(`${what} (array of at most ${max})`))
const nums = (v: unknown, what: string, max: number, lo: number, hi: number): number[] => list(v, what, max).map(x => num(x, what, lo, hi))

// ── Open-Meteo ──────────────────────────────────────────────────────────────
/** We ask for 12 hours and one day; anything far past that is not a forecast we asked for. */
export const WX_MAX_HOURS = 48, WX_MAX_DAYS = 16
const TEMP = 100, WIND = 500
export function parseOpenMeteo(raw: unknown): OpenMeteo {
  const p = obj(raw, 'forecast'), c = obj(p.current, 'current')
  const out: OpenMeteo = {
    current: {
      temperature_2m: num(c.temperature_2m, 'temperature', -TEMP, TEMP),
      weather_code: int(c.weather_code, 'weather code', 0, 99),
      wind_speed_10m: num(c.wind_speed_10m, 'wind', 0, WIND),
    },
  }
  const day = opt(c.is_day, v => int(v, 'is_day', 0, 1))
  if (day !== undefined) out.current.is_day = day
  const h = opt(p.hourly, v => obj(v, 'hourly'))
  if (h) out.hourly = { temperature_2m: nums(h.temperature_2m, 'hourly temperatures', WX_MAX_HOURS, -TEMP, TEMP) }
  const d = opt(p.daily, v => obj(v, 'daily'))
  if (d) out.daily = { temperature_2m_max: nums(d.temperature_2m_max, 'daily highs', WX_MAX_DAYS, -TEMP, TEMP), temperature_2m_min: nums(d.temperature_2m_min, 'daily lows', WX_MAX_DAYS, -TEMP, TEMP) }
  return out
}

// ── GitHub contributions ────────────────────────────────────────────────────
/** The proxy's `y=last` is one year (≤ 371 days); two years is the most any payload may carry. */
export const GH_MAX_DAYS = 800, GH_MAX_EVENTS = 100, GH_USER_MAX = 39
const DATE = /^\d{4}-\d{2}-\d{2}$/
function parseDay(raw: unknown): ContribDay {
  const d = obj(raw, 'day'), date = str(d.date, 'day date', 10)
  if (!DATE.test(date)) bad('day date')
  const count = int(d.count, 'day count', 0, 100_000), level = opt(d.level, v => int(v, 'day level', 0, 4))
  return level === undefined ? { date, count } : { date, count, level }
}
const parseDays = (v: unknown) => list(v, 'contribution days', GH_MAX_DAYS).map(parseDay)
/** The contributions proxy (github-contributions-api.jogruber.de/v4): its `contributions` days. */
export const parseContribApi = (raw: unknown): ContribDay[] => parseDays(obj(raw, 'contributions').contributions)
/** A pushed `Contribs` payload (the shape the source maps). */
export const parseContribs = (raw: unknown): Contribs => { const p = obj(raw, 'contribs'); return { user: label(p.user, 'user', GH_USER_MAX), days: parseDays(p.days) } }
export interface GhEvent { type: string; created_at: string; payload?: { size?: number } }
/** GitHub's public events (`per_page=100`): type, a parseable time, an optional push size. */
export function parseGhEvents(raw: unknown): GhEvent[] {
  return list(raw, 'events', GH_MAX_EVENTS).map(r => {
    const e = obj(r, 'event'), created_at = str(e.created_at, 'event time', 40)
    if (!Number.isFinite(Date.parse(created_at))) bad('event time')
    const size = opt(e.payload, v => opt(obj(v, 'event payload').size, s => int(s, 'push size', 0, 10_000)))
    return { type: str(e.type, 'event type', 64), created_at, ...(size === undefined ? {} : { payload: { size } }) }
  })
}

// ── now playing ─────────────────────────────────────────────────────────────
export const NP_TEXT_MAX = 120
/** A pushed track (BroadcastChannel, `Source.push`, a socket, the Media Session). Seconds ≤ 1e6. */
export function parseNowPlaying(raw: unknown): NowPlaying {
  const p = obj(raw, 'now playing'), out: NowPlaying = { title: label(p.title, 'title', NP_TEXT_MAX) }
  const artist = opt(p.artist, v => label(v, 'artist', NP_TEXT_MAX)), album = opt(p.album, v => label(v, 'album', NP_TEXT_MAX))
  const position = opt(p.position, v => num(v, 'position', 0, 1e6)), duration = opt(p.duration, v => num(v, 'duration', 0, 1e6))
  const playing = opt(p.playing, v => (typeof v === 'boolean' ? v : bad('playing')))
  if (artist !== undefined) out.artist = artist
  if (album !== undefined) out.album = album
  if (position !== undefined) out.position = position
  if (duration !== undefined) out.duration = duration
  if (playing !== undefined) out.playing = playing
  return out
}

// ── URL config ──────────────────────────────────────────────────────────────
export interface LiveConfig { lat: number; lon: number; place: string; user: string }
/** Glyphs kept from `?place=` (after folding to what the 5×7 font draws). */
export const PLACE_MAX = 24
/** GitHub's username rule: 1–39 letters, digits or single inner hyphens. */
export const GH_USER = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
/**
 * `?lat=&lon=&place=&gh=` → config; anything missing, out of range or invalid falls back to `d`.
 * Nothing here names a host: the board only ever connects to the three APIs in `sources.ts`.
 */
export function parseLiveConfig(search: string, d: LiveConfig): LiveConfig {
  const q = new URLSearchParams(search)
  const coord = (k: string, lim: number, dv: number) => {
    const raw = q.get(k)?.trim(), v = raw ? Number(raw) : NaN
    return Number.isFinite(v) && Math.abs(v) <= lim ? v : dv
  }
  const place = sanitize((q.get('place') ?? '').slice(0, 4 * PLACE_MAX)).slice(0, PLACE_MAX).trimEnd()
  const gh = q.get('gh') ?? ''
  return { lat: coord('lat', 90, d.lat), lon: coord('lon', 180, d.lon), place: place || d.place, user: GH_USER.test(gh) ? gh : d.user }
}
