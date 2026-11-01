import type { CellBounds, Field, GridConfig } from '../types'
import { createRaster, rasterize, rasterWindow, sample, tightBounds, type Raster, type SpaceId } from '../raster/raster'
import { blur } from '../raster/ops'
import type { HeightRaster } from '../light/height'
import { lightDir, type Light, type Vec3 } from '../light/shade'

/**
 * Relief (docs/living-matter/M-materials.md §3.1): height from any field, ambient occlusion of a height raster,
 * raking light and lattice-text masks. Everything here is a bake (cached per input identity) except `rake`,
 * which is per frame and allocation-light. Units are cells of the raster's grid on all three axes.
 */

export interface FieldHeightOptions {
  /** Height in cells at field value 1 (default 2). */
  scale?: number
  /** Gaussian pre-blur radius in cells before differentiating (default 0). Kills 1-cell noise that would alias into normals. */
  smooth?: number
  /** Coverage: `field` = value > 0 (default), `all` = the whole grid, or an explicit 0..1 raster. */
  mask?: 'field' | 'all' | Raster
  space?: SpaceId
}

const PER_SOURCE = 8
const fieldHeights = new WeakMap<object, Map<string, HeightRaster>>()
const rasterIds = new WeakMap<Raster, number>()
let nextRaster = 1
const idOf = (r: Raster) => { let id = rasterIds.get(r); if (!id) rasterIds.set(r, (id = nextRaster++)); return id }
/** LRU get-or-make on a per-identity map. */
function cached<K extends object, V>(store: WeakMap<K, Map<string, V>>, owner: K, key: string, make: () => V, cap = PER_SOURCE): V {
  let per = store.get(owner)
  const hit = per?.get(key)
  if (hit !== undefined) { per!.delete(key); per!.set(key, hit); return hit }
  const v = make()
  if (!per) store.set(owner, (per = new Map()))
  per.set(key, v)
  if (per.size > cap) per.delete(per.keys().next().value!)
  return v
}

/** Cells i … end of a row: coverage (mode 0 all, 1 field > 0, 2 the mask clamped to 0..1) and the scaled height under it. */
function coverRow(mode: number, M: Float32Array, S: Float32Array, O: Float32Array, K: Float32Array, scale: number, i: number, end: number): void {
  for (; i <= end; i++) {
    const cover = mode === 0 ? 1 : mode === 1 ? (M[i] > 0 ? 1 : 0) : Math.max(0, Math.min(1, M[i]))
    K[i] = cover
    if (cover > 0) O[i] = S[i] * scale * cover
  }
}

/**
 * Height without an SDF: `field` (0..1) evaluated per cell of `grid` and scaled to cells. Stone veins, weave
 * relief, rust and ripples become relief this way. Cached like `heightRaster` (per field identity → grid,
 * space and options; LRU of 8), so calling it from `layers()` costs a map lookup. Keep the field object stable.
 * A baked raster on `grid` itself can stand in for the field: its values are used as they are, with no second
 * rasterization (≡ passing `sample(raster)`, which returns the stored value at every cell centre).
 */
export function heightFromField(field: Field | Raster, grid: GridConfig, o: FieldHeightOptions = {}): HeightRaster {
  const scale = o.scale ?? 2, smooth = o.smooth ?? 0, space = o.space ?? 'card', m = o.mask ?? 'field'
  const maskId = typeof m === 'string' ? m : `r${idOf(m)}`
  return cached(fieldHeights, field, `${grid.cols}x${grid.rows}|${space}|${scale}|${smooth}|${maskId}`, () => {
    const raw = typeof field === 'function' ? rasterize(field, grid, space) : field.grid.cols === grid.cols && field.grid.rows === grid.rows && field.space === space ? field : rasterize(sample(field), grid, space)
    const n = grid.cols * grid.rows
    const src = smooth > 0 ? blur(raw, smooth) : raw
    const out: HeightRaster = { ...createRaster(grid, space), mask: new Float32Array(n) }
    // coverage can only be non-zero inside the field's (or the mask raster's) window: visit just that, row by row
    const mode = m === 'all' ? 0 : m === 'field' ? 1 : 2, cover = typeof m === 'string' ? raw.data : m.data
    const win: CellBounds = typeof m === 'string' ? (mode === 0 ? [0, 0, grid.cols - 1, grid.rows - 1] : rasterWindow(raw)) : rasterWindow(m)
    for (let r = win[1]; r <= win[3]; r++) coverRow(mode, cover, src.data, out.data, out.mask, scale, r * grid.cols + win[0], r * grid.cols + win[2])
    out.bounds = m === 'all' ? [0, 0, grid.cols - 1, grid.rows - 1] : tightBounds({ ...out, data: out.mask, bounds: win }) ?? [0, 0, -1, -1]
    return out
  })
}

