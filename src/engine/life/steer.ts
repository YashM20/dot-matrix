/**
 * Reynolds steering (Steering Behaviors for Autonomous Characters, GDC 1999) on head agents, plus a turn-capped
 * integrator and the Mauthner C-start escape (Eaton et al. 1977; Domenici & Blake 1997).
 * Every behaviour adds into `out` [fx, fy], scaled by its weight `w` (the caller picks units: the pond uses L/s²).
 * The unscaled terms are at most about 1 in size, so weights read as accelerations.
 * Headings are unit vectors (hx, hy), never angles; turns use precomputed cos / sin, so no trig runs per step.
 */
import { dcos, dsin, noise2, TAU } from '../noise'
import type { SpatialHash } from '../physics/particles'

export interface Agent { x: number; y: number; hx: number; hy: number; u: number }

/** Steer toward (tx, ty) at full speed: (desired velocity − velocity) / maxU. */
export function seek(a: Agent, tx: number, ty: number, maxU: number, w: number, out: Float32Array | number[]): void {
  const dx = tx - a.x, dy = ty - a.y, l = Math.sqrt(dx * dx + dy * dy)
  if (!(l > 1e-9) || !(maxU > 0)) return
  out[0] += w * ((dx / l) * maxU - a.hx * a.u) / maxU
  out[1] += w * ((dy / l) * maxU - a.hy * a.u) / maxU
}
/** Steer away from (tx, ty) at full speed. */
export function flee(a: Agent, tx: number, ty: number, maxU: number, w: number, out: Float32Array | number[]): void {
  seek(a, 2 * a.x - tx, 2 * a.y - ty, maxU, w, out)
}
/** Seek that slows inside `slow` cells and stops on the target (arrive). */
export function arrive(a: Agent, tx: number, ty: number, maxU: number, slow: number, w: number, out: Float32Array | number[]): void {
  const dx = tx - a.x, dy = ty - a.y, l = Math.sqrt(dx * dx + dy * dy)
  if (!(l > 1e-9) || !(maxU > 0)) return
  const want = l < slow ? (maxU * l) / slow : maxU
  out[0] += w * ((dx / l) * want - a.hx * a.u) / maxU
  out[1] += w * ((dy / l) * want - a.hy * a.u) / maxU
}
/**
 * Wander on a circle `dist` ahead, radius `rad`: the angle on the circle is TAU·noise2(n·dt·rate, id, seed), smooth
 * in time and pure in (n, id, seed). Pushes toward that point (unit strength).
 */
export function wander(a: Agent, id: number, n: number, dt: number, o: { dist: number; rad: number; rate: number; seed: number }, w: number, out: Float32Array | number[]): void {
  const th = TAU * noise2(n * dt * o.rate, id * 7.31 + .5, o.seed)
  const tx = a.x + a.hx * o.dist + o.rad * dcos(th), ty = a.y + a.hy * o.dist + o.rad * dsin(th)
  const dx = tx - a.x, dy = ty - a.y, l = Math.sqrt(dx * dx + dy * dy)
  if (!(l > 1e-9)) return
  out[0] += (w * dx) / l; out[1] += (w * dy) / l
}
/**
 * Stay inside the region sdf < 0: look `ahead` seconds along the velocity; when sdf(p') > −margin, push along −∇sdf
 * with weight w·(1 + (sdf + margin)/margin). The gradient is a central difference (h = .5 cell).
 */
