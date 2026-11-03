/**
 * Donut and heatmap (#132). The donut is rings of dot sites at fixed clock fractions, cut into segments with one
 * empty site between them, so a segment's edge always falls on a site; the picked segment steps out and turns red.
 * The heatmap is one big site per cell whose size is the value, quantized to `levels` steps (tone follows the step).
 */
import type { Tone } from '../types'
import { TAU, dcos, dsin } from '../noise/dmath'
import { emptyChart, type Chart, type Mark, type Pt } from './marks'
import { pickIndex } from './readout'
import type { Range2 } from './scale'

export interface DonutSpec {
  cx: number; cy: number
  /** Ring radii (cells): two or three rings make a band of big dots. */
  radii: readonly number[]
  /** Sites per ring, at the same clock fractions on every ring (a radial band). */
  sites: number; size: number
  /** Cells the picked segment steps out. */
  pop: number
  /** Segment tones in data order (cycled); the track is `faint`. */
  tones: readonly Tone[]
}
/** Cumulative segment ends (fractions of the turn) for the values, each scaled by `sweep` (the animate-in). */
export function donutBounds(values: readonly number[], sweep = 1): number[] {
  const vs = values.map(v => (Number.isFinite(v) && v > 0 ? v : 0)), total = vs.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return []
  let acc = 0
  return vs.map((v, i) => { acc += v; return i === vs.length - 1 ? sweep : (acc / total) * sweep })
}
export function donutChart(values: readonly number[], pick: number, sweep: number, s: DonutSpec): Chart {
  const n = values.length, hot = pickIndex(pick, n), bounds = donutBounds(values, Math.max(0, Math.min(1, sweep)))
  if (!n) return emptyChart()
  const at = (a: number, r: number): Pt => [s.cx + r * dsin(TAU * a), s.cy - r * dcos(TAU * a)]
  const segs: Pt[][] = values.map(() => []), track: Pt[] = []
  for (let k = 0; k < s.sites; k++) {
    const a = k / s.sites
    let i = -1
    for (let j = 0; j < bounds.length; j++) if (a < bounds[j]) { i = j; break }
    // the first site of each segment stays empty: the gap between segments
    const start = i > 0 ? bounds[i - 1] : 0
    if (i < 0) { for (const r of s.radii) track.push(at(a, r)); continue }
    if (a - start < 1 / s.sites - 1e-9) continue
    for (const r of s.radii) segs[i].push(at(a, r + (i === hot ? s.pop : 0)))
  }
  const marks: Mark[] = [{ sites: track, size: s.size * .45, tone: 'faint' }]
  segs.forEach((sites, i) => marks.push({ sites, size: s.size, tone: i === hot ? 'active' : s.tones[i % s.tones.length] }))
  const mid = s.radii.reduce((a, b) => a + b, 0) / Math.max(1, s.radii.length)
  const anchors = values.map((_, i) => at(((i ? bounds[i - 1] ?? 0 : 0) + (bounds[i] ?? 0)) / 2, mid))
  return { marks, labels: [], anchors, pick: hot }
}

export interface HeatSpec {
  /** Centre of the first cell, and the pitch between cells (cells). */
  x0: number; y0: number; dx: number; dy: number
  size: number; domain: Range2
  /** Tone per level, lowest first; `levels` = its length. Level 0 is drawn too (an empty cell is a faint dot). */
  tones: readonly Tone[]
}
/** The level (0 … levels − 1) of a value in the domain; non-finite values read as the lowest. */
export function heatLevel(v: number, [d0, d1]: Range2, levels: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(levels - 1, Math.round(((v - d0) / ((d1 - d0) || 1)) * (levels - 1))))
}
/** Rows × columns of values (row-major); the pick is a flat index row × cols + col. */
export function heatChart(matrix: readonly (readonly number[])[], pick: number, s: HeatSpec): Chart {
  const rows = matrix.length, cols = rows ? Math.max(...matrix.map(r => r.length)) : 0, levels = s.tones.length
  if (!rows || !cols || !levels) return emptyChart()
  const hot = pickIndex(pick, rows * cols), groups: Pt[][] = s.tones.map(() => []), hotLevel = { l: 0 }, anchors: Pt[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p: Pt = [s.x0 + c * s.dx, s.y0 + r * s.dy], l = heatLevel(matrix[r][c], s.domain, levels)
    anchors.push(p)
    if (r * cols + c === hot) hotLevel.l = l; else groups[l].push(p)
  }
  // dot size is the level: (l + 1) / levels lands on a quantize step for 5 levels
  const marks: Mark[] = groups.map((sites, l) => ({ sites, size: s.size, tone: s.tones[l], value: (l + 1) / levels }))
  if (hot >= 0) marks.push({ sites: [anchors[hot]], size: s.size, tone: 'active', value: (hotLevel.l + 1) / levels })
  return { marks, labels: [], anchors, pick: hot }
}
