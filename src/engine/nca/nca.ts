/**
 * Neural cellular automata (Mordvintsev et al., "Growing Neural Cellular Automata", Distill 2020), CPU
 * inference. Each cell holds C floats: channel 0 = alpha (alive), 1 = tone, the rest hidden. One step:
 *
 * 1. perception: per channel, the cell's own value plus Sobel x / y gradients (kernels / 8) → 3C floats;
 * 2. a per-cell 2-layer MLP (3C → hidden, ReLU → C, no output bias) gives an update dx;
 * 3. stochastic update: each cell applies dx with probability `fire` (seeded hash of seed, step, cell);
 * 4. alive masking: a cell lives if some cell in its 3×3 has alpha > .1 both before and after the update;
 *    dead cells are zeroed (and never run the MLP, which is most of the speed).
 *
 * Grids are stored padded by one dead cell on every side ((w + 2) × (h + 2) × C), so the 3×3 stencils need
 * no bounds checks. Weights ship as a small Int8 asset (per-row scales, see `NcaAsset`), trained offline by
 * scripts/nca/train.ts. `ncaRun` wraps a model in a SimField-style timeline: a pure function of the step
 * (checkpoints, `lead` + `period` loop, scripted damage), until the pointer scratches it (`ncaScratch`) —
 * then it runs live off the loop and rejoins at the next loop wrap once left alone. Framework-free.
 */
import type { Field } from '../types'
import { hash01 } from '../math'

/** Weights as shipped: Int8 rows (base64) with one float scale per row. */
export interface NcaAsset {
  name: string
  channels: number; hidden: number
  /** Grid it was trained on and the seed cell (unpadded coordinates). */
  w: number; h: number; seedAt: [number, number]
  /** Fire rate the model was trained with. */
  fire: number
  /** Cells with alpha > .5 once fully grown (for heal percentages). */
  grown: number
  /** hidden rows of 3C (identity | sobel x | sobel y), base64 Int8, and their scales. */
  w1: string; s1: number[]; b1: number[]
  /** hidden rows of C (row j = hidden unit j's contribution to each channel), base64 Int8, and scales. */
  w2: string; s2: number[]
  /** Free-form provenance (training steps, loss, time). */
  meta?: Record<string, number | string>
}
export interface NcaModel {
  channels: number; hidden: number; fire: number
  /** [hidden][3C] */
  w1: Float64Array
  b1: Float64Array
  /** [hidden][C] */
  w2: Float64Array
  w: number; h: number; seedAt: [number, number]; grown: number
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Base64 → bytes (no atob/Buffer: works the same in browsers, workers and Node). */
export function ncaBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, ''), out = new Uint8Array((clean.length * 3) >> 2)
  let acc = 0, bits = 0, o = 0
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]); bits += 6
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255 }
  }
  return out.subarray(0, o)
}
function dequant(b64: string, scales: number[], cols: number): Float64Array {
  const q = new Int8Array(ncaBase64(b64).buffer), out = new Float64Array(scales.length * cols)
  for (let r = 0; r < scales.length; r++) for (let c = 0; c < cols; c++) out[r * cols + c] = Math.fround(q[r * cols + c] * scales[r])
  return out
}
/** Decode a shipped asset into float weights. */
export function ncaModel(a: NcaAsset): NcaModel {
  const C = a.channels, P = 3 * C
  return {
    channels: C, hidden: a.hidden, fire: a.fire, w: a.w, h: a.h, seedAt: a.seedAt, grown: a.grown,
    w1: dequant(a.w1, a.s1, P), b1: Float64Array.from(a.b1, Math.fround), w2: dequant(a.w2, a.s2, C),
  }
}

