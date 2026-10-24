/**
 * Dot sprites: 2D discs as position-based particles (Verlet: position + previous position, so velocity is
 * implied and a step can never blow up), colliding with each other through a uniform spatial hash, and with
 * the card's bounds (restitution + floor friction). Kinds: 0 = off, 1 = dynamic, 2 = static obstacle
 * (collides, never moves — e.g. the dots still sitting in a word).
 *
 * State (in a world's Float32Array) is `PARTICLE_STRIDE` planes of n: x, y, px, py, kind. Radii and masses are
 * per system (constant); the spatial hash is scratch rebuilt by a counting sort every solver iteration, O(n).
 * Each pass (integrate, hash, contacts, bounds) is a data-parallel map, the shape a GPU port keeps
 * (contacts become a Jacobi-style averaged solve there). Framework-free, no allocation per step.
 */
export const PARTICLE_STRIDE = 5
export const P_OFF = 0, P_DYNAMIC = 1, P_STATIC = 2

export interface SpatialHash {
  cell: number; cols: number; rows: number; x0: number; y0: number
  /** Prefix sums of particles per cell (cols·rows + 1) and the particle indices sorted by cell. */
  start: Int32Array; items: Int32Array; cellOf: Int32Array
}
export function createHash(n: number, bounds: [number, number, number, number], cell: number): SpatialHash {
  const [x0, y0, x1, y1] = bounds, cols = Math.max(1, Math.ceil((x1 - x0) / cell)), rows = Math.max(1, Math.ceil((y1 - y0) / cell))
  return { cell, cols, rows, x0, y0, start: new Int32Array(cols * rows + 1), items: new Int32Array(n), cellOf: new Int32Array(n) }
}
/** Bucket the particles of `s` whose kind ≠ off (counting sort; positions outside the box clamp to its edge cells). */
export function buildHash(hs: SpatialHash, s: Float32Array, n: number, X: number, Y: number, K: number): void {
  const { cell, cols, rows, x0, y0, start, items, cellOf } = hs
  start.fill(0)
  for (let i = 0; i < n; i++) {
    if (s[K + i] === P_OFF) { cellOf[i] = -1; continue }
    let cx = Math.floor((s[X + i] - x0) / cell), cy = Math.floor((s[Y + i] - y0) / cell)
    cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx; cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy
    const c = cy * cols + cx
    cellOf[i] = c; start[c + 1]++
  }
  for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c]
  // fill using a running cursor per cell (reuse `cellOf` order; start[c] is advanced then restored)
  for (let i = 0; i < n; i++) { const c = cellOf[i]; if (c >= 0) items[start[c]++] = i }
  for (let c = cols * rows; c > 0; c--) start[c] = start[c - 1]
  start[0] = 0
}

export interface ParticleOptions {
  n: number
  /** Radius per particle (cells), or one radius for all. */
  radius: number | Float32Array
  /** Inverse mass per particle (default ∝ 1/r²). */
  invMass?: Float32Array
  /** Box the discs live in: [x0, y0, x1, y1]. */
  bounds: [number, number, number, number]
  /** Bounce off the box (0..1, default .45) and off each other (default .2). */
  restitution?: number; bounce?: number
  /** Tangential velocity kept per floor contact step (default .9). */
  friction?: number
  /** Velocity kept per step (air drag, default .998). */
  drag?: number
  /** Gravity in cells / s² at 1 g (default 220). */
  g?: number
  /** Contact iterations per step (default 3). */
  iterations?: number
  /** Speed limit, cells / s (default 400). */
  maxSpeed?: number
}
export interface Particles extends Required<Omit<ParticleOptions, 'radius' | 'invMass'>> {
  r: Float32Array; invMass: Float32Array; rMax: number
  X: number; Y: number; PX: number; PY: number; K: number
  hash: SpatialHash
}
export function createParticles(o: ParticleOptions, offset = 0): Particles {
  const r = typeof o.radius === 'number' ? new Float32Array(o.n).fill(o.radius) : o.radius
  const invMass = o.invMass ?? r.map(x => 1 / Math.max(.25, x * x))
  let rMax = 0; for (const x of r) if (x > rMax) rMax = x
  const n = o.n
  return {
    n, bounds: o.bounds, restitution: o.restitution ?? .45, bounce: o.bounce ?? .2, friction: o.friction ?? .9, drag: o.drag ?? .998,
    g: o.g ?? 220, iterations: o.iterations ?? 3, maxSpeed: o.maxSpeed ?? 400,
    r, invMass, rMax, X: offset, Y: offset + n, PX: offset + 2 * n, PY: offset + 3 * n, K: offset + 4 * n,
    hash: createHash(n, o.bounds, Math.max(1, 2 * rMax)),
  }
}
export const particlesSize = (p: Particles) => p.n * PARTICLE_STRIDE

