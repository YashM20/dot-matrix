/**
 * Domain repetition (#63, docs/IQ-PLAN.md IQ2): one SDF, evaluated in a local frame, repeated over space. Each
 * function takes the base shape as a callback that also receives the cell id, so a card can vary the instances
 * (size, tone, phase) per cell, and it writes the id of the nearest instance into `out` so the card can map the
 * result onto a lattice instance. Pass one reused `out` per loop to stay allocation-free.
 *
 * Ids: `repGrid` and `repMirror` use centred integer ids (cell (0, 0) sits on the origin); `repLimited` and
 * `repRect` use indices 0…n − 1 per axis; `repPolar` uses the sector 0…n − 1.
 *
 * Checking only the cell the point falls in is wrong once instances differ from cell to cell: the nearest instance
 * can sit in a neighbouring cell. `repGrid`, `repLimited` and `repPolar` check the neighbours the article shows are
 * enough (2 × 2 cells, two sectors), which is exact while every instance stays inside its own cell and covers the
 * cell's centre. `repMirror` and `repRect` evaluate one instance and need shapes with the symmetry they name.
 */
import { datan2, dcos, dsin, type Out2 } from './util'

/** A base shape for repetition: (local x, local y, cell id x, cell id y) → distance. */
export type SdCell = (x: number, y: number, ix: number, iy: number) => number
/** A base shape for rotational repetition: (local x, local y, sector) → distance. */
export type SdSector = (x: number, y: number, id: number) => number

const TAU = Math.PI * 2

// after Inigo Quilez, https://iquilezles.org/articles/sdfrepetition/ (MIT)
/**
 * Infinite grid repetition with spacing (sx, sy), the correct way: the cell the point is in plus the three
 * neighbours on its nearer sides. The base shape sits at the local origin. Writes the nearest cell's id to `out`.
 */
export function repGrid(px: number, py: number, sx: number, sy: number, sd: SdCell, out?: Out2): number {
  const ix = Math.round(px / sx) + 0, iy = Math.round(py / sy) + 0 // + 0 turns −0 into 0
  const ox = px - sx * ix < 0 ? -1 : 1, oy = py - sy * iy < 0 ? -1 : 1
  let d = Infinity, bx = ix, by = iy
  for (let j = 0; j < 2; j++) {
    const ry = iy + j * oy
    for (let i = 0; i < 2; i++) {
      const rx = ix + i * ox, e = sd(px - sx * rx, py - sy * ry, rx, ry)
      if (e < d) { d = e; bx = rx; by = ry }
    }
  }
  if (out) { out[0] = bx; out[1] = by }
  return d
}

// after Inigo Quilez, https://iquilezles.org/articles/sdfrepetition/ (MIT); the mirroring is Fizzer's
/**
 * Mirrored repetition: every other cell is flipped, so neighbouring instances face each other across each cell
 * border and the nearest one is always in the point's own cell. One evaluation per point. The base shape still
 * gets the id, so it can vary per cell as long as it stays symmetric about the cell borders. Writes the id to `out`.
 */
export function repMirror(px: number, py: number, sx: number, sy: number, sd: SdCell, out?: Out2): number {
  const ix = Math.round(px / sx) + 0, iy = Math.round(py / sy) + 0
  const rx = px - sx * ix, ry = py - sy * iy
  if (out) { out[0] = ix; out[1] = iy }
  return sd((ix & 1) === 0 ? rx : -rx, (iy & 1) === 0 ? ry : -ry, ix, iy)
}

// after Inigo Quilez, https://iquilezles.org/articles/sdfrepetition/ (MIT)
/**
 * Limited repetition: an nx × ny block of cells centred on the origin, clamped in id space (so the field outside
 * the block is the true distance to the edge instances, unlike intersecting an infinite grid with a box). Even
 * counts work: the ids are offset by half a cell, the way the article suggests. The base shape gets the indices
 * 0…nx − 1, 0…ny − 1; the nearest one goes to `out`.
 */
