/**
 * Board · SIM — cards whose fields are stateful simulations (`src/engine/sim`): Gray–Scott
 * reaction-diffusion, falling sand and Conway's Life. Each is a fixed-dt stepper with checkpoints and a
 * loop (`lead` + `period`), so a card is a pure function of `ctx.t` and costs the same at t = 1 s or 3600 s.
 * One red on the board: the grains falling *right now* in the hourglass (live).
 */
import { fallingSand, grayScott, life, lifeStamp, SAND, SAND_B, simMapField, simPhase, simStep, simView, WALL, type Sim } from '../../engine/sim'
import type { Field, Layer } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle } as const
const N = 72, H = 58
const GRID = T.lattice(2, 0, 11)
const FOOT = 134
const RAIL = { x0: 0, x1: 143, y: 129 }
const on = (f: Field) => GRID.at(GRID.place(f, 0, 0, N, H))

/** Footer: a faint rail filled in `mid` up to the loop position, step counter left, one stat right. */
function footer(sim: Sim, t: number, left: string, right: string): Layer[] {
  const k = simPhase(sim, t), done: [number, number][] = [], rest: [number, number][] = []
  for (let c = RAIL.x0; c <= RAIL.x1; c += 3) (c - RAIL.x0 <= (RAIL.x1 - RAIL.x0) * k ? done : rest).push([c, RAIL.y])
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    layer(T.text(`${left} ${String(simStep(sim, t)).padStart(4, '0')}`, 0, FOOT), 'idle'),
    layer(T.text(right, 143, FOOT, { align: 'right' }), 'faint'),
  ]
}
const pad4 = (n: number) => String(Math.min(9999, n)).padStart(4, '0')

// ── 01 Reaction: coral growth (F .0545, k .062) from 50 seeds, with a narrow diffusion (du .09, dv .045) so
// the labyrinth walls are ~4 dots wide: rings open, branch and fill the card in ~10 s; hold, dissolve over
// the last 1.4 s, regrow. Edges wrap (no wall artefact) and a 9-cell size falloff hides the seam.
const rd = grayScott({ w: N, h: H, seed: 3, feed: .0545, kill: .062, du: .09, dv: .045, sub: 6, blobs: 50, radius: [1, 3], lead: 4, period: 13, maxSteps: 240, every: 24 })
const smooth = (a: number, b: number, x: number) => { const s = Math.min(1, Math.max(0, (x - a) / (b - a))); return s * s * (3 - 2 * s) }
/** Border falloff: full inside, ramping to 0 over the outer 9 cells (in sim cells). */
const vignette = (x: number, y: number) => smooth(-1, 9, Math.min(x, y, N - 1 - x, H - 1 - y))
/**
 * Relief: the pattern (V) as a lit surface, light from the upper left. Band 0 = the thin fringe where V
 * fades (faint, small dots), 1 = the shadow flank (mid), 2 = the lit body (value, full size).
 */
function rdBand(t: number, band: 0 | 1 | 2, fade: number): Field {
  const V = (g: Float32Array, x: number, y: number) => g[((Math.min(H - 1, Math.max(0, y)) * N) + Math.min(N - 1, Math.max(0, x))) * 2 + 1]
  return simMapField(rd, t, (g, i, x, y) => {
    const body = Math.min(1, g[i + 1] * 3), k = vignette(x, y) * fade
    if (body < .15 || k <= 0) return 0
    const light = (V(g, x - 1, y - 1) - V(g, x + 1, y + 1)) * 5
    const b = body < .4 ? 0 : light < -.25 ? 1 : 2
    return b !== band ? 0 : (band === 2 ? 1 : band === 1 ? .8 : .4) * k
  })
}
export const simRd: WidgetPreset = {
  id: 'sim-rd', name: 'Sim Reaction-Diffusion', label: 'SIM  REACTION', ...tile, animated: true,
  layers: ctx => {
    const t = ctx.t, k = simPhase(rd, t), fade = 1 - smooth(.9, 1, k)
    return [
      // three tone bands, each a size step: fronts faint and small, bodies mid, cores white and full
      layer(on(rdBand(t, 0, fade)), 'faint'),
      layer(on(rdBand(t, 1, fade)), 'mid'),
      layer(on(rdBand(t, 2, fade)), 'value'),
      ...footer(rd, t, 'STEP', 'F.055 K.062'),
    ]
  },
}