/** A padded NCA state: (w + 2) × (h + 2) cells × `channels` floats, border always 0. */
export interface NcaGrid { w: number; h: number; channels: number; cells: Float32Array }
export const ncaGrid = (w: number, h: number, channels: number): NcaGrid => ({ w, h, channels, cells: new Float32Array((w + 2) * (h + 2) * channels) })
/** First float of unpadded cell (x, y). */
export const ncaIndex = (g: NcaGrid, x: number, y: number) => ((y + 1) * (g.w + 2) + x + 1) * g.channels
/** Plant the seed: one cell with alpha and every hidden channel at 1 (tone 0). */
export function ncaSeed(g: NcaGrid, x: number, y: number): void {
  const i = ncaIndex(g, x, y)
  for (let c = 0; c < g.channels; c++) g.cells[i + c] = c === 1 ? 0 : 1
}
/** Erase (zero) every cell within `r` of (cx, cy), in unpadded cell units. Returns cells that were alive. */
export function ncaDamage(g: NcaGrid, cx: number, cy: number, r: number): number {
  const C = g.channels; let n = 0
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(g.h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(g.w - 1, Math.ceil(cx + r)); x++) {
      if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 > r * r) continue
      const i = ncaIndex(g, x, y)
      if (g.cells[i] > .5) n++
      g.cells.fill(0, i, i + C)
    }
  return n
}
/** Erase every cell for which `cut(x, y)` is true (half-plane cuts, masks). Returns cells that were alive. */
export function ncaErase(g: NcaGrid, cut: (x: number, y: number) => boolean): number {
  let n = 0
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!cut(x, y)) continue
    const i = ncaIndex(g, x, y)
    if (g.cells[i] > .5) n++
    g.cells.fill(0, i, i + g.channels)
  }
  return n
}

// scratch buffers, reused across steps of the same size (single-threaded: one step at a time)
let maskA = new Uint8Array(0), maskB = new Uint8Array(0), percept = new Float64Array(0), acc = new Float64Array(0)
/** 3×3 max-pool of alpha > .1 over the interior of a padded grid. */
function aliveMask(cells: Float32Array, w: number, h: number, C: number, out: Uint8Array) {
  const WP = w + 2
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) {
    const i = y * WP + x
    let live = 0
    for (let dy = -WP; dy <= WP && !live; dy += WP) {
      const r = i + dy
      if (cells[(r - 1) * C] > .1 || cells[r * C] > .1 || cells[(r + 1) * C] > .1) live = 1
    }
    out[i] = live
  }
}

/**
 * One NCA step: `src` → `dst` (both padded, `dst` fully overwritten). `n` is the step index, mixed with
 * `seed` into the per-cell fire hash, so the same (seed, n, state) always gives the same next state.
 * Returns the number of cells that ran the MLP.
 */
export function ncaStep(m: NcaModel, src: Float32Array, dst: Float32Array, w: number, h: number, seed: number, n: number): number {
  const C = m.channels, HID = m.hidden, P = 3 * C, WP = w + 2, NP = WP * (h + 2)
  if (maskA.length < NP) { maskA = new Uint8Array(NP); maskB = new Uint8Array(NP) }
  if (percept.length < P) percept = new Float64Array(P)
  if (acc.length < C) acc = new Float64Array(C)
  const pre = maskA, post = maskB, p = percept, a = acc, { w1, b1, w2, fire } = m
  aliveMask(src, w, h, C, pre)
  dst.set(src)
  let ran = 0
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) {
    const i = y * WP + x
    if (!pre[i] || hash01(seed, n, i) >= fire) continue
    ran++
    const o = i * C, up = o - WP * C, dn = o + WP * C
    for (let c = 0; c < C; c++) {
      const nw = src[up - C + c], nn = src[up + c], ne = src[up + C + c]
      const ww = src[o - C + c], ee = src[o + C + c]
      const sw = src[dn - C + c], ss = src[dn + c], se = src[dn + C + c]
      p[c] = src[o + c]
      p[C + c] = (ne + 2 * ee + se - nw - 2 * ww - sw) * .125
      p[2 * C + c] = (sw + 2 * ss + se - nw - 2 * nn - ne) * .125
    }
    a.fill(0, 0, C)
    for (let j = 0; j < HID; j++) {
      let s = b1[j]
      const r = j * P
      for (let k = 0; k < P; k++) s += w1[r + k] * p[k]
      if (s <= 0) continue
      const r2 = j * C
      for (let c = 0; c < C; c++) a[c] += w2[r2 + c] * s
    }
    for (let c = 0; c < C; c++) dst[o + c] += a[c]
  }
  aliveMask(dst, w, h, C, post)
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) {
    const i = y * WP + x
    if (!(pre[i] && post[i])) dst.fill(0, i * C, i * C + C)
  }
  // the border stays dead: dst.set copied src's zero border and nothing above writes it
  return ran
}

