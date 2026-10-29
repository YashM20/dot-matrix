import type { CellBounds, Field, GridConfig, Layer } from '../types'
import type { NormalRaster } from '../light/height'
import type { Light, ShadeOptions, Vec3 } from '../light/shade'
import { GLOSS_BANDS, placed, toneBands, type Placement, type ToneBand } from '../light/material'
import { createRaster, rasterize, sample, type Raster } from '../raster/raster'

/**
 * Anisotropic sheen (Kajiya–Kay, docs/living-matter/M-materials.md §3.1): brushed and spun metal, threads and
 * lacquered grain. A tangent raster says which way the grooves or fibres run; the highlight stretches *across*
 * them. Tangent rasters are constants (bake once); `anisoSpec` is one typed-array pass per frame.
 */

/** Unit surface-plane tangents per cell (the direction of the grooves, fibres or threads), struct of arrays. */
export interface TangentRaster { grid: GridConfig; x: Float32Array; y: Float32Array; bounds?: CellBounds }

const make = (grid: GridConfig, bounds?: CellBounds): TangentRaster => ({ grid, x: new Float32Array(grid.cols * grid.rows), y: new Float32Array(grid.cols * grid.rows), bounds })

/** Brushed: every tangent at `angle` (radians, 0 = along +x). */
export function tangentLinear(grid: GridConfig, angle: number, bounds?: CellBounds): TangentRaster {
  const t = make(grid, bounds)
  t.x.fill(Math.cos(angle)); t.y.fill(Math.sin(angle))
  return t
}

/** Spun: around (cx, cy) in cells; `circumferential` (lathe grooves, default) or `radial` (sunburst). The centre cell points along +x. */
export function tangentRadial(grid: GridConfig, cx: number, cy: number, mode: 'circumferential' | 'radial' = 'circumferential'): TangentRaster {
  const t = make(grid), { cols, rows } = grid
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const dx = c - cx, dy = r - cy, d = Math.sqrt(dx * dx + dy * dy), i = r * cols + c
    if (d < 1e-6) { t.x[i] = 1; continue }
    if (mode === 'radial') { t.x[i] = dx / d; t.y[i] = dy / d } else { t.x[i] = -dy / d; t.y[i] = dx / d }
  }
  return t
}

/**
 * Following a shape: from the gradient of a signed distance (a Field on `grid` or a raster from
 * `distanceRaster`). `along` = the iso-lines (contour stitching, wood rings); `across` = the gradient
 * (satin stitches run across a column). Cells where |∇d| < 1e-3 (medial axis) copy their left neighbour.
 */
export function tangentSDF(sdf: Field | Raster, grid: GridConfig, mode: 'along' | 'across' = 'along'): TangentRaster {
  const d = typeof sdf === 'function' ? rasterize(sdf, grid) : sdf, D = d.data, { cols, rows } = grid, t = make(grid)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const xl = c > 0 ? c - 1 : c, xr = c < cols - 1 ? c + 1 : c, yu = r > 0 ? r - 1 : r, yd = r < rows - 1 ? r + 1 : r
    const gx = (D[r * cols + xr] - D[r * cols + xl]) / Math.max(1, xr - xl), gy = (D[yd * cols + c] - D[yu * cols + c]) / Math.max(1, yd - yu)
    const g = Math.sqrt(gx * gx + gy * gy), i = r * cols + c
    if (g < 1e-3) { if (c > 0) { t.x[i] = t.x[i - 1]; t.y[i] = t.y[i - 1] } else t.x[i] = 1; continue }
    if (mode === 'across') { t.x[i] = gx / g; t.y[i] = gy / g } else { t.x[i] = -gy / g; t.y[i] = gx / g }
  }
  return t
}

/** Any per-cell direction (weaves: warp vs weft per cell); normalised on the way in (a zero vector becomes +x). */
export function tangentField(grid: GridConfig, fn: (c: number, r: number) => readonly [number, number], bounds?: CellBounds): TangentRaster {
  const t = make(grid, bounds), { cols, rows } = grid
  const [c0, r0, c1, r1] = bounds ?? [0, 0, cols - 1, rows - 1]
  for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
    const [x, y] = fn(c, r), l = Math.sqrt(x * x + y * y), i = r * cols + c
    if (l < 1e-12) { t.x[i] = 1; continue }
    t.x[i] = x / l; t.y[i] = y / l
  }
  return t
}

export interface AnisoOptions extends ShadeOptions {
  /** Kajiya–Kay exponent (default 48: brushed steel; 80 spun knob; 24 satin thread; `{material.aniso.exponent}`). */
  exponent?: number
  /** View direction (default straight on). */
  view?: Vec3
}

/** x^n for integer n by repeated squaring (the hot spot of a specular pass), pow otherwise. */
function powi(x: number, n: number): number {
  if (n !== (n | 0) || n < 0 || n > 1024) return x ** n
  let r = 1
  while (n) { if (n & 1) r *= x; x *= x; n >>= 1 }
  return r
}

