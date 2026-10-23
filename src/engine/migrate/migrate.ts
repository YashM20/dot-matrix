/**
 * Shared-element dot migration (MASTER-PLAN §3.5, P4): every dot of one frame flies to a dot of
 * another. Both sets are ranked along one Hilbert curve over their common bounds and matched rank
 * to rank, so neighbours stay neighbours and the pairing is deterministic (no RNG, no input-order
 * dependence). Setup is a sort (O(n log n), ≈1 ms for 3k dots); a frame is one pass over packed
 * Float32 pairs. Units are the caller's: pixel `DotInstance`s from the sampler (DotCanvas), or
 * card cells with `r` = site size and `opacity` = site value (boards, via `migrationLayers`).
 */
import type { DotInstance, Layer, Tone } from '../types'
import { hilbertOrder } from './hilbert'

export interface MigrateOptions {
  /**
   * Unequal counts. `split` (default): the smaller set's dots split on the way out / merge on the
   * way in, so every drawn dot travels. `fade`: rank-matched pairs travel, the spares of the larger
   * set shrink out (or grow in) where they stand.
   */
  spares?: 'split' | 'fade'
  /** Share of the timeline (0..0.9) over which starts spread in Hilbert-rank order: the move sweeps along the curve. */
  stagger?: number
  /** Bow of each path as a fraction of its length, perpendicular to it (+ = clockwise in y-down space). */
  arc?: number
  /** Easing of each dot's own progress (default: smoothstep). */
  ease?: (t: number) => number
  /** Hilbert order (bits per axis, ≤ 16; default 12 = 4096 steps across the bounds, ties break by position). */
  order?: number
}

/** Floats per dot in a packed frame: x, y, r, opacity, mix (0 = `from` colour, 1 = `to` colour). */
export const MIGRATE_STRIDE = 5
const PAIR = 10 // ax ay ar ao bx by br bo cx cy

