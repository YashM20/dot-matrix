import type { DotStyle, JointGeom, Layer } from '../types'

/**
 * One composite the join pass reads (the base, or one lattice group): the max composite over the inclusive cell
 * window `win` of a `cols`-wide sub-grid (index `(r - win[1]) * width + (c - win[0])`), its cell-centre u / v tables,
 * the card cells already hidden by lattice / site dots (`covered`, window-indexed; base only), the cell half pitch
 * `h` and lattice origin `ox` / `oy` (card px), and the frame's joint table the pass appends to.
 */
export interface JoinArgs {
  layers: Layer[]; best: Float32Array; owner: Uint32Array; win: readonly [number, number, number, number]
  us: Float64Array; vs: Float64Array; covered: Uint8Array | null; style: DotStyle
  h: number; ox: number; oy: number; joints: JointGeom[]
}
/** Per window cell: the packed join value (bits 0–11 mask, 12–15 joint slot; 0xFFFF = a plain dot) and the tone index it resolved. */
export interface JoinFrame { join: Uint16Array; tone: Uint8Array }
export type JoinEmit = (a: JoinArgs) => JoinFrame | null

/**
 * Optional sampler extensions, installed by lazy engine modules (`installSquares()`, src/engine/squares); all
 * absent by default, so a layer with `join` samples as plain dots until the squares chunk has loaded.
 */
export const samplerExt: {
  /** Join pass for one composite that has join layers: keys → masks (src/engine/squares/sampler.ts). */
  join?: JoinEmit
} = {}
