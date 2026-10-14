import { hash01 } from '../math'

/**
 * Reveal masks: a static rank in [0, 1) per cell. A transition at progress `p` shows every dot
 * whose rank is below `p`, so each dot flips exactly once, in mask order — the crisp, digital
 * dissolve of a dot display instead of a muddy cross-fade.
 */
export type Mask = (col: number, row: number, cols: number, rows: number) => number

/** Bayer ordered-dither threshold table, side 2^k (k=3 → 8×8), values (i + .5) / n². */
export function bayerTable(k = 3): Float32Array {
  let m = [[0]]
  for (let level = 0; level < k; level++) {
    const n = m.length, next: number[][] = []
    for (let y = 0; y < 2 * n; y++) {
      next.push([])
      for (let x = 0; x < 2 * n; x++) next[y][x] = 4 * m[y % n][x % n] + [0, 2, 3, 1][(y < n ? 0 : 2) + (x < n ? 0 : 1)]
    }
    m = next
  }
  const n = m.length, out = new Float32Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = (m[y][x] + .5) / (n * n)
  return out
}
const B8 = bayerTable(3)
const frac = (x: number) => x - Math.floor(x)

export const masks = {
  /** Classic 8×8 ordered dither — the "digital" dissolve. */
  bayer: ((c, r) => B8[(r & 7) * 8 + (c & 7)]) as Mask,
  /** Interleaved gradient noise (Jimenez 2014): cheap, low-discrepancy, less grid-like than Bayer. */
  ign: ((c, r) => frac(52.9829189 * frac(0.06711056 * c + 0.00583715 * r))) as Mask,
  /** Hash noise: no structure at all (sparkly). */
  noise: ((c, r) => hash01(c, r, 17)) as Mask,
  /** Top-left → bottom-right sweep. */
  diagonal: ((c, r, cols, rows) => (c / Math.max(1, cols - 1) + r / Math.max(1, rows - 1)) / 2.0001) as Mask,
  /** Left → right wipe. */
  wipe: ((c, _r, cols) => c / Math.max(1, cols)) as Mask,
  /** Centre outwards. */
  radial: ((c, r, cols, rows) => Math.min(.9999, Math.hypot(c / Math.max(1, cols - 1) - .5, r / Math.max(1, rows - 1) - .5) / Math.SQRT1_2)) as Mask,
  /** Outer columns first, closing to the middle (Vestaboard "curtain", inverted). */
  curtain: ((c, _r, cols) => Math.min(.9999, 1 - Math.abs(c / Math.max(1, cols - 1) - .5) * 2)) as Mask,
  /** Rows top → bottom: the LED lamp-test scan. */
  scan: ((_c, r, _cols, rows) => r / Math.max(1, rows)) as Mask,
}
export type MaskName = keyof typeof masks

/** A geometric sweep with a dithered edge: `k` of the rank comes from the dither, so the front is ragged in dots, not a line. */
export function ditherEdge(geometry: Mask, dither: Mask = masks.bayer, k = .25): Mask {
  return (c, r, cols, rows) => Math.min(.9999, (1 - k) * geometry(c, r, cols, rows) + k * dither(c, r, cols, rows))
}
/** Resolve a mask by name (unknown names fall back to Bayer). */
export const maskByName = (name: string | undefined): Mask => (name && name in masks ? masks[name as MaskName] : masks.bayer)