export function repLimited(px: number, py: number, sx: number, sy: number, nx: number, ny: number, sd: SdCell, out?: Out2): number {
  const hx = (nx - 1) * 0.5, hy = (ny - 1) * 0.5
  const tx = px / sx + hx, ty = py / sy + hy
  const ix = Math.round(tx), iy = Math.round(ty)
  const ox = tx - ix < 0 ? -1 : 1, oy = ty - iy < 0 ? -1 : 1
  let d = Infinity, bx = 0, by = 0
  for (let j = 0; j < 2; j++) {
    const ry = clampId(iy + j * oy, ny)
    for (let i = 0; i < 2; i++) {
      const rx = clampId(ix + i * ox, nx), e = sd(px - sx * (rx - hx), py - sy * (ry - hy), rx, ry)
      if (e < d) { d = e; bx = rx; by = ry }
    }
  }
  if (out) { out[0] = bx; out[1] = by }
  return d
}
const clampId = (i: number, n: number) => (i < 0 ? 0 : i > n - 1 ? n - 1 : i)

// after Inigo Quilez, https://iquilezles.org/articles/sdfrepetition/ (MIT)
/**
 * Rotational repetition: `n` copies around the origin. Sector `id` is centred on the angle id·2π/n; the base
 * shape is drawn for sector 0, centred on the +x axis. The point is checked against its sector and the next one,
 * so instances can differ per sector. Writes the nearest sector (0…n − 1) to `out[0]`. Near the centre every
 * instance is about as far away, so there a bigger instance further round can be the nearer one: keep the sizes
 * close, or the shapes away from the centre, if the field there matters.
 */
export function repPolar(px: number, py: number, n: number, sd: SdSector, out?: Out2): number {
  const sp = TAU / n, id = Math.floor(datan2(py, px) / sp)
  const a1 = sp * id, a2 = a1 + sp
  const c1 = dcos(a1), s1 = dsin(a1), c2 = dcos(a2), s2 = dsin(a2)
  const i1 = wrap(id, n), i2 = wrap(id + 1, n)
  const d1 = sd(c1 * px + s1 * py, -s1 * px + c1 * py, i1)
  const d2 = sd(c2 * px + s2 * py, -s2 * px + c2 * py, i2)
  if (out) out[0] = d1 <= d2 ? i1 : i2
  return d1 <= d2 ? d1 : d2
}
const wrap = (i: number, n: number) => ((i % n) + n) % n

// after Inigo Quilez, https://iquilezles.org/articles/sdfrepetition/ (MIT); the improved fold is Shadertoy user timestamp's
/**
 * Repetition along the perimeter of a rectangle: nx instances on the top and bottom rows, ny on the left and right
 * columns (corners shared), spacing `s`, centred on the origin. One evaluation per point, in a frame folded by both
 * axes and the diagonal, so the base shape must be symmetric under x ↔ −x, y ↔ −y and x ↔ y (a disc, a square).
 * Writes the nearest instance's indices (0…nx − 1, 0…ny − 1) to `out`; the id is ours, the article's code returns
 * only the folded point.
 */
export function repRect(px: number, py: number, nx: number, ny: number, s: number, sd: SdCell, out?: Out2): number {
  const hx = nx * 0.5 - 0.5, hy = ny * 0.5 - 0.5
  const qx = Math.abs(px / s) - hx, qy = Math.abs(py / s) - hy
  const swap = qx < qy
  const fx = swap ? qy : qx, fy = swap ? qx : qy
  const k = Math.min(0, Math.round(fy)) + 0
  // the instance centre, unfolded: (0, k) in the folded frame → back through the swap, the offset and the signs
  const cx = ((swap ? k : 0) + hx) * (px < 0 ? -1 : 1), cy = ((swap ? 0 : k) + hy) * (py < 0 ? -1 : 1)
  const ix = cx + hx, iy = cy + hy
  if (out) { out[0] = ix; out[1] = iy }
  return sd(fx * s, (fy - k) * s, ix, iy)
}
