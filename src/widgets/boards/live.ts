/**
 * Board — Live: three TILE cards bound to real sources (P4-E, `src/data`). Weather from Open-Meteo,
 * now playing from a push / websocket feed, GitHub contributions from the public API. Each card
 * draws only from `data` (its defaults are the source's deterministic fixture, so snapshots and
 * goldens never touch the network); numbers glide on data springs, text and status changes
 * dissolve. The footer says where the frame came from: LIVE, CACHED (last good value) or OFFLINE
 * (the fixture). The board spends its one red on today's contribution dot and the playhead knob.
 *
 * Config (URL params, read once): `?board=live&lat=51.51&lon=-0.13&place=London&gh=<user>&np=wss://…`
 */
import { hash01 } from '../../engine/math'
import type { Layer, Tone } from '../../engine/types'
import { statusName } from '../../data/source'
import { contribSource, GH_WEEKS, nowPlayingSource, weatherSource, WX_HOURS } from '../../data/sources'
import { fit, textOf } from '../../data/text'
import { TAU, TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'
import { dotText } from './henry'

const T = layoutFor(TILE)
type Pt = [number, number]
const tile = { chrome: 'dots', grid: TILE, style: tileStyle } as const

// ── config + sources ────────────────────────────────────────────────────────
const params = new URLSearchParams((globalThis as { location?: { search: string } }).location?.search ?? '')
const num = (k: string, d: number) => { const v = Number(params.get(k)); return params.has(k) && Number.isFinite(v) ? v : d }
export const liveConfig = { lat: num('lat', 35.68), lon: num('lon', 139.69), place: params.get('place') ?? 'Tokyo', user: params.get('gh') ?? 'YashM20', np: params.get('np') ?? undefined }
const sources = {
  weather: weatherSource({ lat: liveConfig.lat, lon: liveConfig.lon, place: liveConfig.place }),
  nowPlaying: nowPlayingSource({ url: liveConfig.np, mediaSession: true }),
  contribs: contribSource({ user: liveConfig.user }),
}
export const liveSources = [sources.weather, sources.nowPlaying, sources.contribs]

// ── shared footer: hairline, status dot + word, source name ────────────────
const FOOT = 136
function footer(code: number | undefined, origin: string): Layer[] {
  const s = statusName(code), y = FOOT + 3
  const mark = s === 'offline'
    ? layer(T.dotRing(3.5, y, 2.4, { spacing: (TAU * 2.4) / 6, size: .8 }), 'mid')
    : layer(T.dots([[3.5, y]], 3.4), s === 'live' ? 'value' : 'mid')
  return [
    layer(T.dotLine(1, 131.5, 142, 131.5, { spacing: 2.25, size: .6 }), 'faint'),
    mark,
    layer(T.text(s.toUpperCase(), 10, FOOT), s === 'live' ? 'value' : 'idle'),
    layer(T.text(origin, 143, FOOT, { align: 'right' }), 'mid'),
  ]
}

// ── 01 WEATHER ──────────────────────────────────────────────────────────────
const condition = (code: number, day: boolean) =>
  code === 0 ? (day ? 'CLEAR' : 'CLEAR NIGHT') : code === 1 ? 'MAINLY CLEAR' : code === 2 ? 'PARTLY CLOUDY' : code === 3 ? 'OVERCAST'
    : code <= 48 ? 'FOG' : code <= 55 ? 'DRIZZLE' : code <= 57 ? 'FREEZING DRIZZLE' : code <= 65 ? 'RAIN' : code <= 67 ? 'FREEZING RAIN'
      : code <= 77 ? 'SNOW' : code <= 82 ? 'SHOWERS' : code <= 86 ? 'SNOW SHOWERS' : 'THUNDERSTORM'
type Icon = 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm'
const iconOf = (code: number, day: boolean): Icon =>
  code <= 1 ? (day ? 'sun' : 'moon') : code === 2 ? 'partly' : code === 3 ? 'cloud' : code <= 48 ? 'fog'
    : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : code >= 95 ? 'storm' : 'rain'
const circle = (cx: number, cy: number, r: number, sp: number): Pt[] => {
  const n = Math.max(3, Math.round((TAU * r) / sp))
  return Array.from({ length: n }, (_, k): Pt => [cx + r * Math.sin((k / n) * TAU), cy - r * Math.cos((k / n) * TAU)])
}
/** Three-lobed cloud outline (the henry weather cloud), centred on (cx, cy), scale `k`. */
const cloudShape = (cx: number, cy: number, k = 1) => {
  const lobes: [number, number, number][] = [[cx - 16 * k, cy + 2 * k, 9.5 * k], [cx - 2 * k, cy - 6 * k, 12 * k], [cx + 15 * k, cy + 2.5 * k, 9 * k]]
  const base = cy + 11.5 * k, x0 = cx - 16 * k, x1 = cx + 15 * k
  const inside = (x: number, y: number, skip = -1, pad = .8) => lobes.some(([lx, ly, r], i) => i !== skip && Math.hypot(x - lx, y - ly) < r - pad) || (x > x0 && x < x1 && y > cy - 2 * k && y < base - pad)
  const sp = 3.5
  const pts: Pt[] = [
    ...lobes.flatMap(([lx, ly, r], i) => circle(lx, ly, r, sp).filter(([x, y]) => y <= base + .1 && !inside(x, y, i))),
    ...Array.from({ length: Math.round((x1 - x0) / sp) + 1 }, (_, i): Pt => [x0 + ((x1 - x0) * i) / Math.round((x1 - x0) / sp), base]),
  ]
  return { pts, inside: (x: number, y: number) => inside(x, y, -1, -2.5) || (y <= base + 2.5 && y >= base - 3 && x > x0 - 3 && x < x1 + 3) }
}
const sunPts = (cx: number, cy: number, r: number): [Pt[], Pt[]] => [
  circle(cx, cy, r, 3.4),
  Array.from({ length: 8 }, (_, i) => (i / 8) * TAU).flatMap((a): Pt[] => [r + 5, r + 8.6].map((d): Pt => [cx + d * Math.sin(a), cy - d * Math.cos(a)])),
]
const IC: Pt = [108, 44]
function weatherIcon(icon: Icon): Layer[] {
  const [cx, cy] = IC
  if (icon === 'sun') { const [core, rays] = sunPts(cx, cy, 8.5); return [layer(T.dots(core, 2.8)), layer(T.dots(rays, 2.2), 'idle')] }
  if (icon === 'moon') {
    // crescent outline: the outer rim outside the bite, the bite's rim inside the disc
    const [bx, by, R, r] = [cx + 8, cy - 6, 15, 12.5]
    const rim = circle(cx, cy, R, 3.5).filter(([x, y]) => Math.hypot(x - bx, y - by) > r + .8)
    const bite = circle(bx, by, r, 3.5).filter(([x, y]) => Math.hypot(x - cx, y - cy) < R - .8)
    return [layer(T.dots([...rim, ...bite], 2.7)), layer(T.dots([[cx + 18, cy + 9], [cx + 23, cy - 14]], 1.6), 'mid')]
  }
  if (icon === 'fog') return [0, 1, 2, 3].map(i => layer(T.dotLine(cx - 22 + (i % 2) * 5, cy - 12 + i * 7.5, cx + 20 + (i % 2) * 5, cy - 12 + i * 7.5, { spacing: 3.5, size: 2.2 }), i % 2 ? 'mid' : 'value'))
  if (icon === 'partly') {
    const c = cloudShape(cx + 6, cy + 7, .9), [core, rays] = sunPts(cx - 13, cy - 8, 8.5), keep = ([x, y]: Pt) => !c.inside(x, y)
    return [layer(T.dots(core.filter(keep), 2.8), 'idle'), layer(T.dots(rays.filter(keep), 2.2), 'mid'), layer(T.dots(c.pts, 2.7))]
  }
  const up = icon === 'cloud' ? 0 : -7, c = cloudShape(cx, cy + up)
  const out = [layer(T.dots(c.pts, 2.7))]
  const below = cy + up + 19
  if (icon === 'rain') out.push(...[-14, -4, 6, 16].map((dx, i) => layer(T.dotLine(cx + dx + 2, below + (i % 2) * 3, cx + dx - 2, below + 9 + (i % 2) * 3, { spacing: 3.2, size: 1.9 }), 'idle')))
  if (icon === 'snow') out.push(layer(T.dots([-15, -5, 5, 15].flatMap((dx, i): Pt[] => [[cx + dx, below + (i % 2) * 4], [cx + dx + 5, below + 8 - (i % 2) * 4]]), 2.2), 'idle'))
  if (icon === 'storm') out.push(layer(T.dots([[cx + 2, below - 1], [cx - 1, below + 3], [cx - 4, below + 7], [cx + 1, below + 7], [cx - 2, below + 11], [cx - 5, below + 15]], 2.3), 'value'))
  return out
}
const deg = (x: number) => `${Math.round(x)}°`
const hourKeys = Array.from({ length: WX_HOURS }, (_, i) => `wxH${i}`)
const BAR_X0 = 4, BAR_GAP = (139 - BAR_X0) / (WX_HOURS - 1), BAR_BASE = 88
export const liveWeather: WidgetPreset = {
  id: 'live-weather', name: 'Weather', label: 'WEATHER', group: 'icon', ...tile,
  defaults: sources.weather.fixture, springKeys: ['wxTemp', 'wxWind', 'wxHi', 'wxLo', ...hourKeys],
  layers: ({ data }) => {
    const day = data.wxDay !== 0, code = Math.round(data.wxCode), temp = Math.round(data.wxTemp), t = `${temp}`
    const tw = ([...t].length * 7 - 1) * 3, hours = hourKeys.map(k => data[k])
    const lo = Math.min(...hours), hi = Math.max(...hours), span = Math.max(2, hi - lo)
    const bar = (h: number) => .12 + .88 * ((h - lo) / span)
    return [
      layer(T.big(fit(textOf(data.wxPlace, 'TOKYO'), 14), 1.5, 14, { lattice: 1.35 }), 'idle'),
      layer(dotText(t, 2.5, 30, { px: 3, py: 4.3, size: 3.1 })), layer(T.dotRing(tw + 9.5, 34, 3.6, { spacing: (TAU * 3.6) / 8, size: 2.4 })),
      ...weatherIcon(iconOf(code, day)),
      // next 12 hours: one dot column per hour, now in full tone
      layer(T.dotBars([bar(hours[0])], BAR_X0, BAR_BASE, { gap: BAR_GAP, pitch: 2.6, height: 18, size: 2 })),
      layer(T.dotBars(hours.slice(1).map(bar), BAR_X0 + BAR_GAP, BAR_BASE, { gap: BAR_GAP, pitch: 2.6, height: 18, size: 1.7 }), 'idle'),
      layer(T.text('NOW', 1, 93), 'idle'), layer(T.text('+6H', BAR_X0 + 6 * BAR_GAP, 93, { align: 'center' }), 'mid'), layer(T.text(`+${WX_HOURS - 1}H`, 143, 93, { align: 'right' }), 'mid'),
      layer(T.big(`H ${deg(data.wxHi)}  L ${deg(data.wxLo)}`, 1, 105, { lattice: 1.1 }), 'idle'),
      layer(T.big(`${Math.round(data.wxWind)} KM/H`, 143, 105, { lattice: 1.1, align: 'right' }), 'mid'),
      layer(T.big(condition(code, day), 1, 118, { lattice: 1.15 })),
      ...footer(data.wxStatus, 'OPEN-METEO'),
    ]
  },
}

// ── 02 NOW PLAYING ──────────────────────────────────────────────────────────
/**
 * A cover generated from the title: a sun going down into the sea, on a 2.4-cell site lattice (20 × 20
 * sites). The upper half of the disc is solid, the lower half is cut by gaps that open up toward the
 * horizon; under it the water carries the sun's reflection as dashes that narrow and dim toward the
 * viewer, with a few faint stars above. The title seeds the sun's place, size and band rhythm (each
 * track its own art, the same art every frame).
 */
const COVER = { x: 4, y: 15, n: 20, sp: 2.4 }
const covers = new Map<number, Layer[]>()
function cover(seed: number): Layer[] {
  const key = seed % 1e6
  let out = covers.get(key)
  if (out) return out
  const { n, sp } = COVER, tiers: Pt[][] = [[], [], [], []] // faint, mid, idle, value
  const cx = 8.5 + 3 * hash01(key, 1), r = 7.2 + hash01(key, 2), horizon = 14 + Math.round(hash01(key, 3)), cy = horizon - .5 - r * .72
  // rows under the sun's centre: D drawn, G a gap; the gaps open up toward the horizon
  const BANDS = hash01(key, 4) < .5 ? 'DDGDGDGG' : 'DGDGDGGG'
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const at: Pt = [COVER.x + i * sp, COVER.y + j * sp], d = Math.hypot(i - cx, j - cy)
    if (j < horizon) {
      if (d <= r) {
        // the sun: solid above its centre, then bands that thicken toward the horizon
        const q = j - Math.ceil(cy)
        if (q < 0 || BANDS[q] !== 'G') tiers[q < 2 ? 3 : 2].push(at)
      } else if (hash01(key, j * 32 + i, 5) > .955) tiers[0].push(at) // stars
      continue
    }
    if (j === horizon) { tiers[Math.abs(i - cx) <= r ? 2 : 1].push(at); continue }
    // the water: the reflection narrows and breaks up toward the viewer; faint swell lines either side
    const z = j - horizon, half = r * (1 - z / (n - horizon + 2)), wave = hash01(key, j * 32 + i, 7)
    if (Math.abs(i - cx) <= half && wave > .18) tiers[z < 3 ? 2 : 1].push(at)
    else if (z % 2 === 0 && wave > .55) tiers[0].push(at)
  }
  out = [layer(T.dots(tiers[0], 1), 'faint'), layer(T.dots(tiers[1], 1.6), 'mid'), layer(T.dots(tiers[2], 2), 'idle'), layer(T.dots(tiers[3], 2.3))]
  covers.set(key, out)
  return out
}
/** Spectrum bands: a held spectral tilt (bass-heavy) times two beating sines per band, stepped at 12 fps. */
const EQ_BANDS = 10
const eqLevels = (t: number, seed: number) => {
  const tf = Math.floor(t * 12) / 12, beat = .5 + .5 * Math.max(0, Math.sin(tf * TAU * 1.9)) ** 3
  return Array.from({ length: EQ_BANDS }, (_, i) => {
    const f1 = 1.3 + 2.1 * hash01(seed % 1e6, i, 21), f2 = 2.9 + 3.3 * hash01(seed % 1e6, i, 22), ph = TAU * hash01(seed % 1e6, i, 23)
    const tilt = 1 - .55 * (i / (EQ_BANDS - 1)), wobble = .5 + .25 * Math.sin(tf * f1 * TAU / 2 + ph) + .25 * Math.sin(tf * f2 * TAU / 2 + 2 * ph)
    return Math.max(.08, Math.min(1, tilt * wobble * (i < 3 ? .65 + .45 * beat : .85 + .15 * beat)))
  })
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const liveNowPlaying: WidgetPreset = {
  id: 'live-now-playing', name: 'Now Playing', label: 'NOW PLAYING', group: 'photo', ...tile, animated: true,
  defaults: sources.nowPlaying.fixture, springKeys: ['npPos'],
  layers: ({ data, t }) => {
    const playing = data.npPlay !== 0, title = textOf(data.npTitle, 'NOTHING PLAYING'), dur = data.npDur, pos = Math.max(0, Math.min(1, data.npPos))
    const knob = 3 + pos * 137, seed = data.npTitle || 1
    // spectrum to the right of the cover: it moves with the board clock while playing, flat when paused
    const eq = playing ? eqLevels(t, seed) : Array.from({ length: EQ_BANDS }, () => .04)
    return [
      ...cover(seed),
      layer(T.text(playing ? '▶ PLAYING' : '■ PAUSED', 62, 15), playing ? 'value' : 'idle'),
      layer(T.dotBars(eq, 64, 63, { gap: 8.3, pitch: 2.8, height: 36, size: 1.7 }), playing ? 'idle' : 'faint'),
      layer(T.big(fit(title, 17), 1.5, 75, { lattice: 1.4 })),
      layer(T.big(fit(textOf(data.npArtist), 20), 1.5, 89, { lattice: 1.15 }), 'idle'),
      layer(T.dotLine(3, 106, knob - 3.5, 106, { spacing: 1.65, size: .9 })),
      layer(T.dotLine(141, 106, knob + 3.5, 106, { spacing: 1.65, size: .7 }), 'mid'),
      layer(T.dots([[knob, 106]], 4.6), 'active'),
      ...(dur > 0 ? [layer(T.text(mmss(pos * dur), 1, 112), 'idle'), layer(T.text(`-${mmss(dur - pos * dur)}`, 143, 112, { align: 'right' }), 'mid')] : []),
      layer(T.text(fit(textOf(data.npAlbum), 23), 1, 122), 'mid'),
      ...footer(data.npStatus, 'PUSH'),
    ]
  },
}

// ── 03 CONTRIBUTIONS ────────────────────────────────────────────────────────
const G = { x: 2.3, y: 70, sp: 2.68 }
/** Size + tone per contribution level: level 0 still reads as the calendar's grid at board size, 1 a clear step up. */
const LEVEL: [number, Tone][] = [[1.15, 'faint'], [1.75, 'mid'], [2, 'idle'], [2.25, 'value'], [2.5, 'value']]
const MONTHS = 'JFMAMJJASOND'
export const liveContribs: WidgetPreset = {
  id: 'live-contribs', name: 'Contributions', label: 'CONTRIBUTIONS', group: 'scatter', ...tile,
  defaults: sources.contribs.fixture, springKeys: ['ghTotal', 'ghStreak', 'ghToday', 'ghBest'],
  layers: ({ data }) => {
    const grid = textOf(data.ghGrid), n = grid.length, total = `${Math.round(data.ghTotal)}`
    const byLevel: Pt[][] = LEVEL.map(() => []), at = (i: number): Pt => [G.x + Math.floor(i / 7) * G.sp, G.y + (i % 7) * G.sp]
    for (let i = 0; i < n - 1; i++) byLevel[+grid[i] || 0].push(at(i))
    const todayLevel = +grid[n - 1] || 0
    // month initials over the first full week of each month
    const months: Layer[] = [], today = new Date(data.ghYear, data.ghMonth, data.ghDay)
    for (let m = 0; m < 12; m++) {
      const first = new Date(data.ghYear, data.ghMonth - m, 1), idx = n - 1 - Math.round((today.getTime() - first.getTime()) / 86_400_000)
      const col = Math.floor(idx / 7) + (idx % 7 ? 1 : 0)
      if (idx >= 0 && col <= GH_WEEKS - 1) months.push(layer(T.text(MONTHS[first.getMonth()], Math.round(G.x - 2 + col * G.sp), 91), 'mid'))
    }
    const stat = (label: string, value: string, x: number): Layer[] => [layer(T.text(label, x, 104), 'mid'), layer(T.big(value, x, 114, { lattice: 1.35 }))]
    return [
      layer(T.big(fit(textOf(data.ghUser, 'GITHUB'), 15), 1.5, 14, { lattice: 1.35 }), 'idle'),
      layer(dotText(total, 2.5, 30, { px: 3, py: 4.3, size: 3.1 })),
      layer(T.text('IN THE', 143, 46, { align: 'right' }), 'idle'), layer(T.text('LAST YEAR', 143, 54, { align: 'right' }), 'idle'),
      ...byLevel.map((pts, l) => layer(T.dots(pts, LEVEL[l][0]), LEVEL[l][1])),
      layer(T.dots([at(n - 1)], Math.max(2.6, LEVEL[todayLevel][0])), 'active'),
      ...months,
      ...stat('TODAY', `${Math.round(data.ghToday)}`, 1), ...stat('STREAK', `${Math.round(data.ghStreak)}D`, 50), ...stat('BEST', `${Math.round(data.ghBest)}`, 99),
      ...footer(data.ghStatus, 'GITHUB'),
    ]
  },
}

export const liveBoard = [liveWeather, liveNowPlaying, liveContribs]
