/**
 * What the sampling worker's build sees instead of `./workshop-physics.ts` (vite.config.ts `mainThreadOnly`): sand,
 * mercury and thread keep their worlds on the main thread, so here they are shells whose `layers` throw. The fluid,
 * the rope and the sand sim never ship in the worker's `wk-workshop` chunk.
 */
import { TILE, tileStyle, type WidgetPreset } from '../types'

const shell = (id: string, name: string): WidgetPreset => ({
  id, name, group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true,
  layers: () => { throw new Error(`${id} keeps its live state on the main thread`) },
})
export const matSand = shell('mat-sand', 'Sand')
export const matMercury = shell('mat-mercury', 'Mercury')
export const matThread = shell('mat-thread', 'Thread')
export const physicsHooks = {}
