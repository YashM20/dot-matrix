/**
 * Afterglow (phosphor persistence) — the decay raster owed since P3 (ADVANCED-PLAN: v′ = max(v, old·e^(−Δt/τ))).
 * A lit cell jumps to its new value at once and fades out exponentially once it goes dark, so moving
 * light leaves a trail. Pure: same inputs, same raster. The CRT skin runs the same rule per pixel on the
 * GPU (`stage.ts`: a black fill at 1 − e^(−Δt/τ), then a `lighten` composite of the new frame).
 */
import type { Raster } from '../raster/raster'

/** Share of the light a dark cell keeps after `dt` seconds with time constant `tau`. */
export const decayFactor = (dt: number, tau: number): number => (tau > 0 ? Math.exp(-Math.max(0, dt) / tau) : 0)

/**
 * Liquid-crystal response (the LCD skin): unlike phosphor (`afterglow`, max with decay) it is symmetric, a pixel
 * follows its drive both ways, v′ = v + (target − v)·(1 − e^(−Δt/τ)): a step reaches 63% after τ. The stage runs it
 * per cell on the GPU (`globalAlpha` = `ghostStep(Δt, τ)`, the new cell image drawn over the old).
 */
export const ghostStep = (dt: number, tau: number): number => (tau > 0 ? 1 - Math.exp(-Math.max(0, dt) / tau) : 1)
/** One LCD response step of a cell image (Float32, same length): `prev` moves towards `next` (pure, a new array). */
export function lcdGhost(prev: Float32Array, next: Float32Array, dt: number, tau: number): Float32Array {
  const k = ghostStep(dt, tau), out = new Float32Array(next.length)
  for (let i = 0; i < out.length; i++) out[i] = prev[i] + (next[i] - prev[i]) * k
  return out
}

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
