/**
 * Watch faces that tell the time plainly: an analog dial with a sweeping seconds hand (its red tip is the face's
 * one accent) and a large digital face, hours over minutes on a 3.5 lattice, the seconds run round the squircle.
 */
import { TAU, layer } from '../types'
import { CX, CY, DAYS, SQ, T, face, knock, pad2, polar, ray, squircleSites, textBox, wallNow, type Pt } from './watch-kit'

// ── ANALOG ────────────────────────────────────────────────────────────────────
/** Hand angles (radians, clockwise from 12) for a time of day; `s` may carry a fraction. */
export function handAngles(h: number, m: number, s: number): { hour: number; minute: number; second: number } {
  return { hour: (((h % 12) + m / 60 + s / 3600) / 12) * TAU, minute: ((m + s / 60) / 60) * TAU, second: (s / 60) * TAU }
}
// every hand starts clear of the hub dot, so the centre is one hub dot instead of a pile of three sizes
export const HANDS = { hour: { r0: 4.6, r1: 28, step: 3.2, size: 3.6 }, minute: { r0: 4.6, r1: 44, step: 3, size: 2.8 }, second: { r0: 4.6, r1: 42, step: 2.4, size: 1.2 }, tip: { r: 46, size: 4.6 } }
/** The hands' dot sites for a time of day. */
export function handSites(h: number, m: number, s: number): { hour: Pt[]; minute: Pt[]; second: Pt[]; tip: Pt } {
  const a = handAngles(h, m, s), { hour, minute, second, tip } = HANDS
  return { hour: ray(a.hour, hour.r0, hour.r1, hour.step), minute: ray(a.minute, minute.r0, minute.r1, minute.step), second: ray(a.second, second.r0, second.r1, second.step), tip: polar(tip.r, a.second) }
}
const minuteTrack: Pt[] = Array.from({ length: 60 }, (_, i) => i).filter(i => i % 5).map(i => polar(54, (i / 60) * TAU))
const hourMarks: Pt[] = Array.from({ length: 12 }, (_, i) => i).filter(i => i).flatMap(i => [polar(54, (i / 12) * TAU), polar(50.5, (i / 12) * TAU)])
// 12 o'clock: the other markers' two sites, one size up (was a 2 × 2 block of touching dots)
const twelve: Pt[] = [[CX, CY - 54], [CX, CY - 50.5]]
const NUMERALS: [string, number][] = [['12', 0], ['3', .25], ['6', .5], ['9', .75]]
export const analogFace = face('watch-analog', 'Analog', 'round', {
  group: 'polar', animated: true,
  layers: () => {
    const now = wallNow(), hs = handSites(now.hour, now.minute, now.second), N = HANDS, date = `${DAYS[now.dow]} ${pad2(now.day)}`
    // the hands leave the numerals and the date clear when they pass over them
    const boxes = [...NUMERALS.map(([s, f]) => { const [x, y] = polar(41, f * TAU); return textBox(s, x, y - 4.55, 1.3) }), textBox(date, CX, CY + 17)]
    const hand = (pts: Pt[], size: number) => knock(T.dots(pts, size), boxes, 1 + size / 2)
    return [
      layer(T.dots(minuteTrack, 1.1), 'mid'),
      layer(T.dots(hourMarks, 2.2), 'idle'),
      layer(T.dots(twelve, 3), 'value'),
      // a numeral under the red tip loses the dots the tip would cover
      ...NUMERALS.map(([s, f]) => {
        const [x, y] = polar(41, f * TAU), n = T.big(s, x, y - 4.55, { lattice: 1.3, align: 'center' })
        return layer({ ...n, field: T.marker(hs.tip, N.tip.size, { lattice: 1.3, origin: n.origin, snap: false }).cut(n.field) }, 'mid')
      }),
      layer(T.text(date, CX, CY + 17, { align: 'center' }), 'mid'),
      layer(hand(hs.hour, N.hour.size), 'value'),
      layer(hand(hs.minute, N.minute.size), 'value'),
      layer(hand(hs.second, N.second.size), 'idle'),
      layer(T.dots([hs.tip], N.tip.size), 'active'),
      layer(T.dots([[CX, CY]], 5), 'value'),
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
