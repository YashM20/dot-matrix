/**
 * Position-based dynamics (Müller et al. 2007): cloth (3D particles on a grid, distance constraints,
 * aerodynamic wind on the normals, pinned particles) and a 2D soft body (a ring of particles held by
 * perimeter constraints, an area constraint and shape matching, so it wobbles like jelly and keeps its volume).
 * Verlet state (position + previous position), so a step is stable at any frame rate and velocity is implied.
 *
 * State lives in a world's Float32Array (layouts below); constraint tables, rest shapes and normals are
 * per body (constant / scratch). Constraint passes are Gauss–Seidel on CPU; a GPU port colours the grid
 * constraints (4 colours for structural, 4 for shear) and runs each colour as one dispatch. Framework-free.
 */

// ── Cloth ───────────────────────────────────────────────────────────────────

export interface ClothOptions {
  cols: number; rows: number
  /** Rest distance between neighbours (world units). */
  spacing: number
  /** World position of particle (0, 0); the sheet lies in the x/y plane, rows growing +y. */
  origin: [number, number, number]
  /** Pinned particles (infinite mass), by grid index. */
  pin: (col: number, row: number) => boolean
  /** Stiffness per solver pass of stretch / shear / bend constraints (0..1). */
  stretch?: number; shear?: number; bend?: number
  /** Solver passes per step (default 6). */
  iterations?: number
  /** Velocity kept per step (default .995). */
  drag?: number
  /** Gravity at 1 g, world units / s² (default 160). */
  g?: number
  /** Aerodynamic coefficient: force = k (n · (wind − v)) n (default .9). */
  lift?: number
}
export interface Cloth extends Required<Omit<ClothOptions, 'pin'>> {
  n: number
  /** State offsets: x, y, z planes then px, py, pz planes. */
  X: number; Y: number; Z: number; PX: number; PY: number; PZ: number
  invMass: Float32Array
  /** Constraints: particle pairs, rest lengths, stiffness. */
  ca: Int32Array; cb: Int32Array; rest: Float32Array; k: Float32Array
  /** Per-particle normal (scratch). */
  nx: Float32Array; ny: Float32Array; nz: Float32Array
}
export const CLOTH_STRIDE = 6

export function createCloth(o: ClothOptions, offset = 0): Cloth {
  const { cols, rows, spacing } = o, n = cols * rows
  const invMass = new Float32Array(n)
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) invMass[j * cols + i] = o.pin(i, j) ? 0 : 1
  const pairs: [number, number, number, number][] = [], at = (i: number, j: number) => j * cols + i
  const stretch = o.stretch ?? 1, shear = o.shear ?? .6, bend = o.bend ?? .25
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (i + 1 < cols) pairs.push([at(i, j), at(i + 1, j), spacing, stretch])
    if (j + 1 < rows) pairs.push([at(i, j), at(i, j + 1), spacing, stretch])
    if (i + 1 < cols && j + 1 < rows) { pairs.push([at(i, j), at(i + 1, j + 1), spacing * Math.SQRT2, shear]); pairs.push([at(i + 1, j), at(i, j + 1), spacing * Math.SQRT2, shear]) }
    if (i + 2 < cols) pairs.push([at(i, j), at(i + 2, j), spacing * 2, bend])
    if (j + 2 < rows) pairs.push([at(i, j), at(i, j + 2), spacing * 2, bend])
  }
  const m = pairs.length
  const ca = new Int32Array(m), cb = new Int32Array(m), rest = new Float32Array(m), k = new Float32Array(m)
  pairs.forEach(([a, b, l, s], c) => { ca[c] = a; cb[c] = b; rest[c] = l; k[c] = s })
  return {
    cols, rows, spacing, origin: o.origin, stretch, shear, bend, iterations: o.iterations ?? 6, drag: o.drag ?? .995, g: o.g ?? 160, lift: o.lift ?? .9,
    n, X: offset, Y: offset + n, Z: offset + 2 * n, PX: offset + 3 * n, PY: offset + 4 * n, PZ: offset + 5 * n,
    invMass, ca, cb, rest, k, nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
  }
}
export const clothSize = (c: Cloth) => c.n * CLOTH_STRIDE