/**
 * Anisotropic highlight, 0..1: (√(1 − (T·H)²))^p · att, where T is the tangent projected into the surface
 * plane (T − (T·n)n, renormalised) and H the half vector of light and view. Zero where n·L ≤ 0. The highlight
 * stretches *across* the tangent: concentric grooves give the spun-metal bowtie, horizontal brushing a
 * vertical streak. One typed-array pass like `shade.ts` `pass` (an integer p/2 via repeated squaring).
 */
export function anisoSpec(n: NormalRaster, t: TangentRaster, light: Light, o: AnisoOptions = {}): Field {
  const p = o.exponent ?? 48, half = p / 2, cols = n.grid.cols
  const b = n.bounds ?? [0, 0, cols - 1, n.grid.rows - 1], c0 = b[0], r0 = b[1], c1 = b[2], r1 = b[3]
  const out = o.into ?? createRaster(n.grid, n.space)
  if (o.into) out.data.fill(0)
  out.bounds = n.bounds
  const S = out.data, NX = n.x, NY = n.y, NZ = n.z, M = n.mask, H = n.height, TX = t.x, TY = t.y
  const point = !Array.isArray(light)
  const dir = point ? [0, 0, 1] : light as Vec3, dl = 1 / (Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1)
  const ux = dir[0] * dl, uy = dir[1] * dl, uz = dir[2] * dl
  const at = point ? (light as { at: Vec3 }).at : [0, 0, 0], px = at[0], py = at[1], pz = at[2]
  const fo = point ? (light as { falloff?: number }).falloff : undefined, f2 = fo ? fo * fo : 0
  const vw = o.view ?? [0, 0, 1], vl = 1 / (Math.sqrt(vw[0] * vw[0] + vw[1] * vw[1] + vw[2] * vw[2]) || 1)
  const vx = vw[0] * vl, vy = vw[1] * vl, vz = vw[2] * vl
  // (1 − d²) below this gives a highlight under 1e-3 (invisible): skip the power
  const floor = half > 0 ? 1e-3 ** (1 / half) : 0
  for (let r = r0; r <= r1; r++) {
    const row = r * cols
    for (let c = c0; c <= c1; c++) {
      const i = row + c, m = M[i]
      if (m <= 0) continue
      let lx = ux, ly = uy, lz = uz, att = 1
      if (point) {
        lx = px - c; ly = py - r; lz = pz - H[i]
        const d2 = lx * lx + ly * ly + lz * lz + 1e-12, k = 1 / Math.sqrt(d2)
        lx *= k; ly *= k; lz *= k
        if (f2 > 0) att = f2 / (f2 + d2)
      }
      const nx = NX[i], ny = NY[i], nz = NZ[i]
      if (nx * lx + ny * ly + nz * lz <= 0) continue
      let hx = lx + vx, hy = ly + vy, hz = lz + vz
      const hl = 1 / (Math.sqrt(hx * hx + hy * hy + hz * hz) || 1)
      hx *= hl; hy *= hl; hz *= hl
      const tx = TX[i], ty = TY[i], tn = tx * nx + ty * ny
      let qx = tx - tn * nx, qy = ty - tn * ny, qz = -tn * nz
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz)
      if (ql < 1e-9) continue
      qx /= ql; qy /= ql; qz /= ql
      const d = qx * hx + qy * hy + qz * hz, x = 1 - d * d
      if (x > floor) S[i] = m * att * powi(x, half)
    }
  }
  return sample(out)
}

/**
 * A body field plus an aniso highlight as whole size steps over it, in tone bands (the gloss rule: +1 step at
 * `rim`, +2 at `core`; the body under the highlight is replaced, not doubled). Keep the body ≤ 1 − 2 steps.
 */
export function anisoLayers(body: Field, spec: Field, o: Placement & { steps?: number; rim?: number; core?: number; bands?: readonly ToneBand[]; highlightTone?: 'idle' | 'value' } = {}): Layer[] {
  const s = 1 / Math.max(1, (o.steps ?? 5) - 1), rim = o.rim ?? .25, core = o.core ?? .55
  const highlight: Field = (u, v) => { const p = spec(u, v); if (p < rim) return 0; const b = body(u, v); return b <= 0 ? 0 : Math.min(1, b + (p >= core ? 2 : 1) * s) }
  highlight.bounds = spec.bounds
  const under: Field = (u, v) => (spec(u, v) >= rim ? 0 : body(u, v))
  under.bounds = body.bounds
  const at: Placement = {}
  if (o.lattice !== undefined) at.lattice = o.lattice
  if (o.origin) at.origin = o.origin
  return [...toneBands(under, o.bands ?? GLOSS_BANDS, at), placed(highlight, o.highlightTone ?? 'value', at)]
}