/** Place particle i at (x, y) with velocity (vx, vy) cells / s for a step of dt. */
export function setParticle(p: Particles, s: Float32Array, i: number, x: number, y: number, vx: number, vy: number, dt: number, kind = P_DYNAMIC): void {
  s[p.X + i] = x; s[p.Y + i] = y; s[p.PX + i] = x - vx * dt; s[p.PY + i] = y - vy * dt; s[p.K + i] = kind
}
export const particleSpeed = (p: Particles, s: Float32Array, i: number, dt: number) => Math.hypot(s[p.X + i] - s[p.PX + i], s[p.Y + i] - s[p.PY + i]) / dt

/** Nearest particle (of `kind`, default dynamic) to (x, y) within `reach` of its rim, or -1. */
export function nearestParticle(p: Particles, s: Float32Array, x: number, y: number, reach: number, kind = P_DYNAMIC): number {
  let best = -1, bd = Infinity
  for (let i = 0; i < p.n; i++) {
    if (s[p.K + i] !== kind) continue
    const d = Math.hypot(s[p.X + i] - x, s[p.Y + i] - y) - p.r[i]
    if (d < reach && d < bd) { bd = d; best = i }
  }
  return best
}

/**
 * One step: Verlet integrate dynamic particles under gravity (gx, gy) in g, then `iterations` rounds of
 * disc contacts (hash neighbourhood, mass-weighted, with a little bounce) and box bounds (restitution, floor
 * friction along the gravity's tangent). `hold(i)` returns true for particles the caller pins this step.
 */
export function particlesStep(p: Particles, s: Float32Array, dt: number, gx = 0, gy = 1, hold?: (i: number) => boolean): void {
  const { n, X, Y, PX, PY, K, r, invMass, drag } = p, ax = gx * p.g * dt * dt, ay = gy * p.g * dt * dt, vmax = p.maxSpeed * dt
  for (let i = 0; i < n; i++) {
    if (s[K + i] !== P_DYNAMIC || hold?.(i)) continue
    let vx = (s[X + i] - s[PX + i]) * drag + ax, vy = (s[Y + i] - s[PY + i]) * drag + ay
    const sp = vx * vx + vy * vy
    if (sp > vmax * vmax) { const k = vmax / Math.sqrt(sp); vx *= k; vy *= k }
    s[PX + i] = s[X + i]; s[PY + i] = s[Y + i]; s[X + i] += vx; s[Y + i] += vy
  }
  // resting contacts (normal speed under ~4 steps of gravity) do not bounce: piles sit still instead of buzzing
  const rest = 4 * p.g * dt * dt, hs = p.hash, { cols, rows, start, items, cellOf } = hs
  for (let it = 0; it < p.iterations; it++) {
    buildHash(hs, s, n, X, Y, K)
    for (let i = 0; i < n; i++) {
      const c = cellOf[i]
      if (c < 0 || s[K + i] !== P_DYNAMIC) continue
      const cx = c % cols, cy = (c / cols) | 0, wi = hold?.(i) ? 0 : invMass[i]
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy
        if (yy < 0 || yy >= rows) continue
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox
          if (xx < 0 || xx >= cols) continue
          const cc = yy * cols + xx
          for (let q = start[cc]; q < start[cc + 1]; q++) {
            const j = items[q]
            // each dynamic pair once (i < j); static obstacles are visited from the dynamic side only
            if (j === i || (s[K + j] === P_DYNAMIC && j < i)) continue
            const dx = s[X + j] - s[X + i], dy = s[Y + j] - s[Y + i], rr = r[i] + r[j], d2 = dx * dx + dy * dy
            if (d2 >= rr * rr) continue
            const wj = s[K + j] === P_STATIC || hold?.(j) ? 0 : invMass[j], wsum = wi + wj
            if (wsum <= 0) continue
            let d = Math.sqrt(d2), nx: number, ny: number
            if (d < 1e-6) { nx = 1; ny = 0; d = 0 } else { nx = dx / d; ny = dy / d }
            const pen = (rr - d) / wsum, ki = pen * wi, kj = pen * wj
            s[X + i] -= nx * ki; s[Y + i] -= ny * ki; s[X + j] += nx * kj; s[Y + j] += ny * kj
            // a touch of bounce: move the previous positions so the normal velocity partly reverses
            if (p.bounce > 0 && it === 0) {
              const rvx = (s[X + j] - s[PX + j]) - (s[X + i] - s[PX + i]), rvy = (s[Y + j] - s[PY + j]) - (s[Y + i] - s[PY + i])
              const vn = rvx * nx + rvy * ny
              if (vn < -rest) {
                const imp = -vn * p.bounce / wsum
                s[PX + i] += nx * imp * wi; s[PY + i] += ny * imp * wi; s[PX + j] -= nx * imp * wj; s[PY + j] -= ny * imp * wj
              }
            }
          }
        }
      }
    }
    bounds(p, s, gx, gy, rest, hold)
  }
}