export interface AOOptions {
  /** Reach in cells (default 3). */
  radius?: number
  /** Darkening at full occlusion, 0..1 (default .75). */
  strength?: number
  /** `blur` (default): one separable blur; `horizon`: 8-direction horizon march (sharper creases, about 4× cost). */
  mode?: 'blur' | 'horizon'
}

const aos = new WeakMap<HeightRaster, Map<string, Raster>>()
/**
 * Ambient occlusion of a height raster: 1 on open surfaces, down to 1 − strength in pits, grooves and at the
 * foot of walls. Cached per height raster and options. Bake-time only (2–4 ms at 144²). The result covers the
 * whole grid (1 outside the reach of the relief), so it has no `bounds`.
 */
export function ambientOcclusion(h: HeightRaster, o: AOOptions = {}): Raster {
  const R = o.radius ?? 3, s = o.strength ?? .75, mode = o.mode ?? 'blur'
  return cached(aos, h, `${mode}|${R}|${s}`, () => {
    const { cols, rows } = h.grid, out = createRaster(h.grid, h.space), A = out.data, H = h.data
    A.fill(1)
    const pad = Math.ceil(R), [c0, r0, c1, r1] = rasterWindow(h, pad)
    if (mode === 'blur') {
      const b = blur({ ...h, bounds: rasterWindow(h, pad) }, R).data, k = 1 / (.5 * R)
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * cols + c, occ = (b[i] - H[i]) * k
        if (occ > 0) A[i] = 1 - s * (occ < 1 ? occ : 1)
      }
    } else {
      const step = R / 4
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * cols + c, h0 = H[i]
        let sum = 0
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a)
          let best = 0
          for (let j = 1; j <= 4; j++) {
            const d = j * step, x = Math.round(c + dx * d), y = Math.round(r + dy * d)
            const q = H[(y < 0 ? 0 : y >= rows ? rows - 1 : y) * cols + (x < 0 ? 0 : x >= cols ? cols - 1 : x)], dh = q - h0
            if (dh > 0) { const sinH = dh / Math.sqrt(d * d + dh * dh); if (sinH > best) best = sinH }
          }
          sum += best
        }
        if (sum > 0) A[i] = 1 - s * (sum / 8)
      }
    }
    return out
  })
}

/** `f` darkened by an AO raster on the same grid: f · ao, keeping `f.bounds`. */
export function occluded(f: Field, ao: Raster): Field {
  const a = sample(ao), g: Field = (u, v) => { const x = f(u, v); return x === 0 ? 0 : x * a(u, v) }
  g.bounds = f.bounds
  return g
}

const DEG = Math.PI / 180
/**
 * The same light with its elevation clamped into [lo, hi] radians (raking light for engraving; defaults 8° and
 * 18°, `{material.rakeElevation}`); the azimuth is kept. Point lights (the torch) pass through unchanged.
 */
export function rake(light: Light, hi = 18 * DEG, lo = 8 * DEG): Light {
  if (!Array.isArray(light)) return light
  const L = light as Vec3, h = Math.sqrt(L[0] * L[0] + L[1] * L[1]), az = h > 1e-9 ? Math.atan2(L[0], -L[1]) : 0
  const el = Math.atan2(L[2], h)
  return lightDir(az, el < lo ? lo : el > hi ? hi : el)
}

/**
 * A lattice field (a `T.big` / `T.text` result on lattice k) as a 0/1 mask raster on `grid` (any grid whose cells are
 * card cells, usually the card's own): every lattice dot lit ≥ `at` fills the k×k card cells whose centres fall in it.
 * The lattice dot of card cell c is ⌊(c + ½ − origin) / k⌋ (the sampler's lattice placement).
 */
