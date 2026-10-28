/**
 * Value noise (F0.2): the hash01 lattice with a smoothstep fade, bit-identical to cinema.ts's former private
 * `vnoise`. For migration only (new cards use gradient noise). Its own module so the cinema board bundles just this.
 */
import { hash01 } from '../math'

/** Value noise in [0, 1], bit-identical to cinema.ts's former private vnoise (hash01 lattice, smoothstep fade). For migration only. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash01(xi, yi, seed), b = hash01(xi + 1, yi, seed), c = hash01(xi, yi + 1, seed), d = hash01(xi + 1, yi + 1, seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
