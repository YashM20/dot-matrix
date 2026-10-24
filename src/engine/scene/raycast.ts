/**
 * scene3d, cut down (MASTER-PLAN §3.8, NEXT-PLAN gap #7): the two ray casters the HIVE cards and the
 * HIVE game share. Plain maths, no DOM: a field calls them per cell and turns the hit into a value.
 *
 * - `castHall`: an analytic ray-plane hall (floor y = +floor, ceiling y = −ceil, walls x = ±wall),
 *   camera at the origin looking down +z, world y growing downward like the card.
 * - `castGrid`: a DDA ray through a tile map (Wolfenstein style) for a first-person maze.
 *
 * Shading helpers: `lamp` (Lambert × soft inverse-square point light), `fog` (depth falloff),
 * `seam` (mortar lines never thinner than ~one cell) and `project` (world → screen cells).
 */
import { clamp } from '../math'

import type { Vec3 } from '../light/shade'

/** A ray-plane hall. (vx,vy) = vanishing point in cells, `f` = focal length in cells per world unit; rays past `far` hit nothing. */
export interface Hall { vx: number; vy: number; f: number; floor: number; ceil?: number; wall?: number; far: number }
export const HALL_FLOOR = 0, HALL_CEIL = 1, HALL_WALL_L = 2, HALL_WALL_R = 3
/** A hall hit: surface `s`, world point, depth, and the world size of one cell there across (`fp`) / along depth (`fz`). */
export interface HallHit { s: number; x: number; y: number; z: number; fp: number; fz: number }
/** Outward normals of the hall surfaces, by `HallHit.s`. */
export const HALL_NORMAL: Vec3[] = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0]]

/** The surface seen through screen cell (px, py), or null past `far`. */
export function castHall(h: Hall, px: number, py: number): HallHit | null {
  const dx = (px - h.vx) / h.f, dy = (py - h.vy) / h.f
  let z = h.far, s = -1, d = 1
  if (dy > 1e-9 && h.floor / dy < z) { z = h.floor / dy; s = HALL_FLOOR; d = h.floor }
  if (h.ceil !== undefined && dy < -1e-9 && h.ceil / -dy < z) { z = h.ceil / -dy; s = HALL_CEIL; d = h.ceil }
  if (h.wall !== undefined && Math.abs(dx) > 1e-9 && h.wall / Math.abs(dx) < z) { z = h.wall / Math.abs(dx); s = dx < 0 ? HALL_WALL_L : HALL_WALL_R; d = h.wall }
  return s < 0 ? null : { s, x: dx * z, y: dy * z, z, fp: z / h.f, fz: (z * z) / (h.f * d) }
}

/** Lambert × soft inverse-square falloff from a point light at `l` (radius `r`, intensity `i`) on a surface with normal `n`. */
export function lampAt(px: number, py: number, pz: number, [nx, ny, nz]: Vec3, [lx, ly, lz]: Vec3, r: number, i: number): number {
  const ax = lx - px, ay = ly - py, az = lz - pz, d = Math.hypot(ax, ay, az) || 1e-6
  return (i * Math.max(0, (ax * nx + ay * ny + az * nz) / d)) / (1 + (d / r) ** 2)
}
/** `lampAt` for a hall hit. */
export const lamp = (h: HallHit, l: Vec3, r: number, i: number) => lampAt(h.x, h.y, h.z, HALL_NORMAL[h.s], l, r, i)

/** Depth fog: 1 at the camera, 0 at `far`. */
export const fog = (z: number, far: number, k = 1.3) => clamp(1 - z / far) ** k
const frac = (x: number) => x - Math.floor(x)
/** A seam `w` world units wide on a `period` grid, never thinner than ~1 cell (`fp` = world size of a cell there). */
export const seam = (x: number, period: number, w: number, fp: number) => { const f = frac(x / period) * period; return f < Math.max(w, fp * .8) }
/** Screen position (cells) of a world point in a hall's camera. */
export const project = (h: Hall, [x, y, z]: Vec3): [number, number] => [h.vx + (h.f * x) / z, h.vy + (h.f * y) / z]

/** A tile map: `cells[y * w + x]` > 0 is solid (the value is the wall's material id). */
export interface TileMap { w: number; h: number; cells: ArrayLike<number> }
/** A grid hit: perpendicular distance, wall material, which side (0 = an x-face, 1 = a y-face), the tile and the 0..1 coordinate along the face. */
export interface GridHit { dist: number; tile: number; side: 0 | 1; mx: number; my: number; u: number }

/**
 * DDA through `map` from (x, y) along (dx, dy) (need not be unit). `dist` is measured along the ray
 * direction's projection, so with a camera-plane ray (dir + plane × k) it is the fish-eye-free depth.
 * Returns null after `maxSteps` tiles or on leaving the map.
 */
export function castGrid(map: TileMap, x: number, y: number, dx: number, dy: number, maxSteps = 64, out?: GridHit): GridHit | null {
  let mx = Math.floor(x), my = Math.floor(y)
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx), ddy = dy === 0 ? 1e30 : Math.abs(1 / dy)
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1
  let tx = dx < 0 ? (x - mx) * ddx : (mx + 1 - x) * ddx, ty = dy < 0 ? (y - my) * ddy : (my + 1 - y) * ddy
  let side: 0 | 1 = 0
  for (let n = 0; n < maxSteps; n++) {
    if (tx < ty) { tx += ddx; mx += sx; side = 0 } else { ty += ddy; my += sy; side = 1 }
    if (mx < 0 || my < 0 || mx >= map.w || my >= map.h) return null
    const tile = map.cells[my * map.w + mx]
    if (tile > 0) {
      const dist = side === 0 ? tx - ddx : ty - ddy
      const hit = side === 0 ? y + dist * dy : x + dist * dx
      const r = out ?? ({} as GridHit)
      r.dist = dist; r.tile = tile; r.side = side; r.mx = mx; r.my = my; r.u = hit - Math.floor(hit)
      return r
    }
  }
  return null
}