/** Flat sheet at rest. */
export function clothInit(c: Cloth, s: Float32Array): void {
  const [ox, oy, oz] = c.origin
  for (let j = 0; j < c.rows; j++) for (let i = 0; i < c.cols; i++) {
    const p = j * c.cols + i
    s[c.X + p] = s[c.PX + p] = ox + i * c.spacing
    s[c.Y + p] = s[c.PY + p] = oy + j * c.spacing
    s[c.Z + p] = s[c.PZ + p] = oz
  }
}

/** Per-particle normals from the grid neighbours (central differences of the surface), unit length. */
export function clothNormals(c: Cloth, s: Float32Array): void {
  const { cols, rows, X, Y, Z, nx, ny, nz } = c
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const p = j * cols + i, l = j * cols + Math.max(0, i - 1), r = j * cols + Math.min(cols - 1, i + 1)
    const u = Math.max(0, j - 1) * cols + i, d = Math.min(rows - 1, j + 1) * cols + i
    const ax = s[X + r] - s[X + l], ay = s[Y + r] - s[Y + l], az = s[Z + r] - s[Z + l]
    const bx = s[X + d] - s[X + u], by = s[Y + d] - s[Y + u], bz = s[Z + d] - s[Z + u]
    let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx
    const len = Math.hypot(x, y, z) || 1
    x /= len; y /= len; z /= len
    nx[p] = x; ny[p] = y; nz[p] = z
  }
}

export interface ClothStepOptions {
  /** Gravity direction in g (x, y; the sheet hangs along it). */
  gx?: number; gy?: number
  /** Wind velocity at particle p (world units / s), written into `out`. */
  wind?: (p: number, x: number, y: number, z: number, out: Float32Array) => void
  /** Pinned this step: particle → target position (grab). */
  grab?: { p: number; x: number; y: number; z: number }
}
const windOut = new Float32Array(3)
/** One step of dt seconds. */
export function clothStep(c: Cloth, s: Float32Array, dt: number, o: ClothStepOptions = {}): void {
  const { n, X, Y, Z, PX, PY, PZ, invMass, drag } = c, gx = (o.gx ?? 0) * c.g * dt * dt, gy = (o.gy ?? 1) * c.g * dt * dt
  if (o.wind) clothNormals(c, s)
  const vmax = c.spacing * .9 // never more than ~a spacing per step: tunnelling and blow-ups are impossible
  for (let p = 0; p < n; p++) {
    if (invMass[p] === 0) continue
    let vx = (s[X + p] - s[PX + p]) * drag, vy = (s[Y + p] - s[PY + p]) * drag, vz = (s[Z + p] - s[PZ + p]) * drag
    vx += gx; vy += gy
    if (o.wind) {
      o.wind(p, s[X + p], s[Y + p], s[Z + p], windOut)
      // relative wind along the normal pushes the sheet (both faces)
      const rx = windOut[0] - vx / dt, ry = windOut[1] - vy / dt, rz = windOut[2] - vz / dt
      const f = c.lift * (rx * c.nx[p] + ry * c.ny[p] + rz * c.nz[p]) * dt * dt
      vx += f * c.nx[p]; vy += f * c.ny[p]; vz += f * c.nz[p]
    }
    const sp = vx * vx + vy * vy + vz * vz
    if (sp > vmax * vmax) { const k = vmax / Math.sqrt(sp); vx *= k; vy *= k; vz *= k }
    s[PX + p] = s[X + p]; s[PY + p] = s[Y + p]; s[PZ + p] = s[Z + p]
    s[X + p] += vx; s[Y + p] += vy; s[Z + p] += vz
  }
  const g = o.grab
  for (let it = 0; it < c.iterations; it++) {
    if (g) { s[X + g.p] = g.x; s[Y + g.p] = g.y; s[Z + g.p] = g.z }
    for (let q = 0; q < c.ca.length; q++) {
      const a = c.ca[q], b = c.cb[q], wa = g && g.p === a ? 0 : invMass[a], wb = g && g.p === b ? 0 : invMass[b], w = wa + wb
      if (w === 0) continue
      const dx = s[X + b] - s[X + a], dy = s[Y + b] - s[Y + a], dz = s[Z + b] - s[Z + a]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < 1e-6) continue
      const k = c.k[q] * (d - c.rest[q]) / (d * w)
      s[X + a] += dx * k * wa; s[Y + a] += dy * k * wa; s[Z + a] += dz * k * wa
      s[X + b] -= dx * k * wb; s[Y + b] -= dy * k * wb; s[Z + b] -= dz * k * wb
    }
  }
  if (g) { s[X + g.p] = g.x; s[Y + g.p] = g.y; s[Z + g.p] = g.z }
}
/** Nearest particle to (x, y) in the x/y projection, within `reach`, or -1. */
export function clothNearest(c: Cloth, s: Float32Array, x: number, y: number, reach: number): number {
  let best = -1, bd = reach * reach
  for (let p = 0; p < c.n; p++) { const dx = s[c.X + p] - x, dy = s[c.Y + p] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p } }
  return best
}
/** Largest relative stretch of any stretch constraint (tests: a stable sheet stays near 0). */
export function clothMaxStrain(c: Cloth, s: Float32Array): number {
  let m = 0
  for (let q = 0; q < c.ca.length; q++) {
    if (c.k[q] !== c.stretch || c.rest[q] !== c.spacing) continue
    const a = c.ca[q], b = c.cb[q], d = Math.hypot(s[c.X + b] - s[c.X + a], s[c.Y + b] - s[c.Y + a], s[c.Z + b] - s[c.Z + a])
    m = Math.max(m, Math.abs(d / c.rest[q] - 1))
  }
  return m
}

