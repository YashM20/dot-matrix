/**
 * Integer lattice hashing (part of `dmath`, F0.1). Its own module so the IR noise pack chunk (gradient, voronoi)
 * doesn't share a chunk with the algorithms board. Import from `dmath`.
 */
/** murmur3 finaliser (as math.ts): full avalanche on 32 bits → uint32. */
export function fmix32(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
/**
 * `ihash`'s three multipliers, for lattice loops that inline it: ihash(a, b, c) ===
 * fmix32(imul(a, IH_A) ^ imul(b, IH_B) ^ imul(c, IH_C)), and imul(a + k, K) === (imul(a, K) + k·K) | 0 for |k| ≤ 2²⁰.
 */
export const IH_A = 0x8da6b343, IH_B = 0xd8163841, IH_C = 0xcb1ab31f
/**
 * Integer lattice hash → uint32: h = imul(a, 0x8da6b343) ^ imul(b, 0xd8163841) ^ imul(c, 0xcb1ab31f),
 * then the murmur3 finaliser (as math.ts:17-21). Inputs are taken as int32 (`| 0`). Use it for lattice
 * cells, entity ids and step counters over the full 32-bit range. `hash32` (math.ts) is for
 * fractional inputs: it scales by 256, so integers alias past ±2²³.
 * Mirrored exactly by GLSL `uint` ops (noise/glsl.ts).
 */
export function ihash(a: number, b = 0, c = 0): number {
  return fmix32(Math.imul(a, IH_A) ^ Math.imul(b, IH_B) ^ Math.imul(c, IH_C))
}
