/**
 * Raked sand (docs/living-matter/M-materials.md §5, `mat-sand`): a mutable height raster in a physics world's state.
 * A tine carves a gaussian out of the sand and heaps exactly that volume on a ring just outside it (sand is pushed
 * aside, never lost); relaxation by the angle of repose then moves a quarter of any slope's excess over `talus` to
 * the lowest of the 4 neighbours, Jacobi style (every cell reads the same old heights), so a pass conserves volume to
 * float rounding and never depends on scan order.
 *
 * Step code: registered with the determinism lint (scripts/lib/detLint.ts `src/engine/matter/sand`): `dexp` from
 * `noise/dmath`, never `Math.exp`.
 */
import { dcos, dexp } from '../noise/dmath'

export interface Sand {
  w: number; h: number; n: number
  /** Offset of the height plane in the state. */
  H: number
  /** Repose: the largest step (height units) a slope keeps between 4-neighbours (default .8). */
  talus: number
  /** Relaxation passes per step (default 2). */
  passes: number
  /** Scratch: per-cell height change of one pass, and the carve weights. */
  delta: Float64Array; wts: Float64Array; idx: Int32Array
}
export function createSand(w: number, h: number, o: { talus?: number; passes?: number } = {}, offset = 0): Sand {
  const n = w * h
  return { w, h, n, H: offset, talus: o.talus ?? .8, passes: o.passes ?? 2, delta: new Float64Array(n), wts: new Float64Array(256), idx: new Int32Array(256) }
}
/** Floats of state the sand needs. */
export const sandSize = (sd: Sand) => sd.n

/** Total sand (height units × cells). */
export function sandVolume(sd: Sand, s: Float32Array): number { let v = 0; for (let i = 0; i < sd.n; i++) v += s[sd.H + i]; return v }

/**
 * One tine at (x, y), cells of the sand grid: dig a gaussian of radius `r` and depth `depth` (never below 0), then
 * heap the dug volume on the ring r < d ≤ r + 1.5 round it (weights peak at r + .75). Returns the volume moved.
 */
export function sandCarve(sd: Sand, s: Float32Array, x: number, y: number, r: number, depth: number): number {
  const { w, h, H, wts, idx } = sd, reach = r + 1.5, inv = 1 / (r * r)
  const c0 = Math.max(0, Math.floor(x - reach)), c1 = Math.min(w - 1, Math.ceil(x + reach))
  const r0 = Math.max(0, Math.floor(y - reach)), r1 = Math.min(h - 1, Math.ceil(y + reach))
  let moved = 0, ring = 0, nr = 0
  for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
    const dx = i - x, dy = j - y, d2 = dx * dx + dy * dy, k = j * w + i
    if (d2 <= r * r) {
      const cur = s[H + k], dig = Math.min(cur, depth * dexp(-d2 * inv * 2))
      if (dig > 0) { s[H + k] = cur - dig; moved += dig }
    } else if (d2 <= reach * reach && nr < idx.length) {
      const d = Math.sqrt(d2) - (r + .75), g = dexp(-d * d * 2)
      idx[nr] = k; wts[nr] = g; ring += g; nr++
    }
  }
  if (!(moved > 0)) return 0
  if (ring > 0) { for (let q = 0; q < nr; q++) s[H + idx[q]] += moved * wts[q] / ring; return moved }
  // no ring cell on the grid (a tine past a corner): put the sand back where it was dug
  const k = Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))
  s[H + k] += moved
  return 0
}

/**
 * A comb of `tines` teeth `spacing` cells apart, perpendicular to the stroke direction (dx, dy), centred on (x, y):
 * each tooth carves (`sandCarve`). Writes the teeth's positions into `at` (x, y pairs) when given.
 */
export function sandRake(sd: Sand, s: Float32Array, x: number, y: number, dx: number, dy: number, o: { tines?: number; spacing?: number; r?: number; depth?: number } = {}, at?: Float32Array): number {
  const tines = o.tines ?? 5, sp = o.spacing ?? 3, r = o.r ?? 1, depth = o.depth ?? .35, l = Math.sqrt(dx * dx + dy * dy)
  const px = l > 1e-9 ? -dy / l : 0, py = l > 1e-9 ? dx / l : 1
  let moved = 0
  for (let k = 0; k < tines; k++) {
    const off = (k - (tines - 1) / 2) * sp, tx = x + px * off, ty = y + py * off
    if (at) { at[2 * k] = tx; at[2 * k + 1] = ty }
    moved += sandCarve(sd, s, tx, ty, r, depth)
  }
  return moved
}

/** One relaxation pass: a quarter of each slope's excess over the talus slides to the lowest 4-neighbour. */
function relaxPass(sd: Sand, s: Float32Array): number {
  const { w, h, H, talus, delta } = sd
  delta.fill(0)
  let moved = 0
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, v = s[H + k]
    let low = -1, lv = v
    if (i > 0 && s[H + k - 1] < lv) { lv = s[H + k - 1]; low = k - 1 }
    if (i < w - 1 && s[H + k + 1] < lv) { lv = s[H + k + 1]; low = k + 1 }
    if (j > 0 && s[H + k - w] < lv) { lv = s[H + k - w]; low = k - w }
    if (j < h - 1 && s[H + k + w] < lv) { lv = s[H + k + w]; low = k + w }
    if (low < 0 || v - lv <= talus) continue
    const m = (v - lv - talus) / 4
    delta[k] -= m; delta[low] += m; moved += m
  }
  if (moved > 0) for (let k = 0; k < sd.n; k++) if (delta[k] !== 0) s[H + k] += delta[k]
  return moved
}
/** `passes` relaxation passes (default the sand's own); returns the sand moved. */
export function sandRelax(sd: Sand, s: Float32Array, passes = sd.passes): number {
  let m = 0
  for (let p = 0; p < passes; p++) m += relaxPass(sd, s)
  return m
}

/**
 * The raked garden: base height `base`, straight rake lines along x (period `period`, depth `depth`) and, within
 * `rings` cells of each stone's rim, concentric lines round it instead (the nearer stone wins). Stones are (x, y, r).
 * Smooth (a cosine profile), so its slopes stay under any talus ≥ π · depth / period.
 */
export function sandGarden(sd: Sand, s: Float32Array, stones: readonly (readonly [number, number, number])[], o: { base?: number; depth?: number; period?: number; rings?: number } = {}): void {
  const { w, h, H } = sd, base = o.base ?? 2, depth = o.depth ?? .45, period = o.period ?? 3, rings = o.rings ?? 10
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let u = (j + .5) / period, best = Infinity
    for (const [x, y, r] of stones) {
      const dx = i - x, dy = j - y, d = Math.sqrt(dx * dx + dy * dy) - r
      if (d < rings && d < best) { best = d; u = Math.max(0, d) / period }
    }
    s[H + j * w + i] = base - depth * (.5 - .5 * dcos(2 * Math.PI * u))
  }
}
