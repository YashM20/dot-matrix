/**
 * The terrarium (docs/living-matter/L-pond.md §L2 `pond-terrarium`): a top-down floor of stones, a nest, a creeper
 * grown by space colonisation toward the sun (grow.ts; a cached history scrubbed by iteration, pure in t) and an
 * ant colony on a lattice-3 pheromone pair (agents.ts; the World). The newest growth is the one accent.
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { fbm2, rngFor, voronoi2 } from '../noise'
import { ANT_CARRY, ANT_STRIDE, ANT_X, ANT_Y, antsInit, antsStep, createAnts, type Ants } from './agents'
import { colonise, type Colony } from './grow'
import { phaseSteps } from './pond'
import { pressDiscrete, pressInit, pressStep, PRESS_HOLD, PRESS_SLOTS, PRESS_TAP, pressAt, seamBlend } from './loop'
import { clearTiles, EDGE3, edgeOfTangent, putBig, putGlyph, RAMP3, rampGlyph, T_ACTIVE, T_FAINT, T_IDLE, T_MID, T_VALUE, type TileGrid, type TileRaster } from './glyphTiles'

export const TERRA_DT = 1 / 15
export const TERRA_W = 48, TERRA_H = 44, TERRA_PITCH = 3, TERRA_OY = 11, CRUMBS = 5, CRUMB_BITES = 40
export interface TerrariumSpec {
  seed: number; tiles: TileGrid
  /** Nest (card cells). */
  nest: [number, number]
  /** Crumbs on the floor at the start (card cells), CRUMB_BITES each. */
  crumbs: [number, number][]
  /** Creeper root (card cells). */
  root: [number, number]
  /** The autopilot's crumbs: [loop phase s, x, y] (card cells), each into a free slot. */
  drops?: [number, number, number][]
  lead: number; period: number; seam: number
}
export interface TerraLayout { CR: number; G: number; size: number }
export interface Terrarium {
  world: World; spec: TerrariumSpec; ants: Ants; layout: TerraLayout
  /** Baked floor stones: per tile, a RAMP3 glyph index (−1 = bare floor). */
  stones: Int16Array
}
const toLx = (x: number) => x / TERRA_PITCH, toLy = (y: number) => (y - TERRA_OY) / TERRA_PITCH
export const antCardX = (lx: number) => lx * TERRA_PITCH, antCardY = (ly: number) => TERRA_OY + ly * TERRA_PITCH
/**
 * Pheromone per ant step (× (1 − since/600)). The plan's 1 with .006 evaporation saturates the whole floor within
 * 10 s (90 ants lay 90 a step against .6 % loss); .05 leaves trails that stand out from the wandering.
 */
export const ANT_DEPOSIT = .05
/** The lamp's reach (card cells): ants turn away inside it, tones brighten inside it. */
export const LAMP_R = 24

