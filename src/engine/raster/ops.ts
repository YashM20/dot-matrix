import type { CellBounds } from '../types'
import { createRaster, rasterWindow, type Raster } from './raster'

/**
 * Neighbourhood ops on `Raster` (MASTER-PLAN §3.1). Every op returns a new raster on the same grid
 * and space, only visits the input's bounds grown by the op's reach, and sets the output bounds.
 * Radii are in cells of the raster's grid.
 */

const EMPTY: CellBounds = [0, 0, -1, -1]
const like = (r: Raster, bounds: CellBounds | undefined): Raster => createRaster(r.grid, r.space, bounds)
/** Bounds of `r` grown by `pad` cells (undefined = whole grid stays whole grid). */
const grown = (r: Raster, pad: number): CellBounds | undefined => (r.bounds ? rasterWindow(r, pad) : undefined)

/** Mirror an index into [0, n) (half-sample symmetric: -1 → 0, n → n - 1), repeating for long reaches. */
function reflect(i: number, n: number): number {
  if (n === 1) return 0
  const p = 2 * n
  i = ((i % p) + p) % p
  return i < n ? i : p - 1 - i
}

/** Normalised 1-D kernel: `box` is flat over ±round(radius); `gaussian` has σ = radius / 2 over ±ceil(radius). */
function kernel(radius: number, kind: 'box' | 'gaussian'): Float64Array {
  if (!(radius > 0)) return Float64Array.of(1)
  const h = kind === 'box' ? Math.max(1, Math.round(radius)) : Math.max(1, Math.ceil(radius))
  const k = new Float64Array(2 * h + 1), s = radius / 2
  let sum = 0
  for (let i = -h; i <= h; i++) sum += k[i + h] = kind === 'box' ? 1 : Math.exp(-(i * i) / (2 * s * s))
  for (let i = 0; i < k.length; i++) k[i] /= sum
  return k
}

/**
 * Separable blur. Each cell scatters its value through the kernel and weight that would fall off
 * the grid is reflected back in, so the total (mass) is preserved exactly up to float rounding —
 * a blurred glow never loses energy at the card edge.
 */
export function blur(r: Raster, radius: number, kind: 'box' | 'gaussian' = 'gaussian'): Raster {
  const k = kernel(radius, kind), h = (k.length - 1) / 2, { cols, rows } = r.grid
  const [c0, r0, c1, r1] = rasterWindow(r), out = like(r, grown(r, h))
  if (c0 > c1 || r0 > r1) { out.bounds = EMPTY; return out }
  const tmp = new Float32Array(cols * rows), src = r.data, dst = out.data
  // horizontal pass over the input rows
  for (let y = r0; y <= r1; y++) {
    const row = y * cols
    for (let x = c0; x <= c1; x++) {
      const v = src[row + x]
      if (v === 0) continue
      for (let j = -h; j <= h; j++) tmp[row + reflect(x + j, cols)] += v * k[j + h]
    }
  }
  // vertical pass over the columns the horizontal pass reached
  const xa = Math.max(0, c0 - h), xb = Math.min(cols - 1, c1 + h)
  for (let y = r0; y <= r1; y++) for (let x = xa; x <= xb; x++) {
    const v = tmp[y * cols + x]
    if (v === 0) continue
    for (let j = -h; j <= h; j++) dst[reflect(y + j, rows) * cols + x] += v * k[j + h]
  }
  return out
}

/** Cell offsets within a disc of `radius` (centre included). */
function disc(radius: number): [number, number][] {
  const n = Math.floor(radius + 1e-9), out: [number, number][] = []
  for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) if (x * x + y * y <= radius * radius + 1e-9) out.push([x, y])
  return out
}

/** Grey-scale morphology over a disc; cells off the grid are ignored (not treated as 0). */
function morph(r: Raster, radius: number, max: boolean): Raster {
  const offs = disc(radius), reach = Math.floor(radius + 1e-9), { cols, rows } = r.grid, src = r.data
  // dilation can light cells around the bounds; erosion can only darken inside them
  const out = like(r, max ? grown(r, reach) : r.bounds && rasterWindow(r)), dst = out.data
  const [c0, r0, c1, r1] = rasterWindow(out)
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
    let m = max ? 0 : Infinity
    for (const [dx, dy] of offs) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
      const v = src[yy * cols + xx]
      if (max ? v > m : v < m) m = v
    }
    dst[y * cols + x] = m === Infinity ? 0 : m
  }
  return out
}
/** Each cell takes the largest value within `radius` cells (shapes grow). */
export const dilate = (r: Raster, radius: number): Raster => morph(r, radius, true)
/** Each cell takes the smallest value within `radius` cells (shapes shrink). */
export const erode = (r: Raster, radius: number): Raster => morph(r, radius, false)