/** Keep dynamic discs inside the box; reflect the normal velocity (restitution) and damp the tangential one. */
function bounds(p: Particles, s: Float32Array, gx: number, gy: number, rest: number, hold?: (i: number) => boolean) {
  const { n, X, Y, PX, PY, K, r, restitution: e, friction } = p, [x0, y0, x1, y1] = p.bounds
  // which walls act as floors: those the gravity presses into
  const fl = gx < -.3, fr = gx > .3, ft = gy < -.3, fb = gy > .3 || (Math.abs(gx) <= .3 && Math.abs(gy) <= .3)
  for (let i = 0; i < n; i++) {
    if (s[K + i] !== P_DYNAMIC || hold?.(i)) continue
    const ri = r[i]
    let x = s[X + i], y = s[Y + i], vx = x - s[PX + i], vy = y - s[PY + i], slideX = false, slideY = false
    // into a wall: reflect (restitution) above the resting speed, stop below it; floors damp the slide along them
    if (x < x0 + ri) { x = x0 + ri; if (vx < 0) vx = -vx > rest ? -vx * e : 0; slideY = fl }
    else if (x > x1 - ri) { x = x1 - ri; if (vx > 0) vx = vx > rest ? -vx * e : 0; slideY = fr }
    if (y < y0 + ri) { y = y0 + ri; if (vy < 0) vy = -vy > rest ? -vy * e : 0; slideX = ft }
    else if (y > y1 - ri) { y = y1 - ri; if (vy > 0) vy = vy > rest ? -vy * e : 0; slideX = fb }
    if (slideX) vx *= friction
    if (slideY) vy *= friction
    s[X + i] = x; s[Y + i] = y; s[PX + i] = x - vx; s[PY + i] = y - vy
  }
}

/** Kinetic energy proxy Σ |v|² (cells / step) — settling tests. */
export function particlesEnergy(p: Particles, s: Float32Array): number {
  let e = 0
  for (let i = 0; i < p.n; i++) if (s[p.K + i] === P_DYNAMIC) { const vx = s[p.X + i] - s[p.PX + i], vy = s[p.Y + i] - s[p.PY + i]; e += vx * vx + vy * vy }
  return e
}
/** Deepest overlap between any two non-off discs (tests). */
export function particlesMaxOverlap(p: Particles, s: Float32Array): number {
  let m = 0
  for (let i = 0; i < p.n; i++) for (let j = i + 1; j < p.n; j++) {
    if (s[p.K + i] === P_OFF || s[p.K + j] === P_OFF || (s[p.K + i] === P_STATIC && s[p.K + j] === P_STATIC)) continue
    const d = p.r[i] + p.r[j] - Math.hypot(s[p.X + i] - s[p.X + j], s[p.Y + i] - s[p.Y + j])
    if (d > m) m = d
  }
  return m
}