export function createTerrarium(spec: TerrariumSpec): Terrarium {
  const ants = createAnts({ w: TERRA_W, h: TERRA_H, ants: 90, nest: [toLx(spec.nest[0]), toLy(spec.nest[1])], seed: spec.seed, evaporate: .006, diffuseEvery: 4, speed: .5, deposit: ANT_DEPOSIT, blur: .4 }, 0)
  const CR = ants.size, G = CR + 3 * CRUMBS, size = G + PRESS_SLOTS
  const dt = TERRA_DT
  const avoid: [number, number, number] = [0, 0, LAMP_R / TERRA_PITCH]
  function init(s: Float32Array) {
    antsInit(ants, s)
    // the colony is already out foraging: ants spread over the floor, a few on their way home
    const rng = rngFor(spec.seed, 0xa47, 0)
    for (let i = 0; i < ants.ants; i++) {
      const o = ants.A + ANT_STRIDE * i
      s[o + ANT_X] = 2 + rng() * (TERRA_W - 4); s[o + ANT_Y] = 2 + rng() * (TERRA_H - 4); s[o + 2] = Math.floor(rng() * 256); s[o + 4] = Math.floor(rng() * 200)
    }
    for (let k = 0; k < CRUMBS; k++) {
      const c = spec.crumbs[k], o = CR + 3 * k
      s[o] = c ? toLx(c[0]) : 0; s[o + 1] = c ? toLy(c[1]) : 0; s[o + 2] = c ? CRUMB_BITES : 0
    }
    pressInit(s, G)
  }
  /** Put a crumb (card cells) in the first empty slot; none free → no crumb. */
  const dropCrumb = (s: Float32Array, px: number, py: number) => {
    if (py < TERRA_OY) return
    for (let k = 0; k < CRUMBS; k++) {
      const o = CR + 3 * k
      if (s[o + 2] >= 1) continue
      s[o] = Math.max(1, Math.min(TERRA_W - 1, toLx(px))); s[o + 1] = Math.max(1, Math.min(TERRA_H - 1, toLy(py))); s[o + 2] = CRUMB_BITES
      return
    }
  }
  const start = Math.round(spec.lead / dt), len = Math.round(spec.period / dt)
  const drops = (spec.drops ?? []).map(([sec, x, y]) => ({ at: Math.round(sec / dt), x, y }))
  function step(s: Float32Array, n: number, inp: StepInput) {
    const press = pressStep(s, G, inp.pointers[0], dt), ph = phaseSteps(n, start, len)
    for (const d of drops) if (ph === d.at) dropCrumb(s, d.x, d.y)
    if (press === PRESS_TAP) { const [px, py] = pressAt(s, G); dropCrumb(s, px, py) }
    if (inp.kick) dropCrumb(s, 80, 80)
    let lamp: [number, number, number] | undefined
    if (press === PRESS_HOLD) { const [px, py] = pressAt(s, G); avoid[0] = toLx(px); avoid[1] = toLy(py); lamp = avoid }
    antsStep(ants, s, n, s.subarray(CR, CR + 3 * CRUMBS), lamp)
  }
  // crumb positions snap at the seam (a crumb never slides across the floor); their bites lerp
  const discrete: number[] = [...pressDiscrete(G)]
  for (let k = 0; k < CRUMBS; k++) discrete.push(CR + 3 * k, CR + 3 * k + 1)
  for (let i = 0; i < ants.ants; i++) discrete.push(ants.A + ANT_STRIDE * i + 2, ants.A + ANT_STRIDE * i + ANT_CARRY)
  const world = createWorld({
    size, dt, lead: spec.lead, period: spec.period, seam: spec.seam,
    every: 150, maxCheckpoints: 7, maxSteps: Math.round((spec.lead + spec.period) / dt) + 60, idle: 4, heal: 2, maxLiveSteps: 4,
    init, step, blend: seamBlend({ size, discrete }),
  })
  // floor stones, baked once: Voronoi cells near their sites, density from fBm
  const { cols, rows, pitch, ox, oy } = spec.tiles, stones = new Int16Array(cols * rows).fill(-1)
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const x = ox + tx * pitch + 1.5, y = oy + ty * pitch + 1.5, vo = voronoi2(x / 11, y / 11, spec.seed + 5, 'l2')
    if (vo.f1 > .42 || vo.f2 - vo.f1 < .1) continue
    const dx = x - spec.nest[0], dy = y - spec.nest[1]
    if (dx * dx + dy * dy < 12 * 12) continue
    stones[ty * cols + tx] = rampGlyph(RAMP3, .25 + .25 * (fbm2(x / 8, y / 8, 3, spec.seed) * .5 + .5) + .3 * (1 - vo.f1 / .42)).index
  }
  return { world, spec, ants, layout: { CR, G, size }, stones }
}

