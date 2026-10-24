/**
 * Presets known to this page, filled as board chunks load (`manifest.loadBoard`) or all at once by the
 * eager registry (`./index.ts`). Lookups are by the layers function `withChrome(p)` hands out, which is
 * what the sampler sees: the static-sample cache (`useDotField`) and the worker path (`workers/client`)
 * read this instead of importing every board.
 */
import { withChrome, type WidgetPreset } from './types'

/** Layers functions of static presets (not `animated`, no `clock`): safe to cache by key. */
export const staticLayers = new WeakSet<object>()
/** Preset id behind a layers function the worker can rebuild (no live media). */
export const workerIds = new WeakMap<object, string>()
const byId = new Map<string, WidgetPreset>()

export function registerPresets(items: readonly WidgetPreset[]) {
  for (const p of items) {
    const layers = withChrome(p)
    if (!p.animated && !p.clock) staticLayers.add(layers)
    if (!p.media) workerIds.set(layers, p.id)
    if (!byId.has(p.id)) byId.set(p.id, p)
  }
}
/** A registered preset by id (only boards loaded so far). */
export const registeredPreset = (id: string): WidgetPreset | undefined => byId.get(id)