export function contain(a: Agent, sdf: (x: number, y: number) => number, ahead: number, margin: number, w: number, out: Float32Array | number[]): void {
  const px = a.x + a.hx * a.u * ahead, py = a.y + a.hy * a.u * ahead, d = sdf(px, py)
  if (d <= -margin) return
  const gx = sdf(px + .5, py) - sdf(px - .5, py), gy = sdf(px, py + .5) - sdf(px, py - .5), l = Math.sqrt(gx * gx + gy * gy)
  if (!(l > 1e-9)) return
  const k = w * (1 + (d + margin) / margin)
  out[0] -= (k * gx) / l; out[1] -= (k * gy) / l
}
/** Push away from `count` points (xy pairs) closer than `radius`, linearly stronger when closer. */
export function separate(a: Agent, others: ArrayLike<number>, count: number, radius: number, w: number, out: Float32Array | number[]): void {
  for (let k = 0; k < count; k++) {
    const dx = a.x - others[2 * k], dy = a.y - others[2 * k + 1], l = Math.sqrt(dx * dx + dy * dy)
    if (!(l > 1e-9) || l >= radius) continue
    const f = w * (1 - l / radius)
    out[0] += (f * dx) / l; out[1] += (f * dy) / l
  }
}
/** Match the mean velocity of `count` neighbours (hx hy u triples), normalised by the fastest of them and us. */
export function align(a: Agent, others: ArrayLike<number>, count: number, w: number, out: Float32Array | number[]): void {
  if (!count) return
  let vx = 0, vy = 0, top = a.u
  for (let k = 0; k < count; k++) { const u = others[3 * k + 2]; vx += others[3 * k] * u; vy += others[3 * k + 1] * u; if (u > top) top = u }
  if (!(top > 1e-9)) return
  out[0] += (w * (vx / count - a.hx * a.u)) / top
  out[1] += (w * (vy / count - a.hy * a.u)) / top
}

/** cos / sin of the largest turn one step may take (ω·dt), computed once per (ω, dt). */
export const turnCap = (omega: number, dt: number) => ({ c: dcos(omega * dt), s: dsin(omega * dt) })
/** Turn the heading toward the unit vector (dx, dy) by at most the cap (c, s) (exact when within it). */
export function turnToward(a: Agent, dx: number, dy: number, turn: { c: number; s: number }): void {
  const dot = a.hx * dx + a.hy * dy
  if (dot >= turn.c) { a.hx = dx; a.hy = dy; return }
  const sg = a.hx * dy - a.hy * dx < 0 ? -1 : 1, s = turn.s * sg
  const hx = a.hx * turn.c - a.hy * s, hy = a.hx * s + a.hy * turn.c, l = Math.sqrt(hx * hx + hy * hy) || 1
  a.hx = hx / l; a.hy = hy / l
}
/**
 * Integrate: the wanted velocity is v = h·u + clamp(F, maxF)·respond; the heading turns toward it by at most ω·dt
 * (`turn`); the speed takes F's along-heading part over dt, clamped to [minU, maxU]; then the agent moves.
 * `respond` (default dt) is how many seconds of F the heading answers to at once: a fish steers its heading (a
 * capped turn), so the pond uses about 1 s, and a point mass uses dt (v += F·dt).
 */
export function integrate(a: Agent, f: Float32Array | number[], dt: number, maxF: number, turn: { c: number; s: number }, minU: number, maxU: number, respond = dt): void {
  let fx = f[0], fy = f[1]
  const fl = Math.sqrt(fx * fx + fy * fy)
  if (fl > maxF) { fx *= maxF / fl; fy *= maxF / fl }
  const vx = a.hx * a.u + fx * respond, vy = a.hy * a.u + fy * respond, vl = Math.sqrt(vx * vx + vy * vy)
  if (vl > 1e-9) turnToward(a, vx / vl, vy / vl, turn)
  const u = a.u + (fx * a.hx + fy * a.hy) * dt
  a.u = u < minU ? minU : u > maxU ? maxU : u
  a.x += a.hx * a.u * dt; a.y += a.hy * a.u * dt
}

