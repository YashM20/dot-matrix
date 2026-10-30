/**
 * Dot ↔ square morphs (docs/living-matter/Q-squares.md §4.3, squares Q3). A wavefront sweeps the layers' own u/v from
 * `from`: behind it a cell's roundness goes 0 → 1 (`shapeOf`, snapped to 1/8), and the sampler keeps each dot's ink
 * (`samplerExt.ink`: the half side scales by √(A(n_style) / A(n))), so the tone holds while the shape turns. Cells the
 * front has fully passed (w = 1) join (`opts.join`), so the quarter-tile masks appear last and read as fusing.
 * Pure and deterministic (inside the determinism lint).
 */
import type { Field, JoinSpec, Layer } from '../types'

export interface MorphOptions {
  /** Where the front starts, in the layers' u/v (default [.5, 0]: the top edge's centre, a horizontal front). */
  from?: [number, number]
  /** Width of the front, as a fraction of the longest distance (default .25). */
  width?: number
  /** Join the cells the front has passed (w = 1); unset = no joins. */
  join?: JoinSpec | true
  /** Distance metric: 'row' (|v − from.v|, a straight front; the default) or 'radial'. */
  metric?: 'row' | 'radial'
}
/** The front's progress w ∈ [0, 1] at (u, v) for morph position k ∈ [0, 1]: 0 = still a dot, 1 = a square. */
export function morphFront(k: number, u: number, v: number, opts: MorphOptions = {}): number {
  const [fu, fv] = opts.from ?? [.5, 0], width = opts.width ?? .25
  let d: number
  if (opts.metric === 'radial') {
    const du = u - fu, dv = v - fv, mu = Math.max(fu, 1 - fu), mv = Math.max(fv, 1 - fv)
    d = Math.sqrt(du * du + dv * dv) / Math.sqrt(mu * mu + mv * mv)
  } else d = Math.abs(v - fv) / Math.max(fv, 1 - fv)
  const x = Math.max(0, Math.min(1, (Math.max(0, Math.min(1, k)) * (1 + width) - d) / width))
  return x * x * (3 - 2 * x)
}
const masked = (f: Field, keep: (u: number, v: number) => boolean): Field => {
  const g: Field = (u, v) => (keep(u, v) ? f(u, v) : 0)
  if (f.bounds) g.bounds = f.bounds
  return g
}
/**
 * Wrap `layers` so cells turn from dots to squares along a wavefront at position `k` (0 = the layers as they are,
 * 1 = every cell square, and joined when `opts.join` is set). A cell the front hasn't reached keeps the style's shape
 * (`shapeOf` → undefined), so k = 0 samples exactly as the layers do. With `join`, each layer is split in two: the cells
 * still turning, and the cells the front has passed, which join.
 */
export function squareMorph(layers: Layer[], k: number, opts: MorphOptions = {}): Layer[] {
  const w = (u: number, v: number) => morphFront(k, u, v, opts)
  const shapeOf = (_: number, u: number, v: number) => { const x = w(u, v); return x > 0 ? x : undefined }
  return layers.flatMap((l): Layer[] => {
    if (l.sites) return [{ ...l, shapeOf }]
    if (!opts.join) return [{ ...l, shapeOf }]
    return [
      { ...l, field: masked(l.field, (u, v) => w(u, v) < 1), shapeOf },
      { ...l, field: masked(l.field, (u, v) => w(u, v) >= 1), shapeOf: () => 1, join: opts.join },
    ]
  })
}
