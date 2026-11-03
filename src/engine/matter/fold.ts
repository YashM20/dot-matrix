/**
 * Paper folding (docs/living-matter/X-advanced.md #17): a flat sheet folded along straight creases, one simple fold
 * at a time. A crease is a line through a point at an angle, folded as a valley (the flap comes up toward the viewer
 * and lands on top of the stack) or a mountain (it goes behind). A fold splits every facet the line crosses and turns
 * every layer on the flap's side about the crease, so the flap's stack lands reversed, beyond the whole stack. Each
 * facet keeps where it lies (an isometry of the sheet: a rotation or a reflection), its layer, and which face is up.
 *
 * A fold in progress is a rotation by θ (0 … π) about the crease: a flap point at distance d from it projects to
 * d·cos θ from it, at height ±d·sin θ, and its facet's normal turns with it. Past π/2 the flap shows its other face.
 * While it turns, its key orders it against the stack (above everything for a valley, below for a mountain, its own
 * layers reversed past π/2, when the stack is seen from its other side); at θ = π the key equals the layer the
 * finished fold gives, so a fold ends without a jump.
 *
 * Deterministic (F0.9 lint): `dsin` / `dcos` and sqrt only, no randomness. θ = 0 and θ = π are exact (cos ±1, sin 0).
 */
import { dcos, dsin } from '../noise/dmath'

export type FoldKind = 'valley' | 'mountain'
/** A crease: the line through (x, y) along `angle` (radians, y down). The side its normal (−sin, cos) points to is the flap. */
export interface Crease { x: number; y: number; angle: number; kind: FoldKind }
/** A crease as a point and the unit normal toward the flap. */
export interface CreaseLine { x: number; y: number; nx: number; ny: number; kind: FoldKind }
/** Sheet → world: x' = a·x + b·y + e, y' = c·x + d·y + f, as [a, b, c, d, e, f]. */
export type Affine = readonly [number, number, number, number, number, number]
export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0]
/** A facet: a convex polygon of the sheet (x0, y0, x1, y1 …), where it lies now, its layer, and whether its back is up. */
export interface Facet { readonly poly: readonly number[]; readonly m: Affine; readonly layer: number; readonly back: boolean }
/** A facet posed for one frame: its outline projected onto the card, heights, the visible face's unit normal and its draw key. */
export interface Posed {
  readonly facet: Facet
  readonly pts: readonly number[]
  readonly z: readonly number[]
  readonly n: readonly [number, number, number]
  /** The sheet's front face is the one seen. */
  readonly front: boolean
  /** Draw order: a higher key lies over a lower one. */
  readonly key: number
  readonly moving: boolean
}

const EPS = 1e-9

export function creaseLine(c: Crease): CreaseLine {
  const sx = -dsin(c.angle), sy = dcos(c.angle), k = 1 / Math.sqrt(sx * sx + sy * sy)
  return { x: c.x, y: c.y, nx: sx * k, ny: sy * k, kind: c.kind }
}
/** Signed area of a polygon (shoelace). */
export function polyArea(p: readonly number[]): number {
  let s = 0
  for (let i = 0, n = p.length; i < n; i += 2) { const j = (i + 2) % n; s += p[i] * p[j + 1] - p[j] * p[i + 1] }
  return s / 2
}
export function mapPoly(m: Affine, p: readonly number[]): number[] {
  const out = new Array<number>(p.length)
  for (let i = 0; i < p.length; i += 2) { out[i] = m[0] * p[i] + m[1] * p[i + 1] + m[4]; out[i + 1] = m[2] * p[i] + m[3] * p[i + 1] + m[5] }
  return out
}
/** The part of convex polygon p where a·x + b·y + c ≥ 0 (one Sutherland–Hodgman plane); null when nothing with area is left. */
export function clipHalf(p: readonly number[], a: number, b: number, c: number): number[] | null {
  const out: number[] = [], n = p.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n, x0 = p[i], y0 = p[i + 1], x1 = p[j], y1 = p[j + 1], f0 = a * x0 + b * y0 + c, f1 = a * x1 + b * y1 + c
    if (f0 >= -EPS) out.push(x0, y0)
    if ((f0 > EPS && f1 < -EPS) || (f0 < -EPS && f1 > EPS)) { const t = f0 / (f0 - f1); out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) }
  }
  return out.length >= 6 && Math.abs(polyArea(out)) > EPS ? out : null
}
/** The crease's signed distance (toward the flap) as an affine function of sheet coordinates under m: [a, b, c]. */
const sideOf = (m: Affine, L: CreaseLine): [number, number, number] =>
  [m[0] * L.nx + m[2] * L.ny, m[1] * L.nx + m[3] * L.ny, (m[4] - L.x) * L.nx + (m[5] - L.y) * L.ny]