export function cardMask(lf: { field: Field; lattice?: number | [number, number]; origin?: [number, number] }, grid: GridConfig, at = .5): Raster {
  // (square lattices; a rect lattice, squares Q2, reads its x factor)
  const k = typeof lf.lattice === 'object' ? lf.lattice[0] : lf.lattice ?? 1, [ox, oy] = lf.origin ?? [0, 0], { cols, rows } = grid
  const lc = Math.max(1, Math.floor((cols - ox) / k)), lr = Math.max(1, Math.floor((rows - oy) / k))
  const lit = new Uint8Array(lc * lr), b = lf.field.bounds
  // a bounded field (text, sprites) is 0 outside its bounds: evaluate, and fill, only the lattice window it can light
  const i0 = b ? Math.max(0, Math.floor(b[0])) : 0, j0 = b ? Math.max(0, Math.floor(b[1])) : 0
  const i1 = b ? Math.min(lc - 1, Math.ceil(b[2])) : lc - 1, j1 = b ? Math.min(lr - 1, Math.ceil(b[3])) : lr - 1
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) lit[j * lc + i] = lf.field(lc === 1 ? .5 : i / (lc - 1), lr === 1 ? .5 : j / (lr - 1)) >= at ? 1 : 0
  const out = createRaster(grid)
  const win: CellBounds = [Math.max(0, Math.floor(i0 * k + ox - .5)), Math.max(0, Math.floor(j0 * k + oy - .5)), Math.min(cols - 1, Math.ceil((i1 + 1) * k + ox)), Math.min(rows - 1, Math.ceil((j1 + 1) * k + oy))]
  if (i0 <= i1 && j0 <= j1) for (let r = win[1]; r <= win[3]; r++) {
    const j = Math.floor((r + .5 - oy) / k)
    if (j < 0 || j >= lr) continue
    for (let c = win[0]; c <= win[2]; c++) {
      const i = Math.floor((c + .5 - ox) / k)
      if (i >= 0 && i < lc && lit[j * lc + i]) out.data[r * cols + c] = 1
    }
  }
  out.bounds = (i0 <= i1 && j0 <= j1 ? tightBounds({ ...out, bounds: win }) : undefined) ?? [0, 0, -1, -1]
  return out
}

/** Row y of `insetDistance`: each lit cell's squared distance to the nearest unlit cell centre within the cap. */
function insetRow(D: Float32Array, O: Float32Array, cols: number, rows: number, y: number, at: number, k: number, c2: number): void {
  for (let x = 0, i = y * cols; x < cols; x++, i++) {
    if (!(D[i] >= at)) continue
    let best = c2
    for (let dy = -k; dy <= k; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= rows) continue
      for (let dx = -k, j = yy * cols + x - k; dx <= k; dx++, j++) {
        const xx = x + dx
        if (xx < 0 || xx >= cols || D[j] >= at) continue
        const d2 = dx * dx + dy * dy
        if (d2 < best) best = d2
      }
    }
    O[i] = .5 - Math.sqrt(best)
  }
}
/**
 * The inside half of `distanceRaster` (raster/ops.ts), banded: a lit cell (value ≥ `at`) gets .5 − its distance to the
 * nearest unlit cell centre, capped at `cap` cells; every unlit cell gets 1 (outside: no coverage, no height). For a
 * height profile that saturates within `cap − .5` cells (an engraving's wall), `heightRaster` of this ≡ `heightRaster`
 * of `distanceRaster`, bit for bit, at a fraction of the cost: a (2·cap + 1)² search per lit cell instead of two
 * full-grid distance transforms. Lazy (matter only): `raster/ops.ts` ships in first load.
 */
export function insetDistance(r: Raster, cap = 3, at = .5): Raster {
  const { cols, rows } = r.grid, out = createRaster(r.grid, r.space), k = Math.ceil(cap)
  out.data.fill(1)
  for (let y = 0; y < rows; y++) insetRow(r.data, out.data, cols, rows, y, at, k, cap * cap)
  return out
}
