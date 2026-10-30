/**
 * Schotter (Georg Nees, 1968) and a Molnár-style ring study (squares Q3, docs/living-matter/Q-squares.md §4.2).
 *
 * Schotter: a cols × rows grid of squares, order at the top and rubble at the bottom. Row i carries disorder
 * d = k · i / (rows − 1); each square is offset by up to ±d / 2 of a cell per axis (quantized to ¼ cell) and turned
 * 45° with probability d. Rotation is snapped to the two states a square has (0, π/4): a lattice of squares can only
 * show those. The draws are hashed per square, so raising k makes the same squares wander further: disorder is
 * monotone in k as well as by row.
 * Molnár: nested square rings, each drawn as dot sites along its perimeter, with a hashed side jitter per ring.
 * Pure and deterministic (inside the lint).
 */
import { hash01 } from '../math'

export interface SchotterSquare {
  /** Grid column and row, and the square's id (row-major). */
  col: number; row: number; id: number
  /** Centre in cells (col + .5 + dx, row + .5 + dy); dx, dy multiples of ¼. */
  x: number; y: number
  /** 0 or π/4 (radians). */
  rot: number
  /** The row's disorder d ∈ [0, k]. */
  d: number
}
export interface SchotterOptions { cols?: number; rows?: number; seed?: number; /** Overall disorder (default 1). */ k?: number }

/** Nees' Schotter: one square per cell, disorder growing down the rows. */
export function schotter(o: SchotterOptions = {}): SchotterSquare[] {
  const cols = o.cols ?? 12, rows = o.rows ?? 22, seed = o.seed ?? 1, k = Math.max(0, Math.min(1, o.k ?? 1)), out: SchotterSquare[] = []
  for (let row = 0; row < rows; row++) {
    const d = k * row / Math.max(1, rows - 1)
    for (let col = 0; col < cols; col++) {
      const id = row * cols + col, q = (x: number) => Math.round(x * 4) / 4
      const dx = q((hash01(seed, id, 1) - .5) * d), dy = q((hash01(seed, id, 2) - .5) * d)
      out.push({ col, row, id, x: col + .5 + dx, y: row + .5 + dy, rot: hash01(seed, id, 3) < d ? Math.PI / 4 : 0, d })
    }
  }
  return out
}

export interface MolnarOptions { cx: number; cy: number; rings: number; /** Side of the outermost ring and the step between rings (cells). */ side: number; step: number; seed?: number; jitter?: number; /** Site spacing along a side (cells, default 1). */ pitch?: number }
/** Dot sites along nested square perimeters (Vera Molnár's (Dés)ordres): ring j's side is jittered by up to ±jitter. */
export function molnar(o: MolnarOptions): { x: number; y: number; ring: number }[] {
  const out: { x: number; y: number; ring: number }[] = [], pitch = o.pitch ?? 1, seed = o.seed ?? 1, jitter = o.jitter ?? .5
  for (let j = 0; j < o.rings; j++) {
    const side = o.side - j * o.step + Math.round((hash01(seed, j, 7) - .5) * 2 * jitter * 2) / 2
    if (side <= 0) break
    const half = side / 2, n = Math.max(1, Math.round(side / pitch))
    for (let s = 0; s < 4; s++) for (let i = 0; i < n; i++) {
      const a = -half + i * side / n
      const [x, y] = s === 0 ? [a, -half] : s === 1 ? [half, a] : s === 2 ? [-a, half] : [-half, -a]
      out.push({ x: o.cx + x, y: o.cy + y, ring: j })
    }
  }
  return out
}
