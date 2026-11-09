/**
 * Drawing pieces shared by the watch faces (#126): the two cases (a round one and a squircle one), the screen each
 * face is clipped to, the wall clock, and a few small models (steps, heart rate, air temperature) that make the
 * complications move with the day. Everything is in TILE cells; the case sits under the dot label row.
 */
import { hash01 } from '../../engine/math'
import type { Layer } from '../../engine/types'
import { MINUTE, partsOf, type WallParts } from '../../engine/astro/calendar'
import { TAU, TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

export { PRESS, at, circle, rr, states, ui } from './components-kit'
export const T = layoutFor(TILE)
export type Pt = [number, number]
/** Round dots (n = 2), like the components and dash boards. */
export const style = { ...tileStyle, cornerRoundness: 0 }
/** Centre of every face. */
export const CX = 72, CY = 77
export type FrameKind = 'round' | 'squircle'
/** Round case: outer edge (where the crown sits), bezel line and the screen the face is clipped to (radii in cells). */
export const ROUND = { edge: 64, bezel: 61, screen: 57 }
/** Squircle case: half width and height of the bezel line, superellipse exponent, screen inset. */
export const SQ = { a: 57, b: 62, n: 5, inset: 4 }
export const LINE = { spacing: 3.3, size: 1.5 }

export const mod = (x: number, m: number) => ((x % m) + m) % m
/** A point at clock angle `a` (clockwise from 12) and radius `r` around the face centre. */
export const polar = (r: number, a: number, cx = CX, cy = CY): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
/** Sites from radius r0 to r1 along clock angle `a`, `step` cells apart (a hand). */
export const ray = (a: number, r0: number, r1: number, step: number): Pt[] => {
  const n = Math.max(1, Math.round((r1 - r0) / step))
  return Array.from({ length: n + 1 }, (_, i) => polar(r0 + ((r1 - r0) * i) / n, a))
}

// ── the squircle ──────────────────────────────────────────────────────────────
/** A superellipse point at parameter θ, 0 at 12 o'clock, clockwise. */
const sqPt = (a: number, b: number, th: number): Pt => {
  const s = Math.sin(th), c = Math.cos(th), e = 2 / SQ.n
  return [CX + a * Math.sign(s) * Math.abs(s) ** e, CY - b * Math.sign(c) * Math.abs(c) ** e]
}
/** Sites evenly spaced by arc length on a squircle of half sizes a × b, the first at 12, clockwise: `count` of them, or `spacing` apart. */
export function squircleSites(a: number, b: number, o: { count?: number; spacing?: number }): Pt[] {
  const N = 1440, curve: Pt[] = Array.from({ length: N + 1 }, (_, i) => sqPt(a, b, (i / N) * TAU)), acc = [0]
  for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]))
  const L = acc[N], n = o.count ?? Math.max(8, Math.round(L / (o.spacing ?? LINE.spacing))), out: Pt[] = []
  for (let k = 0, j = 1; k < n; k++) {
    const d = (k / n) * L
    while (acc[j] < d) j++
    const f = (d - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1), p = curve[j - 1], q = curve[j]
    out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f])
  }
  return out
}
const inSquircle = (x: number, y: number, a: number, b: number) => (Math.abs(x - CX) / a) ** SQ.n + (Math.abs(y - CY) / b) ** SQ.n <= 1

/** Is (x, y) on the face's screen, `inset` cells in from its edge? */
export const onScreen = (kind: FrameKind, x: number, y: number, inset = 0) => kind === 'round'
  ? Math.hypot(x - CX, y - CY) <= ROUND.screen - inset
  : inSquircle(x, y, SQ.a - SQ.inset - inset, SQ.b - SQ.inset - inset)
/** Drop the sites inside any of the boxes [x0, y0, x1, y1] (grown by `pad`), so text reads over a fill (`T.knock`). */
export const knock = T.knock
/** The box a centred `T.big` / `T.text` line covers: [x0, y0, x1, y1]. */
export const textBox = (s: string, cx: number, top: number, k = 1): [number, number, number, number] => {
  const [w, h] = T.size(s)
  return [cx - (w * k) / 2, top, cx + (w * k) / 2, top + h * k]
}

