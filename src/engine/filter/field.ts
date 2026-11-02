/**
 * Footprint fields (IQ4, #65): the glue between the filtered patterns and the grid sampler. A field that sets
 * `footprint` is called as `f(u, v, du, dv)`, with `du` / `dv` one cell of the grid it is sampled on
 * (`Field.footprint`, src/engine/types.ts); every other field is sampled exactly as before.
 */
import type { Field } from '../types'
import type { Pattern } from './procedural'

/** Mark `f` as a footprint field: the sampler passes it the cell size (du, dv); without one, du = dv = 0. */
export function withFootprint(f: (u: number, v: number, du: number, dv: number) => number): Field {
  const out: Field = (u, v, du = 0, dv = 0) => f(u, v, du, dv)
  out.footprint = true
  return out
}

/**
 * A filtered pattern (./procedural.ts, ./checkers.ts) laid over the card: p = (ox + u·sx, oy + v·sy), so `sx` / `sy`
 * pattern units span the card, and the footprint is one cell in those units, (du·sx, 0) and (0, dv·sy). Sampled with
 * no footprint (a caller other than the sampler), it is the plain pattern.
 */
export const patternField = (pattern: Pattern, sx: number, sy = sx, ox = 0, oy = 0): Field =>
  withFootprint((u, v, du, dv) => pattern(ox + u * sx, oy + v * sy, du * sx, 0, 0, dv * sy))
