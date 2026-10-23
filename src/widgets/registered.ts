import type { WidgetPreset } from './types'

/**
 * The presets the sample worker can rebuild by id and the static-sample cache may memoise. The full
 * registry (`widgets/index.ts`) adds every board's presets on import; a page that embeds only a few
 * cards (the essay) adds just those, so the renderer path (`DotCanvas` → `useDotField`, the worker
 * client) never has to import every board. Only add presets that `widgets/index.ts` also lists (the
 * worker looks them up by id in its own copy of the registry).
 */
const presets = new Set<WidgetPreset>()
let version = 0
export function registerPresets(ps: readonly WidgetPreset[]): void {
  let added = false
  for (const p of ps) if (!presets.has(p)) { presets.add(p); added = true }
  if (added) version++
}
export const registeredPresets = (): readonly WidgetPreset[] => [...presets]
/** Bumps whenever presets are added (consumers rebuild their lookups lazily). */
export const registryVersion = () => version
