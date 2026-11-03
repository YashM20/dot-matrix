/**
 * The Turing skin's solver (docs/living-matter/X-advanced.md #15): Gray-Scott reaction-diffusion (Pearson 1993,
 * after Gray and Scott 1984) on a growing, fish-shaped domain, in the Lagrangian frame of Crampin, Gaffney and Maini
 * (1999, "Reaction and diffusion on growing domains"). The grid is fixed to the body (material coordinates); as the
 * body grows by Lx(t) along and Ly(t) across, a material cell gets bigger in the water, so diffusion between cells
 * falls as 1/L² and every chemical is diluted at the growth rate ρ = (ln Lx Ly)':
 *
 *   ∂u/∂t = Du (u_ξξ / Lx² + u_ηη / Ly²) − u v² + F (1 − u) − ρ u
 *   ∂v/∂t = Dv (v_ξξ / Lx² + v_ηη / Ly²) + u v² − (F + k) v − ρ v
 *
 * In the spot-splitting regime (F, k near Pearson's "mitosis" pair) a spot that gets room divides in two, so the
 * spots on a growing body multiply the way Kondo and Asai (1995) watched stripes insert on a growing angelfish.
 * Explicit Euler with a 5-point stencil; the body outline is a zero-flux wall (an outside neighbour reads as the
 * cell itself). Substeps keep every step under the stability bound as the young body's diffusion runs high.
 * Deterministic: plain float arithmetic, no allocation per step.
 */

export interface SkinParams {
  F: number; k: number
  /** Diffusion of u and v in reaction-diffusion units: a material cell is 1 unit across when L = 1. */
  Du: number; Dv: number
}
/** Spot-splitting Gray-Scott (Pearson's diffusion pair, with h = 1 per cell). */
export const SKIN_SPOTS: SkinParams = { F: .0367, k: .0649, Du: .2097, Dv: .105 }

export interface Skin {
  nx: number; ny: number; n: number
  /** 1 where the cell is on the body. */
  mask: Uint8Array
  /** Body cells in scan order, and each one's four neighbours (east, west, south, north; itself past the outline). */
  cells: Int32Array; nb: Int32Array
  params: SkinParams
  /** Scratch: u and v of two substeps (ping-pong). */
  pu: Float64Array; pv: Float64Array; qu: Float64Array; qv: Float64Array
}

/** A skin on an nx × ny material grid whose body cells are `inside(i, j)`. */
export function createSkin(nx: number, ny: number, inside: (i: number, j: number) => boolean, params: SkinParams = SKIN_SPOTS): Skin {
  const n = nx * ny, mask = new Uint8Array(n)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) mask[j * nx + i] = inside(i, j) ? 1 : 0
  const list: number[] = []
  for (let c = 0; c < n; c++) if (mask[c]) list.push(c)
  const cells = Int32Array.from(list), nb = new Int32Array(cells.length * 4)
  const at = (c: number, i: number, j: number) => (i >= 0 && j >= 0 && i < nx && j < ny && mask[j * nx + i] ? j * nx + i : c)
  cells.forEach((c, q) => {
    const i = c % nx, j = (c / nx) | 0
    nb[4 * q] = at(c, i + 1, j); nb[4 * q + 1] = at(c, i - 1, j); nb[4 * q + 2] = at(c, i, j + 1); nb[4 * q + 3] = at(c, i, j - 1)
  })
  return { nx, ny, n, mask, cells, nb, params, pu: new Float64Array(n), pv: new Float64Array(n), qu: new Float64Array(n), qv: new Float64Array(n) }
}

/** Substeps needed to advance `T` units at sizes (lx, ly): the 5-point bound dt · Du · 2 (1/lx² + 1/ly²) ≤ 1, with margin. */
export const skinSubsteps = (sk: Skin, T: number, lx: number, ly: number) =>
  Math.max(Math.ceil(T), Math.ceil((T * sk.params.Du * 2 * (1 / (lx * lx) + 1 / (ly * ly))) / .8))

/**
 * Advance u (at `U`) and v (at `V`) of state `s` by `T` units on a body of size (lx, ly) growing at ρ (per unit).
 * Off-body cells are left as they are.
 */
export function skinStep(sk: Skin, s: Float32Array, U: number, V: number, T: number, lx: number, ly: number, rho: number): void {
  const { cells, nb, params: { F, k, Du, Dv } } = sk, m = cells.length
  const steps = skinSubsteps(sk, T, lx, ly), dt = T / steps, ax = 1 / (lx * lx), ay = 1 / (ly * ly), fk = F + k
  let au = sk.pu, av = sk.pv, bu = sk.qu, bv = sk.qv
  for (let q = 0; q < m; q++) { const c = cells[q]; au[c] = s[U + c]; av[c] = s[V + c] }
  for (let it = 0; it < steps; it++) {
    for (let q = 0; q < m; q++) {
      const c = cells[q], o = 4 * q, e = nb[o], w = nb[o + 1], so = nb[o + 2], no = nb[o + 3]
      const u = au[c], v = av[c], uvv = u * v * v
      const lu = (au[e] + au[w] - 2 * u) * ax + (au[so] + au[no] - 2 * u) * ay
      const lv = (av[e] + av[w] - 2 * v) * ax + (av[so] + av[no] - 2 * v) * ay
      const nv = v + dt * (Dv * lv + uvv - fk * v - rho * v)
      bu[c] = u + dt * (Du * lu - uvv + F * (1 - u) - rho * u)
      // flush v's tail to 0: far from a spot it decays into subnormals, which are slow on every engine
      bv[c] = nv < 1e-9 ? 0 : nv
    }
    const tu = au, tv = av; au = bu; av = bv; bu = tu; bv = tv
  }
  for (let q = 0; q < m; q++) { const c = cells[q]; s[U + c] = au[c]; s[V + c] = av[c] }
}

/** Fill the skin's rest state: u = 1, v = 0 everywhere. */
export function skinClear(sk: Skin, s: Float32Array, U: number, V: number): void {
  for (let c = 0; c < sk.n; c++) { s[U + c] = 1; s[V + c] = 0 }
}

/** Seed a spot: a disc of radius `r` cells at material (x, y) set to Pearson's seed (u = .5, v = .25). */
export function skinSeed(sk: Skin, s: Float32Array, U: number, V: number, x: number, y: number, r: number): void {
  const { nx, ny, mask } = sk
  for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(ny - 1, Math.ceil(y + r)); j++) for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(nx - 1, Math.ceil(x + r)); i++) {
    const c = j * nx + i, dx = i - x, dy = j - y
    if (!mask[c] || dx * dx + dy * dy > r * r) continue
    s[U + c] = .5; s[V + c] = .25
  }
}

/**
 * Scratch a disc of radius `r` cells at material (x, y) back to bare skin (u = 1, v = 0): the spots around it split
 * into the gap and the pattern closes over it, as Kondo's group saw a zebrafish's stripes regrow after ablation.
 */
export function skinErase(sk: Skin, s: Float32Array, U: number, V: number, x: number, y: number, r: number): void {
  const { nx, ny, mask } = sk
  for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(ny - 1, Math.ceil(y + r)); j++) for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(nx - 1, Math.ceil(x + r)); i++) {
    const c = j * nx + i, dx = i - x, dy = j - y
    if (mask[c] && dx * dx + dy * dy <= r * r) { s[U + c] = 1; s[V + c] = 0 }
  }
}
