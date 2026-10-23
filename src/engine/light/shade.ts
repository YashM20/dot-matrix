import type { Field } from '../types'
import { createRaster, rasterMax, sample, type Raster } from '../raster/raster'
import { blur, cut, moat, threshold } from '../raster/ops'
import type { NormalRaster } from './height'

/**
 * Per-frame lighting on a cached `NormalRaster`: one dot product per cell (≈ 0.1 ms on a 144² card).
 * A light is a direction or a point, so the pointer can be the light (torch) and a board can share
 * one light direction (time of day). Coordinates are cells of the normals' grid: x right, y down,
 * z toward the viewer.
 */
export type Vec3 = readonly [number, number, number]
/** A point light `at` (cells; z = height above the surface). `falloff` (cells) dims it with distance: f² / (f² + d²). */
export interface PointLight { at: Vec3; falloff?: number }
export type Light = Vec3 | PointLight

/** Direction toward a distant light: `azimuth` clockwise from 12 o'clock, `elevation` above the surface (radians). */
export function lightDir(azimuth: number, elevation: number): Vec3 {
  const c = Math.cos(elevation)
  return [Math.sin(azimuth) * c, -Math.cos(azimuth) * c, Math.sin(elevation)]
}
/** A torch held `height` cells above cell (x, y) — e.g. the pointer: `torch(p.x, p.y)`. */
export const torch = (x: number, y: number, height = 32, falloff?: number): PointLight => ({ at: [x, y, height], falloff })

export interface ShadeOptions {
  /** Light added everywhere on the shape, 0..1 (default 0). */
  ambient?: number
  /** Write into this raster (same grid) instead of allocating one per call. */
  into?: Raster
}

const unit = (v: Vec3): Vec3 => { const k = 1 / (Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1); return [v[0] * k, v[1] * k, v[2] * k] }
const isPoint = (l: Light): l is PointLight => !Array.isArray(l)

/** x^n: repeated squaring for integer n (Math.pow is the hot spot of a specular pass), pow otherwise. */
function powi(x: number, n: number): number {
  if (n !== (n | 0) || n < 0 || n > 1024) return x ** n
  let r = 1
  while (n) { if (n & 1) r *= x; x *= x; n >>= 1 }
  return r
}

/** A fresh (or reused, cleared) output raster on the normals' grid with their bounds. */
function target(n: NormalRaster, into?: Raster): Raster {
  const out = into ?? createRaster(n.grid, n.space)
  if (into) out.data.fill(0)
  out.bounds = n.bounds
  return out
}

/**
 * The one shading loop: diffuse into `dif` and/or specular into `spe`, one light vector per cell.
 * A tight typed-array loop (no per-cell callbacks): ~20k cells in about 0.1 ms.
 */
function pass(n: NormalRaster, light: Light, ambient: number, dif: Float32Array | null, spe: Float32Array | null, view: Vec3, shininess: number): void {
  const cols = n.grid.cols, b = n.bounds ?? [0, 0, cols - 1, n.grid.rows - 1], c0 = b[0], r0 = b[1], c1 = b[2], r1 = b[3]
  const point = isPoint(light), u = point ? [0, 0, 1] : unit(light), ux = u[0], uy = u[1], uz = u[2]
  const at = point ? light.at : [0, 0, 0], px = at[0], py = at[1], pz = at[2], f2 = point && light.falloff ? light.falloff * light.falloff : 0
  const v = unit(view), vx = v[0], vy = v[1], vz = v[2], NX = n.x, NY = n.y, NZ = n.z, M = n.mask, H = n.height, lit = 1 - ambient
  const wantD = dif !== null, wantS = spe !== null, D = dif ?? NX, P = spe ?? NX
  // R·V below this gives a highlight under 1e-3 (invisible): skip the power for most of the surface
  const floor = shininess > 0 ? 1e-3 ** (1 / shininess) : 0
  for (let r = r0; r <= r1; r++) {
    const dy = py - r, row = r * cols
    for (let c = c0; c <= c1; c++) {
      const i = row + c, m = M[i]
      if (m <= 0) continue
      let lx = ux, ly = uy, lz = uz, att = 1
      if (point) {
        lx = px - c; ly = dy; lz = pz - H[i]
        const d2 = lx * lx + ly * ly + lz * lz + 1e-12, k = 1 / Math.sqrt(d2)
        lx *= k; ly *= k; lz *= k
        if (f2 > 0) att = f2 / (f2 + d2)
      }
      const nx = NX[i], ny = NY[i], nz = NZ[i], ndl = nx * lx + ny * ly + nz * lz
      if (ndl <= 0) { if (wantD) D[i] = m * ambient; continue }
      if (wantD) D[i] = m * (ambient + lit * att * ndl)
      if (wantS) {
        const k2 = 2 * ndl, rv = (k2 * nx - lx) * vx + (k2 * ny - ly) * vy + (k2 * nz - lz) * vz
        if (rv > floor) P[i] = m * att * powi(rv, shininess)
      }
    }
  }
}

/** Diffuse (Lambert) light, 0..1: ambient + (1 − ambient) · max(0, n·L), times the shape's coverage. */
export function lambert(n: NormalRaster, light: Light, opts: ShadeOptions = {}): Field {
  const out = target(n, opts.into)
  pass(n, light, opts.ambient ?? 0, out.data, null, [0, 0, 1], 1)
  return sample(out)
}

/**
 * Specular (Phong) highlight only, 0..1: max(0, R·V)^shininess with R the light reflected about the
 * normal, zero where the surface faces away from the light (and below 1e-3, which no dot can show). Draw it as its own layer over the
 * diffuse one (gloss = the highlight two size steps up). `view` defaults to straight on.
 */
export function phong(n: NormalRaster, light: Light, view: Vec3 = [0, 0, 1], shininess = 24, opts: ShadeOptions = {}): Field {
  const out = target(n, opts.into)
  pass(n, light, 0, null, out.data, view, shininess)
  return sample(out)
}

/** Lambert and Phong from one pass (what a lit material needs each frame): `{ diffuse, specular }`. */
export function illuminate(n: NormalRaster, light: Light, opts: ShadeOptions & { view?: Vec3; shininess?: number; intoSpecular?: Raster } = {}): { diffuse: Field; specular: Field } {
  const dif = target(n, opts.into), spe = target(n, opts.intoSpecular)
  pass(n, light, opts.ambient ?? 0, dif.data, spe.data, opts.view ?? [0, 0, 1], opts.shininess ?? 24)
  return { diffuse: sample(dif), specular: sample(spe) }
}

/**
 * Glow around the bright parts of `r` (MASTER-PLAN §3.8: rasterize the accent at 2× pitch, bloom it,
 * draw it in `activeDim` behind the accent). Cells ≥ `at` are blurred over `radius` cells and scaled so
 * the brightest glow cell is `strength`. With `gap`, the source cells and a `gap`-cell moat around them
 * are cut out, so the halo never touches the accent it surrounds.
 */
export function bloom(r: Raster, radius: number, opts: { strength?: number; at?: number; gap?: number } = {}): Raster {
  const { strength = 1, at = .5, gap } = opts, src = threshold(r, at)
  let glow = blur(src, radius, 'gaussian')
  if (gap !== undefined) {
    const clear = moat(src, Math.max(0, gap))
    for (let i = 0; i < clear.data.length; i++) clear.data[i] = Math.max(clear.data[i], src.data[i])
    glow = cut(glow, clear)
  }
  const peak = rasterMax(glow), k = peak > 0 ? strength / peak : 0
  for (let i = 0; i < glow.data.length; i++) glow.data[i] *= k
  return glow
}
