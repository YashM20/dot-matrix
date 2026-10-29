import type { Field, GridConfig } from '../types'
import { stbn } from '../halftone/mask'

/**
 * Glass v2 (docs/living-matter/M-materials.md §4.1): refraction that moves the *sampled value* at sub-cell precision
 * while every dot stays on its lattice. A Snell LUT along one bezel radius (after kube.io, "Liquid Glass in the
 * browser": rebuilt from the published method, no code copied) turns the inset from a rounded box's edge into a
 * displacement; the flat top magnifies. The legacy `glass()` (light/material.ts, whole-cell offsets) is untouched.
 * Units are cells of the grid the field is sampled on. Bakes (the LUT) are cached per arguments; per frame a lens is
 * an analytic SDF, one LUT lookup and one `behind` read per cell inside it.
 */

/** A bezel height profile over x ∈ [0, 1] (0 = outer edge, 1 = where the flat top starts), y ∈ [0, 1]. */
export type BezelProfile = (x: number) => number
const cl = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const circle: BezelProfile = x => { const t = 1 - cl(x); return Math.sqrt(1 - t * t) }
const squircle: BezelProfile = x => { const t = 1 - cl(x), t2 = t * t; return Math.sqrt(Math.sqrt(1 - t2 * t2)) }
/** kube.io's profiles: convex circle √(1 − (1 − x)²), convex squircle ⁴√(1 − (1 − x)⁴), concave 1 − circle, and a lip (a squircle rim that dips a third back toward the flat). */
export const BEZEL: Readonly<{ circle: BezelProfile; squircle: BezelProfile; concave: BezelProfile; lip: BezelProfile }> = Object.freeze({
  circle, squircle,
  concave: (x: number) => 1 - circle(x),
  lip: (x: number) => { const s = cl((x - .5) / .5); return squircle(x) * (1 - .35 * s * s * (3 - 2 * s)) },
})

export interface SnellLUT {
  /** 127 normalised displacement magnitudes from the edge (i = 0) to the flat (i = 126); signed (+ = toward the inside). */
  mag: Float32Array
  /** Largest |displacement| in cells before normalising (the feDisplacementMap `scale`). */
  max: number
  /** Bezel normal z per sample (for Fresnel). */
  nz: Float32Array
}
export const LUT_SAMPLES = 127
const luts = new Map<string, SnellLUT>()
const profileIds = new WeakMap<BezelProfile, number>()
let nextProfile = 1
/**
 * Refraction displacement along one bezel radius (kube.io, "Liquid Glass in the browser"): 127 vertical rays
 * hit the bezel, refract once by Snell (air n₁ = 1 → glass n₂ = `ior`, default 1.5), and travel down
 * through `height(x) + base` cells of glass to the background plane. Pure and cached per arguments.
 */
export function snellLUT(profile: BezelProfile, o: { bezel: number; thickness: number; base?: number; ior?: number }): SnellLUT {
  let pid = profileIds.get(profile)
  if (!pid) profileIds.set(profile, (pid = nextProfile++))
  const base = o.base ?? 2, ior = o.ior ?? 1.5, key = `${pid}|${o.bezel}|${o.thickness}|${base}|${ior}`
  const hit = luts.get(key)
  if (hit) return hit
  const n = LUT_SAMPLES, raw = new Float64Array(n), nz = new Float32Array(n), eta = 1 / ior, d = .001
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1)
    // the slope by central differences (one-sided at the ends), in cells of height per cell of run
    const xa = Math.max(0, x - d), xb = Math.min(1, x + d), k = (o.thickness / o.bezel) * (profile(xb) - profile(xa)) / (xb - xa)
    const l = Math.sqrt(k * k + 1), nx = -k / l, ny = 1 / l // the 2-D surface normal, tilted outward on a rising bezel
    // I = (0, −1); cos i = −n·I = ny; T = ηI + (η cos i − √(1 − sin²t)) n
    const cosi = ny, sin2t = eta * eta * (1 - cosi * cosi)
    if (sin2t >= 1) { raw[i] = 0; nz[i] = ny; continue } // total internal reflection cannot happen going in, kept for safety
    const f = eta * cosi - Math.sqrt(1 - sin2t), tx = f * nx, ty = -eta + f * ny
    const depth = o.thickness * profile(x) + base
    raw[i] = ty < 0 ? depth * tx / -ty : 0
    nz[i] = ny
  }
  let max = 0
  for (let i = 0; i < n; i++) if (Math.abs(raw[i]) > max) max = Math.abs(raw[i])
  const mag = new Float32Array(n)
  if (max > 0) for (let i = 0; i < n; i++) mag[i] = raw[i] / max
  const out: SnellLUT = { mag, max, nz }
  luts.set(key, out)
  if (luts.size > 16) luts.delete(luts.keys().next().value!)
  return out
}

