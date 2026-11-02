/**
 * Per-dot supersampling over the cell (IQ4, #65), the generic fallback for a field with no analytic filter, ported
 * from Inigo Quilez's "Filtering procedural textures" (MIT; see THIRD-PARTY-NOTICES.md): average the pattern on an
 * sx × sy grid spread over the footprint, with sx, sy set by the footprint's size times a `detail` (samples per unit),
 * so a small footprint costs one sample and a large one up to `max` per axis. The article anchors the sample grid at
 * the pixel's corner; a dot samples its centre, so the grid here is centred on the point (one sample = the plain
 * value). Costs sx·sy field calls per dot: prefer an analytic filter (./procedural.ts, ./checkers.ts, ./bandlimit.ts).
 */
import type { Field } from '../types'

/** The default cap on samples per axis (the article's MaxSamples). */
export const MAX_SAMPLES = 8

/**
 * Mean of `f` over the footprint parallelogram centred on (u, v), with edges (dux, dvx) and (duy, dvy).
 * Samples per axis: 1 + clamp(⌊detail·|edge|⌋, 0, max − 1).
 */
// after Inigo Quilez, https://iquilezles.org/articles/filtering/ (MIT)
export function filterSample(f: (u: number, v: number) => number, u: number, v: number, dux: number, dvx: number, duy: number, dvy: number,
  detail: number, max = MAX_SAMPLES): number {
  const cap = Math.max(1, Math.floor(max))
  const sx = 1 + Math.min(Math.max(Math.floor(detail * Math.sqrt(dux * dux + dvx * dvx)), 0), cap - 1)
  const sy = 1 + Math.min(Math.max(Math.floor(detail * Math.sqrt(duy * duy + dvy * dvy)), 0), cap - 1)
  if (sx === 1 && sy === 1) return f(u, v)
  let sum = 0
  for (let j = 0; j < sy; j++) {
    const t = (j + .5) / sy - .5
    for (let i = 0; i < sx; i++) {
      const s = (i + .5) / sx - .5
      sum += f(u + s * dux + t * duy, v + s * dvx + t * dvy)
    }
  }
  return sum / (sx * sy)
}

/**
 * `field` supersampled over each dot's cell: a `footprint` field (the sampler passes the cell size) that averages
 * `field` with `filterSample`. `detail` is samples per unit of u / v, so `4 * (cols - 1)` takes 4 × 4 samples a cell
 * (capped at `max` per axis). Without a footprint (any other caller) it is `field` itself. `bounds` grow by a cell,
 * since a sample half a cell out can reach into them.
 */
// after Inigo Quilez, https://iquilezles.org/articles/filtering/ (MIT)
export function supersampled(field: Field, detail: number, max = MAX_SAMPLES): Field {
  const plain = (u: number, v: number) => field(u, v)
  const out: Field = (u, v, du = 0, dv = 0) => (du > 0 || dv > 0 ? filterSample(plain, u, v, du, 0, 0, dv, detail, max) : field(u, v))
  out.footprint = true
  const b = field.bounds
  if (b) out.bounds = [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1]
  return out
}
