import type { GridConfig } from '../types'
import type { HeightRaster } from '../light/height'
import { createRaster, type Raster } from '../raster/raster'
import type { TangentRaster } from './aniso'

/**
 * Weaving (docs/living-matter/M-materials.md §3.1): drawdowns (which thread is on top at each crossing), loom
 * drafts (threading, tie-up, treadling) and the relief of a woven cloth. A crossing is `crossing` cells square:
 * a thread of crossing − 1 cells with a round cross-profile and a 1-cell void gap, so the smallest period on
 * the card is the gap's (crossing ≥ 3 cells; `{material.minPeriod}`).
 */

/** true = the warp (vertical thread) is over the weft at (end c, pick r). */
export type Drawdown = (c: number, r: number) => boolean
/** A loom draft: threading (shaft per warp end), tie-up [shaft][treadle], treadling (treadle per pick). */
export interface Draft { shafts: number; treadles: number; threading: readonly number[]; tieup: readonly (readonly boolean[])[]; treadling: readonly number[] }

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Plain weave: a checker. */
export const plain = (): Drawdown => (c, r) => ((c + r) & 1) === 0
/** k/n twill: each pick is the previous shifted by `dir` (2/2: k 2, n 4; denim 3/1). */
export const twill = (k: number, n: number, dir: 1 | -1 = 1): Drawdown => (c, r) => mod(c - dir * r, n) < k
/** n-end satin with step s: one interlacement per row and column (warp-faced: the warp floats over all but that point). */
export const satin = (n: number, s: number, face: 'warp' | 'weft' = 'warp'): Drawdown => (c, r) => {
  const point = mod(r - s * c, n) === 0
  return face === 'warp' ? !point : point
}
/** Herringbone: a k/n twill on a zigzag threading, mirrored every m ends (m a multiple of n). */
export const herringbone = (k: number, n: number, m: number): Drawdown => {
  const t = twill(k, n)
  return (c, r) => { const z = mod(c, 2 * m); return t(z < m ? z : 2 * m - 1 - z, r) }
}
/** Basket weave: k×k blocks of plain weave. */
export const basket = (k: number): Drawdown => (c, r) => ((Math.floor(c / k) + Math.floor(r / k)) & 1) === 0

/** A draft's drawdown: tieup[threading[c mod T]][treadling[r mod R]]. */
export function fromDraft(d: Draft): Drawdown {
  const T = d.threading.length, R = d.treadling.length
  return (c, r) => d.tieup[d.threading[mod(c, T)]][d.treadling[mod(r, R)]]
}

