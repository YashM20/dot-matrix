/**
 * Watch faces that read the sky, computed on the device from the date (src/engine/astro, after Meeus): the moon's
 * phase with today's red dot on a ring of the lunation, and the sun's day at a fixed place on a 24-hour dial with
 * the sun itself in red.
 */
import { MINUTE, partsOf, zoneWall, type Zone } from '../../engine/astro/calendar'
import { litAt, moonPhase, nextMoonPhase, phaseName } from '../../engine/astro/moon'
import { LONDON, sunTimes } from '../../engine/astro/sun'
import { TAU, layer, type WidgetCredit } from '../types'
import { CX, CY, DAYS, T, clockOf, face, knock, polar, textBox, wallNow, type Pt } from './watch-kit'

export const MEEUS: WidgetCredit = { by: ['Jean Meeus'], title: 'Astronomical Algorithms', source: 'https://en.wikipedia.org/wiki/Astronomical_Algorithms' }

// ── the moon's disc, also used small by the complications face ────────────────
/** Maria seen from the north: centre (x right, y down) and radius, in disc radii. They draw a step dimmer when lit. */
const MARIA: [number, number, number][] = [
  [-.32, -.36, .24], [.17, -.33, .15], [.33, -.07, .17], [.63, -.22, .1], [.5, .16, .12], [-.2, .38, .14], [-.6, 0, .26], [.3, .34, .08],
]
/** Square-packed sites of a disc split into lit, lit mare and dark, for a phase. */
export function moonSites(cx: number, cy: number, r: number, spacing: number, phase: number, maria = true): { lit: Pt[]; mare: Pt[]; dark: Pt[] } {
  const out = { lit: [] as Pt[], mare: [] as Pt[], dark: [] as Pt[] }, n = Math.floor(r / spacing)
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = (i * spacing) / r, y = (j * spacing) / r
    if (x * x + y * y > 1 + 1e-9) continue
    const p: Pt = [cx + i * spacing, cy + j * spacing]
    if (!litAt(x, y, phase)) out.dark.push(p)
    else if (maria && MARIA.some(([mx, my, mr]) => Math.hypot(x - mx, y - my) < mr)) out.mare.push(p)
    else out.lit.push(p)
  }
  return out
}

// ── MOON ──────────────────────────────────────────────────────────────────────
const MOON = { cx: 72, cy: 56, r: 21, spacing: 3.3, size: 2.8, ring: 31 }
/** The lunation ring: 30 sites, new moon at 12, full moon at 6. */
const LUNATION: Pt[] = Array.from({ length: 30 }, (_, i) => polar(MOON.ring, (i / 30) * TAU, MOON.cx, MOON.cy))
export const moonFace = face('watch-moon', 'Moon', 'round', {
  group: 'polar', inset: 'dark', credit: { ...MEEUS, note: 'moon phase from the series of chapters 47 and 48' },
  layers: () => {
    const now = wallNow(), m = moonPhase(now.utc), today = Math.round(m.phase * 30) % 30
    const disc = moonSites(MOON.cx, MOON.cy, MOON.r, MOON.spacing, m.phase)
    const toFull = m.phase < .5, next = nextMoonPhase(now.utc, toFull ? .5 : 0), nd = partsOf(next + now.offset * MINUTE)
    const sameDay = partsOf(now.local).day === nd.day && next - now.utc < 86_400_000
    const ring = LUNATION.map((p, i) => ({ p, i })).filter(({ i }) => i !== today)
    const mark = (i: number) => i === 0 || i === 15
    return [
      layer(T.dots(disc.dark, MOON.size), 'faint'),
      layer(T.dots(disc.mare, MOON.size), 'idle'),
      layer(T.dots(disc.lit, MOON.size), 'value'),
      layer(T.dots(ring.filter(({ i }) => !mark(i) && i > today).map(r => r.p), 1.3), 'faint'),
      layer(T.dots(ring.filter(({ i }) => !mark(i) && i < today).map(r => r.p), 1.3), 'mid'),
      layer(T.dots(ring.filter(({ i }) => mark(i)).map(r => r.p), 2.4), 'idle'),
      layer(T.dots([LUNATION[today]], 4.6), 'active'),
      layer(T.text(phaseName(m.phase), CX, 92, { align: 'center' }), 'idle'),
      layer(T.big(`${Math.round(m.illumination * 100)}%`, CX, 103, { lattice: 1.6, align: 'center' }), 'value'),
      layer(T.text(`${toFull ? 'FULL' : 'NEW'} ${sameDay ? 'TODAY' : `ON ${DAYS[nd.dow]}`}`, CX, 119, { align: 'center' }), 'mid'),
    ]
  },
})