/** 1 where the value is at least `threshold`, else 0. */
export function threshold(r: Raster, at = .5): Raster {
  const out = like(r, r.bounds), [c0, r0, c1, r1] = rasterWindow(r), { cols } = r.grid
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) { const i = y * cols + x; out.data[i] = r.data[i] >= at ? 1 : 0 }
  return out
}

/**
 * A `width`-cell outline of the shape (value ≥ `at`): `inner` keeps the shape's own edge cells,
 * `outer` lights the cells just outside it. Returns a 0/1 mask.
 */
export function outline(r: Raster, width = 1, opts: { at?: number; side?: 'inner' | 'outer' } = {}): Raster {
  const { at = .5, side = 'inner' } = opts, inside = threshold(r, at)
  const other = side === 'inner' ? erode(inside, width) : dilate(inside, width)
  const out = like(r, side === 'inner' ? inside.bounds : other.bounds), [c0, r0, c1, r1] = rasterWindow(out), { cols } = r.grid
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
    const i = y * cols + x
    out.data[i] = side === 'inner' ? inside.data[i] - other.data[i] : other.data[i] - inside.data[i]
  }
  return out
}

/**
 * The clearance ring around a shape: a 0/1 mask of the cells within `gap` cells outside it. Cut it
 * out of the layers behind (`cut`) so a glyph or glow never touches its background.
 */
export const moat = (r: Raster, gap = 1, at = .5): Raster => outline(r, gap, { at, side: 'outer' })

/** `r` with every cell of `mask` (scaled by the mask's value) removed: r · (1 − mask). */
export function cut(r: Raster, mask: Raster): Raster {
  const out = like(r, r.bounds), [c0, r0, c1, r1] = rasterWindow(r), { cols } = r.grid
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) { const i = y * cols + x; out.data[i] = r.data[i] * (1 - Math.min(1, Math.max(0, mask.data[i]))) }
  return out
}

/** Exact 1-D squared distance transform (Felzenszwalb–Huttenlocher) of `f` into `d`; "no site" is a huge finite cost. */
const FAR = 1e20
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity
  const meet = (q: number, p: number) => (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p)
  for (let q = 1; q < n; q++) {
    let s = meet(q, v[k])
    while (s <= z[k]) { k--; s = meet(q, v[k]) }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + f[v[k]] }
}
/** Exact Euclidean distance (cells) from every cell to the nearest cell where `on` holds. */
function edt(on: Uint8Array, cols: number, rows: number): Float64Array {
  const n = Math.max(cols, rows), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  const g = new Float64Array(cols * rows)
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) f[y] = on[y * cols + x] ? 0 : FAR
    edt1(f, rows, d, v, z)
    for (let y = 0; y < rows; y++) g[y * cols + x] = d[y]
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) f[x] = g[y * cols + x]
    edt1(f, cols, d, v, z)
    for (let x = 0; x < cols; x++) g[y * cols + x] = Math.sqrt(d[x])
  }
  return g
}

/**
 * Signed distance (cells) to the edge of the shape `value ≥ at`: negative inside, positive outside,
 * the edge sitting half a cell beyond the outermost lit centre. Turns any mask (a glyph, a sprite, a
 * rasterized field) into the SDF `heightRaster` embosses. No bounds: distance is defined everywhere.
 */
export function distanceRaster(r: Raster, at = .5): Raster {
  const { cols, rows } = r.grid, n = cols * rows, inside = new Uint8Array(n), outside = new Uint8Array(n)
  let any = false
  for (let i = 0; i < n; i++) { const on = r.data[i] >= at; inside[i] = on ? 1 : 0; outside[i] = on ? 0 : 1; any ||= on }
  const out = createRaster(r.grid, r.space)
  if (!any) { out.data.fill(Math.sqrt(cols * cols + rows * rows)); return out }
  const toIn = edt(inside, cols, rows), toOut = edt(outside, cols, rows)
  for (let i = 0; i < n; i++) out.data[i] = inside[i] ? .5 - toOut[i] : toIn[i] - .5
  return out
}
