/**
 * Box-filtered procedural patterns (IQ4, #65), ported from Inigo Quilez's "Filterable procedurals" (MIT; see
 * THIRD-PARTY-NOTICES.md): checkers, grid, squares, crosses and xor, each the exact average of its plain pattern over
 * the footprint box. A pattern takes a point p = (x, y) and the footprint's two edges dpdx = (dxx, dxy) and
 * dpdy = (dyx, dyy) as scalars (no tuple per call). The articles read those from GPU derivatives; on the dot grid
 * they are one cell, `(cell, 0)` and `(0, cell)` in pattern units (`patternField` in ./field.ts does that).
 *
 * Every filtered function equals its plain one when the footprint is 0 (an axis of width 0 is point-sampled): the
 * articles' `+ 0.01` guards against 0 / 0 are replaced by that branch, so a zero footprint is the plain pattern.
 * Values are in [0, 1]. Deterministic (only +, −, ×, /, floor, abs, min, max; scanned by the determinism lint).
 */

/** A pattern: point (x, y), footprint edges dpdx = (dxx, dxy) and dpdy = (dyx, dyy), value in [0, 1]. */
export type Pattern = (x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number) => number

/** GLSL fract: x − floor(x), in [0, 1). */
export const fract = (x: number) => x - Math.floor(x)
/** The filter width on one axis: w = max(|dpdx|, |dpdy|) for that component (the articles' kernel). */
export const kernel =(dxx: number, dyx: number) => Math.max(Math.abs(dxx), Math.abs(dyx))

// ── checkers ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * The checkers' square signal on one axis, box-filtered over width w: the average of −sign(fract(x / 2) − ½).
 * w = 0 gives the signal itself (the plain pattern).
 */
// after Inigo Quilez, https://iquilezles.org/articles/filterableprocedurals/ (MIT)
function checkerAxis(x: number, w: number): number {
  if (!(w > 0)) return -Math.sign(fract(x * .5) - .5)
  return 2 * (Math.abs(fract((x - .5 * w) * .5) - .5) - Math.abs(fract((x + .5 * w) * .5) - .5)) / w
}
/** Plain checkers, 0 / 1 on unit squares (1 where floor(x) + floor(y) is odd; ½ exactly on an edge). */
export const checkers = (x: number, y: number) => .5 - .5 * Math.sign(fract(x * .5) - .5) * Math.sign(fract(y * .5) - .5)
/** Box-filtered checkers: the exact mean of `checkers` over the footprint box. */
// after Inigo Quilez, https://iquilezles.org/articles/filterableprocedurals/ (MIT)
export function filteredCheckers(x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number): number {
  return .5 - .5 * checkerAxis(x, kernel(dxx, dyx)) * checkerAxis(y, kernel(dxy, dyy))
}

// ── grid, squares, crosses ────────────────────────────────────────────────────────────────────────────
/**
 * The fraction of a box of width w around x that falls on a line of the pattern: lines are the first 1/n of every
 * unit cell (fract(x)·n < 1). Its integral is (floor(x) + min(fract(x)·n, 1)) / n; w = 0 gives the indicator.
 */
// after Inigo Quilez, https://iquilezles.org/articles/filterableprocedurals/ (MIT)
function lineAxis(x: number, w: number, n: number): number {
  if (!(w > 0)) return fract(x) * n < 1 ? 1 : 0
  const a = x + .5 * w, b = x - .5 * w
  return (Math.floor(a) + Math.min(fract(a) * n, 1) - Math.floor(b) - Math.min(fract(b) * n, 1)) / (n * w)
}
/** Plain grid: 0 on the lines (width 1/n of a cell), 1 inside. */
export const grid = (x: number, y: number, n = 10) => (1 - lineAxis(x, 0, n)) * (1 - lineAxis(y, 0, n))
/** Box-filtered grid of lines 1/n of a cell wide (the article's N = 10). */
// after Inigo Quilez, https://iquilezles.org/articles/filterableprocedurals/ (MIT)
export function filteredGrid(x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number, n = 10): number {
  return (1 - lineAxis(x, kernel(dxx, dyx), n)) * (1 - lineAxis(y, kernel(dxy, dyy), n))
}
/** Plain squares: 0 on a square 1/n of a cell at each cell corner, 1 elsewhere. */
export const squares = (x: number, y: number, n = 3) => 1 - lineAxis(x, 0, n) * lineAxis(y, 0, n)
/** Box-filtered squares (the article's N = 3). */
// after Inigo Quilez, https://iquilezles.org/articles/filterableprocedurals/ (MIT)
export function filteredSquares(x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number, n = 3): number {
  return 1 - lineAxis(x, kernel(dxx, dyx), n) * lineAxis(y, kernel(dxy, dyy), n)
}
/** Plain crosses: the xor of the two line sets (0 on one set of lines, 1 where they cross or on neither). */
export const crosses = (x: number, y: number, n = 3) => { const i = lineAxis(x, 0, n), j = lineAxis(y, 0, n); return 1 - i - j + 2 * i * j }
/** Box-filtered crosses (the article's N = 3). */
// after Inigo Quilez, https://iquilezles.org/articles/filterableprocedurals/ (MIT)
export function filteredCrosses(x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number, n = 3): number {
  const i = lineAxis(x, kernel(dxx, dyx), n), j = lineAxis(y, kernel(dxy, dyy), n)
  return 1 - i - j + 2 * i * j
}

// ── xor ──────────────────────────────────────────────────────────────────────────────────────────────
/** The xor pattern's octave count (the article's loop). */
const XOR_OCTAVES = 8
/** Plain xor pattern: 8 octaves of checkers, each half the scale of the last, weighted ½, ¼, … from the coarsest. */
export function xor(x: number, y: number): number {
  let v = 0
  for (let i = 0; i < XOR_OCTAVES; i++) { v += checkers(x, y); x *= .5; y *= .5; v *= .5 }
  return v
}
/** Box-filtered xor pattern: the same octaves, each a box-filtered checkers with the footprint halved along. */
// after Inigo Quilez, https://iquilezles.org/articles/filterableprocedurals/ (MIT)
export function filteredXor(x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number): number {
  let v = 0, wx = kernel(dxx, dyx), wy = kernel(dxy, dyy)
  for (let i = 0; i < XOR_OCTAVES; i++) {
    v += .5 - .5 * checkerAxis(x, wx) * checkerAxis(y, wy)
    wx *= .5; wy *= .5; x *= .5; y *= .5; v *= .5
  }
  return v
}
