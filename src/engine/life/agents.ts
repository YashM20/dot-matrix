/**
 * Agents on a trail lattice (docs/living-matter/L-pond.md §L2 "agents.ts"):
 * - **Physarum** after J. Jones, *Characteristics of pattern formation and evolution in approximations of Physarum
 *   transport networks* (Artificial Life 16, 2010): each agent senses the trail at three sensors (front, ±SA at
 *   offset SO), rotates by RA toward the strongest, steps SS forward and deposits; then the trail takes a 3×3 mean
 *   diffuse and decays. Food cells deposit every step, so the network links them.
 * - **Ants** with two pheromones (home and food): searching ants follow FOOD and lay HOME, carrying ants follow HOME
 *   and lay FOOD, each deposit fading with the time since the ant left the nest or the crumb.
 *
 * Headings are bytes (0..255 = one turn) stored as floats, so a turn is an integer add and the trig is two
 * 256-entry `dcos`/`dsin` tables built once. Agents run in index order from a rotating start (n·7919 mod N), so no
 * agent always moves first. Everything persistent lives in the world's Float32Array; diffuse scratch stays outside.
 */
import { dcos, dsin, ihash, rngFor, TAU } from '../noise'

const tables = (() => {
  const cos = new Float64Array(256), sin = new Float64Array(256)
  for (let k = 0; k < 256; k++) { cos[k] = dcos((TAU * k) / 256); sin[k] = dsin((TAU * k) / 256) }
  return { cos, sin }
})()
const wrap8 = (h: number) => ((h % 256) + 256) % 256

/** 3×3 mean (zero-flux edges, mask cells hold 0) blended in by `blur` (1 = the full mean), then × keep. */
function diffuse(src: Float32Array, off: number, w: number, h: number, keep: number, tmp: Float32Array, mask?: Uint8Array, blur = 1) {
  const kb = (keep * blur) / 9, ks = keep * (1 - blur)
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : h - 1
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (mask && !mask[i]) { tmp[i] = 0; continue }
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : w - 1
      tmp[i] = (src[off + y0 * w + x0] + src[off + y0 * w + x] + src[off + y0 * w + x1]
        + src[off + y * w + x0] + src[off + i] + src[off + y * w + x1]
        + src[off + y1 * w + x0] + src[off + y1 * w + x] + src[off + y1 * w + x1]) * kb + src[off + i] * ks
    }
  }
  for (let i = 0; i < w * h; i++) src[off + i] = tmp[i]
}

// ── physarum ────────────────────────────────────────────────────────────────────────────────────────
export interface PhysarumSpec {
  w: number; h: number; agents: number; seed: number
  /** Sensor angle and rotation angle in 1/256 turns (22.5° = 16, 45° = 32); sensor offset and step in lattice cells. */
  sa?: number; ra?: number; so?: number; ss?: number
  deposit?: number
  /** Fraction lost per step, after the diffuse. */
  decay?: number
  /** How much of the 3×3 mean replaces each cell per step (1 = Jones' full mean; less keeps veins sharp on a coarse lattice). */
  blur?: number
  /** 1 = the agents may go there. */
  mask?: Uint8Array
}
export interface Physarum extends Required<Omit<PhysarumSpec, 'mask'>> {
  mask?: Uint8Array
  /** Offsets: the trail plane (w·h) and the agent planes (x, y, heading 0..255). */
  T: number; AX: number; AY: number; AH: number
  size: number
  /** 256-entry dcos / dsin tables. */
  cos: Float64Array; sin: Float64Array
  tmp: Float32Array
}
export function createPhysarum(spec: PhysarumSpec, offset = 0): Physarum {
  const { w, h, agents } = spec, T = offset, AX = T + w * h, AY = AX + agents, AH = AY + agents
  return {
    sa: 16, ra: 32, so: 4, ss: 1, deposit: 5, decay: .1, blur: 1, ...spec,
    T, AX, AY, AH, size: w * h + 3 * agents, cos: tables.cos, sin: tables.sin, tmp: new Float32Array(w * h),
  }
}
const onMask = (p: { w: number; h: number; mask?: Uint8Array }, x: number, y: number) =>
  x >= 0 && y >= 0 && x < p.w && y < p.h && (!p.mask || p.mask[(y | 0) * p.w + (x | 0)] === 1)
