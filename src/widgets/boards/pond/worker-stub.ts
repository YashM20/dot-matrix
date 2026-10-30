/**
 * What the sampling worker's build sees instead of `./index.ts` (vite.config.ts `mainThreadOnly`): no pond cards.
 * Pond cards refuse the worker anyway (`mainThread()`), so a pond id there is an unknown preset, the reply is an
 * error and the card samples on the main thread (`src/workers/client.ts`). Keeps `engine/life` out of the worker chunk.
 */
import type { WidgetPreset } from '../../types'

export const pondBoard: WidgetPreset[] = []
/** No sources in the worker either (the light hub is a main-thread `Source`). */
export const pondSources = []