export interface Migration {
  /** Dots drawn per frame: max(from, to). */
  readonly count: number
  /** Per drawn dot, in rank order: its `from` / `to` index (-1 = a spare that fades in / out in place). */
  readonly fromIndex: Int32Array
  readonly toIndex: Int32Array
  /** Packed frame at progress p (0 = `from`, 1 = `to`), MIGRATE_STRIDE floats per dot; reuses `out`. */
  frame(p: number, out?: Float64Array): Float64Array
  /** The frame as dots: colour crossfades per dot (hex / rgb tokens mix, others switch at half way); reuses `out`. */
  dots(p: number, out?: DotInstance[]): DotInstance[]
  /** Colour of dot `i` at its own mix (the `from` colour below .5, the `to` colour from .5). */
  colorAt(i: number, mix: number): string
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Pair `from` with `to` along a Hilbert curve and return the per-frame interpolator. */
export function migrate(from: readonly DotInstance[], to: readonly DotInstance[], opts: MigrateOptions = {}): Migration {
  const nA = from.length, nB = to.length, N = Math.max(nA, nB), spares = opts.spares ?? 'split'
  const order = Math.max(1, Math.min(16, Math.round(opts.order ?? 12))), easeFn = opts.ease ?? smooth
  const stagger = Math.max(0, Math.min(.9, opts.stagger ?? 0)), arc = opts.arc ?? 0, span = 1 - stagger
  // one square frame over both sets, so the curve is the same for both
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const set of [from, to]) for (const d of set) { if (d.x < x0) x0 = d.x; if (d.x > x1) x1 = d.x; if (d.y < y0) y0 = d.y; if (d.y > y1) y1 = d.y }
  const frame: [number, number, number] = N ? [x0, y0, Math.max(x1 - x0, y1 - y0)] : [0, 0, 0]
  const rankOf = (set: readonly DotInstance[]) => {
    const n = set.length, xs = new Float64Array(n), ys = new Float64Array(n)
    for (let i = 0; i < n; i++) { xs[i] = set[i].x; ys[i] = set[i].y }
    return hilbertOrder(n, xs, ys, frame, order)
  }
  const ra = rankOf(from), rb = rankOf(to)
  const fromIndex = new Int32Array(N), toIndex = new Int32Array(N)
  if (spares === 'split' && nA && nB) {
    for (let k = 0; k < N; k++) { fromIndex[k] = ra[Math.floor((k * nA) / N)]; toIndex[k] = rb[Math.floor((k * nB) / N)] }
  } else {
    // walk the larger set's ranks; the smaller set's ranks land evenly among them, the rest are spares
    const big = nA >= nB ? ra : rb, small = nA >= nB ? rb : ra, nS = small.length, nL = big.length
    const bigIdx = nA >= nB ? fromIndex : toIndex, smallIdx = nA >= nB ? toIndex : fromIndex
    let s = 0
    for (let k = 0; k < nL; k++) {
      bigIdx[k] = big[k]
      // pair rank s of the small set with big rank floor((s + .5) · nL / nS)
      if (s < nS && k === Math.floor(((s + .5) * nL) / nS)) smallIdx[k] = small[s++]
      else smallIdx[k] = -1
    }
  }
  // packed pairs; a spare's missing end is its own position at r = opacity = 0
  const pairs = new Float64Array(N * PAIR), starts = new Float64Array(N)
  const palette: string[] = [], colorIds = new Map<string, number>(), ca = new Uint16Array(N), cb = new Uint16Array(N)
  let lastColor = '', lastId = -1
  const colorId = (c: string) => {
    if (c === lastColor) return lastId
    let id = colorIds.get(c); if (id === undefined) { colorIds.set(c, (id = palette.length)); palette.push(c) }
    lastColor = c; return (lastId = id)
  }
  for (let k = 0; k < N; k++) {
    const a = fromIndex[k] >= 0 ? from[fromIndex[k]] : undefined, b = toIndex[k] >= 0 ? to[toIndex[k]] : undefined
    const A = a ?? b!, B = b ?? a!, o = k * PAIR
    pairs[o] = A.x; pairs[o + 1] = A.y; pairs[o + 2] = a ? a.r : 0; pairs[o + 3] = a ? a.opacity : 0
    pairs[o + 4] = B.x; pairs[o + 5] = B.y; pairs[o + 6] = b ? b.r : 0; pairs[o + 7] = b ? b.opacity : 0
    // quadratic control point: the chord's midpoint pushed sideways by arc × length
    const dx = B.x - A.x, dy = B.y - A.y
    pairs[o + 8] = (A.x + B.x) / 2 - dy * arc; pairs[o + 9] = (A.y + B.y) / 2 + dx * arc
    ca[k] = colorId(A.color); cb[k] = colorId(B.color)
    starts[k] = N > 1 ? (stagger * k) / (N - 1) : 0
  }
  const mixed = new Map<number, string>()
  const colorAt = (k: number, mix: number): string => {
    const a = ca[k], b = cb[k]
    if (a === b || mix <= 0) return palette[a]
    if (mix >= 1) return palette[b]
    const step = Math.round(mix * 16), key = (a * 65536 + b) * 17 + step
    let c = mixed.get(key)
    if (c === undefined) mixed.set(key, (c = mixColor(palette[a], palette[b], step / 16)))
    return c
  }
  const progress = (k: number, p: number) => easeFn(Math.max(0, Math.min(1, span > 0 ? (p - starts[k]) / span : p >= starts[k] ? 1 : 0)))
  const framePacked = (p: number, out: Float64Array = new Float64Array(N * MIGRATE_STRIDE)): Float64Array => {
    for (let k = 0; k < N; k++) {
      const e = progress(k, p), f = 1 - e, o = k * PAIR, w = k * MIGRATE_STRIDE
      out[w] = f * f * pairs[o] + 2 * f * e * pairs[o + 8] + e * e * pairs[o + 4]
      out[w + 1] = f * f * pairs[o + 1] + 2 * f * e * pairs[o + 9] + e * e * pairs[o + 5]
      out[w + 2] = pairs[o + 2] + (pairs[o + 6] - pairs[o + 2]) * e
      out[w + 3] = pairs[o + 3] + (pairs[o + 7] - pairs[o + 3]) * e
      out[w + 4] = e
    }
    return out
  }
  let scratch: Float64Array | undefined
  return {
    count: N, fromIndex, toIndex, colorAt,
    frame: framePacked,
    dots(p, out = []) {
      const f = framePacked(p, (scratch ??= new Float64Array(N * MIGRATE_STRIDE)))
      out.length = N
      for (let k = 0; k < N; k++) {
        const w = k * MIGRATE_STRIDE, mix = f[w + 4], ia = fromIndex[k], ib = toIndex[k], src = (mix < .5 ? (ia >= 0 ? from[ia] : to[ib]) : ib >= 0 ? to[ib] : from[ia])
        const d = out[k] ??= { x: 0, y: 0, r: 0, opacity: 0, color: '' }
        d.x = f[w]; d.y = f[w + 1]; d.r = f[w + 2]; d.opacity = f[w + 3]; d.color = colorAt(k, mix)
        d.shape = src.shape; d.roundness = src.roundness
      }
      return out
    },
  }
}

