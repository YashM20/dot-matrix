/**
 * Board · SIM — cards whose fields are stateful simulations (`src/engine/sim`): Gray–Scott
 * reaction-diffusion, falling sand and Conway's Life. Each is a fixed-dt stepper with checkpoints, so
 * a card is still a pure function of `ctx.t`; the sim state is just replayed (and cached) behind it.
 */
import { fallingSand, grayScott, grayScottField, life, lifeField, sandField, simStep, type Sim } from '../../engine/sim'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle } as const
const N = 72, H = 58
const GRID = T.lattice(2, 0, 11)
const FOOT = 134
const BAR = { x0: 8, x1: 135, y: 128 }

/** Loop the sim: `lead` seconds of head start (so a still frame is already a pattern), then `span` seconds on repeat. */
const phase = (ctx: WidgetContext, lead: number, span: number) => lead + (((ctx.t % span) + span) % span)
/** Footer: step counter in idle grey, one red dot travelling a faint rail with the loop position. */
function footer(sim: Sim, lead: number, span: number, tt: number) {
  const k = (tt - lead) / span, x = BAR.x0 + (BAR.x1 - BAR.x0) * k
  const rail: [number, number][] = []
  for (let c = BAR.x0; c <= BAR.x1; c += 3) rail.push([c, BAR.y])
  return [
    layer(T.dots(rail, 1), 'faint'),
    layer(T.dots([[x, BAR.y]], 2.4), 'active'),
    layer(T.text(`STEP ${String(simStep(sim, tt)).padStart(4, '0')}`, 0, FOOT), 'idle'),
  ]
}
const card = (id: string, name: string, label: string, sim: Sim, fieldOf: (s: Sim, t: number) => ReturnType<typeof lifeField>, lead: number, span: number): WidgetPreset => ({
  id, name, label, ...tile, animated: true,
  layers: ctx => {
    const tt = phase(ctx, lead, span)
    return [layer(GRID.at(GRID.place(fieldOf(sim, tt), 0, 0, N, H)), 'auto'), ...footer(sim, lead, span, tt)]
  },
})

export const simRd = card('sim-rd', 'Sim Reaction-Diffusion', 'SIM  REACTION', grayScott({ w: N, h: H, seed: 3, blobs: 10, sub: 10 }), grayScottField, 14, 16)
export const simSand = card('sim-sand', 'Sim Falling Sand', 'SIM  SAND', fallingSand({ w: N, h: H, seed: 5 }), sandField, 6, 12)
export const simLife = card('sim-life', 'Sim Life', 'SIM  LIFE', life({ w: N, h: H, seed: 11 }), lifeField, 1, 16)

export const simBoard = [simRd, simSand, simLife]
