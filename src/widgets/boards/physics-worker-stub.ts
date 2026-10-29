/**
 * What the sampling worker's build sees instead of `./physics.ts` (vite.config.ts `mainThreadOnly`): no physics cards.
 * Every physics card keeps its live world on the main thread (`mainThread()` throws in a worker), so a physics id
 * there is an unknown preset, the reply is an error and the card samples on the main thread (`src/workers/client.ts`),
 * without the worker first fetching the board and `engine/physics` (docs/living-matter/F0-foundation.md §7 R13).
 */
import type { Source } from '../../data/source'
import type { WidgetPreset } from '../types'

export const physicsBoard: WidgetPreset[] = []
export const physicsSources: readonly Source[] = []
