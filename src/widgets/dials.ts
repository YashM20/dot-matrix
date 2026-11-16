/**
 * Dial geometry for TILE cards (#357): a 270°-style dotted track with its lit stretch, ticks, scale numbers and a
 * needle of big sites. The dash dials and the components knob draw from here; `polar` is the one clock-angle helper.
 */
import type { Layer, Tone } from '../engine/types'
import { TAU, TILE, layer, layoutFor, type LatticeField } from './types'

const T = layoutFor(TILE)
type Pt = [number, number]
/** Track sites: the components board's fine outline pitch and size. */
const RING = { spacing: 3.3, size: 1.5 }
const mod = (x: number, m: number) => ((x % m) + m) % m

/** A point at clock angle `a` (clockwise from 12) on a circle. */
export const polar = (cx: number, cy: number, r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)]

/** A dial: centre, radius and its arc (start clockwise from 12, sweep), both in radians. */
export interface Dial { cx: number; cy: number; r: number; start: number; sweep: number }
export const angleOf = (d: Dial, f: number) => d.start + Math.max(0, Math.min(1, f)) * d.sweep
/** A knob control's `map`: the pointer's angle on the dial → value, so a tap on the scale jumps there. */
export const dialMap = (d: Dial) => (x: number, y: number, v: number): number => {
  const dx = x - d.cx, dy = y - d.cy
  if (Math.hypot(dx, dy) < 8) return v
  const rel = mod(Math.atan2(dx, -dy) - d.start, TAU)
  return rel <= d.sweep ? rel / d.sweep : rel - d.sweep < TAU - rel ? 1 : 0
}
/**
 * The dial's dotted track, and the stretch from fraction `f0` to `f1` lit on the same sites. With `needleAt`, the
 * track sites under the needle at that fraction are knocked out, so it sits in clear air.
 */
export function dialArc(d: Dial, f0: number, f1: number, tone: Tone = 'value', needleAt?: number): Layer[] {
  const lo = Math.min(f0, f1), hi = Math.max(f0, f1)
  const clear = (lf: LatticeField) => (needleAt === undefined ? lf : T.knockout(lf, needleSites(d, needleAt), NEEDLE.clear))
  return [
    layer(clear(T.dotRing(d.cx, d.cy, d.r, { ...RING, start: d.start, sweep: d.sweep })), 'mid'),
    ...(hi - lo > 1e-3 ? [layer(clear(T.dotRing(d.cx, d.cy, d.r, { ...RING, start: angleOf(d, lo), sweep: (hi - lo) * d.sweep, size: 2.2 })), tone)] : []),
  ]
}
/** Tick sites just inside the track at fractions `fs`. */
export const dialTicks = (d: Dial, fs: number[], size = 2.4): LatticeField => T.dots(fs.map(f => polar(d.cx, d.cy, d.r - 6, angleOf(d, f))), size)
/** Scale numbers inside the ticks, 5×7 type centred on their angle. */
export const dialLabels = (d: Dial, marks: [number, string][], inset = 15): Layer[] => marks.map(([f, s]) => {
  const [x, y] = polar(d.cx, d.cy, d.r - inset, angleOf(d, f))
  return layer(T.text(s, Math.round(x), Math.round(y - 3), { align: 'center' }), 'idle')
})
/** The needle: a short run of big sites across the track at fraction `f`; `clear` = the track's knockout radius round each. */
const NEEDLE = { size: 2.6, clear: 3.2 }
export const needleSites = (d: Dial, f: number): Pt[] => { const a = angleOf(d, f); return [-13, -9, -5, -1, 3].map(k => polar(d.cx, d.cy, d.r + k, a)) }
export const needle = (d: Dial, f: number, v = 1): LatticeField => ({ field: () => v, sites: needleSites(d, f), size: NEEDLE.size })
