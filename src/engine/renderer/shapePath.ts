/**
 * Dot outlines. Squircles are superellipses |x/r|^n + |y/r|^n = 1.
 * `cornerRoundness` (0..1) maps to the exponent n via squircleExponent():
 *   0 → n=2 (circle) · ≈0.26 → n=4 (iOS squircle) · 0.5 → n=9.5 · 1 → n=32 (visually square).
 * n ≤ 8 is drawn with four cubic béziers fitted at the 45° point of the exact curve;
 * above that the curve is a rounded square whose corner radius shrinks as n grows.
 */
export function squircleExponent(roundness = 0): number { const r = Math.max(0, Math.min(1, roundness)); return 2 + 30 * r * r }
/** Bézier handle length (fraction of r) so the curve hits the true superellipse at 45°. */
export function bezierHandle(n: number): number { return (2 ** (-1 / n) - 0.5) / 0.375 }
/** Corner radius (fraction of r) of the rounded square that meets the exact superellipse at 45°. */
export function cornerFraction(n: number): number { return (Math.SQRT2 * (1 - 2 ** (-1 / n))) / (Math.SQRT2 - 1) }
export const BEZIER_MAX_N = 8

export function circlePath(x: number, y: number, r: number): string { return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0` }
export function squarePath(x: number, y: number, r: number): string { return `M ${x - r} ${y - r}h${r * 2}v${r * 2}h${-r * 2}Z` }
export function roundedSquarePath(x: number, y: number, r: number, corner: number): string {
  const c = Math.max(0, Math.min(r, corner)), s = r - c
  return `M ${x - s} ${y - r}h${s * 2}a${c} ${c} 0 0 1 ${c} ${c}v${s * 2}a${c} ${c} 0 0 1 ${-c} ${c}h${-s * 2}a${c} ${c} 0 0 1 ${-c} ${-c}v${-s * 2}a${c} ${c} 0 0 1 ${c} ${-c}Z`
}
export function squirclePath(x: number, y: number, r: number, roundness = 0): string {
  const n = squircleExponent(roundness)
  if (n > BEZIER_MAX_N) return roundedSquarePath(x, y, r, r * cornerFraction(n))
  const k = r * bezierHandle(n)
  return `M ${x} ${y - r} C ${x + k} ${y - r} ${x + r} ${y - k} ${x + r} ${y} C ${x + r} ${y + k} ${x + k} ${y + r} ${x} ${y + r} C ${x - k} ${y + r} ${x - r} ${y + k} ${x - r} ${y} C ${x - r} ${y - k} ${x - k} ${y - r} ${x} ${y - r}Z`
}
export function superformulaPath(): never { throw new Error('not implemented — deferred, see DESIGN.md Known Gaps') }

/** Radius of the rendered squircle at 45°, in units of r — used by the acceptance tests. */
export function squircleRadius45(roundness: number): number {
  const n = squircleExponent(roundness)
  if (n > BEZIER_MAX_N) { const c = cornerFraction(n), s = 1 - c; return Math.hypot(s, s) + c }
  const k = bezierHandle(n); return Math.SQRT2 * (0.5 + 0.375 * k)
}
