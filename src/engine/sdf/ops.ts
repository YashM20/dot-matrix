/**
 * Modifiers that work on any SDF: `opRound` inflates a shape by `r` (rounding its corners), `opOnion` hollows it
 * into a band of half-thickness `r`. The `sdg` forms carry the gradient through.
 *
 * Inside distances (after Inigo Quilez, https://iquilezles.org/articles/interiordistance/): min() of two shapes
 * is right outside the union but wrong inside it, and max() (subtract, intersect) is off on both sides. Onion and
 * inset bands read the inside, so over a union they come out lumpy or broken where the parts overlap. To keep them
 * right: use one exact primitive for the whole outline where there is one (`sdCross`, `sdHorseshoe`, `sdArc`,
 * `sdPie` instead of unions and cuts of boxes and discs); or trace the outline as one closed contour of segments,
 * arcs and quadratic Béziers, each exact (`sdPolygon` does this for straight edges); or, when only the inside
 * matters, model the negative space and flip the sign. `opXor` of two exact shapes stays exact on both sides.
 */
import type { Out2 } from './util'

/** A 2D SDF with its parameters bound: (x, y) → distance. */
export type Sd2 = (x: number, y: number) => number
/** A 2D SDF with gradient: returns the distance, writes ∂d/∂x, ∂d/∂y into `out`. */
export type Sdg2 = (x: number, y: number, out: Out2) => number

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Rounded shape: the iso-line `r` outside the shape. */
export const opRound = (sd: Sd2, r: number): Sd2 => (x, y) => sd(x, y) - r

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Annular shape: a band of half-thickness `r` centred on the outline. Nest it for onion layers. */
export const opOnion = (sd: Sd2, r: number): Sd2 => (x, y) => Math.abs(sd(x, y)) - r

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** `opRound` with gradient: subtracting a constant leaves the gradient as it is. */
export const sdgRound = (sdg: Sdg2, r: number): Sdg2 => (x, y, out) => sdg(x, y, out) - r

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** `opOnion` with gradient: inside the shape the gradient flips. */
export const sdgOnion = (sdg: Sdg2, r: number): Sdg2 => (x, y, out) => {
  const d = sdg(x, y, out)
  if (d < 0) { out[0] = -out[0]; out[1] = -out[1] } else if (d === 0) { out[0] = 0; out[1] = 0 }
  return Math.abs(d) - r
}