/** The smallest draft (distinct columns → shafts, distinct rows → treadles) reproducing `dd` over `ends` × `picks`. */
export function toDraft(dd: Drawdown, ends: number, picks: number): Draft {
  const colKey = (c: number) => { let s = ''; for (let r = 0; r < picks; r++) s += dd(c, r) ? '1' : '0'; return s }
  const shaftOf = new Map<string, number>(), shaftEnd: number[] = [], threading: number[] = []
  for (let c = 0; c < ends; c++) {
    const k = colKey(c)
    let s = shaftOf.get(k)
    if (s === undefined) { s = shaftEnd.length; shaftOf.set(k, s); shaftEnd.push(c) }
    threading.push(s)
  }
  const rowKey = (r: number) => shaftEnd.map(c => (dd(c, r) ? '1' : '0')).join('')
  const treadleOf = new Map<string, number>(), treadlePick: number[] = [], treadling: number[] = []
  for (let r = 0; r < picks; r++) {
    const k = rowKey(r)
    let t = treadleOf.get(k)
    if (t === undefined) { t = treadlePick.length; treadleOf.set(k, t); treadlePick.push(r) }
    treadling.push(t)
  }
  const tieup = shaftEnd.map(c => treadlePick.map(r => dd(c, r)))
  return { shafts: shaftEnd.length, treadles: treadlePick.length, threading, tieup, treadling }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const tie = (shafts: number, treadles: number, f: (s: number, t: number) => boolean) => range(shafts).map(s => range(treadles).map(t => f(s, t)))
/** The named drafts shown on the Loom card, as real drafts (straight threading 1-2-3-4 …, herringbone's point threading). */
export const DRAFTS: Readonly<Record<'plain' | 'twill22' | 'satin52' | 'herringbone' | 'basket2', Draft>> = {
  plain: { shafts: 2, treadles: 2, threading: [0, 1], treadling: [0, 1], tieup: tie(2, 2, (s, t) => s === t) },
  twill22: { shafts: 4, treadles: 4, threading: range(4), treadling: range(4), tieup: tie(4, 4, (s, t) => mod(s - t, 4) < 2) },
  satin52: { shafts: 5, treadles: 5, threading: range(5), treadling: range(5), tieup: tie(5, 5, (s, t) => mod(t - 2 * s, 5) !== 0) },
  herringbone: { shafts: 4, treadles: 4, threading: [0, 1, 2, 3, 3, 2, 1, 0], treadling: range(4), tieup: tie(4, 4, (s, t) => mod(s - t, 4) < 2) },
  basket2: { shafts: 2, treadles: 2, threading: [0, 0, 1, 1], treadling: [0, 0, 1, 1], tieup: tie(2, 2, (s, t) => s === t) },
}

export interface WeaveReliefOptions {
  /** Cells per thread crossing, ≥ 3 (default 4: a 3-cell thread and a 1-cell gap). */
  crossing?: number
  /** Thread height in cells (default 1.2). */
  lift?: number
  /** Woven picks so far, from the top of the box (rows below the fell are bare warp); default: all. */
  picks?: number
  /** The cloth's box in cells, inclusive: [col0, row0, col1, row1]. */
  box: [number, number, number, number]
}
export interface WeaveRelief { height: HeightRaster; tangent: TangentRaster; warp: Raster }

const reliefs = new WeakMap<Drawdown, Map<string, WeaveRelief>>()
/**
 * Relief of a woven cloth: `{ height, tangent, warp }` (warp = 1 where a warp thread shows), baked; cached per
 * drawdown + grid + options (LRU of 8). The visible thread at a crossing has a round cross-profile
 * lift·√(1 − (2f − 1)²) over its crossing − 1 cells (the last column / row is the void gap), and a float of
 * consecutive "up" crossings bulges by .45·lift·sin(π·s/len) along its length, so long satin floats dive at their ends.
 * Tangents are (0, 1) on warp, (1, 0) on weft.
 */
export function weaveRelief(dd: Drawdown, grid: GridConfig, o: WeaveReliefOptions): WeaveRelief {
  const W = Math.max(3, Math.round(o.crossing ?? 4)), lift = o.lift ?? 1.2, [x0, y0, x1, y1] = o.box
  const ends = Math.ceil((x1 - x0 + 1) / W), allPicks = Math.ceil((y1 - y0 + 1) / W), picks = Math.max(0, Math.min(allPicks, o.picks ?? allPicks))
  const key = `${grid.cols}x${grid.rows}|${W}|${lift}|${picks}|${o.box.join(',')}`
  let per = reliefs.get(dd)
  const hit = per?.get(key)
  if (hit) { per!.delete(key); per!.set(key, hit); return hit }
  const { cols, rows } = grid, n = cols * rows
  const height: HeightRaster = { ...createRaster(grid), mask: new Float32Array(n) }
  const tangent: TangentRaster = { grid, x: new Float32Array(n), y: new Float32Array(n) }
  const warp = createRaster(grid)
  // the drawdown over the woven crossings, and the run of each float containing a crossing
  const up = new Uint8Array(ends * picks)
  for (let j = 0; j < picks; j++) for (let i = 0; i < ends; i++) up[j * ends + i] = dd(i, j) ? 1 : 0
  const runWarp = new Int16Array(ends * picks * 2), runWeft = new Int16Array(ends * picks * 2)
  for (let i = 0; i < ends; i++) for (let j = 0; j < picks; j++) {
    const v = up[j * ends + i]
    let a = j, b = j
    while (a > 0 && up[(a - 1) * ends + i] === v) a--
    while (b < picks - 1 && up[(b + 1) * ends + i] === v) b++
    runWarp[2 * (j * ends + i)] = a; runWarp[2 * (j * ends + i) + 1] = b
  }
  for (let j = 0; j < picks; j++) for (let i = 0; i < ends; i++) {
    const v = up[j * ends + i]
    let a = i, b = i
    while (a > 0 && up[j * ends + a - 1] === v) a--
    while (b < ends - 1 && up[j * ends + b + 1] === v) b++
    runWeft[2 * (j * ends + i)] = a; runWeft[2 * (j * ends + i) + 1] = b
  }
  const profile = (f: number) => { const x = (f + .5) / (W - 1) * 2 - 1; return lift * Math.sqrt(Math.max(0, 1 - x * x)) }
  for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
    const lx = x - x0, ly = y - y0, i = Math.floor(lx / W), j = Math.floor(ly / W), fx = lx - i * W, fy = ly - j * W, k = y * cols + x
    const woven = j < picks, warpUp = !woven || up[j * ends + i] === 1
    if (warpUp) {
      if (fx === W - 1) continue
      let h = profile(fx)
      if (woven) {
        const a = runWarp[2 * (j * ends + i)], b = runWarp[2 * (j * ends + i) + 1]
        h += .45 * lift * Math.sin(Math.PI * (ly - a * W + .5) / ((b - a + 1) * W))
      }
      height.data[k] = h; height.mask[k] = 1; tangent.y[k] = 1; warp.data[k] = 1
    } else {
      if (fy === W - 1) continue
      const a = runWeft[2 * (j * ends + i)], b = runWeft[2 * (j * ends + i) + 1]
      height.data[k] = profile(fy) + .45 * lift * Math.sin(Math.PI * (lx - a * W + .5) / ((b - a + 1) * W))
      height.mask[k] = 1; tangent.x[k] = 1
    }
  }
  const b: [number, number, number, number] = [Math.max(0, x0), Math.max(0, y0), Math.min(cols - 1, x1), Math.min(rows - 1, y1)]
  height.bounds = b; tangent.bounds = b; warp.bounds = b
  const out = { height, tangent, warp }
  if (!per) reliefs.set(dd, (per = new Map()))
  per.set(key, out)
  if (per.size > 8) per.delete(per.keys().next().value!)
  return out
}
