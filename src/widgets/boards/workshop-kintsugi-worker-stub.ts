/**
 * What the sampling worker's build sees instead of `./workshop-kintsugi.ts` (vite.config.ts `mainThreadOnly`): the
 * kintsugi plate keeps its tap world on the main thread, so here it is a shell whose `layers` throws. The fracture
 * code never ships in the worker's `wk-workshop` chunk.
 */
import { TILE, tileStyle, type WidgetPreset } from '../types'

export const matKintsugi: WidgetPreset = {
  id: 'mat-kintsugi', name: 'Kintsugi', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true,
  layers: () => { throw new Error('mat-kintsugi keeps its live state on the main thread') },
}
export const kintsugiHooks = {}
