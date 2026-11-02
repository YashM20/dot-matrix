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

const NEAR = 10, REACH = NEAR + .708
/**
 * The cluster's state while it grows. The steps below are module functions over it, not closures made per call: a
 * closure's optimised code is specialised to the first call's context and thrown away on the next, so a second
 * cluster (a card's first frame after a warm-up) would run unoptimised again.
 */
class Grow {
  /** Bucket grid (1 diameter per bucket): head / next linked lists of particle indices. */
  head: Int32Array; next: Int32Array
  /** near[c] = lower bound of the distance from any point of cell c to the closest particle centre, capped. */
  near: Float32Array
  xs: Float32Array; ys: Float32Array; parent: Int32Array; depth: Int32Array; radius: Float32Array; gyration: Float32Array
  count = 0; rmax = 0; mx = 0; my = 0; m2 = 0; hit = -1
  /** `clear`'s list: the particles round (gx0, gy0) when `gcount` had stuck. */
  CX: Float64Array; CY: Float64Array; cand = 0; gx0 = NaN; gy0 = NaN; gcount = -1
  readonly gw: number; readonly gh: number; readonly cx: number; readonly cy: number
  constructor(gw: number, gh: number, n: number, cx: number, cy: number) {
    this.gw = gw; this.gh = gh; this.cx = cx; this.cy = cy
    this.head = new Int32Array(gw * gh).fill(-1); this.next = new Int32Array(n).fill(-1)
    this.near = new Float32Array(gw * gh).fill(NEAR)
    this.xs = new Float32Array(n); this.ys = new Float32Array(n); this.parent = new Int32Array(n).fill(-1); this.depth = new Int32Array(n)
    this.radius = new Float32Array(n); this.gyration = new Float32Array(n)
    this.CX = new Float64Array(n); this.CY = new Float64Array(n)
  }
}
// (squares are written as products: x ** 2 is x · x exactly, and a product never leaves the optimised code)
function add(g: Grow, x: number, y: number, par: number): void {
  const { gw, gh, near } = g, i = g.count++
  g.xs[i] = x; g.ys[i] = y; g.parent[i] = par; g.depth[i] = par < 0 ? 0 : g.depth[par] + 1
  const bx = Math.min(gw - 1, Math.max(0, x | 0)), by = Math.min(gh - 1, Math.max(0, y | 0))
  g.next[i] = g.head[by * gw + bx]; g.head[by * gw + bx] = i
  for (let yy = Math.max(0, by - NEAR), yb = Math.min(gh - 1, by + NEAR); yy <= yb; yy++) {
    // a bound is ≤ NEAR, so a cell can only drop within NEAR + the half diagonal of the particle: this row's span of that
    // disc (REACH a hair wider, so a cell left out could not have dropped)
    const ey = yy + .5 - y, hw = Math.sqrt(Math.max(0, REACH * REACH - ey * ey))
    nearRow(near, yy * gw, ey, Math.max(0, bx - NEAR, Math.ceil(x - .5 - hw)), Math.min(gw - 1, bx + NEAR, Math.floor(x - .5 + hw)), x)
  }
  const rx = x - g.cx, ry = y - g.cy
  g.rmax = Math.max(g.rmax, Math.sqrt(rx * rx + ry * ry))
  g.radius[i] = g.rmax
  g.mx += x; g.my += y; g.m2 += x * x + y * y
  const c = i + 1, gx = g.mx / c, gy = g.my / c
  g.gyration[i] = Math.sqrt(Math.max(0, g.m2 / c - gx * gx - gy * gy))
}
/**
 * One row of `near` round a new particle at x: the cell centre to the particle, less the half diagonal (a bound for
 * every point of the cell). A cell whose bound can't drop (its centre is farther than its bound + the half diagonal,
 * with room for rounding) skips the root.
 */
function nearRow(near: Float32Array, row: number, ey: number, xa: number, xb: number, x: number): void {
  const ey2 = ey * ey
  for (let xx = xa, c = row + xa; xx <= xb; xx++, c++) {
    const ex = xx + .5 - x, q = ex * ex + ey2, reach = near[c] + .7073
    if (q >= reach * reach) continue
    const d = Math.sqrt(q) - .7072
    if (d < near[c]) near[c] = d
  }
}
/** Closest particle within 2.5 diameters of (x, y): sets `g.hit` and returns its distance (2.5 when none). */
function nearest(g: Grow, x: number, y: number): number {
  const { gw, gh, head, next, xs, ys } = g, bx = x | 0, by = y | 0
  let best = 2.5 * 2.5, hit = -1
  const ya = Math.max(0, by - 3), yb = Math.min(gh - 1, by + 3), xa = Math.max(0, bx - 3), xb = Math.min(gw - 1, bx + 3)
  for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++)
    for (let i = head[yy * gw + xx]; i >= 0; i = next[i]) {
      const ex = xs[i] - x, ey = ys[i] - y, dd = ex * ex + ey * ey
      if (dd < best) { best = dd; hit = i }
    }
  g.hit = hit
  return Math.sqrt(best)
}
/**
 * `nearest`'s distance without its `hit` (the walk's room, its short steps, the bisection), from a list of the
 * particles round the walker: every particle within 2.5 + SLACK of the point the list was gathered at (and some
 * farther), so any query within SLACK of that point (per axis) sees each particle within 2.5 of it, and gets the
 * same minimum (a particle the bucket walk skips is ≥ 2.5 away, and the cap is 2.5). A walker near the cluster
 * makes many short steps in one place: the list is gathered again only when it strays or a particle sticks.
 */