/** `#rgb`, `#rrggbb` or `rgb(a)(…)` → [r, g, b, a], or null. */
function parseColor(c: string): [number, number, number, number] | null {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (h) {
    const s = h[1].length === 3 ? h[1].replace(/./g, ch => ch + ch) : h[1]
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 1]
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(c)
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
}
/** Linear mix of two CSS colours; unparseable pairs switch at half way. */
export function mixColor(a: string, b: string, t: number): string {
  const p = parseColor(a), q = parseColor(b)
  if (!p || !q) return t < .5 ? a : b
  const m = p.map((v, i) => v + (q[i] - v) * t)
  const rgb = m.slice(0, 3).map(v => Math.round(v))
  return m[3] >= 1 ? `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}` : `rgba(${rgb.join(',')},${+m[3].toFixed(3)})`
}

export interface MigrationLayerOptions {
  /** Colour string of a dot → layer tone (default: the colour string is a `Tone` name). */
  tone?: (color: string) => Tone
  /** Site sizes snap to this step while in flight (endpoints keep theirs), so a frame is a handful of layers. */
  sizeStep?: number
  /** Dots smaller than this (a spare fading out) are not drawn. */
  minSize?: number
}

/**
 * A migration frame as site layers, for boards whose dots are in card cells (`r` = site size,
 * `opacity` = site value, `color` = tone name). Dots group by tone, snapped size and value; each dot
 * shows its `from` tone until half way, then its `to` tone. Never splatted to card pitch.
 */
export function migrationLayers(m: Migration, p: number, opts: MigrationLayerOptions = {}): Layer[] {
  const f = m.frame(p), step = opts.sizeStep ?? .1, min = opts.minSize ?? .15, tone = opts.tone ?? ((c: string) => c as Tone)
  const groups = new Map<string, { sites: [number, number][]; size: number; value: number; tone: Tone }>()
  for (let k = 0; k < m.count; k++) {
    const w = k * MIGRATE_STRIDE, r = f[w + 2], v = f[w + 3]
    if (r < min || v <= 0) continue
    const size = Math.max(step, Math.round(r / step) * step), value = Math.round(v * 20) / 20, c = m.colorAt(k, f[w + 4] < .5 ? 0 : 1)
    const key = `${c}|${size}|${value}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { sites: [], size, value, tone: tone(c) }))
    g.sites.push([f[w], f[w + 1]])
  }
  return [...groups.values()].map(g => ({ field: () => g.value, sites: g.sites, size: +g.size.toFixed(3), tone: g.tone }))
}