// ── flocks (L2) ─────────────────────────────────────────────────────────────────────────────────────
/** Bucket n points (state planes X, Y) into `hash` by counting sort; every point counts (no kind plane). */
export function hashPoints(hs: SpatialHash, s: ArrayLike<number>, n: number, X: number, Y: number): void {
  const { cell, cols, rows, x0, y0, start, items, cellOf } = hs
  start.fill(0)
  for (let i = 0; i < n; i++) {
    let cx = Math.floor((s[X + i] - x0) / cell), cy = Math.floor((s[Y + i] - y0) / cell)
    cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx; cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy
    const c = cy * cols + cx
    cellOf[i] = c; start[c + 1]++
  }
  for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c]
  for (let i = 0; i < n; i++) items[start[cellOf[i]]++] = i
  for (let c = cols * rows; c > 0; c--) start[c] = start[c - 1]
  start[0] = 0
}
let kd = new Float64Array(0)
/**
 * The k nearest other agents of every agent (indices into `out`, n·k; −1 when fewer exist), by insertion sort on
 * (d², index), so ties break by index and the result equals a brute-force search. The hash must hold the current
 * positions (`hashPoints`). Rings of hash cells are searched outward until the k-th distance is inside the ring.
 */
export function kNearest(s: ArrayLike<number>, n: number, X: number, Y: number, hash: SpatialHash, k: number, out: Int32Array): void {
  if (kd.length < k) kd = new Float64Array(k)
  const { cell, cols, rows, x0, y0, start, items } = hash
  for (let i = 0; i < n; i++) {
    const px = s[X + i], py = s[Y + i], o = i * k
    let m = 0
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((px - x0) / cell))), cy = Math.min(rows - 1, Math.max(0, Math.floor((py - y0) / cell)))
    const maxR = Math.max(cx, cols - 1 - cx, cy, rows - 1 - cy)
    for (let r = 0; r <= maxR; r++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= rows) continue
        const edge = gy === cy - r || gy === cy + r
        for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r) {
          if (gx >= 0 && gx < cols) {
            const c = gy * cols + gx
            for (let q = start[c]; q < start[c + 1]; q++) {
              const j = items[q]
              if (j === i) continue
              const dx = s[X + j] - px, dy = s[Y + j] - py, d = dx * dx + dy * dy
              if (m === k && (d > kd[k - 1] || (d === kd[k - 1] && j > out[o + k - 1]))) continue
              let p = m < k ? m++ : k - 1
              while (p > 0 && (kd[p - 1] > d || (kd[p - 1] === d && out[o + p - 1] > j))) { kd[p] = kd[p - 1]; out[o + p] = out[o + p - 1]; p-- }
              kd[p] = d; out[o + p] = j
            }
          }
          if (r === 0) break
        }
      }
      // every point in a later ring is at least r cells away
      if (m === k && kd[k - 1] <= (r * cell) * (r * cell)) break
    }
    for (let p = m; p < k; p++) out[o + p] = -1
  }
}
let nnScratch = new Int32Array(0)
/**
 * Boids (Reynolds 1987) over a SpatialHash. Separation from every agent within `sep` (linear falloff); alignment
 * and cohesion over the k nearest (topological, Ballerini et al. 2008) or everyone within `radius` (metric).
 * Terms are about unit size before their weights: alignment (v̄ − v)/max speed, cohesion toward the neighbours'
 * centroid (full strength `sep`·2 away), separation Σ(1 − d/sep)·unit. Adds into `out` (2n: fx, fy per agent).
 * `nn` (n·k) reuses neighbour lists from `kNearest`; the hash must hold the current positions.
 */
