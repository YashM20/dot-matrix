/**
 * Sample data for the charts board (#132), made up for it: each card has two sets (A, B) of the same shape so the
 * chart can morph between them. The longer series come from a seeded hash walk (`hash01`, integer maths only), so
 * they are the same on every engine and every run.
 */
import type { Candle } from '../../engine/charts/cartesian'
import { hash01 } from '../../engine/math'

const round1 = (v: number) => Math.round(v * 10) / 10
const pad2 = (n: number) => String(n).padStart(2, '0')

// ── bar: orders per month, two years ────────────────────────────────────────
export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
export const ORDERS: [number[], number[]] = [
  [34, 41, 38, 52, 47, 58, 63, 55, 61, 70, 66, 78],
  [45, 50, 57, 54, 66, 71, 68, 79, 84, 76, 88, 96],
]

// ── line: site visits per hour, a Monday and a Sunday ───────────────────────
export const HOURS = Array.from({ length: 24 }, (_, h) => pad2(h))
export const VISITS: [number[], number[]] = [
  [12, 8, 6, 5, 6, 11, 24, 41, 58, 52, 47, 50, 61, 55, 49, 52, 60, 72, 80, 66, 48, 35, 24, 16],
  [18, 14, 10, 7, 6, 7, 10, 16, 25, 36, 48, 58, 64, 70, 74, 71, 66, 60, 55, 50, 44, 38, 30, 22],
]

// ── area: rooftop solar output (kW) from 06:00 to 20:00, a clear day and a cloudy one ──
export const SUN_HOURS = Array.from({ length: 15 }, (_, i) => pad2(6 + i))
export const SOLAR: [number[], number[]] = [
  [.1, .6, 1.5, 2.6, 3.6, 4.4, 4.9, 5.1, 4.9, 4.4, 3.6, 2.6, 1.5, .6, .1],
  [.1, .4, .9, 1.8, 1.2, 2.6, 1.9, 3.1, 1.4, 2.2, 1.6, .9, .7, .3, 0],
]

// ── donut: storage use (GB) on a phone and a computer ───────────────────────
export const KINDS = ['PHOTOS', 'APPS', 'VIDEO', 'MAIL', 'OTHER']
export const STORAGE: [number[], number[]] = [
  [48, 22, 17, 6, 9],
  [31, 44, 58, 12, 21],
]

// ── heatmap: commits per hour (06–21) and weekday, this week and last ───────
export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const HEAT_HOURS = Array.from({ length: 16 }, (_, i) => pad2(6 + i))
/** Work hours are busy, lunch dips, weekends are quiet; the hash adds the noise of a real week. */
function commits(seed: number): number[][] {
  return DAYS.map((_, d) => HEAT_HOURS.map((_, i) => {
    const h = 6 + i, weekend = d >= 5
    const shape = weekend ? (h >= 11 && h <= 17 ? .35 : .1) : h < 8 ? .1 : h === 12 || h === 13 ? .45 : h <= 18 ? .9 : h <= 20 ? .4 : .15
    return Math.round(shape * (.3 + .7 * hash01(d * 31 + i, seed)) * 12)
  }))
}
export const COMMITS: [number[][], number[][]] = [commits(11), commits(29)]

// ── sparklines: three server gauges over the last 32 minutes, two servers ───
export const GAUGES = [{ name: 'CPU', unit: '%', lo: 6, hi: 94, d: 0 }, { name: 'MEM', unit: '%', lo: 38, hi: 82, d: 0 }, { name: 'NET', unit: '', lo: .2, hi: 9.6, d: 1 }]
/** A bounded random walk with a pull back to the middle. */
function walk(n: number, lo: number, hi: number, seed: number, d: number): number[] {
  const out: number[] = [], span = hi - lo
  let v = lo + span * (.3 + .4 * hash01(seed, 1))
  for (let i = 0; i < n; i++) {
    v += span * ((hash01(seed, i + 2) - .5) * .34 + (.5 - (v - lo) / span) * .12)
    v = Math.max(lo, Math.min(hi, v))
    out.push(d ? round1(v) : Math.round(v))
  }
  return out
}
export const SPARK_N = 32
export const SERVERS: [number[][], number[][]] = [0, 1].map(s => GAUGES.map((g, k) => walk(SPARK_N, g.lo, g.hi, 101 + s * 17 + k * 5, g.d))) as [number[][], number[][]]

// ── candles: twenty trading days of a made-up stock, two months ─────────────
function market(n: number, start: number, seed: number): Candle[] {
  const out: Candle[] = []
  let price = start
  for (let i = 0; i < n; i++) {
    const r = (k: number) => hash01(seed * 97 + i, k)
    const o = price, c = Math.round(o + (r(1) - .5) * 14), h = Math.max(o, c) + Math.round(r(2) * 6), l = Math.min(o, c) - Math.round(r(3) * 6)
    out.push({ o, h, l, c })
    price = c + Math.round((r(4) - .5) * 3) + (price < start - 12 ? 3 : price > start + 12 ? -3 : 0)
  }
  return out
}
export const SESSIONS = Array.from({ length: 20 }, (_, i) => String(i + 1))
export const STOCK: [Candle[], Candle[]] = [market(20, 184, 3), market(20, 188, 8)]