// ── Soft body (2D jelly) ────────────────────────────────────────────────────

export interface SoftOptions {
  /** Particles on the ring. */
  count: number
  /** Rest shape centre and radii (an ellipse, flattened at the bottom by `flat`). */
  cx: number; cy: number; rx: number; ry: number
  /** 0..1: how much of the lower half is squared off into a base (default .35). */
  flat?: number
  /** Shape-matching pull per step (0..1, default .12) and its linear (squash) share (default .35). */
  stiffness?: number; squash?: number
  /** Area constraint stiffness (default .5) and perimeter stiffness (default .6). */
  pressure?: number; perimeter?: number
  /** Solver passes (default 4), drag (default .992), gravity at 1 g (default 220). */
  iterations?: number; drag?: number; g?: number
  /** Floor box [x0, y0, x1, y1] the ring stays inside, with friction on contact (default .7). */
  bounds: [number, number, number, number]
  friction?: number
}
export interface Soft extends Required<SoftOptions> {
  n: number
  /** State offsets: x, y planes, then px, py planes. */
  X: number; Y: number; PX: number; PY: number
  /** Rest offsets from the rest centroid, and the rest area / edge lengths. */
  qx: Float32Array; qy: Float32Array; area0: number; edge: Float32Array
  /** Inverse of Σ q qᵀ (2×2), for the linear (squash) part of shape matching. */
  aqq: [number, number, number, number]
}
export const SOFT_STRIDE = 4

