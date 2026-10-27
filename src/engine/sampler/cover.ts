import type { DotStyle } from '../types'
import { squircleExponent } from '../renderer/shapePath'

/**
 * The exponent the cover test uses for a style or a per-dot form: 'square' → Infinity, 'circle' and
 * 'superformula' → 2 (both render as circles, shapePath.ts), otherwise squircleExponent(roundness).
 */
export const coverExponent = (shape: DotStyle['shape'], roundness?: number): number =>
  shape === 'square' ? Infinity : shape === 'squircle' ? squircleExponent(roundness) : 2

/**
 * The single cover rule (docs/living-matter/F0-foundation.md §2.6): does a site dot of reach R (cells)
 * hide the card cell at offset (dx, dy)? Shaped like the drawn dot. n: from coverExponent; rot: radians.
 * Bands (with r = cornerRoundness, n = 2 + 30r²):
 *   n ≤ 2.5  (r ≤ 0.129)  circle: Math.hypot(dx, dy) <= R, the legacy expression byte-for-byte; rot ignored.
 *   n ≥ 8    (r ≥ 0.447)  square (Chebyshev): max(ax, ay) <= 1 with a = |offset| / R after un-rotating by rot.
 *   between              superellipse: ax ** n + ay ** n <= 1 after un-rotating by rot.
 * Rotation: rot ≡ 0 (mod π/2) → no rotation (exact); rot ≡ π/4 (mod π/2) → the exact diamond form
 * (square band: ax + ay <= √2); any other rot → offsets rotated by −rot with Math.cos/sin, then the band test.
 * A rotated non-circle reaches up to R·√2 along an axis: callers scanning a cell box widen it.
 */
export function hides(dx: number, dy: number, R: number, n: number, rot = 0): boolean {
  if (n <= 2.5) return Math.hypot(dx, dy) <= R
  // the shape has the square's symmetries, so a multiple of π/2 is no rotation (cos 1, sin 0: exact) and an odd
  // multiple of π/4 is the diamond (cos = sin = √½); only other angles go through Math.cos / Math.sin
  const q = rot / (Math.PI / 4), k = Math.round(q), exact = Math.abs(q - k) < 1e-9
  const c = exact ? (k & 1 ? Math.SQRT1_2 : 1) : Math.cos(rot), s = exact ? (k & 1 ? Math.SQRT1_2 : 0) : Math.sin(rot)
  const ax = Math.abs(dx * c + dy * s) / R, ay = Math.abs(dy * c - dx * s) / R
  return n >= 8 ? Math.max(ax, ay) <= 1 : ax ** n + ay ** n <= 1
}
