/**
 * Diffusion-limited aggregation (Witten & Sander, "Diffusion-Limited Aggregation, a Kinetic Critical
 * Phenomenon", PRL 47, 1981), off-lattice: unit-diameter discs at continuous positions, so the cluster has
 * no lattice anisotropy and its particles are natural dot `sites`.
 *
 * Particles are released one at a time on a circle just outside the cluster and random-walk until they
 * touch it, then stick where they first touch. Tips screen the fjords (a walker almost never reaches deep
 * into a gap), so the cluster grows the branching, fractal (D ≈ 1.71) frost / coral shape. The arrival
 * order is the growth history: a card reveals particles 0…k(t), and the newest ones are the live front.
 *
 * The walk is a sequence of jumps to the rim of the largest particle-free circle around the walker (a free
 * walk leaves a circle uniformly on its rim, so this keeps the statistics of the plain walk):
 *  - far from the cluster the circle's radius comes from the cluster radius;
 *  - near it, from `near`, a per-cell lower bound of the distance to the closest particle (to 10 units);
 *  - within 2.5 units, from an exact search of the bucket grid; steps never drop below `minStep`, and a step
 *    that would overlap is bisected to its first contact, so discs touch and never overlap.
 * A walker that strays past `kill` × the launch radius is relaunched. Deterministic for a seed (`dsin` /
 * `dcos`, mulberry32).
 */
import { mulberry32 } from '../sampler/jitter'
import { dcos, dsin } from './attractor'

export interface DlaSpec {
  /** Domain in particle diameters. The seed particle sits at the centre. */
  w: number
  h: number
  /** Particles to aggregate (stops early when the cluster reaches `maxRadius`). */
  n: number
  seed?: number
  /** Stop once the cluster radius reaches this (default min(w, h) / 2 - 2). */
  maxRadius?: number
  /** Relaunch radius as a multiple of the launch radius (default 2.5). */
  kill?: number
  /** Smallest step near the cluster, in diameters (default 0.4). */
  minStep?: number
}
export interface Dla {
  w: number
  h: number
  /** Particles stuck (the seed included, index 0). */
  count: number
  /** Position of particle i (arrival order), in diameters. */
  x: Float32Array
  y: Float32Array
  /** The particle each one stuck to (-1 for the seed): the branch tree. */
  parent: Int32Array
  /** Branch depth: hops to the seed along `parent`. */
  depth: Int32Array
  /** Cluster radius (farthest particle from the seed) after particle i stuck. */
  radius: Float32Array
  /** Radius of gyration after particle i stuck: N ∝ Rg^D gives the fractal dimension. */
  gyration: Float32Array
  /** Jumps taken in total (a cost measure). */
  steps: number
}

const NEAR = 10

export function dla(spec: DlaSpec): Dla {
  const { w, h, n, seed = 1, kill = 2.5, minStep = .4 } = spec
  const maxRadius = spec.maxRadius ?? Math.min(w, h) / 2 - 2
  const rnd = mulberry32(seed >>> 0)
  const cx = w / 2, cy = h / 2, gw = Math.ceil(w), gh = Math.ceil(h)
  // bucket grid (1 diameter per bucket): head / next linked lists of particle indices
  const head = new Int32Array(gw * gh).fill(-1), next = new Int32Array(n).fill(-1)
  // near[c] = lower bound of the distance from any point of cell c to the closest particle centre, capped
  const near = new Float32Array(gw * gh).fill(NEAR)
  const xs = new Float32Array(n), ys = new Float32Array(n), parent = new Int32Array(n).fill(-1), depth = new Int32Array(n), radius = new Float32Array(n), gyration = new Float32Array(n)
  let count = 0, rmax = 0, steps = 0, mx = 0, my = 0, m2 = 0
  const add = (x: number, y: number, par: number) => {
    const i = count++
    xs[i] = x; ys[i] = y; parent[i] = par; depth[i] = par < 0 ? 0 : depth[par] + 1
    const bx = Math.min(gw - 1, Math.max(0, x | 0)), by = Math.min(gh - 1, Math.max(0, y | 0))
    next[i] = head[by * gw + bx]; head[by * gw + bx] = i
    for (let yy = Math.max(0, by - NEAR); yy <= Math.min(gh - 1, by + NEAR); yy++) for (let xx = Math.max(0, bx - NEAR); xx <= Math.min(gw - 1, bx + NEAR); xx++) {
      // cell centre to particle, less the half diagonal: a bound for every point of the cell
      const d = Math.sqrt((xx + .5 - x) ** 2 + (yy + .5 - y) ** 2) - .7072, c = yy * gw + xx
      if (d < near[c]) near[c] = d
    }
    rmax = Math.max(rmax, Math.sqrt((x - cx) ** 2 + (y - cy) ** 2))
    radius[i] = rmax
    mx += x; my += y; m2 += x * x + y * y
    const c = i + 1
    gyration[i] = Math.sqrt(Math.max(0, m2 / c - (mx / c) ** 2 - (my / c) ** 2))
  }
  /** Closest particle within 2.5 diameters of (x, y): sets `hit` and returns its distance (2.5 when none). */
  let hit = -1
  const nearest = (x: number, y: number): number => {
    let best = 2.5 * 2.5
    hit = -1
    const bx = x | 0, by = y | 0
    for (let yy = Math.max(0, by - 3); yy <= Math.min(gh - 1, by + 3); yy++) for (let xx = Math.max(0, bx - 3); xx <= Math.min(gw - 1, bx + 3); xx++)
      for (let i = head[yy * gw + xx]; i >= 0; i = next[i]) {
        const dd = (xs[i] - x) ** 2 + (ys[i] - y) ** 2
        if (dd < best) { best = dd; hit = i }
      }
    return Math.sqrt(best)
  }
  add(cx, cy, -1)
  const TAU = Math.PI * 2
  while (count < n && rmax < maxRadius) {
    const launch = rmax + 3, killR = Math.max(launch + 8, launch * kill)
    let a = rnd() * TAU, x = cx + launch * dcos(a), y = cy + launch * dsin(a)
    for (;;) {
      const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy)
      if (d > killR || x < 0 || y < 0 || x >= w || y >= h) { a = rnd() * TAU; x = cx + launch * dcos(a); y = cy + launch * dsin(a); continue }
      // room to move: the largest circle around the walker that holds no particle centre closer than 1
      let room = d - rmax - 1
      if (room < 2) {
        const bound = near[(y | 0) * gw + (x | 0)]
        room = bound >= 2.5 ? bound - 1 : nearest(x, y) - 1
      }
      a = rnd() * TAU; steps++
      if (room >= minStep) { x += room * dcos(a); y += room * dsin(a); continue }
      // within reach: a short step; if it touches, stick at the contact point
      const nx = x + minStep * dcos(a), ny = y + minStep * dsin(a), q = nearest(nx, ny)
      if (q > 1) { x = nx; y = ny; continue }
      // the step overlaps: bisect it for the first contact (clear at f = 0, overlapping at f = 1)
      let lo = 0, hi = 1
      for (let k = 0; k < 14; k++) { const f = (lo + hi) / 2; if (nearest(x + (nx - x) * f, y + (ny - y) * f) > 1) lo = f; else hi = f }
      const sx = x + (nx - x) * lo, sy = y + (ny - y) * lo
      nearest(sx, sy)
      add(sx, sy, hit)
      break
    }
  }
  return { w, h, count, x: xs.slice(0, count), y: ys.slice(0, count), parent: parent.slice(0, count), depth: depth.slice(0, count), radius: radius.slice(0, count), gyration: gyration.slice(0, count), steps }
}