/** Facets cut by a crease: the parts that stay and the parts on the flap's side. */
export function splitFacets(facets: readonly Facet[], L: CreaseLine): { still: Facet[]; moving: Facet[] } {
  const still: Facet[] = [], moving: Facet[] = []
  for (const f of facets) {
    const [a, b, c] = sideOf(f.m, L), mv = clipHalf(f.poly, a, b, c), st = clipHalf(f.poly, -a, -b, -c)
    if (st) still.push(mv ? { ...f, poly: st } : f)
    if (mv) moving.push(st ? { ...f, poly: mv } : f)
  }
  return { still, moving }
}
/** m followed by the reflection across the crease (x − 2n((x − p)·n)). */
export function reflectAffine(m: Affine, L: CreaseLine): Affine {
  const { nx, ny } = L, r00 = 1 - 2 * nx * nx, r01 = -2 * nx * ny, r11 = 1 - 2 * ny * ny, k = 2 * (L.x * nx + L.y * ny), tx = k * nx, ty = k * ny
  return [r00 * m[0] + r01 * m[2], r00 * m[1] + r01 * m[3], r01 * m[0] + r11 * m[2], r01 * m[1] + r11 * m[3], r00 * m[4] + r01 * m[5] + tx, r01 * m[4] + r11 * m[5] + ty]
}
const range = (fs: readonly Facet[]): [number, number] => {
  let lo = Infinity, hi = -Infinity
  for (const f of fs) { if (f.layer < lo) lo = f.layer; if (f.layer > hi) hi = f.layer }
  return [lo, hi]
}
/** The draw key of a flap layer turned by θ (cos θ = c): the layer it lands on at θ = π. */
function flapKey(kind: FoldKind, layer: number, c: number, all: [number, number], mv: [number, number]): number {
  if (kind === 'valley') return all[1] + 1 + (c >= 0 ? layer - mv[0] : mv[1] - layer)
  return all[0] - 1 - (c >= 0 ? mv[1] - layer : layer - mv[0])
}

/** The sheet with its first k creases folded flat (each a full simple fold, θ = π). */
export function foldFlat(sheet: readonly number[], creases: readonly Crease[], k: number): Facet[] {
  let facets: Facet[] = [{ poly: sheet, m: IDENTITY, layer: 0, back: false }]
  for (let j = 0; j < k; j++) {
    const L = creaseLine(creases[j]), all = range(facets), { still, moving } = splitFacets(facets, L), mv = range(moving)
    facets = [...still, ...moving.map(f => ({ poly: f.poly, m: reflectAffine(f.m, L), layer: flapKey(L.kind, f.layer, -1, all, mv), back: !f.back }))]
  }
  return facets
}
/** cos θ and sin θ, exact at 0 and π. */
const cosSin = (theta: number): [number, number] => (theta === 0 ? [1, 0] : theta === Math.PI ? [-1, 0] : [dcos(theta), dsin(theta)])
/** A world point on the flap's side, turned θ about the crease: its projection and height. */
export function foldPoint(L: CreaseLine, theta: number, x: number, y: number): [number, number, number] {
  const [c, s] = cosSin(theta), d = (x - L.x) * L.nx + (y - L.y) * L.ny, k = d * (c - 1)
  return [x + L.nx * k, y + L.ny * k, (L.kind === 'valley' ? d : -d) * s]
}
/** Facets posed with crease L turned by θ (L null or θ = 0: flat as they are). */
export function pose(facets: readonly Facet[], L: CreaseLine | null, theta: number): Posed[] {
  const flat = (f: Facet): Posed => ({ facet: f, pts: mapPoly(f.m, f.poly), z: new Array<number>(f.poly.length / 2).fill(0), n: [0, 0, 1], front: !f.back, key: f.layer, moving: false })
  if (!L || theta === 0) return facets.map(f => flat(f))
  const all = range(facets), { still, moving } = splitFacets(facets, L), mv = range(moving), [c, s] = cosSin(theta), out = still.map(f => flat(f))
  for (const f of moving) {
    const w = mapPoly(f.m, f.poly), pts: number[] = [], z: number[] = []
    for (let i = 0; i < w.length; i += 2) { const q = foldPoint(L, theta, w[i], w[i + 1]); pts.push(q[0], q[1]); z.push(q[2]) }
    // the front face's normal, turned with the flap (valley: n → n·c + ẑ·s, so ẑ → ẑ·c − n·s; mountain the other way)
    const fz = f.back ? -1 : 1, t = L.kind === 'valley' ? -s * fz : s * fz, u = 1 / Math.sqrt(t * t + c * c), N: [number, number, number] = [L.nx * t * u, L.ny * t * u, c * fz * u]
    const front = N[2] >= 0
    out.push({ facet: f, pts, z, n: front ? N : [-N[0], -N[1], -N[2]], front, key: flapKey(L.kind, f.layer, c, all, mv), moving: true })
  }
  return out
}
/** The sheet with k creases folded flat and crease k turned by θ. */
export function foldAt(sheet: readonly number[], creases: readonly Crease[], k: number, theta: number): Posed[] {
  const facets = foldFlat(sheet, creases, k)
  return pose(facets, k < creases.length && theta > 0 ? creaseLine(creases[k]) : null, theta)
}