// ── Timeline ──
export interface NcaRunSpec {
  model: NcaModel
  /** Grid (default the model's training grid). */
  w?: number; h?: number
  /** Fire-hash seed. */
  seed?: number
  /** Seconds per step. */
  dt: number
  /** Initial state (default: one seed at the model's `seedAt`). */
  init?: (g: NcaGrid) => void
  /** Scripted events on the deterministic timeline: called on the state at step n, before step n runs. */
  script?: (g: NcaGrid, n: number) => void
  /** Head start (s) and loop length (s), as SimField: t folds into [lead, lead + period). */
  lead?: number; period?: number
  /** Checkpoint interval in steps (default 24). */
  every?: number
  /** Most steps one call may take (default 600). */
  maxSteps?: number
  /** Steps of alpha history kept for `ncaGrowth` (default 8). */
  history?: number
  /** Seconds a scratched run must be left alone before it rejoins the loop at its next wrap (default 4). */
  rejoin?: number
}
export interface NcaRun {
  spec: NcaRunSpec; model: NcaModel; w: number; h: number; seed: number
  start: number; length: number; every: number; maxSteps: number; history: number
  /** The head state (step `n`); read it, do not keep it. */
  grid: NcaGrid; n: number
  scratch: Float32Array
  checkpoints: Map<number, Float32Array>
  /** Alpha of the last `history + 1` steps (ring by step index). */
  ring: Float32Array[]; ringFrom: number
  /** Scratched by the pointer: running live, off the deterministic timeline. */
  live: boolean; lastAbs: number; lastScratch: number; lastFolded: number
  stepsTaken: number; cellsRun: number
  /** Last pointer position per pointer id (strokes are stamped as segments). */
  strokes: Map<number, [number, number]>
}
export function ncaRun(spec: NcaRunSpec): NcaRun {
  const model = spec.model, w = spec.w ?? model.w, h = spec.h ?? model.h, history = Math.max(1, spec.history ?? 8)
  const g = ncaGrid(w, h, model.channels)
  if (spec.init) spec.init(g)
  else ncaSeed(g, Math.min(w - 1, model.seedAt[0] + ((w - model.w) >> 1)), Math.min(h - 1, model.seedAt[1] + ((h - model.h) >> 1)))
  const start = Math.round((spec.lead ?? 0) / spec.dt), length = spec.period ? Math.max(1, Math.round(spec.period / spec.dt)) : Infinity
  const run: NcaRun = {
    spec, model, w, h, seed: spec.seed ?? 1, start, length, every: Math.max(1, spec.every ?? 24), maxSteps: Math.max(1, spec.maxSteps ?? 600), history,
    grid: g, n: 0, scratch: new Float32Array(g.cells.length), checkpoints: new Map([[0, g.cells.slice()]]),
    ring: Array.from({ length: history + 1 }, () => new Float32Array(w * h)), ringFrom: 0,
    live: false, lastAbs: -Infinity, lastScratch: -Infinity, lastFolded: -1, stepsTaken: 0, cellsRun: 0, strokes: new Map(),
  }
  recordAlpha(run)
  return run
}
function recordAlpha(run: NcaRun) {
  const a = run.ring[run.n % run.ring.length], { w, h } = run, C = run.model.channels, cells = run.grid.cells
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = cells[((y + 1) * (w + 2) + x + 1) * C]
}
function advance(run: NcaRun, scripted: boolean) {
  if (scripted) run.spec.script?.(run.grid, run.n)
  run.cellsRun += ncaStep(run.model, run.grid.cells, run.scratch, run.w, run.h, run.seed, run.n)
  const s = run.scratch; run.scratch = run.grid.cells; run.grid.cells = s
  run.n++; run.stepsTaken++
  recordAlpha(run)
  if (!run.live && run.n % run.every === 0 && !run.checkpoints.has(run.n)) run.checkpoints.set(run.n, run.grid.cells.slice())
}
/** Rewind to the newest checkpoint ≤ n − history (so the alpha history is complete at n). */
function restore(run: NcaRun, n: number) {
  let k = Math.floor(Math.max(0, n - run.history) / run.every) * run.every
  while (k > 0 && !run.checkpoints.has(k)) k -= run.every
  run.grid.cells.set(run.checkpoints.get(k)!); run.n = k; run.ringFrom = k; run.live = false
  recordAlpha(run)
}
/** Step index for time t on the loop (SimField folding). */
export function ncaStepAt(run: NcaRun, t: number): number {
  const n = Math.floor(t / run.spec.dt + 1e-9)
  if (run.length === Infinity) return Math.max(0, n)
  return run.start + (((n % run.length) + run.length) % run.length)
}
/** Loop position 0..1. */
export const ncaPhase = (run: NcaRun, t: number) => run.length === Infinity ? 0 : (ncaStepAt(run, t) - run.start) / run.length