const SLACK = 2, KEEP = 2.5 + SLACK * 1.4143 + .001, KEEP2 = KEEP * KEEP
function clear(g: Grow, x: number, y: number): number {
  if (g.count !== g.gcount || !(Math.abs(x - g.gx0) <= SLACK) || !(Math.abs(y - g.gy0) <= SLACK)) gather(g, x, y)
  const { CX, CY } = g, n = g.cand
  let best = 2.5 * 2.5
  for (let k = 0; k < n; k++) { const ex = CX[k] - x, ey = CY[k] - y, dd = ex * ex + ey * ey; if (dd < best) best = dd }
  return Math.sqrt(best)
}
/**
 * `clear`'s list round (x, y): the buckets of every point within 2.5 + SLACK, a bucket more for points rounded across
 * a bucket edge; kept, the particles within 2.5 of some point of the SLACK square (2.5 + SLACK·√2, rounded up).
 */
function gather(g: Grow, x: number, y: number): void {
  const { gw, gh, head, next, xs, ys, CX, CY } = g
  let cand = 0
  g.gx0 = x; g.gy0 = y; g.gcount = g.count
  const xa = Math.max(0, Math.floor(x - SLACK - 2.5) - 1), xb = Math.min(gw - 1, Math.floor(x + SLACK + 2.5) + 1)
  const ya = Math.max(0, Math.floor(y - SLACK - 2.5) - 1), yb = Math.min(gh - 1, Math.floor(y + SLACK + 2.5) + 1)
  for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) for (let i = head[yy * gw + xx]; i >= 0; i = next[i]) {
    const ex = xs[i] - x, ey = ys[i] - y
    if (ex * ex + ey * ey < KEEP2) { CX[cand] = xs[i]; CY[cand] = ys[i]; cand++ }
  }
  g.cand = cand
}

const TAU = Math.PI * 2
/**
 * One walker, launched on the circle of radius `launch` round the seed, walked until it sticks (relaunched past
 * `killR` or off the domain); returns the jumps it took. A function per walker (not one loop in `dla`) so it is
 * optimised by its call count, which a second cluster then starts with.
 */
function walk(g: Grow, rnd: () => number, launch: number, killR: number, w: number, h: number, minStep: number): number {
  const { cx, cy, near, gw } = g
  let steps = 0, a = rnd() * TAU, x = cx + launch * dcos(a), y = cy + launch * dsin(a)
  for (;;) {
    const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy)
    if (d > killR || x < 0 || y < 0 || x >= w || y >= h) { a = rnd() * TAU; x = cx + launch * dcos(a); y = cy + launch * dsin(a); continue }
    // room to move: the largest circle around the walker that holds no particle centre closer than 1
    let room = d - g.rmax - 1
    if (room < 2) {
      const bound = near[(y | 0) * gw + (x | 0)]
      room = bound >= 2.5 ? bound - 1 : clear(g, x, y) - 1
    }
    a = rnd() * TAU; steps++
    if (room >= minStep) { x += room * dcos(a); y += room * dsin(a); continue }
    // within reach: a short step; if it touches, stick at the contact point
    const nx = x + minStep * dcos(a), ny = y + minStep * dsin(a), q = clear(g, nx, ny)
    if (q > 1) { x = nx; y = ny; continue }
    // the step overlaps: bisect it for the first contact (clear at f = 0, overlapping at f = 1)
    let lo = 0, hi = 1
    for (let k = 0; k < 14; k++) { const f = (lo + hi) / 2; if (clear(g, x + (nx - x) * f, y + (ny - y) * f) > 1) lo = f; else hi = f }
    const sx = x + (nx - x) * lo, sy = y + (ny - y) * lo
    nearest(g, sx, sy)
    add(g, sx, sy, g.hit)
    return steps
  }
}

export function dla(spec: DlaSpec): Dla {
  const { w, h, n, seed = 1, kill = 2.5, minStep = .4 } = spec
  const maxRadius = spec.maxRadius ?? Math.min(w, h) / 2 - 2
  const rnd = mulberry32(seed >>> 0)
  const cx = w / 2, cy = h / 2, g = new Grow(Math.ceil(w), Math.ceil(h), n, cx, cy)
  let steps = 0
  add(g, cx, cy, -1)
  while (g.count < n && g.rmax < maxRadius) {
    const launch = g.rmax + 3
    steps += walk(g, rnd, launch, Math.max(launch + 8, launch * kill), w, h, minStep)
  }
  const count = g.count
  return { w, h, count, x: g.xs.slice(0, count), y: g.ys.slice(0, count), parent: g.parent.slice(0, count), depth: g.depth.slice(0, count), radius: g.radius.slice(0, count), gyration: g.gyration.slice(0, count), steps }
}
