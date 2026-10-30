/**
 * Block glitch (squares Q3, docs/living-matter/Q-squares.md §4.2): per time bucket `step`, `hash32(seed, step, b)`
 * picks `blocks` rectangles in whole cells of a cols × rows grid; inside each, the field is read from a horizontal
 * shift of whole cells (wrapping inside the block) and, for some, one tone band up or down. Only tones change, never
 * hue. `step < 0` is the identity (no burst). Pure and deterministic (inside the lint).
 */
import type { Field } from '../types'
import { hash32 } from '../math'

export interface GlitchBlock { x: number; y: number; w: number; h: number; shift: number; tone: number }
export interface GlitchOptions { seed: number; step: number; blocks: number; maxShift: number; cols: number; rows: number; /** Largest block side (cells; default a third of the grid). */ maxSide?: number }

/** The blocks of one burst (empty when step < 0). */
export function glitchBlocks(o: GlitchOptions): GlitchBlock[] {
  if (o.step < 0) return []
  const out: GlitchBlock[] = [], side = o.maxSide ?? Math.max(2, Math.floor(Math.min(o.cols, o.rows) / 3))
  for (let b = 0; b < o.blocks; b++) {
    const h0 = hash32(o.seed, o.step, b), h1 = hash32(o.seed + 1, o.step, b)
    const w = 2 + (h0 % (side * 2)), h = 1 + ((h0 >>> 8) % Math.max(1, side >> 1))
    const x = (h0 >>> 16) % Math.max(1, o.cols - w), y = h1 % Math.max(1, o.rows - h)
    const shift = (1 + ((h1 >>> 8) % Math.max(1, o.maxShift))) * ((h1 >>> 20) & 1 ? 1 : -1)
    out.push({ x, y, w: Math.min(w, o.cols), h, shift, tone: ((h1 >>> 24) & 3) === 0 ? .25 : ((h1 >>> 24) & 3) === 1 ? -.25 : 0 })
  }
  return out
}
/** `field` with one burst of block shifts applied (the last block wins where blocks overlap). */
export function blockGlitch(field: Field, o: GlitchOptions): Field {
  const blocks = glitchBlocks(o)
  if (!blocks.length) return field
  const X = Math.max(1, o.cols - 1), Y = Math.max(1, o.rows - 1)
  const g: Field = (u, v) => {
    const c = Math.round(u * X), r = Math.round(v * Y)
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]
      if (c < b.x || c >= b.x + b.w || r < b.y || r >= b.y + b.h) continue
      const sc = b.x + ((((c - b.x - b.shift) % b.w) + b.w) % b.w), val = field(sc / X, v)
      return val > 0 ? Math.max(0, Math.min(1, val + b.tone)) : 0
    }
    return field(u, v)
  }
  if (field.bounds) g.bounds = field.bounds
  return g
}