// ── the case ──────────────────────────────────────────────────────────────────
/** The crown on the right of the case: two columns of small dots. */
const crown = (x0: number): Layer => layer(T.dots([2.5, 5].flatMap(dx => [71, 74, 77, 80, 83].map((y): Pt => [x0 + dx, y])), 1.5), 'mid')
/** One rim per case, the bezel line: a second faint edge 3 cells outside it read as a doubled border at zoom. */
const CASES: Record<FrameKind, Layer[]> = {
  round: [layer(T.dotRing(CX, CY, ROUND.bezel, LINE), 'mid'), crown(CX + ROUND.edge)],
  squircle: [layer(T.dots(squircleSites(SQ.a, SQ.b, { spacing: LINE.spacing }), LINE.size), 'mid'), crown(CX + SQ.a + 3)],
}
export const caseOf = (kind: FrameKind): Layer[] => CASES[kind]
const KINDS = new Map<string, FrameKind>()
/** The case a face was made with (scripts/watch.ts checks the face stays on its screen). */
export const frameOf = (id: string): FrameKind => KINDS.get(id) ?? 'round'

/** What every face shares: TILE grid, dot label, round dots, its case drawn under the face. */
export function face(id: string, name: string, kind: FrameKind, extra: Partial<WidgetPreset> & Pick<WidgetPreset, 'layers'>): WidgetPreset {
  KINDS.set(id, kind)
  return { id, name, group: 'composite', chrome: 'dots', grid: TILE, style, clock: true, ...extra, layers: ctx => [...caseOf(kind), ...extra.layers(ctx)] }
}

// ── the wall clock ────────────────────────────────────────────────────────────
/**
 * Now, read from the device clock: the instant (`utc`, ms), the local wall time on the UTC scale (`local`) and its
 * parts. The offset comes from `getTimezoneOffset`, which the golden runs pin to 0 (scripts/lib/freeze.ts), so a
 * face hashes the same on every machine.
 */
export interface Wall extends WallParts { utc: number; local: number; /** Minutes east of UTC. */ offset: number }
export function wallNow(): Wall {
  const d = new Date(), offset = -d.getTimezoneOffset()
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
  return { ...partsOf(local), utc: local - offset * MINUTE, local, offset }
}
export const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0')
export const hhmm = (p: { hour: number; minute: number }) => `${pad2(p.hour)}:${pad2(p.minute)}`
/** A whole-minute clock time from ms on a wall scale. */
export const clockOf = (ms: number) => hhmm(partsOf(ms))
export const dayKey = (p: WallParts) => p.year * 400 + p.month * 32 + p.day

// ── small day models (steps, pulse, air) ──────────────────────────────────────
/** Share of a day's walking in each hour: a commute, lunch and an evening walk. */
const HOURLY = [0, 0, 0, 0, 0, 0, .15, .7, 1.1, .6, .45, .5, .9, .7, .4, .45, .6, 1, 1.2, .7, .45, .3, .12, .02]
export const STEP_GOAL = 8000
/** Steps in each hour of the day `p` falls on, the current hour counted up to its minute; later hours are 0. */
export function hourlySteps(p: WallParts): number[] {
  const k = dayKey(p)
  return HOURLY.map((w, h) => {
    const full = Math.round(w * 700 * (.6 + .8 * hash01(k, h, 7)))
    return h < p.hour ? full : h === p.hour ? Math.round((full * p.minute) / 60) : 0
  })
}
/** Resting pulse for the minute: 60–69 bpm. */
export const pulseOf = (p: WallParts) => 60 + Math.floor(10 * hash01(dayKey(p), p.hour * 60 + p.minute, 3))
/** Air temperature (°C): a daily swing peaking mid-afternoon, colder in the northern winter. */
export function airOf(p: WallParts): number {
  const season = -Math.cos(((p.month + .5) / 12) * TAU), day = -Math.cos(((p.hour + p.minute / 60 - 3) / 24) * TAU)
  return Math.round(11 + 8 * season + 4 * day)
}
/** A heartbeat for the pulse at `bpm`: full on the beat, one quantize step down between beats (t in seconds). */
export const beat = (t: number, bpm: number) => (mod((t * bpm) / 60, 1) < .18 ? 1 : .75)
