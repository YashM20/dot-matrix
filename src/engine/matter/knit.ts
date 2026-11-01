import type { CellBounds, GridConfig } from '../types'
import type { HeightRaster } from '../light/height'
import { createRaster } from '../raster/raster'
import type { TangentRaster } from './aniso'

/**
 * Knitted fabric (docs/living-matter/M-materials.md §5, `mat-knit`): stockinette as two leaning loop arms per stitch
 * (the V), purl columns as horizontal bumps, and a rope cable whose two strands cross every `every` rows. A pure
 * function of fabric cells, baked to a height raster plus the tangent along each loop arm (for the Kajiya–Kay sheen).
 *
 * Periods: a stitch is `stitch[0]` cells wide (two legs, each half of it: ≥ 3 cells with a cross-profile) and
 * `stitch[1]` cells tall (the V repeats every row: ≥ 2). A cable repeats every 2 · `every` rows.
 */
export interface KnitOptions {
  /** Stitch size in cells, [width, height] (default [6, 4]: two 3-cell legs, a 4-cell row). */
  stitch?: readonly [number, number]
  /** Leg slope, cells across per cell down (default .35): the legs lean in toward the V's foot. */
  lean?: number
  /** Loop height in cells (default 1.2). */
  lift?: number
  /** Stitch columns knitted purl side out (horizontal bumps), e.g. the frame round a cable. */
  purl?: readonly number[]
  /** A rope cable: its first stitch column, 4 columns wide (two strands of 2), crossing every `every` rows (default 8) over `cross` rows (default 3). */
  cable?: { col: number; every?: number; cross?: number }
}
export interface KnitRelief { height: HeightRaster; tangent: TangentRaster }

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const mod = (a: number, n: number) => ((a % n) + n) % n
/** One stitch's legs at (fx, fy) in its own cells (centres at + .5): height and the leg's tangent x (y is 1, unnormalised). */
function legs(fx: number, fy: number, W: number, H: number, lean: number, lift: number, out: Float64Array): number {
  const x = fx + .5, y = fy + .5, k = lean * (y - H / 2), hw = W / 4, bulge = .75 + .25 * Math.sin(Math.PI * y / H)
  // this stitch's two legs (left leans +, right −) and the neighbours' legs that reach into it
  let best = 0, tx = 0
  for (let q = 0; q < 4; q++) {
    const c = q === 0 ? W / 4 + k : q === 1 ? 3 * W / 4 - k : q === 2 ? 3 * W / 4 - k - W : W / 4 + k + W
    const d = Math.abs(x - c) / hw
    if (d >= 1) continue
    const h = lift * Math.sqrt(1 - d * d) * bulge
    if (h > best) { best = h; tx = q === 0 || q === 3 ? lean : -lean }
  }
  out[0] = best; out[1] = tx; out[2] = 1
  return best
}
/** A purl bump: a horizontal loop across the column, mid-row; the rows between bumps are a void crease (|v| ≥ .7). */
function purlBump(fx: number, fy: number, W: number, H: number, lift: number, out: Float64Array): number {
  const v = (fy + .5 - H / 2) / (H / 2), u = (fx + .5) / W
  const h = v * v < .49 ? lift * .9 * Math.sqrt(1 - v * v) * (.85 + .15 * Math.cos(2 * Math.PI * (u - .5))) : 0
  out[0] = h; out[1] = 1; out[2] = 0
  return h
}
/** The left strand's slot (0 = left, 1 = right) at fabric row position yr (rows); it is in front while it crosses rightward (q < cross). */
function strand(yr: number, every: number, cross: number): number {
  const q = mod(yr, 2 * every)
  if (q < cross) return smooth(q / cross)
  if (q < every) return 1
  if (q < every + cross) return 1 - smooth((q - every) / cross)
  return 0
}
/** d(slot)/d(row) of the left strand (rows⁻¹), by central difference. */
const strandSlope = (yr: number, every: number, cross: number) => (strand(yr + .05, every, cross) - strand(yr - .05, every, cross)) / .1

/**
 * The fabric at cell (x, y) (cells from the fabric's origin, x right, y down; row j = ⌊y / height⌋): height in
 * cells, and the surface tangent (unnormalised) into `out` = [h, tx, ty]. Exported for the checks.
 */
export function knitAt(x: number, y: number, o: KnitOptions = {}, out: Float64Array = new Float64Array(3)): Float64Array {
  const [W, H] = o.stitch ?? [6, 4], lean = o.lean ?? .35, lift = o.lift ?? 1.2
  const col = Math.floor(x / W), fy = mod(y, H)
  if (o.cable && col >= o.cable.col && col < o.cable.col + 4) {
    const every = o.cable.every ?? 8, cross = o.cable.cross ?? 3, yr = (y + .5) / H
    const sa = strand(yr, every, cross), q = mod(yr, 2 * every), frontA = q < cross, slope = strandSlope(yr, every, cross) * 2 * W / H
    const bx = x - o.cable.col * W, crossing = q < cross || (q >= every && q < every + cross)
    let best = -Infinity, tx = 0, ty = 1
    for (let s = 0; s < 2; s++) {
      const slot = s ? 1 - sa : sa, front = s ? !frontA : frontA, dir = s ? -1 : 1
      const lx = bx - slot * 2 * W
      if (lx < -.5 || lx >= 2 * W - .5) continue
      legs(mod(lx, W), fy, W, H, lean, lift, out)
      if (out[0] <= 0) continue
      // the strand in front rides up over the crossing, the one behind dips under it
      const h = out[0] + (crossing ? (front ? .45 * lift : -.35 * lift) : 0)
      if (h > best) { best = h; tx = out[1] + dir * slope; ty = 1 }
    }
    if (best === -Infinity) { purlBump(mod(x, W), fy, W, H, lift, out); out[0] *= .55; return out } // reverse stockinette behind the cable
    out[0] = best; out[1] = tx; out[2] = ty
    return out
  }
  if (o.purl?.includes(col)) { purlBump(mod(x, W), fy, W, H, lift, out); return out }
  legs(mod(x, W), fy, W, H, lean, lift, out)
  return out
}

/**
 * The fabric relief over `box` of `grid` (cells), with fabric row `y0` (cells) at the box's top: height (mask = the
 * loops, 0 in the crevices between them) and the unit tangent along each arm. A bake (one `knitAt` per cell).
 */
export function knitRelief(grid: GridConfig, box: CellBounds, o: KnitOptions & { y0?: number; floor?: number } = {}): KnitRelief {
  const { cols, rows } = grid, n = cols * rows, h: HeightRaster = { ...createRaster(grid, 'card', box), mask: new Float32Array(n) }
  const tx = new Float32Array(n), ty = new Float32Array(n), out = new Float64Array(3), y0 = o.y0 ?? 0, floor = o.floor ?? .05
  for (let r = Math.max(0, box[1]); r <= Math.min(rows - 1, box[3]); r++) for (let c = Math.max(0, box[0]); c <= Math.min(cols - 1, box[2]); c++) {
    knitAt(c - box[0], r - box[1] + y0, o, out)
    const i = r * cols + c
    // below `floor` (cells) a cell is crevice: void between the loops
    if (out[0] <= floor) continue
    const l = Math.sqrt(out[1] * out[1] + out[2] * out[2]) || 1
    h.data[i] = out[0]; h.mask[i] = 1; tx[i] = out[1] / l; ty[i] = out[2] / l
  }
  return { height: h, tangent: { grid, x: tx, y: ty, bounds: box } }
}
