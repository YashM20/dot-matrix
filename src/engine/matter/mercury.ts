/**
 * Mercury in a tray (docs/living-matter/M-materials.md §5, `mat-mercury`): the metal is the ink of a stable fluid
 * (`physics/fluid.ts`) that sinks hard along gravity, so it pools on the tray's low side, flows when the phone tips
 * (gravity `gx`, `gy` feed the step, never the light) and is stirred by a drag. A tap splits a bead off: its mass
 * leaves the pool, it hops out and falls back under the same gravity, and after `REJOIN` seconds it merges again,
 * so mass is the pool's ink plus the beads'.
 *
 * Step code: registered with the determinism lint (scripts/lib/detLint.ts `src/engine/matter/mercury`).
 */
import { createFluid, fluidDensityAt, fluidInk, fluidSize, fluidSplat, fluidStep, type Fluid } from '../physics/fluid'

export interface Mercury {
  fluid: Fluid
  /** Beads after the fluid planes: `beads` slots of (x, y, vx, vy, age, mass); mass 0 = empty. */
  B: number; beads: number
  /** Total floats of state. */
  size: number
}
export const BEAD = 6
/** Seconds a split bead stays apart before it rejoins the pool. */
export const REJOIN = 1.5
/** Gravity on a bead, cells / s² at 1 g. */
const BEAD_G = 60

export function createMercury(w: number, h: number, beads = 3): Mercury {
  const fluid = createFluid({ w, h, iterations: 12, vorticity: 0, dissipation: 0, damping: 2.5, sink: 70, maxSpeed: 40, sharp: true })
  const B = fluidSize(fluid)
  return { fluid, B, beads, size: B + beads * BEAD }
}

/** The settled pool: ink 1 below the fill line (row `fill` of the grid, a 1-row soft edge), still. */
export function mercuryInit(m: Mercury, s: Float32Array, fill: number): void {
  const f = m.fluid
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    const t = j + .5 - fill
    s[f.D + j * f.w + i] = t >= .5 ? 1 : t <= -.5 ? 0 : t + .5
  }
}

export interface MercuryInput {
  /** Gravity on the screen in g (≈ (0, 1) upright). */
  gx: number; gy: number
  /** Pointers stirring this step, fluid cells and cells / s: (x, y, vx, vy) each. */
  stir?: readonly (readonly [number, number, number, number])[]
  /** Split a bead off at (x, y), fluid cells. */
  split?: readonly [number, number] | null
}

/** Pool ink plus the beads' mass. */
export function mercuryMass(m: Mercury, s: Float32Array): number {
  let mass = fluidInk(m.fluid, s)
  for (let k = 0; k < m.beads; k++) mass += s[m.B + BEAD * k + 5]
  return mass
}

/** Take the ink within radius r of (x, y) out of the pool (capped at `max`); returns the mass taken. */
function take(f: Fluid, s: Float32Array, x: number, y: number, r: number, max: number): number {
  let got = 0
  const c0 = Math.max(0, Math.floor(x - r)), c1 = Math.min(f.w - 1, Math.ceil(x + r)), r0 = Math.max(0, Math.floor(y - r)), r1 = Math.min(f.h - 1, Math.ceil(y + r))
  for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
    const dx = i - x, dy = j - y
    if (dx * dx + dy * dy > r * r || got >= max) continue
    const k = f.D + j * f.w + i, d = Math.min(s[k], max - got)
    s[k] -= d; got += d
  }
  return got
}
/** Put mass back into the pool round (x, y), spread over the 3×3 cells nearest it. */
function give(f: Fluid, s: Float32Array, x: number, y: number, mass: number): void {
  const ci = Math.max(1, Math.min(f.w - 2, Math.round(x))), cj = Math.max(1, Math.min(f.h - 2, Math.round(y)))
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) s[f.D + j * f.w + i] += mass / 9
}

/** One step: stir, gravity, the beads' flight and rejoining, then the fluid. */
export function mercuryStep(m: Mercury, s: Float32Array, dt: number, inp: MercuryInput): void {
  const f = m.fluid
  for (const [x, y, vx, vy] of inp.stir ?? []) fluidSplat(f, s, x, y, 1.6, vx * .6, vy * .6, 0)
  if (inp.split) {
    const [x, y] = inp.split
    if (fluidDensityAt(f, s, x, y) > .4) {
      let slot = 0, oldest = -1
      for (let k = 0; k < m.beads; k++) { const o = m.B + BEAD * k; if (!(s[o + 5] > 0)) { slot = k; oldest = -1; break } if (s[o + 4] > oldest) { oldest = s[o + 4]; slot = k } }
      const o = m.B + BEAD * slot
      if (s[o + 5] > 0) give(f, s, s[o], s[o + 1], s[o + 5]) // the slot's old bead rejoins first
      const mass = take(f, s, x, y, 1.3, 3)
      // the bead hops out against gravity, a little sideways by where it was struck
      s[o] = x; s[o + 1] = y; s[o + 2] = -inp.gx * 9 + (x - f.w / 2) * .4; s[o + 3] = -inp.gy * 9; s[o + 4] = 0; s[o + 5] = mass
    }
  }
  for (let k = 0; k < m.beads; k++) {
    const o = m.B + BEAD * k
    if (!(s[o + 5] > 0)) continue
    s[o + 2] += BEAD_G * inp.gx * dt; s[o + 3] += BEAD_G * inp.gy * dt
    s[o + 2] *= .985; s[o + 3] *= .985
    let x = s[o] + s[o + 2] * dt, y = s[o + 1] + s[o + 3] * dt
    // the tray's walls: a bead rolls along them
    if (x < .5) { x = .5; s[o + 2] = -s[o + 2] * .3 } else if (x > f.w - 1.5) { x = f.w - 1.5; s[o + 2] = -s[o + 2] * .3 }
    if (y < .5) { y = .5; s[o + 3] = -s[o + 3] * .3 } else if (y > f.h - 1.5) { y = f.h - 1.5; s[o + 3] = -s[o + 3] * .3 }
    s[o] = x; s[o + 1] = y; s[o + 4] += dt
    if (s[o + 4] >= REJOIN) { give(f, s, x, y, s[o + 5]); s[o + 5] = 0 }
  }
  fluidStep(f, s, dt, inp.gx, inp.gy)
}
