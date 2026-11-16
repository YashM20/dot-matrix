/**
 * What the sampling worker's build sees instead of `./workshop-ice.ts` (vite.config.ts `mainThreadOnly`): the ice card
 * keeps its breath world on the main thread, so here it is a shell whose `layers` throw. The worker's reply is an
 * error and the card samples on the main thread (`src/workers/client.ts`); the world and the DLA never ship in the
 * worker's `wk-workshop` chunk.
 */
import { TILE, tileStyle, type WidgetPreset } from '../types'

export const matIce: WidgetPreset = {
  id: 'mat-ice', name: 'Ice', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true,
  layers: () => { throw new Error('mat-ice keeps its live state on the main thread') },
}
export const iceHooks = {}
