/**
 * The slime-mould scene (docs/living-matter/L-pond.md §L2 `pond-slime`): Jones physarum (agents.ts) on a lattice-3
 * trail grid of 48 × 44 (card rows 11–142), food dots that deposit every step, and `drawSlime`, which reads the
 * trail through the 36 × 33 tile grid: per tile, a structure tensor over the trail decides between a vein glyph
 * along its direction (coherent) and a density glyph (diffuse). Food is the one accent (red dot sites).
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { createPhysarum, physarumInit, physarumStep, type Physarum } from './agents'
import { phaseSteps } from './pond'
import { pressDiscrete, pressInit, pressStep, PRESS_SLOTS, PRESS_TAP, pressAt, seamBlend } from './loop'
import { clearTiles, EDGE3, edgeOfGradient, putGlyph, RAMP3, rampGlyph, T_FAINT, T_IDLE, T_MID, T_VALUE, type TileGrid, type TileRaster } from './glyphTiles'

export const SLIME_DT = 1 / 15
/** Trail lattice: 48 × 44 cells of 3 card cells from card (0, 11). */
export const SLIME_W = 48, SLIME_H = 44, SLIME_PITCH = 3, SLIME_OY = 11
export const SLIME_FOODS = 8
/**
 * Agents and food strength. The plan's 1,200 agents (57 % of the lattice cells) collapse into one fat blob on a
 * 48 × 44 lattice; 600 (28 %) with SO 5, decay .15 and a half-strength 3×3 blur form a network between the foods.
 * Food deposits 60 a step within 1.2 lattice cells (the plan's 10 was weaker than the agents' own trail).
 */
export const SLIME_AGENTS = 600, SLIME_FOOD_DEPOSIT = 60, SLIME_FOOD_R = 1.2
export interface SlimeSpec {
  seed: number; tiles: TileGrid
  /** Base foods (card cells), on from the start. */
  foods: [number, number][]
  /** The autopilot's extra food: card cells, and its on / off loop phases in seconds. */
  extra?: { x: number; y: number; on: number; off: number }
  lead: number; period: number; seam: number
}
export interface SlimeLayout { G: number; FOOD: number; size: number }
export interface Slime { world: World; spec: SlimeSpec; phys: Physarum; layout: SlimeLayout }

/**
 * The dish: a superellipse ((x − 24)/23.5)⁴ + ((y − 22)/21.5)⁴ < 1 on the lattice. A square lattice lets the
 * agents run along its walls into the corners; the rounded dish keeps the network between the foods.
 */
export const SLIME_MASK: Uint8Array = (() => {
  const m = new Uint8Array(SLIME_W * SLIME_H)
  for (let y = 0; y < SLIME_H; y++) for (let x = 0; x < SLIME_W; x++) {
    const u = (x + .5 - 24) / 23.5, v = (y + .5 - 22) / 21.5
    m[y * SLIME_W + x] = u * u * u * u + v * v * v * v < 1 ? 1 : 0
  }
  return m
})()
/** Lattice coordinates of a card cell. */
export const slimeLx = (x: number) => x / SLIME_PITCH, slimeLy = (y: number) => (y - SLIME_OY) / SLIME_PITCH

export function createSlime(spec: SlimeSpec): Slime {
  const phys = createPhysarum({ w: SLIME_W, h: SLIME_H, agents: SLIME_AGENTS, seed: spec.seed, sa: 16, ra: 32, so: 5, ss: 1, deposit: 5, decay: .15, blur: .5, mask: SLIME_MASK }, 0)
  const FOOD = phys.size, G = FOOD + 3 * SLIME_FOODS, size = G + PRESS_SLOTS
  const dt = SLIME_DT, start = Math.round(spec.lead / dt), len = Math.round(spec.period / dt)
  const xOn = spec.extra ? Math.round(spec.extra.on / dt) : -1, xOff = spec.extra ? Math.round(spec.extra.off / dt) : -1
  const extraIn = (ph: number) => ph >= xOn && ph < xOff
  const foodList = new Float32Array(3 * SLIME_FOODS)
  const XS = spec.foods.length // the extra food's slot

  function init(s: Float32Array) {
    physarumInit(phys, s)
    spec.foods.forEach(([x, y], k) => { s[FOOD + 3 * k] = x; s[FOOD + 3 * k + 1] = y; s[FOOD + 3 * k + 2] = 1 })
    if (spec.extra) { s[FOOD + 3 * XS] = spec.extra.x; s[FOOD + 3 * XS + 1] = spec.extra.y; s[FOOD + 3 * XS + 2] = extraIn(phaseSteps(0, start, len)) ? 1 : 0 }
    pressInit(s, G)
  }
  function step(s: Float32Array, n: number, inp: StepInput) {
    const ph = phaseSteps(n, start, len)
    if (spec.extra) { if (ph === xOn) s[FOOD + 3 * XS + 2] = 1; else if (ph === xOff) s[FOOD + 3 * XS + 2] = 0 }
    if (pressStep(s, G, inp.pointers[0], dt) === PRESS_TAP) {
      const [px, py] = pressAt(s, G)
      let near = -1, free = -1, nd = 8 * 8
      for (let k = 0; k < SLIME_FOODS; k++) {
        const o = FOOD + 3 * k
        if (s[o + 2] < .5) { if (free < 0) free = k; continue }
        const dx = s[o] - px, dy = s[o + 1] - py, d = dx * dx + dy * dy
        if (d < nd) { nd = d; near = k }
      }
      if (near >= 0) s[FOOD + 3 * near + 2] = 0
      else if (free >= 0 && py >= SLIME_OY) { s[FOOD + 3 * free] = Math.max(2, Math.min(141, px)); s[FOOD + 3 * free + 1] = Math.max(SLIME_OY + 2, Math.min(141, py)); s[FOOD + 3 * free + 2] = 1 }
    }
    let m = 0
    for (let k = 0; k < SLIME_FOODS; k++) { const o = FOOD + 3 * k; if (s[o + 2] >= .5) { foodList[m++] = slimeLx(s[o]); foodList[m++] = slimeLy(s[o + 1]); foodList[m++] = SLIME_FOOD_R } }
    physarumStep(phys, s, n, foodList.subarray(0, m), SLIME_FOOD_DEPOSIT)
  }
  // agent headings and the food switches are discrete; positions and the trail lerp
  const discrete: number[] = [...pressDiscrete(G)]
  for (let i = 0; i < phys.agents; i++) discrete.push(phys.AH + i)
  for (let k = 0; k < SLIME_FOODS; k++) discrete.push(FOOD + 3 * k + 2)
  const blend = seamBlend({ size, discrete })
  const world = createWorld({
    size, dt, lead: spec.lead, period: spec.period, seam: spec.seam,
    every: 150, maxCheckpoints: 6, maxSteps: Math.round((spec.lead + spec.period) / dt) + 60, idle: 4, heal: 2, maxLiveSteps: 4,
    init, step, blend,
  })
  return { world, spec, phys, layout: { G, FOOD, size } }
}

