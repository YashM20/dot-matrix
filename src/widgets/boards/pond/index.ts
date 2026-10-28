/**
 * Board · POND — living scenes in glyph tiles (docs/living-matter/L-pond.md, docs/LIFE.md). L1: 01 KOI. L2 adds
 * jelly, slime, fireflies, murmuration and a terrarium. Every card is a `src/engine/life` scene on a physics world:
 * a pure function of t until touched, then live, healing back. Cards are main-thread only; the sampling worker's
 * build resolves this module to `./worker-stub.ts` (vite.config.ts `mainThreadOnly`), so `engine/life` never ships
 * in `sampleWorker-*.js`.
 */
import type { World } from '../../../engine/physics/world'
import type { WidgetPreset } from '../../types'
import { koiPond, koiProbe, pondKoi } from './koi'

export const pondBoard: WidgetPreset[] = [pondKoi]
/** The board's worlds (tests reset them). */
export const pondWorlds: World[] = [koiPond.world]
/** Read-outs for tests and the browser probe. */
export const pondProbe = { koi: koiProbe }
