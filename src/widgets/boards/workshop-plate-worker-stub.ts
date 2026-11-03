/**
 * What the sampling worker's build sees instead of `./workshop-plate.ts` (vite.config.ts `mainThreadOnly`): the
 * Lichtenberg plate keeps its tap world on the main thread, so here it is a shell whose `layers` throws. The growth
 * model never ships in the worker's `wk-workshop` chunk.
 */
import { TILE, tileStyle, type WidgetPreset } from '../types'

export const matLichtenberg: WidgetPreset = {
  id: 'mat-lichtenberg', name: 'Lichtenberg', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true,
  layers: () => { throw new Error('mat-lichtenberg keeps its live state on the main thread') },
}
export const plateHooks = {}
