/**
 * The Turing skin (docs/living-matter/X-advanced.md #15): the pond's second species, a spotted fish seen from the
 * side whose skin is a reaction-diffusion pattern (turingSkin.ts) on its own growing body. A `World`
 * (physics/world.ts) holds the skin's u and v on a fixed body grid; the body grows exponentially over the fish's
 * life (about 2.4× longer and 1.9× deeper), and the spots divide as room opens between them.
 *
 * One loop is one life. A hatchling swims in from the left with a few spots, hovers and grows while its spots split,
 * and the grown fish swims off to the right. Off screen the skin goes back to the hatchling's (the egg, baked once
 * from a seeded relaxation), so the loop's end is bit-equal to its start and the wrap needs no blend: the loop starts
 * at life phase `lifeAt`, the world's init plays the life up to there, and the step plays it on round the reset.
 * The pose is a pure function of the life phase. Tap the body to scratch a patch of skin clean: the spots around it
 * split into the gap. A live skin heals back by lerp.
 *
 * Units: material cells (i along the body from the snout, j across from the back); card cells for the pose.
 * Deterministic: `dmath`, seeded streams, a fixed step; no allocation per step.
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { dexp, dlog, dsin, rngFor, TAU } from '../noise'
import { createSkin, skinClear, skinErase, skinSeed, skinStep, type Skin } from './turingSkin'
import { pressDiscrete, pressInit, pressStep, PRESS_TAP, pressAt, seamBlend } from './loop'

/** World steps per second. */
export const TURING_RATE = 36
/** The body grid (material cells), and reaction-diffusion units per cell once grown. */
export const SKIN_NX = 56, SKIN_NY = 32, SKIN_CELL = 1.8
/** Card cells per material cell once grown: the adult body is 92 cells long. */
export const ADULT_PX = 92 / SKIN_NX
/** Body size at hatching, as a fraction of the adult's (along, across), and the life phase growth ends at. */
const L0X = .42, L0Y = .55, GROWN = .85
/** Life phases: swum in by IN; swims off from OUT, gone by GONE. */
const IN = .1, OUT = .86, GONE = .985
/** The radius a tap scratches clean, reaction-diffusion units (about one spot and its margin). */
const SCRATCH_R = 8

export interface TuringSpec {
  seed: number
  /** Loop (= life) length, seconds. */
  period: number
  /** Life phase the loop starts at (t = 0: a young fish, settled, spotted). */
  lifeAt: number
  /** Reaction-diffusion time units one life covers. */
  units: number
}
export interface TuringLayout { n: number; U: number; V: number; G: number; size: number }
export interface Turing { world: World; spec: TuringSpec; skin: Skin; layout: TuringLayout; len: number; shift: number; egg: Float32Array }

/** Half the body's depth at ξ ∈ [0, 1] (snout to tail root), as a fraction of the deepest: a round head, a smooth taper. */
export function bodyHalf(x: number): number {
  const a = .36, hp = .2
  if (x < 0 || x > 1) return 0
  if (x < a) { const t = (a - x) / a; return Math.sqrt(Math.max(0, 1 - t * t)) }
  const s = (x - a) / (1 - a)
  return hp + (1 - hp) * (1 - s) * (1 - s) * (1 + 2 * s)
}
/** The body's midline (η, down positive): a slight hump on the back. */
export const bodyMid = (x: number) => -.08 * dsin(Math.PI * x)
/** Is (ξ, η) on the body? η ∈ [−1, 1], −1 the top of the grid. */
export const onBody = (x: number, y: number) => Math.abs(y - bodyMid(x)) < bodyHalf(x) * .96

/** Growth at life phase λ: the cell size along and across (fraction of adult) and the dilution rate ρ per unit. */
export function growth(spec: TuringSpec, lam: number): [number, number, number] {
  const g = Math.min(1, lam / GROWN), lx = dexp((1 - g) * LN0X), ly = dexp((1 - g) * LN0Y)
  return [lx, ly, g < 1 ? -(LN0X + LN0Y) / (GROWN * spec.units) : 0]
}
const LN0X = dlog(L0X), LN0Y = dlog(L0Y)

