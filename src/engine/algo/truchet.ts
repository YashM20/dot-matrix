/**
 * Multi-scale Truchet (after Christopher Carlson, "Multi-Scale Truchet Patterns", Bridges 2018; squares Q3,
 * docs/living-matter/Q-squares.md §4.2). A quadtree of tiles at scales 1, ½, ¼: each tile is split by hash, and each
 * leaf draws one motif from {arc pair \, arc pair /, cross, bar −, bar |}: bands a third of the tile wide that meet
 * every edge at its middle third, so neighbours of one size connect. The colour inverts per level (ink = motif XOR
 * odd level), which is what lets a smaller tile read as a figure cut into its parent.
 *
 * Tiles are listed in placement order (breadth first: the top tiles, then their children, …), so a card can reveal the
 * pattern level by level: with `placed` tiles down, a point shows the deepest placed tile that holds it.
 * Pure and deterministic (inside the lint).
 */
import { hash01 } from '../math'

export interface TruchetTile {
  /** Top-left corner and side (cells), level (0 = top), motif (0 \, 1 /, 2 cross, 3 −, 4 |), first child (−1 = leaf). */
  x: number; y: number; size: number; level: number; kind: number; child: number
}
export interface TruchetOptions {
  seed: number
  /** Top tiles across and down, and their side (cells; a power of two ≥ 4 · 2^(levels − 1) keeps every band a cell wide). */
  cols: number; rows: number; size: number
  /** Levels (default 3: scales 1, ½, ¼). */
  levels?: number
  /** Chance a tile splits, per level (default [.55, .4]). */
  split?: readonly number[]
}
/** The tiles in placement order. */
export function truchetTiles(o: TruchetOptions): TruchetTile[] {
  const levels = o.levels ?? 3, split = o.split ?? [.55, .4], out: TruchetTile[] = []
  const kindOf = (i: number) => { const h = hash01(o.seed, i, 11); return h < .43 ? 0 : h < .86 ? 1 : h < .93 ? 2 : h < .965 ? 3 : 4 }
  for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) out.push({ x: c * o.size, y: r * o.size, size: o.size, level: 0, kind: kindOf(out.length), child: -1 })
  // breadth first: a tile's children are appended when it is reached, so every level follows the one above
  for (let i = 0; i < out.length; i++) {
    const t = out[i]
    if (t.level >= levels - 1 || hash01(o.seed, i, 13) >= (split[t.level] ?? 0)) continue
    t.child = out.length
    const h = t.size / 2
    for (let k = 0; k < 4; k++) out.push({ x: t.x + (k & 1) * h, y: t.y + (k >> 1) * h, size: h, level: t.level + 1, kind: kindOf(out.length), child: -1 })
  }
  return out
}
const B = 1 / 6
/** A motif at local (x, y) ∈ [0, 1]²: is it ink (before the level's inversion)? */
export function motifAt(kind: number, x: number, y: number): boolean {
  const ring = (cx: number, cy: number) => { const dx = x - cx, dy = y - cy; return Math.abs(Math.sqrt(dx * dx + dy * dy) - .5) <= B }
  const stub = (cx: number, cy: number) => { const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= B * B }
  switch (kind) {
    case 0: return ring(0, 0) || ring(1, 1)
    case 1: return ring(1, 0) || ring(0, 1)
    case 2: return Math.abs(x - .5) <= B || Math.abs(y - .5) <= B
    case 3: return Math.abs(y - .5) <= B || stub(.5, 0) || stub(.5, 1)
    default: return Math.abs(x - .5) <= B || stub(0, .5) || stub(1, .5)
  }
}
/**
 * The tile that shows at cell point (px, py) once `placed` tiles are down (−1 = none yet): the deepest placed tile
 * holding the point. `cols` = top tiles across.
 */
export function truchetTileAt(tiles: TruchetTile[], cols: number, rows: number, px: number, py: number, placed = tiles.length): number {
  const size = tiles[0]?.size ?? 1, c = Math.floor(px / size), r = Math.floor(py / size)
  if (c < 0 || r < 0 || c >= cols || r >= rows) return -1
  let i = r * cols + c
  if (i >= placed) return -1
  for (;;) {
    const t = tiles[i]
    if (t.child < 0) return i
    const h = t.size / 2, k = (px >= t.x + h ? 1 : 0) + (py >= t.y + h ? 2 : 0), ch = t.child + k
    if (ch >= placed) return i
    i = ch
  }
}
/** Ink (1) or paper (0) at cell point (px, py): the shown tile's motif, inverted on odd levels. */
export function truchetInk(tiles: TruchetTile[], cols: number, rows: number, px: number, py: number, placed = tiles.length): number {
  const i = truchetTileAt(tiles, cols, rows, px, py, placed)
  if (i < 0) return 0
  const t = tiles[i], on = motifAt(t.kind, (px - t.x) / t.size, (py - t.y) / t.size)
  return on !== ((t.level & 1) === 1) ? 1 : 0
}