// ── 02 Sand: an hourglass. A closed scene (no emitters), so the grain count is constant: the top bulb drains
// through a 3-cell neck into a pile below, in two strata tones; the loop resets it once the top is empty.
const CX = 36, NECK = 28
/** Inner half-width of the glass at row y: 45° funnel near the neck (grains always slide), rounding out to 19. */
const halfWidth = (y: number) => { const d = Math.abs(y - NECK); return Math.min(1 + d, Math.round(1 + 18 * Math.sin(Math.min(1, d / 24) * Math.PI / 2))) }
function hourglass(g: Float32Array, w: number, h: number) {
  for (let y = 0; y < h; y++) {
    const hw = y === 0 || y === h - 1 ? -1 : halfWidth(y)
    if (hw < 0) { for (let x = CX - 20; x <= CX + 20; x++) g[y * w + x] = WALL; continue }
    g[y * w + CX - hw - 1] = WALL; g[y * w + CX + hw + 1] = WALL
    // sand fills the top bulb from row 4 down to just above the neck, strata of 4 rows alternating tone
    if (y >= 4 && y < NECK - 2) for (let x = CX - hw; x <= CX + hw; x++) g[y * w + x] = ((y >> 2) & 1) ? SAND_B : SAND
  }
}
const sand = fallingSand({ w: N, h: H, seed: 5, init: hourglass, emitters: [], dt: 1 / 24, lead: 1.5, period: 15, maxSteps: 600, every: 48 })
const GRAINS = (() => { const g = sand.checkpoints.get(0)!; let c = 0; for (const x of g) if (x === SAND || x === SAND_B) c++; return c })()
const grain = (g: Float32Array, i: number) => g[i] === SAND || g[i] === SAND_B
/** The live stream: a grain below the neck, in the neck's columns, with no pile beside it (cells ±2 empty). */
const falling = (g: Float32Array, i: number, x: number, y: number) =>
  y > NECK && Math.abs(x - CX) <= 1 && grain(g, i) && !grain(g, i - 2 - (x - CX)) && !grain(g, i + 2 - (x - CX))
export const simSand: WidgetPreset = {
  id: 'sim-sand', name: 'Sim Falling Sand', label: 'SIM  SAND', ...tile, animated: true,
  layers: ctx => {
    const t = ctx.t, g = simView(sand, t)
    let top = 0
    for (let i = 0; i < N * NECK; i++) if (grain(g, i)) top++
    return [
      layer(on(simMapField(sand, t, (g, i) => g[i] === WALL ? 1 : 0)), 'faint'),
      layer(on(simMapField(sand, t, (g, i, x, y) => g[i] === SAND && !(top > 0 && falling(g, i, x, y)) ? 1 : 0)), 'value'),
      layer(on(simMapField(sand, t, (g, i, x, y) => g[i] === SAND_B && !(top > 0 && falling(g, i, x, y)) ? .8 : 0)), 'mid'),
      layer(on(simMapField(sand, t, (g, i, x, y) => (top > 0 && falling(g, i, x, y)) ? 1 : 0)), 'active'),
      ...footer(sand, t, 'STEP', `TOP ${pad4(top)}/${GRAINS}`),
    ]
  },
}

// ── 03 Life: a bounded board (dead edges) seeded with intent: a Gosper glider gun firing south-east into a
// soup, two period-3 pulsars, and the soup itself. Dead cells leave a fading trail. Reseeds every 24 s.
const GUN = [
  '........................#...........',
  '......................#.#...........',
  '............##......##............##',
  '...........#...#....##............##',
  '##........#.....#...##..............',
  '##........#...#.##....#.#...........',
  '..........#.....#.......#...........',
  '...........#...#....................',
  '............##......................',
]
const PULSAR = [
  '..###...###..', '.............', '#....#.#....#', '#....#.#....#', '#....#.#....#', '..###...###..', '.............',
  '..###...###..', '#....#.#....#', '#....#.#....#', '#....#.#....#', '.............', '..###...###..',
]
const lifeSim = life({
  w: N, h: H, seed: 11, density: .34, edge: 'dead', soup: [.42, .5, 1, 1], afterglow: .8, dt: 1 / 10, lead: .5, period: 24, maxSteps: 400, every: 16,
  stamps: (g, w, _h, ch) => { lifeStamp(g, w, GUN, 1, 1, ch); lifeStamp(g, w, PULSAR, 56, 2, ch); lifeStamp(g, w, PULSAR, 4, 26, ch) },
})
export const simLife: WidgetPreset = {
  id: 'sim-life', name: 'Sim Life', label: 'SIM  LIFE', ...tile, animated: true,
  layers: ctx => {
    const t = ctx.t, g = simView(lifeSim, t)
    let pop = 0
    for (let i = 0; i < g.length; i += 2) pop += g[i]
    return [
      layer(on(simMapField(lifeSim, t, (g, i) => g[i] === 0 && g[i + 1] > .2 ? .5 : 0)), 'faint'),
      layer(on(simMapField(lifeSim, t, (g, i) => g[i])), 'value'),
      ...footer(lifeSim, t, 'GEN ', `POP ${pad4(pop)}`),
    ]
  },
}

/** The board's sims (cold-start benches reset them; see scripts/bench.ts). */
export const simBoardSims: Sim[] = [rd, sand, lifeSim]
export const simBoard = [simRd, simSand, simLife]