/** Agents spread uniformly over the mask with random headings; the trail starts empty. */
export function physarumInit(p: Physarum, s: Float32Array): void {
  const rng = rngFor(p.seed, 0x5a1e, 0)
  for (let i = 0; i < p.agents; i++) {
    let x = 0, y = 0
    for (let k = 0; k < 64; k++) { x = rng() * p.w; y = rng() * p.h; if (onMask(p, x, y)) break }
    s[p.AX + i] = x; s[p.AY + i] = y; s[p.AH + i] = Math.floor(rng() * 256)
  }
  for (let i = 0; i < p.w * p.h; i++) s[p.T + i] = 0
}
/**
 * One step: sense (3 sensors) → rotate → move → deposit, agents in index order from a rotating start
 * (n·7919 mod N); then a 3×3 mean diffuse and the decay. `food` (x y r triples, lattice cells) adds `foodDeposit`
 * to every cell within r of each food; `repel` [x, y, r] clears the trail within r (salt: agents turn away).
 * - Both side sensors beat the front: a random side (`ihash(seed, i, n) & 1`).
 * - A step off the lattice or the mask: the agent stays and takes a new heading `ihash(seed, i, n + 7919) & 255`.
 */
export function physarumStep(p: Physarum, s: Float32Array, n: number, food?: ArrayLike<number>, foodDeposit = 10, repel?: readonly [number, number, number]): void {
  const { w, h, agents: N, sa, ra, so, ss, deposit, T, AX, AY, AH, cos, sin } = p
  const sense = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? s[T + (y | 0) * w + (x | 0)] : -1)
  const start = (n * 7919) % N
  for (let q = 0; q < N; q++) {
    const i = (start + q) % N, x = s[AX + i], y = s[AY + i]
    let hd = s[AH + i]
    const f = sense(x + cos[hd] * so, y + sin[hd] * so)
    const l = sense(x + cos[wrap8(hd - sa)] * so, y + sin[wrap8(hd - sa)] * so)
    const r = sense(x + cos[wrap8(hd + sa)] * so, y + sin[wrap8(hd + sa)] * so)
    if (f > l && f > r) { /* straight on */ }
    else if (f < l && f < r) hd = wrap8(hd + ((ihash(p.seed, i, n) & 1) ? ra : -ra))
    else if (l < r) hd = wrap8(hd + ra)
    else if (r < l) hd = wrap8(hd - ra)
    const nx = x + cos[hd] * ss, ny = y + sin[hd] * ss
    if (!onMask(p, nx, ny)) { s[AH + i] = ihash(p.seed, i, n + 7919) & 255; continue }
    s[AX + i] = nx; s[AY + i] = ny; s[AH + i] = hd
    s[T + (ny | 0) * w + (nx | 0)] += deposit
  }
  if (food) for (let k = 0; k + 2 < food.length; k += 3) stamp(s, T, w, h, food[k], food[k + 1], food[k + 2], c => c + foodDeposit)
  diffuse(s, T, w, h, 1 - p.decay, p.tmp, p.mask, p.blur)
  if (repel) stamp(s, T, w, h, repel[0], repel[1], repel[2], () => 0)
}
/** Apply `f` to every lattice cell within r of (cx, cy). */
function stamp(s: Float32Array, T: number, w: number, h: number, cx: number, cy: number, r: number, f: (v: number) => number) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + .5 - cx, dy = y + .5 - cy
    if (dx * dx + dy * dy <= r * r) s[T + y * w + x] = f(s[T + y * w + x])
  }
}

