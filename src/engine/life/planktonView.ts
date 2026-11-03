/**
 * Read-outs of a plankton state (plankton.ts) for drawing and checks: the creatures (particles linked within
 * LINK world units, union-find over a spatial hash; each with its centroid and its nucleus, the particle nearest
 * the centroid) and the Lenia density U splatted onto a raster of card cells. Module scratch, no allocation per frame
 * beyond the returned list.
 */
import { createHash } from '../physics/particles'
import { hashPoints } from './steer'
import { PLANKTON_SCALE, type Plankton } from './plankton'

export interface Creature { n: number; x: number; y: number; nucleus: number }
/** Particles closer than this (world units) belong to one creature. */
export const LINK = 2.4

let scratch: { n: number; parent: Int32Array; size: Int32Array; sx: Float64Array; sy: Float64Array; hash: ReturnType<typeof createHash> } | undefined
const find = (parent: Int32Array, i: number) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }

/** Creatures of at least `min` particles, largest first (ties by nucleus index), positions in card cells. */
export function planktonCreatures(p: Plankton, s: Float32Array, min = 24): Creature[] {
  const { n, X, Y } = p.layout, S = PLANKTON_SCALE
  if (!scratch || scratch.n !== n) scratch = { n, parent: new Int32Array(n), size: new Int32Array(n), sx: new Float64Array(n), sy: new Float64Array(n), hash: createHash(n, [0, 0, 160 / S, 160 / S], LINK) }
  const { parent, size, sx, sy, hash } = scratch, { cols, rows, start, items, cellOf } = hash
  hashPoints(hash, s, n, X, Y)
  for (let i = 0; i < n; i++) parent[i] = i
  for (let i = 0; i < n; i++) {
    const c = cellOf[i], ccx = c % cols, ccy = (c / cols) | 0
    for (let gy = Math.max(0, ccy - 1); gy <= Math.min(rows - 1, ccy + 1); gy++) for (let gx = Math.max(0, ccx - 1); gx <= Math.min(cols - 1, ccx + 1); gx++) {
      const c1 = gy * cols + gx
      for (let q = start[c1]; q < start[c1 + 1]; q++) {
        const j = items[q]
        if (j <= i) continue
        const dx = s[X + i] - s[X + j], dy = s[Y + i] - s[Y + j]
        if (dx * dx + dy * dy < LINK * LINK) { const a = find(parent, i), b = find(parent, j); if (a !== b) parent[a < b ? b : a] = a < b ? a : b }
      }
    }
  }
  size.fill(0); sx.fill(0); sy.fill(0)
  for (let i = 0; i < n; i++) { const r = find(parent, i); size[r]++; sx[r] += s[X + i]; sy[r] += s[Y + i] }
  const out: Creature[] = []
  for (let r = 0; r < n; r++) {
    if (parent[r] !== r || size[r] < min) continue
    const x = sx[r] / size[r], y = sy[r] / size[r]
    let best = -1, bd = Infinity
    for (let i = 0; i < n; i++) {
      if (find(parent, i) !== r) continue
      const dx = s[X + i] - x, dy = s[Y + i] - y, d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = i }
    }
    out.push({ n: size[r], x: x * S, y: y * S, nucleus: best })
  }
  return out.sort((a, b) => b.n - a.n || a.nucleus - b.nucleus)
}

/** A raster of card cells, `k` cells per texel: texel (i, j) sits at card cell (k·i, k·j). */
export interface DensityRaster { cols: number; rows: number; k: number; v: Float32Array }
export const createDensityRaster = (cols: number, rows: number, k: number): DensityRaster => ({ cols, rows, k, v: new Float32Array(cols * rows) })

/** U (the Lenia density, kernel sum) at every texel, from the solver's kernel table. */
export function planktonDensity(p: Plankton, s: Float32Array, r: DensityRaster): void {
  const { n, X, Y } = p.layout, S = PLANKTON_SCALE, { cols, rows, k, v } = r, L = p.lenia
  const reach = L.reach, tab = L.kTab, inv = (tab.length - 2) / reach, rc = (reach * S) / k
  v.fill(0)
  for (let i = 0; i < n; i++) {
    const tx = (s[X + i] * S) / k, ty = (s[Y + i] * S) / k
    const i0 = Math.max(0, Math.ceil(tx - rc)), i1 = Math.min(cols - 1, Math.floor(tx + rc)), j0 = Math.max(0, Math.ceil(ty - rc)), j1 = Math.min(rows - 1, Math.floor(ty + rc))
    for (let j = j0; j <= j1; j++) {
      const dy = ((j - ty) * k) / S
      for (let ii = i0; ii <= i1; ii++) {
        const dx = ((ii - tx) * k) / S, d2 = dx * dx + dy * dy
        if (d2 >= reach * reach) continue
        const a = Math.sqrt(d2) * inv, t0 = a | 0
        v[j * cols + ii] += tab[t0] + (tab[t0 + 1] - tab[t0]) * (a - t0)
      }
    }
  }
}

/** Bilinear read of a density raster at card cell (x, y). */
export function densityAt(r: DensityRaster, x: number, y: number): number {
  const u = x / r.k, w = y / r.k, i = Math.floor(u), j = Math.floor(w)
  if (i < 0 || j < 0 || i >= r.cols - 1 || j >= r.rows - 1) return 0
  const fu = u - i, fw = w - j, o = j * r.cols + i, v = r.v
  return (v[o] * (1 - fu) + v[o + 1] * fu) * (1 - fw) + (v[o + r.cols] * (1 - fu) + v[o + r.cols + 1] * fu) * fw
}
