/**
 * Droplet hydraulic erosion on a height raster (H. T. Beyer, "Implementation of a method for hydraulic erosion",
 * TUM 2015). Each droplet runs downhill with a little inertia, picks up sediment while it speeds up and has room for
 * it, and drops it where it slows, climbs or evaporates. Droplets come in a fixed seeded order (droplet i always starts
 * at the same place), so the first N of them are one state whatever the batches they ran in: `rain(h, 0, 900)` ≡
 * `rain(h, 0, 400)` then `rain(h, 400, 900)`, bit for bit. Deterministic (F0.9): `rngFor`, + − × ÷ and `Math.sqrt`
 * only, which IEEE 754 rounds the same in every engine.
 */
import { rngFor } from '../noise/dmath'

export interface ErosionParams {
  /** How much of its old direction a droplet keeps each step (default .05). */
  inertia: number
  /** Sediment capacity factor K (default 4) and its floor on flat ground (default .01). */
  capacity: number
  minSlope: number
  /** Fraction of the free capacity eroded, of the excess deposited, per step (defaults .3, .3). */
  erode: number
  deposit: number
  /** Water lost per step (default .01), gravity (default 4). */
  evaporate: number
  gravity: number
  /** Erosion brush radius in cells (default 3) and steps a droplet lives (default 30). */
  radius: number
  lifetime: number
}
export const EROSION: ErosionParams = { inertia: .05, capacity: 4, minSlope: .01, erode: .3, deposit: .3, evaporate: .01, gravity: 4, radius: 3, lifetime: 30 }

export interface Terrain {
  cols: number
  rows: number
  /** Heights, row-major; changed in place. */
  h: Float32Array
  /** How easily each cell erodes, 0..1 (absent: every cell 1). A glyph's walls get less. */
  soft?: Float32Array
  /** Where droplets fall and run, cells [x0, y0, x1, y1] (absent: the raster); a droplet that leaves it is gone. */
  region?: readonly [number, number, number, number]
}

interface Brush { di: Int32Array; w: Float64Array }
const brushes = new Map<string, Brush>()
/** Offsets within `radius` and their weights max(0, radius − d), in a fixed order. */
function brushOf(cols: number, radius: number): Brush {
  const key = `${cols}|${radius}`, hit = brushes.get(key)
  if (hit) return hit
  const di: number[] = [], w: number[] = [], R = Math.ceil(radius)
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.sqrt(x * x + y * y)
    if (d < radius) { di.push(y * cols + x); w.push(radius - d) }
  }
  const b = { di: Int32Array.from(di), w: Float64Array.from(w) }
  brushes.set(key, b)
  return b
}

/** Height and gradient at (x, y) by bilinear interpolation of the four cells round it (x, y inside the raster). */
function sampleAt(h: Float32Array, cols: number, x: number, y: number, out: Float64Array): void {
  const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, i = iy * cols + ix
  const nw = h[i], ne = h[i + 1], sw = h[i + cols], se = h[i + cols + 1]
  out[0] = nw * (1 - u) * (1 - v) + ne * u * (1 - v) + sw * (1 - u) * v + se * u * v
  out[1] = (ne - nw) * (1 - v) + (se - sw) * v
  out[2] = (sw - nw) * (1 - u) + (se - ne) * u
}

/**
 * Run droplets `from` … `to` − 1 of the seeded sequence over the terrain, in place. Returns the sediment still carried
 * when droplets ended (mass check: removed − deposited − carried = 0 up to rounding). `trace` receives each step's
 * position (droplet index, x, y) when given: a card draws the rain from it.
 */
export function rain(t: Terrain, from: number, to: number, seed: number, p: ErosionParams = EROSION, trace?: (i: number, x: number, y: number) => void): number {
  const { cols, rows, h, soft } = t, b = brushOf(cols, p.radius), s = new Float64Array(3), s2 = new Float64Array(3)
  // droplets live inside the region, and the brush reaches R cells past a droplet: keep both on the raster
  const R = Math.ceil(p.radius), [ra, rb, rc, rd] = t.region ?? [0, 0, cols - 1, rows - 1]
  const rx0 = Math.max(ra, R), ry0 = Math.max(rb, R), rx1 = Math.min(rc, cols - 2 - R), ry1 = Math.min(rd, rows - 2 - R)
  let wsum = 0
  for (let k = 0; k < b.w.length; k++) wsum += b.w[k]
  const BW = b.w.length, inertia = p.inertia, keep = 1 - p.inertia
  let lost = 0
  for (let d = from; d < to; d++) {
    const r = rngFor(seed, d)
    let x = rx0 + r() * (rx1 - rx0), y = ry0 + r() * (ry1 - ry0), dx = 0, dy = 0, speed = 1, water = 1, sed = 0
    for (let life = 0; life < p.lifetime; life++) {
      const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, i = iy * cols + ix
      sampleAt(h, cols, x, y, s)
      dx = dx * inertia - s[1] * keep; dy = dy * inertia - s[2] * keep
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len === 0) break
      dx /= len; dy /= len
      const nx = x + dx, ny = y + dy
      // off the region: the droplet runs off the stone with what it carries
      if (nx < rx0 || ny < ry0 || nx > rx1 || ny > ry1) break
      sampleAt(h, cols, nx, ny, s2)
      const dh = s2[0] - s[0], cap = Math.max(-dh, p.minSlope) * speed * water * p.capacity
      if (sed > cap || dh > 0) {
        // uphill: fill the pit behind it (no more than the climb); else drop a share of the excess
        const put = dh > 0 ? Math.min(dh, sed) : (sed - cap) * p.deposit
        sed -= put
        h[i] += put * (1 - u) * (1 - v); h[i + 1] += put * u * (1 - v); h[i + cols] += put * (1 - u) * v; h[i + cols + 1] += put * u * v
      } else {
        // erode no deeper than the drop, spread over the brush (always on the raster: see rx0 … ry1)
        const take = Math.min((cap - sed) * p.erode, -dh) / wsum
        for (let k = 0; k < BW; k++) {
          const j = i + b.di[k], want = take * b.w[k] * (soft ? soft[j] : 1), got = h[j] < want ? h[j] : want
          h[j] -= got; sed += got
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * p.gravity))
      water *= 1 - p.evaporate
      x = nx; y = ny
      if (trace) trace(d, x, y)
    }
    lost += sed
  }
  return lost
}