/**
 * The posed facets drawn in key order onto a cols × rows cell grid: `top` gets, per cell centre (x, y), the index of
 * the facet seen there (−1: none). Each convex outline is scanned row by row (the span where every edge has the cell
 * on its inner side). Returns the covered cells' bounds, or null.
 */
export function rasterFold(posed: readonly Posed[], cols: number, rows: number, top: Int16Array): [number, number, number, number] | null {
  top.fill(-1)
  const order = posed.map((_, i) => i).sort((a, b) => posed[a].key - posed[b].key || a - b)
  let c0 = cols, r0 = rows, c1 = -1, r1 = -1
  for (const fi of order) {
    const p = posed[fi].pts, n = p.length, area = polyArea(p)
    if (Math.abs(area) < 1e-6) continue
    const sg = area > 0 ? 1 : -1, A: number[] = [], B: number[] = [], C: number[] = []
    let ya = Infinity, yb = -Infinity, xa = Infinity, xb = -Infinity
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n, ex = p[j] - p[i], ey = p[j + 1] - p[i + 1], len = Math.sqrt(ex * ex + ey * ey)
      if (p[i] < xa) xa = p[i]
      if (p[i] > xb) xb = p[i]
      if (p[i + 1] < ya) ya = p[i + 1]
      if (p[i + 1] > yb) yb = p[i + 1]
      if (len < EPS) continue
      // inside: A·x + B·y + C ≥ 0 (a cell within 1e-4 of an edge counts: the creases' dsin / dcos are good to ~1e-7)
      A.push(-sg * ey / len); B.push(sg * ex / len); C.push(sg * (ey * p[i] - ex * p[i + 1]) / len + 1e-4)
    }
    for (let y = Math.max(0, Math.ceil(ya - 1e-4)), ye = Math.min(rows - 1, Math.floor(yb + 1e-4)); y <= ye; y++) {
      let lo = xa - 1e-4, hi = xb + 1e-4
      for (let e = 0; e < A.length && lo <= hi; e++) {
        const v = B[e] * y + C[e], a = A[e]
        if (a > 1e-12) { const x = -v / a; if (x > lo) lo = x } else if (a < -1e-12) { const x = -v / a; if (x < hi) hi = x } else if (v < 0) hi = lo - 1
      }
      const xs = Math.max(0, Math.ceil(lo)), xe = Math.min(cols - 1, Math.floor(hi))
      if (xs > xe) continue
      top.fill(fi, y * cols + xs, y * cols + xe + 1)
      if (xs < c0) c0 = xs
      if (xe > c1) c1 = xe
      if (y < r0) r0 = y
      if (y > r1) r1 = y
    }
  }
  return c1 < 0 ? null : [c0, r0, c1, r1]
}