/** The state at step n of the deterministic timeline (the grid is owned by the run). */
export function ncaRunAtStep(run: NcaRun, n: number): NcaGrid {
  const k = Math.floor(Math.max(0, n - run.history) / run.every) * run.every
  if (n < run.n || (k > run.n && run.checkpoints.has(k))) restore(run, n)
  if (n - run.n > run.maxSteps) restore(run, n)
  let budget = run.maxSteps
  while (run.n < n && budget-- > 0) advance(run, true)
  return run.grid
}
/**
 * The state at time t. Untouched, this is `ncaRunAtStep(ncaStepAt(t))`: a pure function of t. Once
 * scratched, the run steps live with wall time (no loop, no script) and rejoins the timeline at the
 * first loop wrap after `rejoin` seconds without a scratch.
 */
export function ncaRunAt(run: NcaRun, t: number): NcaGrid {
  const abs = Math.floor(t / run.spec.dt + 1e-9), folded = ncaStepAt(run, t)
  const wrapped = folded < run.lastFolded
  run.lastFolded = folded
  if (run.live) {
    const idle = t - run.lastScratch >= (run.spec.rejoin ?? 4)
    if (!(wrapped && idle) && abs >= run.lastAbs) {
      let steps = Math.min(run.maxSteps, abs - run.lastAbs)
      while (steps-- > 0) advance(run, false)
      run.lastAbs = abs
      return run.grid
    }
    restore(run, folded)
  }
  run.lastAbs = abs
  return ncaRunAtStep(run, folded)
}
/**
 * Pointer damage at time t: erase a disc of radius r (grid cells) at (x, y), stamped along the segment
 * from this pointer's previous position so fast strokes leave no gaps. Takes the run off the timeline.
 * `id` = pointer id; pass `up: true` (or call `ncaLift`) when the pointer lifts.
 */
export function ncaScratch(run: NcaRun, t: number, x: number, y: number, r: number, id = 0): number {
  ncaRunAt(run, t)
  if (!run.live) { run.live = true; run.lastAbs = Math.floor(t / run.spec.dt + 1e-9) }
  run.lastScratch = t
  const prev = run.strokes.get(id) ?? [x, y], d = Math.hypot(x - prev[0], y - prev[1]), k = Math.max(1, Math.ceil(d / Math.max(.5, r * .5)))
  let hit = 0
  for (let s = 1; s <= k; s++) hit += ncaDamage(run.grid, prev[0] + (x - prev[0]) * s / k, prev[1] + (y - prev[1]) * s / k, r)
  run.strokes.set(id, [x, y])
  return hit
}
/** Forget a pointer's stroke (its next scratch starts a new segment). */
export const ncaLift = (run: NcaRun, id = 0) => { run.strokes.delete(id) }

/** Alpha now minus alpha `history` steps ago (or at the oldest step in the history), per unpadded cell. */
export function ncaGrowth(run: NcaRun, out = new Float32Array(run.w * run.h)): Float32Array {
  const now = run.ring[run.n % run.ring.length], then = run.ring[Math.max(run.ringFrom, run.n - run.history) % run.ring.length]
  for (let i = 0; i < out.length; i++) out[i] = now[i] - then[i]
  return out
}

/** Cells with alpha > .5 (the visible body). */
export function ncaAliveCount(g: NcaGrid, threshold = .5): number {
  let n = 0
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.cells[ncaIndex(g, x, y)] > threshold) n++
  return n
}

/** A bounded Field over one channel of an NCA grid (nearest cell, 0 outside [0,1)²); `map` shapes the value. */
export function ncaField(g: NcaGrid, channel = 0, map: (x: number) => number = x => x): Field {
  const { w, h, channels: C } = g, cells = g.cells
  const f: Field = (u, v) => {
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0
    return map(cells[(((v * h | 0) + 1) * (w + 2) + (u * w | 0) + 1) * C + channel])
  }
  f.bounds = [0, 0, w - 1, h - 1]
  return f
}
/** A bounded Field seeing the whole cell: `fn(cells, i, x, y)`, `i` = the cell's first float (padded layout). */
export function ncaMapField(g: NcaGrid, fn: (cells: Float32Array, i: number, x: number, y: number) => number): Field {
  const { w, h, channels: C } = g, cells = g.cells
  const f: Field = (u, v) => {
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0
    const x = u * w | 0, y = v * h | 0
    return fn(cells, ((y + 1) * (w + 2) + x + 1) * C, x, y)
  }
  f.bounds = [0, 0, w - 1, h - 1]
  return f
}
