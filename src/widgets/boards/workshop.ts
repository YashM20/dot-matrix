/**
 * Board · WORKSHOP: four materials that grow, break and fold, on the shared material shell (`materials-shared.ts`:
 * the card tile, `matLight`, lazy bakes). The frost window (`workshop-frost.ts`), the frost fern on ice
 * (`workshop-ice.ts`), the kintsugi plate (`workshop-kintsugi.ts`) and the paper fold (`workshop-fold.ts`). The ice and
 * the kintsugi plate keep their tap worlds on the main thread: the sampling worker's build resolves them to stubs
 * (vite.config.ts `mainThreadOnly`).
 *
 * The owner kept these four of fifteen on Nov 16 (#221); the other eleven are in `removedCards` (manifest.ts).
 * Rules (M §1): material from relief and one light, never hue; one red, on a live part
 * only (the freezing cells, the grains sticking now, the seam filling, the moving crease).
 */
import { lightSource } from '../../site/light'
import { matFrost, frostHooks } from './workshop-frost'
import { matIce, iceHooks } from './workshop-ice'
import { matKintsugi, kintsugiHooks } from './workshop-kintsugi'
import { matFold, foldHooks } from './workshop-fold'

/** Frost, ice, kintsugi and the paper fold: one row of four (a `dense` board, manifest.ts). */
export const workshopBoard = [matFrost, matIce, matKintsugi, matFold]
/** Live data for the board: the light / tilt hub (F0), subscribed while the board is open. */
export const workshopSources = [lightSource]
/** The board's internals, for the checks (`scripts/materials.ts`). */
export const workshopHooks = { ...frostHooks, ...iceHooks, ...kintsugiHooks, ...foldHooks }
