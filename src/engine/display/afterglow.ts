/**
 * Afterglow (phosphor persistence) — the decay raster owed since P3 (ADVANCED-PLAN: v′ = max(v, old·e^(−Δt/τ))).
 * A lit cell jumps to its new value at once and fades out exponentially once it goes dark, so moving
 * light leaves a trail. Pure: same inputs, same raster. The CRT skin runs the same rule per pixel on the
 * GPU (`stage.ts`: a black fill at 1 − e^(−Δt/τ), then a `lighten` composite of the new frame).
 */
import type { Raster } from '../raster/raster'

/** Share of the light a dark cell keeps after `dt` seconds with time constant `tau`. */
export const decayFactor = (dt: number, tau: number): number => (tau > 0 ? Math.exp(-Math.max(0, dt) / tau) : 0)

/** Seconds until a full-on cell has faded below `floor` (when a persistence stage can stop drawing). */
export const settleSeconds = (tau: number, floor = 1 / 255): number => (tau > 0 ? tau * Math.log(1 / floor) : 0)

/**
 * `next` with the afterglow of `prev` (null = nothing was lit): each cell is max(next, prev·e^(−Δt/τ)).
 * Rasters must share a grid; the result keeps `next`'s grid and space, and its bounds cover both.
 */
export function afterglow(prev: Raster | null, next: Raster, dt: number, tau: number): Raster {
  const data = Float32Array.from(next.data)
  if (!prev) return { ...next, data }
  if (prev.data.length !== data.length) throw new Error('afterglow: rasters must share a grid')
  const k = decayFactor(dt, tau), p = prev.data
  for (let i = 0; i < data.length; i++) { const g = p[i] * k; if (g > data[i]) data[i] = g < 1e-6 ? 0 : g }
  const a = prev.bounds, b = next.bounds
  const bounds = a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] as Raster['bounds'] : undefined
  return { grid: next.grid, space: next.space, data, bounds }
}
