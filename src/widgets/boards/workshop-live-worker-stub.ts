/**
 * What the sampling worker's build sees instead of `./workshop-live.ts` (vite.config.ts `mainThreadOnly`): knit, paper
 * and ice keep their tap worlds on the main thread, so here they are shells whose `layers` throw. The worker's reply
 * is an error and the card samples on the main thread (`src/workers/client.ts`); the worlds, the knit tile and the
 * DLA never ship in the worker's `wk-workshop` chunk.
 */
import { TILE, tileStyle, type WidgetPreset } from '../types'

const shell = (id: string, name: string): WidgetPreset => ({
  id, name, group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true,
  layers: () => { throw new Error(`${id} keeps its live state on the main thread`) },
})
export const matKnit = shell('mat-knit', 'Knit')
export const matPaper = shell('mat-paper', 'Paper')
export const matIce = shell('mat-ice', 'Ice')
export const liveHooks = {}
