/**
 * One frame of a marched scene into plain buffers (#69, docs/IQ-PLAN.md IQ8): per dot, trace the ray, take the
 * tetrahedron normal at the dot's footprint, Aaltonen's soft shadow toward the sun, a one-sample occlusion, the
 * outdoors rig, sun-coloured fog (plus optional height fog), gamma, and keep the luma, the material and t.
 * A board turns those buffers into dot value and tone; this module never touches tones or the grid.
 *
 * Speed, our own: a scene is objects (`sd`) inside a bounding box plus analytic planes (floor, wall). A ray is
 * marched only across the box and only up to the nearest plane, and a shadow ray only across the box, so the
 * floor, the sky and everything the objects can't touch cost a few multiplies instead of a march.
 */
import { calcNormal, cameraRay, softShadowImproved, sphereTrace, type Camera, type V3 } from './march'
import { applyFog, fogAmount, gamma, heightFog, luma, outdoorLight, sunFogColor } from './light'
import type { Sd3 } from './prims'

/** `Frame.mat` for a ray that hit nothing, and for one that hit nothing inside the sun's disc. */
export const SKY = 255, SUN = 254

/** A plane dot(p, n) + h = 0 (n unit) facing the side where dot(p, n) + h > 0. */
export type Plane = [nx: number, ny: number, nz: number, h: number]
/** Axis-aligned box [x0, y0, z0, x1, y1, z1]. */
export type Box = [number, number, number, number, number, number]

export interface Scene {
  /** The objects (everything but the planes). */
  sd: Sd3
  /** A box the objects stay inside; rays that miss it skip the march. Default: unbounded. */
  box?: Box
  /** Analytic planes (they take no part in shadows: keep the sun on their open side). */
  planes?: Plane[]
  cam: Camera
  /** Unit direction toward the sun. */
  sun: V3
  /** Material id (0 … 254) at a hit; `plane` is the plane's index, or −1 for the objects. Default 0. */
  material?: (x: number, y: number, z: number, plane: number) => number
  /** Albedo per material id (the article: keep it near 0.2). Default 0.2. */
  albedo?: (id: number) => number
  /** Far plane and step budget. */
  tmax: number
  steps?: number
  /** Step scale for bounds (twist, bend); 1 for true SDFs. */
  stepScale?: number
  /** The sun's size for the soft shadow (Aaltonen's w), how far the shadow ray looks, its step budget. */
  shadow: { w: number; maxt: number; steps?: number }
  /** One-sample occlusion: how far out along the normal to probe (0 = no occlusion). */
  occ?: number
  /** Fog density, its colour away from and toward the sun (linear RGB), and optional height fog (a, b). */
  fog: { b: number; base: V3; sun: V3; height?: [a: number, b: number] }
  /** Light gains (sun, sky, bounce); default 1, 1, 1. */
  gain?: V3
  /** Exposure before gamma; default 1. */
  exposure?: number
  /** The sun's disc as the cosine of its angular radius: sky rays inside it get `SUN`. Default: no disc. */
  sunDisc?: number
}

/** A rendered frame: w × h dots, row-major, row 0 at the top. */
export interface Frame { w: number; h: number; lum: Float32Array; mat: Uint8Array; t: Float32Array }

/** Our one-sample stand-in for the cheap occlusion the rig asks for: how clear the space `d` out along n is. */
export function occlusion(sd: Sd3, x: number, y: number, z: number, n: V3, d: number): number {
  const o = sd(x + n[0] * d, y + n[1] * d, z + n[2] * d) / d
  return o < 0 ? 0 : o > 1 ? 1 : o
}

/** Slab test: the ray's [enter, exit] across `b` into `out`; false when it misses. */
export function rayBox(b: Box, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: number[]): boolean {
  out[0] = -Infinity; out[1] = Infinity
  return slab(b[0], b[3], ox, dx, out) && slab(b[1], b[4], oy, dy, out) && slab(b[2], b[5], oz, dz, out) && out[1] >= Math.max(out[0], 0)
}
function slab(lo: number, hi: number, o: number, d: number, out: number[]): boolean {
  if (d === 0) return o >= lo && o <= hi
  const u = (lo - o) / d, v = (hi - o) / d
  out[0] = Math.max(out[0], Math.min(u, v)); out[1] = Math.min(out[1], Math.max(u, v))
  return true
}

/**
 * Render `scene` at w × h dots into `frame` (reused when its size matches). Screen x spans ±w/h·`aspect`
 * (`aspect` = a dot's width over its height, 1 for round lattice dots), screen y ±1.
 */
