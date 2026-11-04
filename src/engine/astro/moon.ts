/**
 * Moon phase from the date (#126), after Jean Meeus, "Astronomical Algorithms" (2nd ed., 1998): the mean
 * elongation, Sun and Moon anomalies of ch. 47 (47.2–47.4) and the low-precision phase angle of ch. 48 (48.4).
 * Good to a few hours, which is plenty for a watch face. Deterministic trig only (`dsin`/`dcos`), no network.
 */
import { dcos, dsin } from '../noise/trig'
import { DAY, HOUR, centuries } from './calendar'

const RAD = Math.PI / 180
/** Degrees folded into [0, 360). */
export const deg360 = (x: number) => ((x % 360) + 360) % 360
export const sinD = (x: number) => dsin(x * RAD)
export const cosD = (x: number) => dcos(x * RAD)
/** Mean length of a lunation in days. */
export const SYNODIC = 29.530588853

export interface MoonPhase {
  /** Fraction of the lunation: 0 new, .25 first quarter, .5 full, .75 last quarter. */
  phase: number
  /** Lit fraction of the disc, 0..1. */
  illumination: number
  /** Days since new moon (phase × the mean lunation). */
  age: number
}

/** The Moon's phase at instant `utc` (ms). */
export function moonPhase(utc: number): MoonPhase {
  const T = centuries(utc)
  const D = deg360(297.8501921 + 445267.1114034 * T - .0018819 * T * T)
  const M = deg360(357.5291092 + 35999.0502909 * T - .0001536 * T * T)
  const Mp = deg360(134.9633964 + 477198.8675055 * T + .0087414 * T * T)
  // phase angle i (48.4); the true elongation is 180° − i, below 180° while waxing
  const i = 180 - D - 6.289 * sinD(Mp) + 2.1 * sinD(M) - 1.274 * sinD(2 * D - Mp) - .658 * sinD(2 * D) - .214 * sinD(2 * Mp) - .11 * sinD(D)
  const phase = deg360(180 - i) / 360
  return { phase, illumination: (1 + cosD(i)) / 2, age: phase * SYNODIC }
}

/** The first instant after `utc` when the phase reaches `target` (0 new, .5 full): 6 h steps, then bisection. */
export function nextMoonPhase(utc: number, target: number): number {
  // rel climbs from 0 to 1 over a lunation and drops back to 0 at the target
  const rel = (ms: number) => { const r = moonPhase(ms).phase - target; return r - Math.floor(r) }
  let a = utc, ra = rel(a)
  for (let k = 0; k < 140; k++) {
    const b = a + 6 * HOUR, rb = rel(b)
    if (rb < ra) {
      let lo = a, hi = b
      for (let j = 0; j < 24; j++) { const m = (lo + hi) / 2; if (rel(m) > .5) lo = m; else hi = m }
      return hi
    }
    a = b; ra = rb
  }
  return utc + SYNODIC * DAY
}

/** The phase's common name (the quarters and full and new moon within about a day). */
export function phaseName(phase: number): string {
  const near = (x: number) => Math.abs(phase - x) < .034
  if (near(0) || near(1)) return 'NEW MOON'
  if (near(.25)) return 'FIRST QUARTER'
  if (near(.5)) return 'FULL MOON'
  if (near(.75)) return 'LAST QUARTER'
  return phase < .25 ? 'WAXING CRESCENT' : phase < .5 ? 'WAXING GIBBOUS' : phase < .75 ? 'WANING GIBBOUS' : 'WANING CRESCENT'
}

/**
 * Is a point of the disc lit? (x, y) relative to the centre, in disc radii, x to the right (northern view: the
 * right side lights first). The terminator is a half ellipse of half-width cos(2π·phase).
 */
export function litAt(x: number, y: number, phase: number): boolean {
  const w = Math.sqrt(Math.max(0, 1 - y * y)), c = dcos(phase * 2 * Math.PI)
  return phase < .5 ? x >= c * w : x <= -c * w
}
