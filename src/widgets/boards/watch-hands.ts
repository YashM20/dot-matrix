/**
 * Watch faces that tell the time plainly: an analog dial with a sweeping seconds hand (its red tip is the face's
 * one accent) and a large digital face, hours over minutes on a 3.5 lattice, the seconds run round the squircle.
 */
import { TAU, layer } from '../types'
import { CX, CY, DAYS, SQ, T, face, pad2, polar, ray, squircleSites, wallNow, type Pt } from './watch-kit'

// ── ANALOG ────────────────────────────────────────────────────────────────────
/** Hand angles (radians, clockwise from 12) for a time of day; `s` may carry a fraction. */
export function handAngles(h: number, m: number, s: number): { hour: number; minute: number; second: number } {
  return { hour: (((h % 12) + m / 60 + s / 3600) / 12) * TAU, minute: ((m + s / 60) / 60) * TAU, second: (s / 60) * TAU }
}
export const HANDS = { hour: { r0: -6, r1: 28, step: 3.2, size: 3.6 }, minute: { r0: -8, r1: 44, step: 3, size: 2.8 }, second: { r0: -12, r1: 42, step: 2.4, size: 1.2 }, tip: { r: 46, size: 4.6 } }
/** The hands' dot sites for a time of day. */
export function handSites(h: number, m: number, s: number): { hour: Pt[]; minute: Pt[]; second: Pt[]; tip: Pt } {
  const a = handAngles(h, m, s), { hour, minute, second, tip } = HANDS
  return { hour: ray(a.hour, hour.r0, hour.r1, hour.step), minute: ray(a.minute, minute.r0, minute.r1, minute.step), second: ray(a.second, second.r0, second.r1, second.step), tip: polar(tip.r, a.second) }
}
const minuteTrack: Pt[] = Array.from({ length: 60 }, (_, i) => i).filter(i => i % 5).map(i => polar(54, (i / 60) * TAU))
const hourMarks: Pt[] = Array.from({ length: 12 }, (_, i) => i).filter(i => i).flatMap(i => [polar(54, (i / 12) * TAU), polar(50.5, (i / 12) * TAU)])
const twelve: Pt[] = [-2.2, 2.2].flatMap(dx => [[CX + dx, CY - 54], [CX + dx, CY - 50.5]] as Pt[])
const NUMERALS: [string, number][] = [['12', 0], ['3', .25], ['6', .5], ['9', .75]]
export const analogFace = face('watch-analog', 'Analog', 'round', {
  group: 'polar', animated: true,
  layers: () => {
    const now = wallNow(), hs = handSites(now.hour, now.minute, now.second), N = HANDS
    return [
      layer(T.dots(minuteTrack, 1.1), 'mid'),
      layer(T.dots(hourMarks, 2.2), 'idle'),
      layer(T.dots(twelve, 2.2), 'value'),
      ...NUMERALS.map(([s, f]) => { const [x, y] = polar(41, f * TAU); return layer(T.big(s, x, y - 4.55, { lattice: 1.3, align: 'center' }), 'mid') }),
      layer(T.text(`${DAYS[now.dow]} ${pad2(now.day)}`, CX, CY + 17, { align: 'center' }), 'mid'),
      layer(T.dots(hs.hour, N.hour.size), 'value'),
      layer(T.dots(hs.minute, N.minute.size), 'value'),
      layer(T.dots(hs.second, N.second.size), 'idle'),
      layer(T.dots([hs.tip], N.tip.size), 'active'),
      layer(T.dots([[CX, CY]], 5.2), 'value'),
    ]
  },
})

// ── DIGITAL ───────────────────────────────────────────────────────────────────
/** 60 second marks round the squircle, just inside the screen's edge; the quarters a little bigger. */
const SECONDS = squircleSites(SQ.a - SQ.inset, SQ.b - SQ.inset, { count: 60 })
const BIG = { lattice: 3.5, smooth: true, align: 'center' } as const
export const digitalFace = face('watch-digital', 'Digital', 'squircle', {
  group: 'text', animated: true,
  layers: () => {
    const now = wallNow(), s = Math.floor(now.second)
    const past = SECONDS.filter((_, i) => i < s), ahead = SECONDS.filter((_, i) => i > s)
    return [
      layer(T.dots(ahead.filter((_, i) => (i + s + 1) % 15), 1.2), 'faint'),
      layer(T.dots(ahead.filter((_, i) => !((i + s + 1) % 15)), 2), 'faint'),
      layer(T.dots(past, 1.4), 'mid'),
      layer(T.dots([SECONDS[s]], 3.4), 'active'),
      layer(T.big(pad2(now.hour), CX, 24, BIG), 'value'),
      layer(T.big(pad2(now.minute), CX, 79, BIG), 'idle'),
    ]
  },
})