// ── SUN ───────────────────────────────────────────────────────────────────────
/** The sun face's place and its clock (London keeps EU summer time). */
const HOME: Zone = { code: 'LDN', name: LONDON.name, std: 0, dst: 'eu' }
const DIAL = { r: 50, count: 96 }
/** Clock angle of an hour of the day on the 24-hour dial: noon at 12, midnight at 6. */
export const dayAngle = (hour: number) => (hour / 24) * TAU + Math.PI
const hourOfDay = (wall: number) => { const p = partsOf(wall); return p.hour + p.minute / 60 }
const RING: { p: Pt; h: number }[] = Array.from({ length: DIAL.count }, (_, k) => ({ p: polar(DIAL.r, dayAngle((k * 24) / DIAL.count)), h: (k * 24) / DIAL.count }))
const TIMES = { y: 70, k: 1.2, xs: [52, 92] }
export const sunFace = face('watch-sun', 'Sun', 'round', {
  group: 'polar', credit: { ...MEEUS, note: 'sunrise and sunset from the solar position, as in the NOAA solar calculator' },
  layers: () => {
    const now = wallNow(), wall = zoneWall(HOME, now.utc), p = partsOf(wall)
    const day0 = Date.UTC(p.year, p.month, p.day), s = sunTimes(day0, LONDON)
    const rise = s.rise === null ? null : zoneWall(HOME, s.rise), set = s.set === null ? null : zoneWall(HOME, s.set)
    const rh = rise === null ? 0 : hourOfDay(rise), sh = set === null ? 0 : hourOfDay(set), hNow = p.hour + p.minute / 60
    const isDay = (h: number) => (s.polar ? s.polar === 'day' : h >= rh && h <= sh)
    const sun = polar(DIAL.r, dayAngle(hNow)), clear = (q: Pt) => Math.hypot(q[0] - sun[0], q[1] - sun[1]) > 5.5
    const ring = RING.filter(r => clear(r.p)), major = (h: number) => h % 3 === 0
    const len = rise !== null && set !== null ? Math.round((set - rise) / MINUTE) : s.polar === 'day' ? 1440 : 0
    const boxes = [...TIMES.xs.map((x, i) => textBox(i ? 'SET' : 'RISE', x, TIMES.y - 10)), ...TIMES.xs.map(x => textBox('00:00', x, TIMES.y, TIMES.k)), textBox('00H 00M', CX, 86, 1.6), textBox(LONDON.name, CX, 104)]
    const horizon = rise !== null && set !== null ? [knock(T.dotLine(...polar(DIAL.r - 4, dayAngle(rh)), ...polar(DIAL.r - 4, dayAngle(sh)), { spacing: 3.3, size: 1.2 }), boxes)] : []
    return [
      layer(T.dots(ring.filter(r => !isDay(r.h) && !major(r.h)).map(r => r.p), 1.3), 'faint'),
      layer(T.dots(ring.filter(r => !isDay(r.h) && major(r.h)).map(r => r.p), 2.2), 'faint'),
      layer(T.dots(ring.filter(r => isDay(r.h) && !major(r.h)).map(r => r.p), 1.4), 'idle'),
      layer(T.dots(ring.filter(r => isDay(r.h) && major(r.h)).map(r => r.p), 2.4), 'value'),
      ...horizon.map(h => layer(h, 'mid')),
      layer(T.text('12', CX, CY - DIAL.r + 6, { align: 'center' }), 'mid'),
      ...TIMES.xs.map((x, i) => layer(T.text(i ? 'SET' : 'RISE', x, TIMES.y - 10, { align: 'center' }), 'mid')),
      ...[rise, set].map((w, i) => layer(T.big(w === null ? '--:--' : clockOf(w), TIMES.xs[i], TIMES.y, { lattice: TIMES.k, align: 'center' }), 'value')),
      layer(T.big(`${Math.floor(len / 60)}H ${String(len % 60).padStart(2, '0')}M`, CX, 86, { lattice: 1.6, align: 'center' }), 'idle'),
      layer(T.text(LONDON.name, CX, 104, { align: 'center' }), 'mid'),
      layer(T.dots([sun], 7), 'active'),
    ]
  },
})