export function createSoft(o: SoftOptions, offset = 0): Soft {
  const n = o.count, flat = o.flat ?? .35, qx = new Float32Array(n), qy = new Float32Array(n)
  let mx = 0, my = 0
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    let x = Math.cos(a) * o.rx, y = Math.sin(a) * o.ry
    // a squared-off base: the lower half bulges toward its bounding box (a gumdrop, not an egg)
    if (y > 0) { const k = flat * (y / o.ry); x = x * (1 - k) + Math.sign(x) * Math.min(o.rx, Math.abs(x) * 1.25) * k; y = y * (1 - k * .5) + o.ry * k * .5 }
    qx[i] = x; qy[i] = y; mx += x; my += y
  }
  mx /= n; my /= n
  let a00 = 0, a01 = 0, a11 = 0
  for (let i = 0; i < n; i++) { qx[i] -= mx; qy[i] -= my; a00 += qx[i] * qx[i]; a01 += qx[i] * qy[i]; a11 += qy[i] * qy[i] }
  const det = a00 * a11 - a01 * a01
  const edge = new Float32Array(n)
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; edge[i] = Math.hypot(qx[j] - qx[i], qy[j] - qy[i]) }
  const s: Soft = {
    ...o, flat, stiffness: o.stiffness ?? .12, squash: o.squash ?? .35, pressure: o.pressure ?? .5, perimeter: o.perimeter ?? .6,
    iterations: o.iterations ?? 4, drag: o.drag ?? .992, g: o.g ?? 220, friction: o.friction ?? .7,
    n, X: offset, Y: offset + n, PX: offset + 2 * n, PY: offset + 3 * n, qx, qy, area0: 0, edge,
    aqq: [a11 / det, -a01 / det, -a01 / det, a00 / det],
  }
  s.area0 = polygonArea(qx, qy, 0, 0, n)
  return s
}
export const softSize = (b: Soft) => b.n * SOFT_STRIDE
function polygonArea(xs: ArrayLike<number>, ys: ArrayLike<number>, ox: number, oy: number, n: number): number {
  let a = 0
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += xs[ox + i] * ys[oy + j] - xs[ox + j] * ys[oy + i] }
  return a / 2
}
/** Signed area of the ring in state `s`. */
export const softArea = (b: Soft, s: Float32Array) => polygonArea(s, s, b.X, b.Y, b.n)

/** Rest pose at (cx, cy). */
export function softInit(b: Soft, s: Float32Array, cx = b.cx, cy = b.cy): void {
  for (let i = 0; i < b.n; i++) { s[b.X + i] = s[b.PX + i] = cx + b.qx[i]; s[b.Y + i] = s[b.PY + i] = cy + b.qy[i] }
}

/** Shape-matching frame of the ring: centroid and the rotation angle of the best fit. */
export function softFrame(b: Soft, s: Float32Array): { cx: number; cy: number; angle: number; sx: number; sy: number } {
  const { n, X, Y, qx, qy } = b
  let cx = 0, cy = 0
  for (let i = 0; i < n; i++) { cx += s[X + i]; cy += s[Y + i] }
  cx /= n; cy /= n
  let p00 = 0, p01 = 0, p10 = 0, p11 = 0
  for (let i = 0; i < n; i++) { const px = s[X + i] - cx, py = s[Y + i] - cy; p00 += px * qx[i]; p01 += px * qy[i]; p10 += py * qx[i]; p11 += py * qy[i] }
  const angle = Math.atan2(p10 - p01, p00 + p11)
  // stretch along the body axes (A = Apq Aqq⁻¹, diagonal after removing the rotation)
  const [q00, q01, q10, q11] = b.aqq, c = Math.cos(-angle), sn = Math.sin(-angle)
  const a00 = p00 * q00 + p01 * q10, a01 = p00 * q01 + p01 * q11, a10 = p10 * q00 + p11 * q10, a11 = p10 * q01 + p11 * q11
  const sx = c * a00 - sn * a10, sy = sn * a01 + c * a11
  return { cx, cy, angle, sx, sy }
}

