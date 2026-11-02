/**
 * Analytically filtered checkers (IQ4, #65), ported from Inigo Quilez's "Checkers filtering" (box filter) and
 * "Improved checkers filtering" (triangle filter) (MIT; see THIRD-PARTY-NOTICES.md). Both write the checkers as the
 * product of two square signals, integrate each axis on its own (the pattern is separable) and recombine them as
 * 0.5 − 0.5·i.x·i.y. The box kernel is w wide; the triangle kernel reaches w either side (2w wide), which steadies a
 * slow pan: a feature entering the footprint starts at weight 0 instead of jumping in. Use it for animated boards.
 *
 * Arguments as in ./procedural.ts: a point and the footprint edges (dxx, dxy), (dyx, dyy). A zero footprint gives
 * the plain checkers (`checkers` in ./procedural.ts); the articles' `+ 0.01` guard is that branch here. Values in
 * [0, 1]. Deterministic (only +, −, ×, /, floor, abs, max; scanned by the determinism lint).
 */
import { checkers, fract, kernel } from './procedural'

/** The square signal: s(x) = −sign(fract(x / 2) − ½), +1 on [0, 1), −1 on [1, 2), period 2. */
// after Inigo Quilez, https://iquilezles.org/articles/morecheckerfiltering/ (MIT)
export const sqr = (x: number) => -Math.sign(fract(x * .5) - .5)
/** Its integral, the triangle signal t(x) = 1 − 2·|fract(x / 2) − ½|: rises on [0, 1], falls on [1, 2]. */
// after Inigo Quilez, https://iquilezles.org/articles/checkerfiltering/ (MIT)
export const tri = (x: number) => 1 - 2 * Math.abs(fract(x * .5) - .5)
/** The second integral p(x) = x / 2 + h·(1 − 2|h|), h = fract(x / 2) − ½: parabolic arcs rising ½ per unit. */
// after Inigo Quilez, https://iquilezles.org/articles/morecheckerfiltering/ (MIT)
export function pri(x: number): number {
  const h = fract(x * .5) - .5
  return x * .5 + h * (1 - 2 * Math.abs(h))
}

/**
 * Box-filtered checkers: per axis the mean of the square signal over [x − w/2, x + w/2], (t(x + w/2) − t(x − w/2)) / w.
 * Same values as `filteredCheckers`, built on the triangle signal. The article's listing integrates over [x − w, x + w]
 * yet divides by w and returns 1 − i.x·i.y, which leaves [0, 1]; this keeps the normalised form of its Shadertoy
 * reference and of "Filterable procedurals".
 */
// after Inigo Quilez, https://iquilezles.org/articles/checkerfiltering/ (MIT)
export function checkersBox(x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number): number {
  const wx = kernel(dxx, dyx), wy = kernel(dxy, dyy)
  if (!(wx > 0) && !(wy > 0)) return checkers(x, y)
  const ix = wx > 0 ? (tri(x + .5 * wx) - tri(x - .5 * wx)) / wx : sqr(x)
  const iy = wy > 0 ? (tri(y + .5 * wy) - tri(y - .5 * wy)) / wy : sqr(y)
  return .5 - .5 * ix * iy
}

/**
 * Triangle-filtered checkers: per axis the square signal weighted by a tent of half width w, which is the second
 * difference of its second integral, (p(x + w) − 2p(x) + p(x − w)) / w².
 */
// after Inigo Quilez, https://iquilezles.org/articles/morecheckerfiltering/ (MIT)
export function checkersTriangle(x: number, y: number, dxx: number, dxy: number, dyx: number, dyy: number): number {
  const wx = kernel(dxx, dyx), wy = kernel(dxy, dyy)
  if (!(wx > 0) && !(wy > 0)) return checkers(x, y)
  const ix = wx > 0 ? (pri(x + wx) - 2 * pri(x) + pri(x - wx)) / (wx * wx) : sqr(x)
  const iy = wy > 0 ? (pri(y + wy) - 2 * pri(y) + pri(y - wy)) / (wy * wy) : sqr(y)
  return .5 - .5 * ix * iy
}