// ── the creeper ─────────────────────────────────────────────────────────────────────────────────────
/** A creeper per hour bucket: 500 attractors, denser on the sunlit side (`sun`: unit screen direction toward the sun). */
export function creeperFor(t: Terrarium, hourBucket: number, sun: [number, number]): Colony {
  const { seed } = t.spec, rng = rngFor(seed, 0xc4ee, hourBucket), att: [number, number][] = []
  const [nx, ny] = t.spec.nest
  for (let tries = 0; att.length < 500 && tries < 20000; tries++) {
    const x = 6 + rng() * 132, y = 16 + rng() * 124, u = rng()
    const lit = ((x - 72) * sun[0] + (y - 77) * sun[1]) / 70, w = Math.max(.12, Math.min(1, .45 + .55 * lit))
    const dx = x - nx, dy = y - ny
    if (u > w || dx * dx + dy * dy < 14 * 14) continue
    att.push([x, y])
  }
  return colonise({ seed: seed + hourBucket, root: [t.spec.root], attractors: att, influence: 16, kill: 2.5, step: 1.5, tropism: [sun[0], sun[1], .2], maxNodes: 700, maxIterations: 400 })
}
/** The display cycle (s): growth 35 % → 100 % of the iterations over 80 s, then pruned back newest-first over 10 s. */
export const CREEPER_CYCLE = 90, CREEPER_GROW = 80
/** Phase offset so t = 0 shows 95 % of the growth. */
const CREEPER_T0 = ((.95 - .35) / .65) * CREEPER_GROW
/** Fraction of the creeper's iterations shown at t (pure in t). */
export function creeperShown(t: number): number {
  const u = (((t + CREEPER_T0) % CREEPER_CYCLE) + CREEPER_CYCLE) % CREEPER_CYCLE
  return u < CREEPER_GROW ? .35 + .65 * (u / CREEPER_GROW) : 1 - .65 * ((u - CREEPER_GROW) / (CREEPER_CYCLE - CREEPER_GROW))
}
/** Is the creeper growing at t (newest growth is red only then)? */
export const creeperGrowing = (t: number) => (((t + CREEPER_T0) % CREEPER_CYCLE) + CREEPER_CYCLE) % CREEPER_CYCLE < CREEPER_GROW

export interface AntView { x: number; y: number; carrying: boolean }
export function antViews(t: Terrarium, s: Float32Array): AntView[] {
  return Array.from({ length: t.ants.ants }, (_, i) => { const o = t.ants.A + ANT_STRIDE * i; return { x: antCardX(s[o + ANT_X]), y: antCardY(s[o + ANT_Y]), carrying: s[o + ANT_CARRY] > .5 } })
}
export interface CrumbView { x: number; y: number; bites: number }
export function crumbViews(t: Terrarium, s: Float32Array): CrumbView[] {
  return Array.from({ length: CRUMBS }, (_, k) => { const o = t.layout.CR + 3 * k; return { x: antCardX(s[o]), y: antCardY(s[o + 1]), bites: s[o + 2] } })
}

const tTx = new Float32Array(36 * 33), tTy = new Float32Array(36 * 33), tThick = new Float32Array(36 * 33), tFlag = new Uint8Array(36 * 33)
let childSeen = new Uint8Array(0)
const BIG_THICK = 4.2
/**
 * Draw the floor (stones, ant trails, the nest), then the creeper: per tile, the thickest visible stem; thick stems
 * (pipe thickness ≥ 4.2) as one lattice-4 dot, the rest as a line along the stem, tips brighter; the newest second
 * of growth in `active`. `lamp` (card cells, or undefined) brightens tones within LAMP_R.
 */
