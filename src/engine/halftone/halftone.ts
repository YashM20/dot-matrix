import type { CellBounds } from '../types'
import { createRaster, rasterWindow, type Raster } from '../raster/raster'
import { blueNoise, BLUE_NOISE_SIZE } from './mask'

/**
 * The halftone ladder (MASTER-PLAN §8 Track L, P4 live media): a luma `Raster` in [0, 1] → a raster of
 * quantized dot levels on the same grid. Values are `level / (levels - 1)` (`mode: 'size'`, dot radius
 * carries luma, so dot *area* ≈ luma² ≈ linear light for gamma-encoded input) or its square root
 * (`mode: 'area'`, dot area carries the value, for linear-light input). Level 0 = no dot.
 *
 * - step 1: ordered multi-level threshold against the STBN mask (size + tone come from the level).
 * - step 2: structure-aware: an edge-preserving (self-guided) filter takes sensor noise out of flat
 *   regions, local contrast is lifted where the neighbourhood is flat (CLAHE-like), and the dither
 *   amplitude falls to ~0 on edges, so contours snap to the nearest level (crisp at cell resolution)
 *   while smooth gradients stay dithered (no banding).
 *
 * `halftone` is pure (frame = STBN slice). `halftoneStream` adds temporal stability for live input:
 * a cell keeps its threshold slice until its input really changes, and level hysteresis absorbs noise.
 */
export interface HalftoneOptions {
  /** Ladder step: 1 ordered threshold, 2 structure-aware (default 1). */
  step?: 1 | 2
  /** Dot levels including "no dot" (default 6). 2 = on/off. */
  levels?: number
  /** `size` (default): value = level fraction; `area`: value = √(level fraction). */
  mode?: 'size' | 'area'
  /** STBN temporal slice (default 0). The pure call uses it for every cell. */
  frame?: number
  /** Step 2 local-contrast gain added in flat neighbourhoods (default .7). */
  contrast?: number
  /** Step 2 neighbourhood radius in cells for local contrast (default 6). */
  radius?: number
}
export interface HalftoneStreamOptions extends HalftoneOptions {
  /** Level hysteresis in level units: a dot changes level only once its input clears the boundary by this much (default .35). */
  hysteresis?: number
  /** Input change (0..1) at which a cell takes the current frame's threshold slice (default .08). */
  reroll?: number
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const BN = BLUE_NOISE_SIZE - 1, PHI = 0.6180339887498949
const sliceOffset = (k: number) => { const s = (k * PHI) % 1; return s < 0 ? s + 1 : s }

/** Summed-area table of `src` (w×h) into `sat` ((w+1)×(h+1), first row/column 0); `sq` sums squares instead. */
function summed(src: Float32Array, w: number, h: number, sat: Float64Array, sq: boolean): void {
  const W = w + 1
  for (let y = 0; y < h; y++) {
    let run = 0
    const row = y * w, o = (y + 1) * W, up = y * W
    for (let x = 0; x < w; x++) { const v = src[row + x]; run += sq ? v * v : v; sat[o + x + 1] = sat[up + x + 1] + run }
  }
}

/** Reusable per-size work buffers (one set per stream, a fresh set per pure call). */
interface Work { w: number; h: number; v: Float32Array; amp: Float32Array; base: Float32Array; s1: Float64Array; s2: Float64Array }
const work = (w: number, h: number): Work => {
  const n = w * h, m = (w + 1) * (h + 1)
  return { w, h, v: new Float32Array(n), amp: new Float32Array(n), base: new Float32Array(n), s1: new Float64Array(m), s2: new Float64Array(m) }
}

/**
 * Fill `k.v` (tone to quantize, 0..1) and `k.amp` (dither amplitude 0..1) for the window of `r`.
 * Step 1: v = input, amp = 1. Step 2: self-guided filter base, local contrast, edge-driven amplitude.
 * Every box statistic comes from two summed-area tables (Σv, Σv²), so any radius costs 4 reads per cell.
 */
function prepare(r: Raster, win: CellBounds, opts: HalftoneOptions, k: Work): void {
  const { cols } = r.grid, [c0, r0] = win, { w, h, v, amp } = k, src = r.data
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = clamp01(src[(r0 + y) * cols + c0 + x])
  if ((opts.step ?? 1) === 1) { amp.fill(1); return }
  const { base, s1, s2 } = k, W = w + 1, eps = .004, R = opts.radius ?? 6, gain = opts.contrast ?? .7
  summed(v, w, h, s1, false); summed(v, w, h, s2, true)
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - 2) * W, yb = (Math.min(h - 1, y + 2) + 1) * W, ny = Math.min(h - 1, y + 2) - Math.max(0, y - 2) + 1
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - 2), xb = Math.min(w - 1, x + 2) + 1, inv = 1 / (ny * (xb - xa))
      const m = (s1[yb + xb] - s1[ya + xb] - s1[yb + xa] + s1[ya + xa]) * inv
      const va = Math.max(0, (s2[yb + xb] - s2[ya + xb] - s2[yb + xa] + s2[ya + xa]) * inv - m * m), A = va / (va + eps)
      // self-guided filter (He et al. 2010), radius 2: flat regions → their mean (noise gone), edges → themselves
      base[y * w + x] = A * v[y * w + x] + (1 - A) * m
    }
  }
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - R) * W, yb = (Math.min(h - 1, y + R) + 1) * W, ny = Math.min(h - 1, y + R) - Math.max(0, y - R) + 1
    const up = Math.max(0, y - 1) * w, dn = Math.min(h - 1, y + 1) * w, row = y * w
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - R), xb = Math.min(w - 1, x + R) + 1, inv = 1 / (ny * (xb - xa))
      const m = (s1[yb + xb] - s1[ya + xb] - s1[yb + xa] + s1[ya + xa]) * inv
      const sd = Math.sqrt(Math.max(0, (s2[yb + xb] - s2[ya + xb] - s2[yb + xa] + s2[ya + xa]) * inv - m * m))
      // local contrast: flat neighbourhoods (small σ over ±R) are stretched about their mean by up to 1 + gain
      const i = row + x, b = base[i]
      v[i] = clamp01(m + (b - m) * (1 + gain * (1 - smooth(.03, .22, sd))))
      // structure: central-difference gradient of the base; edges get (almost) no dither
      const gx = base[row + Math.min(w - 1, x + 1)] - base[row + Math.max(0, x - 1)], gy = base[dn + x] - base[up + x]
      amp[i] = 1 - .85 * smooth(.06, .22, Math.sqrt(gx * gx + gy * gy) * .5)
    }
  }
}

