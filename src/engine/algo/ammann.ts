/**
 * The Ammann–Beenker tiling (phase XQ, docs/living-matter/X-advanced.md #7) by de Bruijn's multigrid: 4 families
 * of parallel lines, family k at angle kπ/4 (lines x·e_k + γ_k ∈ ℤ + ½, offsets summing to 0). Every crossing of a line of
 * family j with one of family k is one tile, the rhombus on e_j and e_k at the point Σ K_m e_m, where K_m is the strip
 * of family m the crossing sits in. Families 2 apart (0 and 2, 1 and 3) cross at 90° and give squares, the others give
 * the 45° rhombi. Pure and deterministic (sqrt only; inside the lint).
 *
 * The half puts the strips' centres on the lines' old places: as a cut-and-project set the tiling's window is then
 * centred within |γ| of the origin, so the origin is the 8-fold centre and inflation by the silver ratio δ = 1 + √2
 * maps the vertices into themselves. A card can zoom by δ about the origin and swap each big tile for the small
 * tiles under it.
 */
export type Pt = [number, number]
const S2 = Math.SQRT1_2
/** Unit directions e_k at kπ/4. */
export const E: readonly Pt[] = [[1, 0], [S2, S2], [0, 1], [-S2, S2]]
export const SILVER = 1 + Math.SQRT2
/** Tile kinds: 0 the square on e0, e2 (axis-aligned), 1 the square on e1, e3 (turned π/4), 2–5 rhombi on (0,1), (1,2), (2,3), (0,3). */
export type AbKind = 0 | 1 | 2 | 3 | 4 | 5
export interface AbTile {
  kind: AbKind
  /** The two families and the crossing's line numbers. */
  j: number; k: number; nj: number; nk: number
  /** The corner the rhombus is spanned from (then + e_j, + e_k), and its centre. */
  corner: Pt
  centre: Pt
}
const kindOf = (j: number, k: number): AbKind => (k - j === 2 ? (j === 0 ? 0 : 1) : j === 0 && k === 3 ? 5 : ((2 + j) as AbKind))

/** Every tile whose centre lies within `radius` of the origin (tiling units: edges 1). */
export function ammannBeenker(radius: number, offsets: readonly number[] = [.013, -.021, .034, -.026]): AbTile[] {
  const out: AbTile[] = [], R = radius / 2 + 2, gamma = offsets.map(g => g + .5)
  for (let j = 0; j < 4; j++) for (let k = j + 1; k < 4; k++) {
    const [ax, ay] = E[j], [bx, by] = E[k], det = ax * by - ay * bx
    for (let nj = Math.ceil(-R + gamma[j]); nj <= Math.floor(R + gamma[j]); nj++) for (let nk = Math.ceil(-R + gamma[k]); nk <= Math.floor(R + gamma[k]); nk++) {
      // the crossing x: x·e_j = nj − γ_j, x·e_k = nk − γ_k
      const sj = nj - gamma[j], sk = nk - gamma[k], x = (sj * by - sk * ay) / det, y = (ax * sk - bx * sj) / det
      let cx = (nj - 1) * ax + (nk - 1) * bx, cy = (nj - 1) * ay + (nk - 1) * by
      for (let m = 0; m < 4; m++) {
        if (m === j || m === k) continue
        const K = Math.floor(x * E[m][0] + y * E[m][1] + gamma[m])
        cx += K * E[m][0]; cy += K * E[m][1]
      }
      const centre: Pt = [cx + (ax + bx) / 2, cy + (ay + by) / 2]
      if (centre[0] * centre[0] + centre[1] * centre[1] > radius * radius) continue
      out.push({ kind: kindOf(j, k), j, k, nj, nk, corner: [cx, cy], centre })
    }
  }
  return out
}
/** The tile's 4 corners (corner, + e_j, + e_j + e_k, + e_k). */
export function abOutline(t: AbTile): Pt[] {
  const [x, y] = t.corner, a = E[t.j], b = E[t.k]
  return [[x, y], [x + a[0], y + a[1]], [x + a[0] + b[0], y + a[1] + b[1]], [x + b[0], y + b[1]]]
}
/** Tile area: sin of the angle between its families (1 for a square, √½ for a rhombus). */
export const abArea = (t: AbTile) => Math.abs(E[t.j][0] * E[t.k][1] - E[t.j][1] * E[t.k][0])

/**
 * Rasterize tiles onto a w × h grid of cells: cell (c, r) centre maps to tiling point ((c + .5 − cx) / s, (cy − r − .5) / s)
 * (s cells per tiling unit, y up). `id` takes the index of the tile holding each cell centre (−1 none) and `depth`
 * how far inside it the centre is (cells, to the nearest edge), so a caller can leave grout. Only cells where
 * `keep[cell]` is set are written (all when omitted). Tiles are tested inside their bounding boxes only.
 */
export function abRaster(tiles: readonly AbTile[], o: { w: number; h: number; s: number; cx: number; cy: number }, id: Int32Array, depth: Float32Array, keep?: Uint8Array): void {
  const { w, h, s, cx, cy } = o, reach = s * 1.5
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i], mx = cx + t.centre[0] * s, my = cy - t.centre[1] * s
    // a tile reaches at most √(1 + √½) < 1.5 edges from its centre
    if (mx < -reach || mx > w + reach || my < -reach || my > h + reach) continue
    const a = E[t.j], b = E[t.k], det = a[0] * b[1] - a[1] * b[0], hgt = Math.abs(det) * s
    const ax = a[0] * s, ay = -a[1] * s, bx = b[0] * s, by = -b[1] * s, x = cx + t.corner[0] * s - .5, y = cy - t.corner[1] * s - .5
    const c0 = Math.max(0, Math.ceil(x + Math.min(0, ax) + Math.min(0, bx))), c1 = Math.min(w - 1, Math.floor(x + Math.max(0, ax) + Math.max(0, bx)))
    const r0 = Math.max(0, Math.ceil(y + Math.min(0, ay) + Math.min(0, by))), r1 = Math.min(h - 1, Math.floor(y + Math.max(0, ay) + Math.max(0, by)))
    const kx = t.corner[0], ky = t.corner[1]
    for (let r = r0; r <= r1; r++) {
      const py = (cy - r - .5) / s - ky
      for (let c = c0, cell = r * w + c0; c <= c1; c++, cell++) {
        if (keep && !keep[cell]) continue
        // the cell centre in tiling units, relative to the corner, then in the (e_j, e_k) basis
        const px = (c + .5 - cx) / s - kx, u = (px * b[1] - py * b[0]) / det, v = (a[0] * py - a[1] * px) / det
        // a hair of slack: a centre on a shared edge must land in one of the two tiles, whatever the rounding
        if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) continue
        id[cell] = i; depth[cell] = Math.min(u, 1 - u, v, 1 - v) * hgt
      }
    }
  }
}