export function drawTerrarium(t: Terrarium, s: Float32Array, c: Colony, time: number, r: TileRaster, lamp?: [number, number]): void {
  const { cols, rows, pitch, ox, oy } = t.spec.tiles, T = cols * rows
  clearTiles(r)
  const lit = (tx: number, ty: number, tone: number) => {
    if (!lamp) return tone
    const dx = ox + tx * pitch + 1.5 - lamp[0], dy = oy + ty * pitch + 1.5 - lamp[1]
    return dx * dx + dy * dy < LAMP_R * LAMP_R && tone < T_VALUE ? tone + 1 : tone
  }
  for (let i = 0; i < T; i++) if (t.stones[i] >= 0) { const tx = i % cols, ty = (i / cols) | 0; putGlyph(r, tx, ty, RAMP3.glyphs[t.stones[i]], lit(tx, ty, T_FAINT), .6) }
  // the food trail, as density (the home trail spreads around the nest and stays unseen)
  const { FOOD } = t.ants
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const lx = Math.floor(toLx(ox + tx * pitch + 2)), ly = Math.floor(toLy(oy + ty * pitch + 2))
    if (lx < 0 || ly < 0 || lx >= TERRA_W || ly >= TERRA_H) continue
    const v = s[FOOD + ly * TERRA_W + lx]
    if (v > .22) putGlyph(r, tx, ty, rampGlyph(RAMP3, Math.min(.6, .1 + v * .5)), lit(tx, ty, T_MID), .6)
  }
  // the nest: a ring of line glyphs around a dark hole
  const [nx, ny] = t.spec.nest
  for (let k = 0; k < 16; k++) {
    const cx = nx + 6 * cosT[k], cy = ny + 6 * sinT[k]
    putGlyph(r, Math.floor((cx - ox) / pitch), Math.floor((cy - oy) / pitch), edgeOfTangent(EDGE3, -sinT[k], cosT[k]), T_IDLE, .8)
  }
  // the creeper
  const shown = creeperShown(time) * c.iterations, growing = creeperGrowing(time), fresh = growing ? creeperShown(time - 1) * c.iterations : Infinity
  tTx.fill(0, 0, T); tTy.fill(0, 0, T); tThick.fill(0, 0, T); tFlag.fill(0, 0, T)
  if (childSeen.length < c.count) childSeen = new Uint8Array(c.count)
  childSeen.fill(0, 0, c.count)
  for (let i = 0; i < c.count; i++) if (c.born[i] <= shown && c.parent[i] >= 0) childSeen[c.parent[i]] = 1
  for (let i = 0; i < c.count; i++) {
    if (c.born[i] > shown) continue
    const tx = Math.floor((c.x[i] - ox) / pitch), ty = Math.floor((c.y[i] - oy) / pitch)
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue
    const k = ty * cols + tx, p = c.parent[i]
    if (p >= 0) { tTx[k] += c.x[i] - c.x[p]; tTy[k] += c.y[i] - c.y[p] }
    if (c.thickness[i] > tThick[k]) tThick[k] = c.thickness[i]
    if (!childSeen[i]) tFlag[k] |= 1
    if (c.born[i] > fresh) tFlag[k] |= 2
  }
  for (let k = 0; k < T; k++) {
    if (!tThick[k]) continue
    const tx = k % cols, ty = (k / cols) | 0, th = tThick[k]
    if (tFlag[k] & 2) { putGlyph(r, tx, ty, edgeOfTangent(EDGE3, tTx[k], tTy[k]), T_ACTIVE, 1); continue }
    if (th >= BIG_THICK) { putBig(r, tx, ty, lit(tx, ty, T_IDLE), th >= 2 * BIG_THICK ? 1 : .8); continue }
    if (tFlag[k] & 1) putGlyph(r, tx, ty, edgeOfTangent(EDGE3, tTx[k], tTy[k]), lit(tx, ty, T_IDLE), .8)
    else putGlyph(r, tx, ty, edgeOfTangent(EDGE3, tTx[k], tTy[k]), lit(tx, ty, th >= 2 ? T_IDLE : T_MID), .8)
  }
}
const cosT = Float64Array.from({ length: 16 }, (_, k) => [1, .9238795325, .7071067812, .3826834324, 0, -.3826834324, -.7071067812, -.9238795325, -1, -.9238795325, -.7071067812, -.3826834324, 0, .3826834324, .7071067812, .9238795325][k])
const sinT = Float64Array.from({ length: 16 }, (_, k) => cosT[(k + 12) % 16])
/** The lamp (card cells) while a press is held, else undefined (the card passes it to `drawTerrarium`). */
export function terraLamp(t: Terrarium, s: Float32Array): [number, number] | undefined {
  const G = t.layout.G
  return s[G + 3] > .5 ? [s[G + 1], s[G + 2]] : undefined
}