export interface FoodView { x: number; y: number; on: boolean }
export function slimeFoods(p: Slime, s: Float32Array): FoodView[] {
  const out: FoodView[] = []
  for (let k = 0; k < SLIME_FOODS; k++) { const o = p.layout.FOOD + 3 * k; out.push({ x: s[o], y: s[o + 1], on: s[o + 2] >= .5 }) }
  return out
}
/**
 * Display level of a trail value: a saturating curve in place of the plan's log(1 + T)/log(41) (no log in a deterministic
 * dir): T/(T + 20)·1.5, clamped to 1 (T = 5 → .3, 20 → .75, 40 → 1).
 */
export const slimeLevel = (T: number) => { const v = T > 0 ? (1.5 * T) / (T + 20) : 0; return v < 1 ? v : 1 }

const sub = new Float32Array(16)
/** Trail level at a card cell (bilinear on the lattice). */
function levelAt(s: Float32Array, x: number, y: number): number {
  const lx = slimeLx(x) - .5, ly = slimeLy(y) - .5
  const x0 = Math.floor(lx), y0 = Math.floor(ly), fx = lx - x0, fy = ly - y0
  const at = (cx: number, cy: number) => { cx = cx < 0 ? 0 : cx >= SLIME_W ? SLIME_W - 1 : cx; cy = cy < 0 ? 0 : cy >= SLIME_H ? SLIME_H - 1 : cy; return s[cy * SLIME_W + cx] }
  const v = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
  return slimeLevel(v)
}
/**
 * Draw the trail into `r`. Per tile: the level at its 4 × 4 card-cell centres (sub16); below .14 the tile stays
 * dark; a structure tensor over the 3 × 3 lattice cells around the tile centre gives the vein direction, and
 * coherence > .4 draws a line along it, else a density glyph. Tones by level: faint < .35 ≤ mid < .6 ≤ idle < .85 ≤ value.
 */
export function drawSlime(p: Slime, s: Float32Array, r: TileRaster): void {
  const { cols, rows, pitch, ox, oy } = p.spec.tiles
  clearTiles(r)
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    let mean = 0
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = levelAt(s, ox + tx * pitch + i + .5, oy + ty * pitch + j + .5); sub[j * 4 + i] = v; mean += v }
    mean /= 16
    if (mean < .14) continue
    // structure tensor on the raw trail around the tile centre
    const cx = Math.floor(slimeLx(ox + tx * pitch + 2)), cy = Math.floor(slimeLy(oy + ty * pitch + 2))
    let jxx = 0, jxy = 0, jyy = 0
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const x = cx + a, y = cy + b
      if (x < 1 || y < 1 || x >= SLIME_W - 1 || y >= SLIME_H - 1) continue
      const gx = slimeLevel(s[y * SLIME_W + x + 1]) - slimeLevel(s[y * SLIME_W + x - 1]), gy = slimeLevel(s[(y + 1) * SLIME_W + x]) - slimeLevel(s[(y - 1) * SLIME_W + x])
      jxx += gx * gx; jxy += gx * gy; jyy += gy * gy
    }
    const tr = jxx + jyy, dd = Math.sqrt((jxx - jyy) * (jxx - jyy) + 4 * jxy * jxy), coh = tr > 1e-9 ? dd / tr : 0
    const tone = mean < .35 ? T_FAINT : mean < .6 ? T_MID : mean < .85 ? T_IDLE : T_VALUE
    const value = mean < .35 ? .6 : mean < .85 ? .8 : 1
    if (coh > .4 && tr > .004) {
      const l1 = (tr + dd) / 2, ex = Math.abs(l1 - jyy) > Math.abs(jxy) * 1e-6 ? l1 - jyy : jxy, ey = Math.abs(l1 - jyy) > Math.abs(jxy) * 1e-6 ? jxy : l1 - jxx
      putGlyph(r, tx, ty, edgeOfGradient(EDGE3, ex, ey), tone, value)
    } else putGlyph(r, tx, ty, rampGlyph(RAMP3, Math.min(1, .15 + mean * .85)), tone, value)
  }
}