export function flock(s: ArrayLike<number>, n: number, planes: { X: number; Y: number; VX: number; VY: number }, hash: SpatialHash, o: { k?: number; radius?: number; sep: number; wSep: number; wAli: number; wCoh: number; nn?: Int32Array }, out: Float32Array): void {
  const { X, Y, VX, VY } = planes, { cell, cols, rows, x0, y0, start, items } = hash
  const k = o.k ?? 0, sep2 = o.sep * o.sep, reach = Math.ceil(Math.max(o.sep, o.radius ?? 0) / cell)
  let nn = o.nn
  if (k && !nn) { if (nnScratch.length < n * k) nnScratch = new Int32Array(n * k); kNearest(s, n, X, Y, hash, k, nnScratch); nn = nnScratch }
  for (let i = 0; i < n; i++) {
    const px = s[X + i], py = s[Y + i], vx = s[VX + i], vy = s[VY + i]
    let fx = 0, fy = 0, ax = 0, ay = 0, cxs = 0, cys = 0, m = 0
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((px - x0) / cell))), cy = Math.min(rows - 1, Math.max(0, Math.floor((py - y0) / cell)))
    for (let gy = Math.max(0, cy - reach); gy <= Math.min(rows - 1, cy + reach); gy++) for (let gx = Math.max(0, cx - reach); gx <= Math.min(cols - 1, cx + reach); gx++) {
      const c = gy * cols + gx
      for (let q = start[c]; q < start[c + 1]; q++) {
        const j = items[q]
        if (j === i) continue
        const dx = px - s[X + j], dy = py - s[Y + j], d2 = dx * dx + dy * dy
        if (d2 < sep2 && d2 > 1e-12) { const d = Math.sqrt(d2), f = 1 - d / o.sep; fx += (o.wSep * f * dx) / d; fy += (o.wSep * f * dy) / d }
        if (!k && o.radius !== undefined && d2 < o.radius * o.radius) { ax += s[VX + j]; ay += s[VY + j]; cxs += s[X + j]; cys += s[Y + j]; m++ }
      }
    }
    if (k && nn) for (let p = 0; p < k; p++) { const j = nn[i * k + p]; if (j < 0) break; ax += s[VX + j]; ay += s[VY + j]; cxs += s[X + j]; cys += s[Y + j]; m++ }
    if (m) {
      ax /= m; ay /= m
      const top = Math.max(Math.sqrt(ax * ax + ay * ay), Math.sqrt(vx * vx + vy * vy), 1e-9)
      fx += (o.wAli * (ax - vx)) / top; fy += (o.wAli * (ay - vy)) / top
      const dx = cxs / m - px, dy = cys / m - py, d = Math.sqrt(dx * dx + dy * dy)
      if (d > 1e-9) { const g = Math.min(1, d / (2 * o.sep)); fx += (o.wCoh * g * dx) / d; fy += (o.wCoh * g * dy) / d }
    }
    out[2 * i] += fx; out[2 * i + 1] += fy
  }
}

/** C-start timings (s) and the turn range it aims for. */
export const CSTART = { bend: .13, burst: .4, refractory: 1.5, turnMin: 90 * Math.PI / 180, turnSpan: 15 * Math.PI / 180, omega: 14 } as const
/**
 * C-start (Mauthner escape): pick the escape turn away from a stimulus at (sx, sy). The agent turns away from the
 * side the stimulus is on, by 90° + 15°·hash (`salt` ∈ [0, 1)), so the bend phase (14 rad/s for .13 s) completes it.
 * Writes [target hx, target hy, turn sign (+1 = toward +left), turn angle] into `out`; the caller runs the
 * timers (bend, then a .4 s burst at 2.6 L/s with beat 1, then a glide; refractory 1.5 s).
 */
export function startle(a: Agent, sx: number, sy: number, salt: number, out: Float32Array | number[]): void {
  const qx = sx - a.x, qy = sy - a.y
  // the stimulus is on the +cross side → turn the other way (a stimulus dead behind or ahead picks by salt)
  const cr = a.hx * qy - a.hy * qx, sg = cr > 1e-9 ? -1 : cr < -1e-9 ? 1 : salt < .5 ? -1 : 1
  const ang = CSTART.turnMin + CSTART.turnSpan * salt, c = dcos(ang), s = dsin(ang) * sg
  out[0] = a.hx * c - a.hy * s; out[1] = a.hx * s + a.hy * c; out[2] = sg; out[3] = ang
}
