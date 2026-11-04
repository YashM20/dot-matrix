/**
 * A tide clock's model (#126): a sum of five harmonic constituents at their real speeds (M2, S2, N2, K1, O1) with
 * made-up amplitudes and phases. It shows how a tide rises and falls (two highs a day, springs and neaps over a
 * fortnight), not the tide at any real harbour: the card says so. Pure and deterministic (`dcos`/`dsin`).
 */
import { dcos, dsin } from '../noise/trig'
import { HOUR, MINUTE } from './calendar'

const RAD = Math.PI / 180
/** Constituents: speed in degrees per hour, relative amplitude, phase lag in degrees. */
export const CONSTITUENTS: readonly { name: string; speed: number; amp: number; lag: number }[] = [
  { name: 'M2', speed: 28.9841042, amp: 1, lag: 0 },
  { name: 'S2', speed: 30, amp: .46, lag: 48 },
  { name: 'N2', speed: 28.4397295, amp: .19, lag: 335 },
  { name: 'K1', speed: 15.0410686, amp: .12, lag: 160 },
  { name: 'O1', speed: 13.9430356, amp: .08, lag: 140 },
]
const TOTAL = CONSTITUENTS.reduce((s, c) => s + c.amp, 0)
/** Hours since 2000-01-01 12:00 UTC. */
const hoursOf = (utc: number) => (utc - 946728000000) / HOUR

/** Height at `utc`, −1..1 (the sum of the amplitudes). */
export function tideHeight(utc: number): number {
  const t = hoursOf(utc)
  let h = 0
  for (const c of CONSTITUENTS) h += c.amp * dcos((c.speed * t - c.lag) * RAD)
  return h / TOTAL
}
/** Rate of change at `utc` (any positive multiple of dh/dt: only its sign is used). */
const slope = (utc: number) => {
  const t = hoursOf(utc)
  let d = 0
  for (const c of CONSTITUENTS) d -= c.amp * c.speed * dsin((c.speed * t - c.lag) * RAD)
  return d
}

export interface TideTurn { at: number; high: boolean; height: number }
/** Highs and lows between `from` and `to` (ms), in time order: 10-minute scan of the slope, then bisection. */
export function tideTurns(from: number, to: number): TideTurn[] {
  const out: TideTurn[] = [], step = 10 * MINUTE
  let a = from, sa = slope(a)
  while (a < to) {
    const b = a + step, sb = slope(b)
    if ((sa > 0) !== (sb > 0)) {
      let lo = a, hi = b
      for (let j = 0; j < 16; j++) { const m = (lo + hi) / 2; if ((slope(m) > 0) === (sa > 0)) lo = m; else hi = m }
      const at = (lo + hi) / 2
      out.push({ at, high: sa > 0, height: tideHeight(at) })
    }
    a = b; sa = sb
  }
  return out
}

export interface TideClock {
  /** Hand angle, clockwise from 12: 0 at high water, π at low water. */
  angle: number
  /** Water level between the last and next turn, 0 at low, 1 at high. */
  level: number
  rising: boolean
  next: TideTurn
}
/** The tide clock at `utc`: where the hand points and how full the face is. */
export function tideClock(utc: number): TideClock {
  const turns = tideTurns(utc - 14 * HOUR, utc + 14 * HOUR)
  const n = turns.findIndex(x => x.at > utc), next = turns[n], prev = turns[n - 1]
  if (!next || !prev) return { angle: 0, level: .5, rising: true, next: next ?? { at: utc, high: true, height: 0 } }
  const f = (utc - prev.at) / (next.at - prev.at), h = tideHeight(utc)
  const high = prev.high ? prev : next, low = prev.high ? next : prev
  const level = Math.max(0, Math.min(1, (h - low.height) / ((high.height - low.height) || 1)))
  return { angle: prev.high ? Math.PI * f : Math.PI * (1 + f), level, rising: !prev.high, next }
}