// ── ants ────────────────────────────────────────────────────────────────────────────────────────────
export interface AntsSpec {
  w: number; h: number; ants: number; nest: [number, number]; seed: number
  /** Fraction of both pheromones lost per step (default .006). */
  evaporate?: number
  /** Steps between 3×3 diffuses (default 4). */
  diffuseEvery?: number
  /** Lattice cells per step (default .5). */
  speed?: number
  /** Deposit scale: an ant lays deposit·(1 − since/600) a step (default 1, the plan's). */
  deposit?: number
  /** Share of the 3×3 mean each diffuse mixes in (default 1). */
  blur?: number
}
/** Per ant: x, y, heading (0..255), carrying (0 / 1), since (steps since it left the nest or the crumb). */
export const ANT_STRIDE = 5
export const ANT_X = 0, ANT_Y = 1, ANT_H = 2, ANT_CARRY = 3, ANT_SINCE = 4
export interface Ants extends Required<AntsSpec> {
  /** Offsets: the home and food pheromone planes (w·h each), the ant records (ANT_STRIDE each). */
  HOME: number; FOOD: number; A: number
  size: number
  tmp: Float32Array
}
export function createAnts(spec: AntsSpec, offset = 0): Ants {
  const cells = spec.w * spec.h, HOME = offset, FOOD = HOME + cells, A = FOOD + cells
  return { evaporate: .006, diffuseEvery: 4, speed: .5, deposit: 1, blur: 1, ...spec, HOME, FOOD, A, size: 2 * cells + ANT_STRIDE * spec.ants, tmp: new Float32Array(cells) }
}
/** Ants start at the nest, fanned out over all headings; no pheromone yet. */
export function antsInit(a: Ants, s: Float32Array): void {
  for (let i = 0; i < a.ants; i++) {
    const o = a.A + ANT_STRIDE * i, h = Math.floor((256 * i) / a.ants)
    s[o + ANT_X] = a.nest[0] + a.speed * 2 * tables.cos[h]; s[o + ANT_Y] = a.nest[1] + a.speed * 2 * tables.sin[h]
    s[o + ANT_H] = h; s[o + ANT_CARRY] = 0; s[o + ANT_SINCE] = 0
  }
  for (let i = 0; i < 2 * a.w * a.h; i++) s[a.HOME + i] = 0
}
const HOMING = 3, FOLLOW = .04, SENSE_A = 24, SENSE_D = 2.5, TURN = 12, SMELL = 5, NEST_R = 1.6, NEST_SMELL = 5, GRAB_R = 1.2
/**
 * One step. Searching ants follow FOOD and lay HOME; carrying ants follow HOME and lay FOOD; deposit = 1 − since/600
 * (≥ 0). An ant smells a crumb (or, carrying, the nest) within a few cells and heads straight for it; a searching
 * ant on a crumb with bites left takes one (the crumb's amount − 1) and turns round; a carrying ant at the nest
 * drops it and turns round. `crumbs` (x y amount per crumb, lattice cells) is a view into the state.
 * `avoid` [x, y, r]: ants inside r turn away from (x, y) (the lamp).
 */
