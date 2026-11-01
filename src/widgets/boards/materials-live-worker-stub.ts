/**
 * What the sampling worker's build sees instead of `./materials-live.ts` (vite.config.ts `mainThreadOnly`): the pool
 * and the rust sign keep their live worlds on the main thread, so here they are shells whose `layers` throw. The
 * worker's reply is an error and the card samples on the main thread (`src/workers/client.ts`), and the ripple, the
 * physics world and the rust bakes never ship in the worker's `wk-materials` chunk.
 */
import { TILE, tileStyle, type WidgetPreset } from '../types'

const shell = (id: string, name: string): WidgetPreset => ({
  id, name, group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true,
  layers: () => { throw new Error(`${id} keeps its live state on the main thread`) },
})
export const matPool = shell('mat-pool', 'Pool')
export const matRust = shell('mat-rust', 'Rust')
export const poolHooks = {}