/** Level → output value. */
const valueOf = (level: number, top: number, area: boolean) => (area ? Math.sqrt(level / top) : level / top)
const levelsOf = (opts: HalftoneOptions) => Math.max(2, Math.round(opts.levels ?? 6))

/** Pure ladder halftone of `r` (see the module note). Same inputs → same output; bounds are kept. */
export function halftone(r: Raster, opts: HalftoneOptions = {}): Raster {
  const win = rasterWindow(r), out = createRaster(r.grid, r.space, r.bounds && win)
  const w = win[2] - win[0] + 1, h = win[3] - win[1] + 1
  if (w <= 0 || h <= 0) return out
  const k = work(w, h), top = levelsOf(opts) - 1, area = opts.mode === 'area', off = sliceOffset(opts.frame ?? 0), mask = blueNoise(), { cols } = r.grid
  prepare(r, win, opts, k)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = win[0] + x, cy = win[1] + y, i = y * w + x
    let t = mask[(cy & BN) * BLUE_NOISE_SIZE + (cx & BN)] + off; if (t >= 1) t -= 1
    const q = Math.min(top, Math.max(0, Math.floor(k.v[i] * top + .5 + k.amp[i] * (t - .5))))
    out.data[cy * cols + cx] = q ? valueOf(q, top, area) : 0
  }
  return out
}

/** A temporally stable halftone of a live raster sequence. `push` returns the same output raster object every frame. */
export interface HalftoneStream {
  /** Halftone the next frame (`frame` = the STBN slice cells re-rolled this frame take). Idempotent for a repeated input. */
  push(r: Raster, frame: number): Raster
  /** Forget the history (next push starts fresh). */
  reset(): void
  /** Cells whose level changed in the last push. */
  readonly changes: number
}

/**
 * Temporal stability for live media (webcam): each cell keeps the threshold slice it last re-rolled to,
 * and re-rolls (takes the current frame's slice) only when its prepared input moved by more than
 * `reroll` since then, so a static scene keeps a fixed blue-noise pattern while moving regions draw fresh,
 * decorrelated thresholds (no "shower door"). On top, level hysteresis: a dot moves to a new level only
 * when its input clears that level's boundary by `hysteresis`, so sensor noise around a boundary never
 * toggles a dot. Deterministic in the input sequence.
 */
export function halftoneStream(opts: HalftoneStreamOptions = {}): HalftoneStream {
  const top = levelsOf(opts) - 1, area = opts.mode === 'area', hyst = opts.hysteresis ?? .35, reroll = opts.reroll ?? .08, mask = blueNoise()
  let k: Work | undefined, out: Raster | undefined, level: Uint8Array, anchor: Float32Array, slice: Float32Array, key = '', changes = 0
  return {
    get changes() { return changes },
    reset() { key = ''; changes = 0 },
    push(r, frame) {
      const win = rasterWindow(r), w = win[2] - win[0] + 1, h = win[3] - win[1] + 1, { cols } = r.grid
      const id = `${cols}x${r.grid.rows}|${win.join(',')}`, fresh = id !== key
      if (fresh) {
        key = id; k = work(Math.max(0, w), Math.max(0, h)); out = createRaster(r.grid, r.space, r.bounds && win)
        level = new Uint8Array(w * h); anchor = new Float32Array(w * h); slice = new Float32Array(w * h)
      }
      changes = 0
      if (w <= 0 || h <= 0) return out!
      prepare(r, win, opts, k!)
      const v = k!.v, amp = k!.amp, off = sliceOffset(frame), d = out!.data
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, cx = win[0] + x, cy = win[1] + y, vi = v[i]
        if (fresh || Math.abs(vi - anchor[i]) > reroll) { anchor[i] = vi; slice[i] = off }
        let t = mask[(cy & BN) * BLUE_NOISE_SIZE + (cx & BN)] + slice[i]; if (t >= 1) t -= 1
        const s = vi * top + .5 + amp[i] * (t - .5), want = Math.min(top, Math.max(0, Math.floor(s))), prev = level[i]
        // hysteresis: stay unless the input clears the boundary of the current level by `hyst`
        const q = fresh || (want > prev ? s >= prev + 1 + hyst : want < prev ? s < prev - hyst : false) ? want : prev
        if (q !== prev) changes++
        level[i] = q
        d[cy * cols + cx] = q ? valueOf(q, top, area) : 0
      }
      if (fresh) changes = 0
      return out!
    },
  }
}

/** Cells whose value differs between two rasters on the same grid (the temporal flicker count). */
export function rasterChanges(a: Raster, b: Raster, eps = 1e-6): number {
  let n = 0
  for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > eps) n++
  return n
}