export function antsStep(a: Ants, s: Float32Array, n: number, crumbs: Float32Array, avoid?: readonly [number, number, number]): void {
  const { w, h, A, HOME, FOOD, speed } = a, { cos, sin } = tables, N = a.ants, nc = (crumbs.length / 3) | 0
  const read = (P: number, x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? s[P + (y | 0) * w + (x | 0)] : 0)
  const start = (n * 7919) % N
  for (let q = 0; q < N; q++) {
    const i = (start + q) % N, o = A + ANT_STRIDE * i, rng = rngFor(a.seed, i, n)
    const x = s[o + ANT_X], y = s[o + ANT_Y], carry = s[o + ANT_CARRY] > .5
    let hd = s[o + ANT_H], tx = NaN, ty = NaN
    // smell the goal
    if (carry) { const dx = a.nest[0] - x, dy = a.nest[1] - y; if (dx * dx + dy * dy < NEST_SMELL * NEST_SMELL) { tx = a.nest[0]; ty = a.nest[1] } }
    else {
      let best = SMELL * SMELL
      for (let c = 0; c < nc; c++) {
        if (crumbs[3 * c + 2] < 1) continue
        const dx = crumbs[3 * c] - x, dy = crumbs[3 * c + 1] - y, d = dx * dx + dy * dy
        if (d < best) { best = d; tx = crumbs[3 * c]; ty = crumbs[3 * c + 1] }
      }
    }
    if (tx === tx) hd = headingTo(tx - x, ty - y)
    else {
      // follow the trail: three sensors on the pheromone this ant wants
      const P = carry ? HOME : FOOD
      const f = read(P, x + cos[hd] * SENSE_D, y + sin[hd] * SENSE_D)
      const l = read(P, x + cos[wrap8(hd - SENSE_A)] * SENSE_D, y + sin[wrap8(hd - SENSE_A)] * SENSE_D)
      const r = read(P, x + cos[wrap8(hd + SENSE_A)] * SENSE_D, y + sin[wrap8(hd + SENSE_A)] * SENSE_D)
      if (l > f && l >= r && l > FOLLOW) hd = wrap8(hd - TURN)
      else if (r > f && r > l && r > FOLLOW) hd = wrap8(hd + TURN)
      // on a trail an ant keeps its line; off it, it explores (a wider random walk)
      const onTrail = f > FOLLOW || l > FOLLOW || r > FOLLOW
      hd = wrap8(hd + (onTrail ? Math.floor(rng() * 7) - 3 : Math.floor(rng() * 25) - 12))
      // path integration: a carrying ant also knows roughly where home is, and drifts toward it
      if (carry) { const d = wrap8(headingTo(a.nest[0] - x, a.nest[1] - y) - hd); hd = wrap8(hd + (d < 128 ? Math.min(d, HOMING) : -Math.min(256 - d, HOMING))) }
    }
    if (avoid) {
      const dx = x - avoid[0], dy = y - avoid[1]
      if (dx * dx + dy * dy < avoid[2] * avoid[2]) {
        const away = headingTo(dx, dy), d = wrap8(away - hd)
        hd = wrap8(hd + (d < 128 ? Math.min(d, 20) : -Math.min(256 - d, 20)))
      }
    }
    let nx = x + cos[hd] * speed, ny = y + sin[hd] * speed
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) { hd = wrap8(hd + 128 + Math.floor(rng() * 33) - 16); nx = x; ny = y }
    s[o + ANT_X] = nx; s[o + ANT_Y] = ny; s[o + ANT_H] = hd
    // lay the trail back to where this ant came from
    const since = s[o + ANT_SINCE] + 1, dep = since < 600 ? a.deposit * (1 - since / 600) : 0
    s[o + ANT_SINCE] = since
    const cell = (ny | 0) * w + (nx | 0)
    if (carry) { s[FOOD + cell] = Math.min(4, s[FOOD + cell] + dep) } else { s[HOME + cell] = Math.min(4, s[HOME + cell] + dep) }
    // goals
    if (carry) {
      const dx = a.nest[0] - nx, dy = a.nest[1] - ny
      if (dx * dx + dy * dy < NEST_R * NEST_R) { s[o + ANT_CARRY] = 0; s[o + ANT_SINCE] = 0; s[o + ANT_H] = wrap8(hd + 128) }
    } else {
      for (let c = 0; c < nc; c++) {
        if (crumbs[3 * c + 2] < 1) continue
        const dx = crumbs[3 * c] - nx, dy = crumbs[3 * c + 1] - ny
        if (dx * dx + dy * dy < GRAB_R * GRAB_R) { crumbs[3 * c + 2] -= 1; s[o + ANT_CARRY] = 1; s[o + ANT_SINCE] = 0; s[o + ANT_H] = wrap8(hd + 128); break }
      }
    }
  }
  const keep = 1 - a.evaporate
  if (n % a.diffuseEvery === 0) { diffuse(s, HOME, w, h, keep, a.tmp, undefined, a.blur); diffuse(s, FOOD, w, h, keep, a.tmp, undefined, a.blur) }
  else for (let i = 0; i < 2 * w * h; i++) s[HOME + i] *= keep
}
/** Byte heading of a direction, no trig: the table entry with the largest dot product (256 compares, ±0.7°). */
function headingTo(dx: number, dy: number): number {
  const { cos, sin } = tables
  let best = 0, bd = -Infinity
  for (let k = 0; k < 256; k += 8) { const d = cos[k] * dx + sin[k] * dy; if (d > bd) { bd = d; best = k } }
  for (let k = best - 7; k <= best + 7; k++) { const j = wrap8(k), d = cos[j] * dx + sin[j] * dy; if (d > bd) { bd = d; best = j } }
  return best
}