export interface SoftStepOptions {
  gx?: number; gy?: number
  /** Round colliders pushing the ring outward/away (pointer pokes): x, y, radius. */
  pokes?: { x: number; y: number; r: number }[]
  /** Particle pinned to a target this step (grab). */
  grab?: { p: number; x: number; y: number }
}
export function softStep(b: Soft, s: Float32Array, dt: number, o: SoftStepOptions = {}): void {
  const { n, X, Y, PX, PY, drag, qx, qy } = b, ax = (o.gx ?? 0) * b.g * dt * dt, ay = (o.gy ?? 1) * b.g * dt * dt
  const vmax = Math.min(b.rx, b.ry) * .5
  for (let i = 0; i < n; i++) {
    let vx = (s[X + i] - s[PX + i]) * drag + ax, vy = (s[Y + i] - s[PY + i]) * drag + ay
    const sp = vx * vx + vy * vy
    if (sp > vmax * vmax) { const k = vmax / Math.sqrt(sp); vx *= k; vy *= k }
    s[PX + i] = s[X + i]; s[PY + i] = s[Y + i]; s[X + i] += vx; s[Y + i] += vy
  }
  const g = o.grab
  for (let it = 0; it < b.iterations; it++) {
    // shape matching: pull every particle toward c + (β A + (1 − β) R) q, A volume-normalised
    const f = softFrame(b, s), cs = Math.cos(f.angle), sn = Math.sin(f.angle), beta = b.squash
    const vol = Math.sqrt(Math.max(1e-6, Math.abs(f.sx * f.sy))), sx = 1 + beta * (f.sx / vol - 1), sy = 1 + beta * (f.sy / vol - 1)
    const k = 1 - Math.pow(1 - b.stiffness, 1 / b.iterations)
    for (let i = 0; i < n; i++) {
      const lx = qx[i] * sx, ly = qy[i] * sy
      const gx = f.cx + cs * lx - sn * ly, gy = f.cy + sn * lx + cs * ly
      s[X + i] += (gx - s[X + i]) * k; s[Y + i] += (gy - s[Y + i]) * k
    }
    // perimeter: neighbouring particles keep their rest spacing
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = s[X + j] - s[X + i], dy = s[Y + j] - s[Y + i], d = Math.hypot(dx, dy)
      if (d < 1e-6) continue
      const c = b.perimeter * .5 * (d - b.edge[i]) / d
      s[X + i] += dx * c; s[Y + i] += dy * c; s[X + j] -= dx * c; s[Y + j] -= dy * c
    }
    // area: move every particle along its outward normal so the enclosed area returns to the rest area
    const area = softArea(b, s), err = b.area0 - area
    let gsum = 0
    for (let i = 0; i < n; i++) { const p = (i + n - 1) % n, q = (i + 1) % n, gx = .5 * (s[Y + q] - s[Y + p]), gy = .5 * (s[X + p] - s[X + q]); gsum += gx * gx + gy * gy }
    if (gsum > 1e-9) {
      const lam = b.pressure * err / gsum
      // gradients from the pre-update positions (Jacobi over the ring), so the push is symmetric
      for (let i = 0; i < n; i++) {
        const p = (i + n - 1) % n, q = (i + 1) % n
        windScratch[2 * i] = .5 * (s[Y + q] - s[Y + p]) * lam; windScratch[2 * i + 1] = .5 * (s[X + p] - s[X + q]) * lam
      }
      for (let i = 0; i < n; i++) { s[X + i] += windScratch[2 * i]; s[Y + i] += windScratch[2 * i + 1] }
    }
    for (const pk of o.pokes ?? []) for (let i = 0; i < n; i++) {
      const dx = s[X + i] - pk.x, dy = s[Y + i] - pk.y, d = Math.hypot(dx, dy)
      if (d < pk.r && d > 1e-6) { s[X + i] = pk.x + dx / d * pk.r; s[Y + i] = pk.y + dy / d * pk.r }
    }
    if (g) { s[X + g.p] = g.x; s[Y + g.p] = g.y }
    softBounds(b, s)
  }
}
const windScratch = new Float32Array(4096)
function softBounds(b: Soft, s: Float32Array) {
  const [x0, y0, x1, y1] = b.bounds, { n, X, Y, PX, PY, friction } = b
  for (let i = 0; i < n; i++) {
    let x = s[X + i], y = s[Y + i]
    if (y > y1) { y = y1; s[PX + i] = x - (x - s[PX + i]) * (1 - friction) }
    if (y < y0) y = y0
    if (x < x0) { x = x0; s[PY + i] = y - (y - s[PY + i]) * (1 - friction) }
    if (x > x1) { x = x1; s[PY + i] = y - (y - s[PY + i]) * (1 - friction) }
    s[X + i] = x; s[Y + i] = y
  }
}
/** Nearest ring particle to (x, y) within reach, or -1. */
export function softNearest(b: Soft, s: Float32Array, x: number, y: number, reach: number): number {
  let best = -1, bd = reach * reach
  for (let i = 0; i < b.n; i++) { const dx = s[b.X + i] - x, dy = s[b.Y + i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i } }
  return best
}
/** Is (x, y) inside the ring? (even–odd) */
export function softContains(b: Soft, s: Float32Array, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = b.n - 1; i < b.n; j = i++) {
    const xi = s[b.X + i], yi = s[b.Y + i], xj = s[b.X + j], yj = s[b.Y + j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
