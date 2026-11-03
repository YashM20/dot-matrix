/**
 * Hex lattice helpers (phase XQ, docs/living-matter/X-advanced.md #7; reused by XM's frost window).
 *
 * `hexSites` lists the centres of a cols × rows hex lattice in card cells (odd rows shifted half a pitch), ready for a
 * `sites` layer. The rest is the kite grid under the hat tiling: flat-top hexagons of circumradius 2, each cut into 6
 * kites by the segments from its centre to its edge midpoints. A kite has a long side √3 (centre to midpoint) and a
 * short side 1 (midpoint to vertex), so every hat (8 kites) has its corners on this grid. `kiteAt` finds the kite
 * that holds a point in O(1): the nearest hex centre (one of the 3 corners of the lattice triangle holding the
 * point), then the sector of the vertex it points at. Pure and deterministic (sqrt only; inside the lint).
 */

export type Pt = [number, number]
export const R3 = Math.sqrt(3)

/** Centres of a cols × rows hex lattice (row-major), `pitch` cells apart, odd rows shifted right by half a pitch. */
export function hexSites(cols: number, rows: number, { pitch = 2, origin = [0, 0] as Pt } = {}): Pt[] {
  const out: Pt[] = [], dy = pitch * R3 / 2
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([origin[0] + (c + (r & 1 ? .5 : 0)) * pitch, origin[1] + r * dy])
  return out
}

/** Hex centres of the kite grid: o + a·(3, √3) + b·(3, −√3) (neighbours 2√3 apart, at 30° + k·60°). */
const U1: Pt = [3, R3], U2: Pt = [3, -R3]
/** Unit directions of the 6 hex vertices (0°, 60°, …): kite k points at vertex k. */
const DIRS: Pt[] = [[1, 0], [.5, R3 / 2], [-.5, R3 / 2], [-1, 0], [-.5, -R3 / 2], [.5, -R3 / 2]]
/** A kite: its hex (lattice a, b) and its sector k (0–5). */
export interface Kite { a: number; b: number; k: number }
/** One small integer per kite (|a|, |b| < 1024; a level-4 tiling spans about ±150), so a Map keyed by it stays fast. */
export const kiteKey = (a: number, b: number, k: number) => ((a + 1024) * 2048 + (b + 1024)) * 6 + k

/** The hex centre of lattice (a, b) for grid origin `o` (a hex centre). */
export const hexCentre = (a: number, b: number, o: Pt = [0, 0]): Pt => [o[0] + a * U1[0] + b * U2[0], o[1] + a * U1[1] + b * U2[1]]

/** The kite holding point (x, y) on the grid whose hex centre sits at `o`. Ties (points on kite edges) go to the lower index. */
export function kiteAt(x: number, y: number, o: Pt = [0, 0]): Kite {
  const X = x - o[0], Y = y - o[1]
  // lattice coordinates: X = 3(a + b), Y = √3(a − b)
  const fa = (X / 3 + Y / R3) / 2, fb = (X / 3 - Y / R3) / 2, a0 = Math.floor(fa), b0 = Math.floor(fb)
  let a = a0, b = b0, best = Infinity
  for (let i = 0; i < 4; i++) {
    const ca = a0 + (i & 1), cb = b0 + (i >> 1), cx = 3 * (ca + cb), cy = R3 * (ca - cb), d = (X - cx) ** 2 + (Y - cy) ** 2
    if (d < best - 1e-9) { best = d; a = ca; b = cb }
  }
  const dx = X - 3 * (a + b), dy = Y - R3 * (a - b)
  let k = 0, top = -Infinity
  for (let i = 0; i < 6; i++) { const s = dx * DIRS[i][0] + dy * DIRS[i][1]; if (s > top + 1e-9) { top = s; k = i } }
  return { a, b, k }
}
/** The centroid of a kite (7/6 of the way from its hex centre toward its vertex). */
export function kiteCentroid(a: number, b: number, k: number, o: Pt = [0, 0]): Pt {
  const [cx, cy] = hexCentre(a, b, o)
  return [cx + DIRS[k][0] * 7 / 6, cy + DIRS[k][1] * 7 / 6]
}
/** The kite's outline (hex centre, midpoint, vertex, midpoint), counter-clockwise for y up. */
export function kiteOutline(a: number, b: number, k: number, o: Pt = [0, 0]): Pt[] {
  const [cx, cy] = hexCentre(a, b, o), v = DIRS[k], p = DIRS[(k + 5) % 6], n = DIRS[(k + 1) % 6]
  // an edge midpoint is halfway between two vertices 2 out: (2v + 2n) / 2 = v + n, √3 from the centre
  return [[cx, cy], [cx + v[0] + p[0], cy + v[1] + p[1]], [cx + 2 * v[0], cy + 2 * v[1]], [cx + v[0] + n[0], cy + v[1] + n[1]]]
}
/** Kite area: two right triangles with legs 1 and √3. */
export const KITE_AREA = R3
