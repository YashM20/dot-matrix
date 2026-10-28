/**
 * Join masks (docs/living-matter/Q-squares.md §1.2, §2.3): a joined cell is drawn as four quarter tiles, one per
 * quadrant (clockwise from the top-left: q0 NW, q1 NE, q2 SE, q3 SW). Each quadrant reads its horizontal
 * neighbour H, vertical neighbour V and diagonal D, and picks one of five shapes (3 bits): 12 bits per cell.
 *
 *   q0 NW: H = W, V = N, D = NW     q1 NE: H = E, V = N, D = NE
 *   q2 SE: H = E, V = S, D = SE     q3 SW: H = W, V = S, D = SW
 *
 * D is read only when H ∧ V (the blob-tileset corner rule), so the 256 neighbourhoods give 47 distinct masks.
 * Pure and deterministic (inside the determinism lint, scripts/lib/detLint.ts).
 */

/** Quadrant shape codes (3 bits). 5 = DIAG is the Q3 `conn: 8` bridge; 6–7 are reserved. */
export const CONVEX = 0, EDGE_H = 1, EDGE_V = 2, FULL = 3, INNER = 4, DIAG = 5
/** Every quadrant FULL: an interior cell (renderers draw it as one rect). */
export const ALL_FULL = 0x6DB
/** Packed join value of a plain (not joinable) dot. */
export const NO_JOIN = 0xFFFF

/** The quadrant shape from its three neighbours. */
export const quadrantCode = (H: boolean, V: boolean, D: boolean, conn8 = false): number =>
  H ? (V ? (D ? FULL : INNER) : EDGE_H) : V ? EDGE_V : conn8 && D ? DIAG : CONVEX

/** Neighbourhood byte: bit0 N, bit1 NE, bit2 E, bit3 SE, bit4 S, bit5 SW, bit6 W, bit7 NW. */
export const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128
/** Mask of one neighbourhood byte. */
export function maskOf(b: number, conn8 = false): number {
  const on = (bit: number) => (b & bit) !== 0
  return quadrantCode(on(W), on(N), on(NW), conn8) | quadrantCode(on(E), on(N), on(NE), conn8) << 3
    | quadrantCode(on(E), on(S), on(SE), conn8) << 6 | quadrantCode(on(W), on(S), on(SW), conn8) << 9
}
/** Mask per neighbourhood byte (4-connected joins), built once. */
export const LUT4: Uint16Array = (() => { const t = new Uint16Array(256); for (let b = 0; b < 256; b++) t[b] = maskOf(b); return t })()
/** Quadrant q's code in a mask. */
export const quadrant = (mask: number, q: number): number => (mask >> (3 * q)) & 7

/**
 * Masks of a key grid (`width` × `height`, row-major): cells with the same non-zero key join. Cells outside the
 * grid count as empty. Key 0 (not joinable) gives NO_JOIN. Writes into `out` when given.
 */
export function joinMasks(key: Uint16Array, width: number, height: number, out = new Uint16Array(width * height)): Uint16Array {
  // a copy with a one-cell empty border, so the eight neighbour reads need no bounds tests
  const PW = width + 2, need = PW * (height + 2)
  if (padded.length < need) padded = new Uint16Array(need)
  const p = padded, lut = LUT4
  p.fill(0, 0, need)
  for (let y = 0; y < height; y++) p.set(key.subarray(y * width, y * width + width), (y + 1) * PW + 1)
  for (let y = 0; y < height; y++) {
    let j = (y + 1) * PW + 1, i = y * width
    for (let x = 0; x < width; x++, i++, j++) {
      const k = p[j]
      if (!k) { out[i] = NO_JOIN; continue }
      out[i] = lut[(p[j - PW] === k ? N : 0) | (p[j - PW + 1] === k ? NE : 0) | (p[j + 1] === k ? E : 0) | (p[j + PW + 1] === k ? SE : 0)
        | (p[j + PW] === k ? S : 0) | (p[j + PW - 1] === k ? SW : 0) | (p[j - 1] === k ? W : 0) | (p[j - PW - 1] === k ? NW : 0)]
    }
  }
  return out
}
let padded = new Uint16Array(0)