export interface Pose {
  /** Card position of the snout's tip and the midline's height; card cells per material cell (along, across). */
  headX: number; midY: number; px: number; py: number
  /** Tail-beat phase (radians) and swim speed (card cells / s, ≥ 0). */
  beat: number; speed: number
}
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/** Centre of the whole fish (body and tail) in card cells at life phase λ. */
function centreAt(lam: number, total: number): [number, number] {
  const rx = 70 + 4 * dsin(TAU * 2 * lam), ry = 82 + 5 * dsin(TAU * 3 * lam + 1)
  if (lam < IN) { const e = smooth(lam / IN); return [-total / 2 - 4 + (rx + total / 2 + 4) * e, ry] }
  if (lam > OUT) { const q = Math.min(1, (lam - OUT) / (GONE - OUT)); return [rx + (144 + total / 2 + 6 - rx) * q * Math.sqrt(q), ry - 6 * q] }
  return [rx, ry]
}
/** The fish's pose at life phase λ (pure; the card and the tap read it). */
export function turingPose(t: Turing, lam: number): Pose {
  const [lx, ly] = growth(t.spec, lam), px = ADULT_PX * lx, py = ADULT_PX * ly, total = SKIN_NX * px * 1.3
  const [cx, cy] = centreAt(lam, total), sec = lam * t.spec.period
  const [bx] = centreAt(Math.max(0, lam - .002), total), speed = Math.abs(cx - bx) / (.002 * t.spec.period)
  // a slow beat while hovering, one more beat per ~14 cells swum
  const beat = TAU * .7 * sec + .45 * (cx - centreAt(0, total)[0])
  return { headX: cx + total / 2, midY: cy, px, py, beat, speed }
}
/** Card cell → material (ξ ∈ [0, 1] snout to tail root, η ∈ [−1, 1]). */
export const toBody = (p: Pose, x: number, y: number): [number, number] => [(p.headX - x) / (SKIN_NX * p.px), (y - p.midY) / ((SKIN_NY / 2) * p.py)]

/** Life phase of loop step n. */
export const lifeOf = (t: Turing, n: number) => (((n + t.shift) % t.len) + t.len) % t.len / t.len

export function createTuring(spec: TuringSpec): Turing {
  const nx = SKIN_NX, ny = SKIN_NY, n = nx * ny, U = 0, V = n, G = 2 * n, size = G + 4
  const skin = createSkin(nx, ny, (i, j) => onBody((i + .5) / nx, -1 + 2 * (j + .5) / ny))
  const dt = 1 / TURING_RATE, len = Math.round(spec.period / dt), shift = Math.round(spec.lifeAt * len), T = spec.units / len
  const egg = new Float32Array(size)
  const t: Turing = { world: undefined as unknown as World, spec, skin, layout: { n, U, V, G, size }, len, shift, egg }

  // the egg: three seeded spots relaxed on the hatchling's body
  let baked = false
  const bake = () => {
    if (baked) return
    baked = true
    skinClear(skin, egg, U, V)
    const rng = rngFor(spec.seed, 0x7e9)
    for (const [x, y] of [[.3, -.15], [.55, .1], [.4, .45]]) skinSeed(skin, egg, U, V, (x + .04 * (rng() - .5)) * nx, ((y + .08 * (rng() - .5) + 1) / 2) * ny, 5)
    for (let k = 0; k < 100; k++) skinStep(skin, egg, U, V, 10, SKIN_CELL * L0X, SKIN_CELL * L0Y, 0)
    pressInit(egg, G)
  }
  /** One step of the life at life step m: the egg at m = 0, then the skin grows. */
  const live = (s: Float32Array, m: number) => {
    if (m === 0) { bake(); for (let i = 0; i < 2 * n; i++) s[i] = egg[i] }
    const [lx, ly, rho] = growth(spec, m / len)
    skinStep(skin, s, U, V, T, SKIN_CELL * lx, SKIN_CELL * ly, rho)
  }

  function init(s: Float32Array) {
    pressInit(s, G)
    for (let m = 0; m < shift; m++) live(s, m)
  }
  function step(s: Float32Array, nStep: number, inp: StepInput) {
    const m = (nStep + shift) % len
    // a tap on the body (or a kick, at its middle) scratches the skin there clean; the spots around regrow into it
    const press = pressStep(s, G, inp.pointers[0], dt)
    if (press === PRESS_TAP || inp.kick) {
      const p = turingPose(t, m / len), [x, y] = press === PRESS_TAP ? pressAt(s, G) : [p.headX - .45 * SKIN_NX * p.px, p.midY]
      const [bx, by] = toBody(p, x, y)
      if (onBody(bx, by)) skinErase(skin, s, U, V, bx * nx, ((by + 1) / 2) * ny, SCRATCH_R / (SKIN_CELL * growth(spec, m / len)[0]))
    }
    live(s, m)
  }

  const blend = seamBlend({ size, discrete: pressDiscrete(G) })
  t.world = createWorld({
    size, dt, lead: 0, period: spec.period, gravity: [0, 0],
    every: 144, maxCheckpoints: 48, maxSteps: len + 144, idle: 5, heal: 2.5, maxLiveSteps: 4,
    init, step, blend,
  })
  return t
}

/** Pointer map for a card: the world's units are card cells. */
export const turingUnits = (x: number, y: number): [number, number] => [x, y]
