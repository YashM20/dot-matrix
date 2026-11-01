/**
 * Pixel sorting (Kim Asendorf, 2010; squares Q3, docs/living-matter/Q-squares.md §4.2): per row (or column), find
 * the maximal runs whose values lie in [lo, hi] and sort each run by a key, stably (ties keep their index order).
 * Cells outside every run stay put, so the picture's dark and bright anchors hold while the mid-tones melt into
 * streaks. O(n log n) per run. Pure and deterministic (inside the lint).
 */
import type { Raster } from '../raster/raster'

export interface PixelSortOptions {
  /** The band a run's values lie in (inclusive). */
  lo?: number; hi?: number
  /** Sort along rows ('x', default) or columns ('y'). */
  axis?: 'x' | 'y'
  /** Sort key of a value (default the value: dark → bright). */
  key?: (v: number) => number
  /** Sort only the first `lines` rows / columns (default all): a sweep in progress. */
  lines?: number
}
/** One sorted run: its line, first cell and length. */
export interface SortRun { line: number; start: number; length: number }

/** Sort `data` (w × h, row-major) in place, run by run; returns the runs it sorted (line order, then start). */
export function pixelSortData(data: Float32Array | Float64Array, w: number, h: number, o: PixelSortOptions = {}): SortRun[] {
  const lo = o.lo ?? .25, hi = o.hi ?? .9, key = o.key ?? ((v: number) => v), alongX = (o.axis ?? 'x') === 'x'
  const lines = Math.min(alongX ? h : w, o.lines ?? Infinity), len = alongX ? w : h, runs: SortRun[] = []
  const at = (line: number, i: number) => (alongX ? line * w + i : i * w + line)
  const idx: number[] = [], vals: number[] = [], keys: number[] = []
  for (let line = 0; line < lines; line++) {
    let i = 0
    while (i < len) {
      const v = data[at(line, i)]
      if (!(v >= lo && v <= hi)) { i++; continue }
      let j = i
      while (j < len && data[at(line, j)] >= lo && data[at(line, j)] <= hi) j++
      if (j - i > 1) {
        idx.length = vals.length = keys.length = 0
        for (let k = i; k < j; k++) { idx.push(k - i); vals.push(data[at(line, k)]); keys.push(key(vals[k - i])) }
        idx.sort((a, b) => keys[a] - keys[b] || a - b)
        for (let k = 0; k < idx.length; k++) data[at(line, i + k)] = vals[idx[k]]
      }
      runs.push({ line, start: i, length: j - i })
      i = j
    }
  }
  return runs
}
/** A sorted copy of a raster (`Raster` in, `Raster` out; the input is untouched). */
export function pixelSort(r: Raster, o: PixelSortOptions = {}): Raster {
  const out: Raster = { ...r, data: Float32Array.from(r.data) }
  pixelSortData(out.data, r.grid.cols, r.grid.rows, o)
  return out
}
