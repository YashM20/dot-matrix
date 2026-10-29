import type { DotBuffer } from '../buffer/dotBuffer'
import type { DotInstance, DotStyle, JointGeom, Layer } from '../types'

/**
 * One composite the join pass reads (the base, or one lattice group): the max composite over the inclusive cell
 * window `win` of a `cols`-wide sub-grid (index `(r - win[1]) * width + (c - win[0])`), its cell-centre u / v tables,
 * the card cells already hidden by lattice / site dots (`covered`, window-indexed; base only), the cell half pitch
 * `h` (`hy` down a rect lattice) and lattice origin `ox` / `oy` (card px), and the frame's joint table the pass appends to.
 */
export interface JoinArgs {
  layers: Layer[]; best: Float32Array; owner: Uint32Array; win: readonly [number, number, number, number]
  us: Float64Array; vs: Float64Array; covered: Uint8Array | null; style: DotStyle
  h: number; hy?: number; ox: number; oy: number; joints: JointGeom[]
}
/** Per window cell: the packed join value (bits 0–11 mask, 12–15 joint slot; 0xFFFF = a plain dot), the tone index it resolved, and the form code (15 = frame style). */
export interface JoinFrame { join: Uint16Array; tone: Uint8Array; form: Uint8Array }

/**
 * Optional sampler and DotBuffer extensions, installed by lazy engine modules (`installSquares()`, src/engine/squares);
 * all absent by default, so a layer with `join` / `shapeOf` samples as plain dots until the squares chunk has loaded.
 * A packed join other than 0xFFFF or a form code other than 15 only exists once they are installed; a rect cell's
 * aspect (squares Q2) is computed by the core and dropped (a plain dot of half side rx) until they are.
 */
export const samplerExt: {
  /** Join / form pass for one composite that has join or shapeOf layers: keys → masks, and per-dot form codes. */
  join?: (a: JoinArgs) => JoinFrame
  /** Form code of a `shapeOf` site dot: its roundness step 0–8, or 15 (the frame style). */
  form?: (layer: Layer, value: number, u: number, v: number) => number
  /** Stamp a packed join / form code and a rect cell's aspect (ry / rx, 1 = none) onto an array-path dot (`joints`: the frame's joint table). */
  stamp?: (d: DotInstance, join: number, form: number, joints: JointGeom[] | null, aspect: number) => void
  /** Write a buffer dot's packed join / form code and aspect (allocating `ext` on first use). */
  push?: (buf: DotBuffer, i: number, join: number, form: number, aspect: number) => void
  /** Attach a transferred `ext` store to a buffer; regrow `ext` to the buffer's new capacity keeping `n` dots; decode it into `toDots` output. */
  attach?: (buf: DotBuffer, ext: ArrayBuffer) => void
  grow?: (buf: DotBuffer, n: number) => void
  decode?: (buf: DotBuffer, out: DotInstance[]) => void
} = {}