export function renderScene(scene: Scene, w: number, h: number, frame?: Frame, aspect = 1): Frame {
  const n = w * h
  const f: Frame = frame && frame.w === w && frame.h === h ? frame : { w, h, lum: new Float32Array(n), mat: new Uint8Array(n), t: new Float32Array(n) }
  const { sd, cam, sun, tmax, fog } = scene, steps = scene.steps ?? 96, scale = scene.stepScale ?? 1, planes = scene.planes ?? []
  const box: Box = scene.box ?? [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity]
  const albedo = scene.albedo ?? (() => .2), exposure = scene.exposure ?? 1, occD = scene.occ ?? 0
  const sw = scene.shadow.w, smax = scene.shadow.maxt, ssteps = scene.shadow.steps ?? 32
  const all: Sd3 = planes.length ? (x, y, z) => { let d = sd(x, y, z); for (const p of planes) d = Math.min(d, p[0] * x + p[1] * y + p[2] * z + p[3]); return d } : sd
  const rd: V3 = new Float64Array(3), nor: V3 = new Float64Array(3), lin: V3 = new Float64Array(3), fc: V3 = new Float64Array(3), span = [0, 0]
  const half = w / h * aspect
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, sx = (2 * (i + .5) / w - 1) * half, sy = 1 - 2 * (j + .5) / h
    cameraRay(cam, sx, sy, rd)
    sunFogColor(rd, sun, fog.base, fog.sun, fc)
    for (let c = 0; c < 3; c++) fc[c] *= exposure
    // the nearest plane in front of the eye
    let t = tmax, hit = -2
    for (let q = 0; q < planes.length; q++) {
      const p = planes[q], dn = p[0] * rd[0] + p[1] * rd[1] + p[2] * rd[2]
      if (dn >= 0) continue
      const tp = -(p[0] * cam.ox + p[1] * cam.oy + p[2] * cam.oz + p[3]) / dn
      if (tp > 0 && tp < t) { t = tp; hit = q }
    }
    // the objects, across the box and short of that plane; the stop test is .4 of the footprint
    if (rayBox(box, cam.ox, cam.oy, cam.oz, rd[0], rd[1], rd[2], span) && span[0] < t) {
      const to = sphereTrace(sd, cam.ox, cam.oy, cam.oz, rd[0], rd[1], rd[2], Math.max(.01, span[0]), Math.min(t, span[1]), cam.cell * .4, steps, scale)
      if (to > 0) { t = to; hit = -1 }
    }
    if (hit === -2) {
      f.lum[k] = gamma(luma(fc)); f.t[k] = Infinity
      f.mat[k] = scene.sunDisc !== undefined && rd[0] * sun[0] + rd[1] * sun[1] + rd[2] * sun[2] > scene.sunDisc ? SUN : SKY
      continue
    }
    const px = cam.ox + rd[0] * t, py = cam.oy + rd[1] * t, pz = cam.oz + rd[2] * t, foot = cam.cell * t
    if (hit >= 0) { const p = planes[hit]; nor[0] = p[0]; nor[1] = p[1]; nor[2] = p[2] } else calcNormal(sd, px, py, pz, foot, nor)
    // the shadow ray starts two footprints off the surface and is marched only across the box
    const lift = Math.max(foot * 2, 2e-3), sx0 = px + nor[0] * lift, sy0 = py + nor[1] * lift, sz0 = pz + nor[2] * lift
    // fog first: where it has all but swallowed the point, its shadow can't show, so the shadow ray is skipped
    let amt = fogAmount(t, fog.b)
    if (fog.height) amt = Math.min(1, amt + heightFog(t, cam.oy, rd[1], fog.height[0], fog.height[1]))
    let sha = 1
    if (amt < .96 && rayBox(box, sx0, sy0, sz0, sun[0], sun[1], sun[2], span) && span[0] < smax) {
      sha = softShadowImproved(sd, sx0, sy0, sz0, sun[0], sun[1], sun[2], Math.max(.02, span[0]), Math.min(smax, span[1]), sw, ssteps, foot * .5)
    }
    const occ = occD > 0 ? occlusion(all, px, py, pz, nor, occD) : 1
    const id = scene.material ? scene.material(px, py, pz, hit) : 0, alb = albedo(id)
    outdoorLight(nor, sun, sha, occ, lin, scene.gain)
    for (let c = 0; c < 3; c++) lin[c] *= alb * exposure
    applyFog(lin, fc, amt)
    f.lum[k] = gamma(luma(lin)); f.mat[k] = id; f.t[k] = t
  }
  return f
}
