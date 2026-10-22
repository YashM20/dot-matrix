/**
 * Shared scalar helpers. Everything here is deterministic across JS engines: no `Math.random`,
 * no `fract(sin(x) * 43758…)` hashing (Math.sin is not bit-identical between V8/JSC/SpiderMonkey,
 * which would make golden snapshots engine-specific).
 */
export const clamp = (x: number, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x)
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
/**
 * Length of (x, y) for per-cell field code. `Math.hypot` is variadic and ~10× slower in V8, and its
 * rounding is engine-specific; `Math.sqrt` is correctly rounded everywhere.
 */
export const len = (x: number, y: number) => Math.sqrt(x * x + y * y)
/** Hermite smoothstep; `a > b` gives the falling edge. */
export function smoothstep(a: number, b: number, x: number): number { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/** murmur3 finaliser — full avalanche on 32 bits. */
function fmix32(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
/** Fractional inputs hash by their 1/256 fixed-point value, so hash(i + .5) ≠ hash(i). */
const fixed = (x: number) => (Number.isFinite(x) ? Math.round(x * 256) | 0 : 0)
/** Integer hash of up to three numbers → uint32. */
export function hash32(a: number, b = 0, c = 0): number {
  let h = fmix32((fixed(a) + 0x9e3779b9) | 0)
  h = fmix32((h ^ fixed(b)) + 0x7f4a7c15 | 0)
  return fmix32((h ^ fixed(c)) + 0x165667b1 | 0)
}
/** Deterministic hash of up to three numbers → [0, 1). Drop-in for the old `fract(sin)` hash. */
export const hash01 = (a: number, b = 0, c = 0) => hash32(a, b, c) / 4294967296
