/**
 * Reiter's snow crystal automaton (C. Reiter, "A local cellular model for snow crystal growth", Chaos, Solitons &
 * Fractals 23, 2005) on a hex disc of radius R. Each cell holds water s. A cell is receptive when it is frozen
 * (s ≥ 1) or touches a frozen cell; per step the non-receptive water diffuses (u ← u + α/12 · (Σ₆ u_n − 6u)), the
 * receptive cells keep theirs and gain γ, and s = u + v. The rim is held at the background vapour β.
 *
 * The flake has the hexagon's 12 symmetries, so only the cells of one 1/12 wedge are stepped: every cell maps to a
 * canonical one, and a wedge cell's neighbours are read through that map (12× fewer updates). Deterministic (F0.9):
 * + − × ÷ only; the result is the step each cell froze at, so a card shows the flake at any step without re-running.
 */

export interface ReiterOptions {
  /** Disc radius in cells (hex distance). */
  radius: number
  /** Background vapour β, vapour added to receptive cells γ, diffusion α (default 1). */
  beta: number
  gamma: number
  alpha?: number
  /** Stop after this many steps, or when the flake comes within `margin` cells of the rim (default 2). */
  maxSteps: number
  margin?: number
}
export interface Reiter {
  readonly radius: number
  /** Axial coordinates of every cell of the disc (q, r), and its canonical (wedge) cell. */
  readonly q: Int16Array
  readonly r: Int16Array
  readonly canon: Int32Array
  /** The step each cell froze at (−1: never), and its water at the end. */
  readonly frozeAt: Int32Array
  readonly s: Float64Array
  /** Steps run. */
  readonly steps: number
}

/** Hex distance of axial (q, r) from the centre. */
const hexLen = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
const NB: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

export function reiter(o: ReiterOptions): Reiter {
  const R = o.radius, alpha = o.alpha ?? 1, margin = o.margin ?? 2, W = 2 * R + 1
  // the disc's cells, indexed; `at` maps (q + R, r + R) to an index (−1 outside)
  const at = new Int32Array(W * W).fill(-1), qs: number[] = [], rs: number[] = []
  for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) if (hexLen(q, r) <= R) { at[(r + R) * W + q + R] = qs.length; qs.push(q); rs.push(r) }
  const n = qs.length, idx = (q: number, r: number) => (hexLen(q, r) <= R ? at[(r + R) * W + q + R] : -1)
  // canonical cell: of the 12 images of cube (x, y, z) = (q, −q − r, r), the one with the largest (x, z) (x ≥ z ≥ y)
  const canon = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const x = qs[i], z = rs[i], y = -x - z, c = [x, y, z]
    let bx = -Infinity, bz = -Infinity
    for (const sg of [1, -1]) for (const [a, b] of [[0, 2], [0, 1], [1, 0], [1, 2], [2, 0], [2, 1]]) {
      const X = sg * c[a], Z = sg * c[b]
      if (X > bx || (X === bx && Z > bz)) { bx = X; bz = Z }
    }
    canon[i] = idx(bx, bz)
  }
  const wedge: number[] = []
  for (let i = 0; i < n; i++) if (canon[i] === i) wedge.push(i)
  const m = wedge.length, slot = new Int32Array(n).fill(-1)
  for (let k = 0; k < m; k++) slot[wedge[k]] = k
  // neighbours of each wedge cell, as wedge slots (−1: off the disc, held at β)
  const nb = new Int32Array(6 * m)
  for (let k = 0; k < m; k++) for (let d = 0; d < 6; d++) {
    const j = idx(qs[wedge[k]] + NB[d][0], rs[wedge[k]] + NB[d][1])
    nb[6 * k + d] = j < 0 ? -1 : slot[canon[j]]
  }
  const rim = new Uint8Array(m)
  for (let k = 0; k < m; k++) rim[k] = hexLen(qs[wedge[k]], rs[wedge[k]]) >= R - margin ? 1 : 0
  let s = new Float64Array(m).fill(o.beta), u = new Float64Array(m), v = new Float64Array(m), next = new Float64Array(m)
  const froze = new Int32Array(m).fill(-1), recv = new Uint8Array(m)
  const c0 = slot[canon[idx(0, 0)]]
  s[c0] = 1; froze[c0] = 0
  let step = 0, done = false
  while (step < o.maxSteps && !done) {
    step++
    for (let k = 0; k < m; k++) {
      let rc = s[k] >= 1 ? 1 : 0
      for (let d = 0; d < 6 && !rc; d++) { const j = nb[6 * k + d]; if (j >= 0 && s[j] >= 1) rc = 1 }
      recv[k] = rc
      if (rc) { u[k] = 0; v[k] = s[k] + o.gamma } else { u[k] = s[k]; v[k] = 0 }
    }
    for (let k = 0; k < m; k++) {
      let sum = 0
      for (let d = 0; d < 6; d++) { const j = nb[6 * k + d]; sum += j < 0 ? o.beta : u[j] }
      next[k] = u[k] + alpha / 12 * (sum - 6 * u[k]) + v[k]
    }
    const t = s; s = next; next = t
    for (let k = 0; k < m; k++) if (froze[k] < 0 && s[k] >= 1) { froze[k] = step; if (rim[k]) done = true }
  }
  const frozeAt = new Int32Array(n), out = new Float64Array(n)
  for (let i = 0; i < n; i++) { const k = slot[canon[i]]; frozeAt[i] = froze[k]; out[i] = s[k] }
  return { radius: R, q: Int16Array.from(qs), r: Int16Array.from(rs), canon, frozeAt, s: out, steps: step }
}