export interface LiquidGlassOptions {
  /** The lens outline: a rounded box (cells, centre and half size) with corner radius; `bezel` cells wide. */
  cx: number; cy: number; hw: number; hh: number; radius: number; bezel: number
  lut: SnellLUT
  /** Displacement multiplier (default 1); 0 fades the lens out without rebuilding the LUT (kube's animated `scale`). */
  strength?: number
  /** Magnification of the flat top about the lens centre (default 1.06). */
  magnify?: number
  /** Frost: blue-noise jitter of the sample point in cells (default 0; 0.6 = satin, 1.6 = frosted). */
  frost?: number
  /** Specular rim light direction in the screen plane (radians, default −60° like kube.io) and its exponent (default 3). */
  rimAngle?: number; rimPower?: number
}
/** Signed distance to a rounded box and its outward gradient, inlined (sdf.ts's `sdfBox` formula), into `out`. */
function roundBox(o: LiquidGlassOptions, px: number, py: number, out: Float64Array): number {
  const dx = px - o.cx, dy = py - o.cy, sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1
  const r = Math.min(o.radius, o.hw, o.hh), qx = Math.abs(dx) - (o.hw - r), qy = Math.abs(dy) - (o.hh - r)
  if (qx > 0 && qy > 0) {
    const l = Math.sqrt(qx * qx + qy * qy)
    out[0] = sx * qx / l; out[1] = sy * qy / l
    return l - r
  }
  // one axis out (or none): length(max(q, 0)) + min(max(qx, qy), 0) is the larger of the two
  if (qx > qy) { out[0] = sx; out[1] = 0; return qx - r }
  out[0] = 0; out[1] = sy
  return qy - r
}

/**
 * The lens as a per-cell displacement: `offset(c, r, out)` writes the sample offset (cells) of card cell (c, r) and
 * returns the bezel coordinate x ∈ [0, 1) on the bezel, 1 on the flat top and −1 outside. Exposed so a point drawn
 * over the glass (a red tick) moves by exactly the offset the scene gets.
 */
export function lensOffset(o: LiquidGlassOptions): (c: number, r: number, out: Float64Array) => number {
  const lut = o.lut, s = o.strength ?? 1, m = 1 / (o.magnify ?? 1.06) - 1, frost = o.frost ?? 0, g = new Float64Array(2), last = LUT_SAMPLES - 1
  return (c, r, out) => {
    const sd = roundBox(o, c, r, g)
    if (sd >= 0) { out[0] = 0; out[1] = 0; return -1 }
    const inset = -sd
    // the flat top magnifies about the centre; the whole lens carries it, so the bezel joins the top without a step
    let ox = (c - o.cx) * m * s, oy = (r - o.cy) * m * s, x = 1
    if (inset < o.bezel) {
      x = inset / o.bezel
      const d = lut.mag[Math.round(x * last)] * lut.max * s
      ox -= g[0] * d; oy -= g[1] * d
    }
    if (frost > 0) { ox += (stbn(c, r) - .5) * frost; oy += (stbn(c + 32, r + 17) - .5) * frost }
    out[0] = ox; out[1] = oy
    return x
  }
}

/**
 * Sub-cell behind-sampling through a lens: returns a Field on the same grid whose value at (u, v) is
 * `behind` read at the refracted point (continuous, so the scene slides under the glass while the dots stay
 * on the lattice). Also returns the Fresnel rim and the specular rim as fields. Per-frame cost: an analytic
 * rounded-box SDF, one LUT lookup and one `behind` read per cell inside the lens; outside it is `behind` as is.
 */
export function liquidGlass(behind: Field, grid: GridConfig, o: LiquidGlassOptions): { through: Field; fresnel: Field; rim: Field; inside: (u: number, v: number) => number; offset: (c: number, r: number, out: Float64Array) => number } {
  const W = grid.cols - 1 || 1, H = grid.rows - 1 || 1, off = lensOffset(o), d = new Float64Array(2), g = new Float64Array(2)
  const lut = o.lut, last = LUT_SAMPLES - 1, R0 = .04, ra = o.rimAngle ?? -60 * Math.PI / 180, rp = o.rimPower ?? 3, lx = Math.cos(ra), ly = Math.sin(ra)
  const through: Field = (u, v) => {
    const c = u * W, r = v * H
    if (off(c, r, d) < 0 || (d[0] === 0 && d[1] === 0)) return behind(u, v) // outside, or no displacement: bit for bit
    return behind((c + d[0]) / W, (r + d[1]) / H)
  }
  if (behind.bounds) through.bounds = behind.bounds
  const bezelAt = (u: number, v: number) => { const sd = roundBox(o, u * W, v * H, g); return sd >= 0 ? -1 : Math.min(1, -sd / o.bezel) }
  const fresnel: Field = (u, v) => {
    const x = bezelAt(u, v)
    if (x < 0) return 0
    const nz = x >= 1 ? 1 : lut.nz[Math.round(x * last)], k = 1 - nz, k2 = k * k
    return (R0 + (1 - R0) * k2 * k2 * k) * .9
  }
  const rim: Field = (u, v) => {
    const x = bezelAt(u, v)
    if (x < 0 || x >= 1) return 0
    const dot = g[0] * lx + g[1] * ly, a = dot > 0 ? dot : 0, b = dot < 0 ? -dot : 0
    return (a ** rp + .5 * b ** rp) * (1 - x)
  }
  const inside = (u: number, v: number) => (roundBox(o, u * W, v * H, g) < 0 ? 1 : 0)
  return { through, fresnel, rim, inside, offset: off }
}

/** Frost on its own: `f` read at a blue-noise jittered point (STBN slice 0, fixed: goldens stay put), averaged over 2 taps. */
export function frost(f: Field, grid: GridConfig, amount: number): Field {
  const W = grid.cols - 1 || 1, H = grid.rows - 1 || 1
  const g: Field = (u, v) => {
    const c = Math.round(u * W), r = Math.round(v * H)
    const ax = (stbn(c, r) - .5) * amount, ay = (stbn(c + 32, r + 17) - .5) * amount
    const bx = (stbn(c + 17, r + 41) - .5) * amount, by = (stbn(c + 49, r + 9) - .5) * amount
    return .5 * (f(u + ax / W, v + ay / H) + f(u + bx / W, v + by / H))
  }
  if (f.bounds) g.bounds = f.bounds
  return g
}
