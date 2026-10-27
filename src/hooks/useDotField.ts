import { useMemo } from 'react'
import { sampleField, sampleLayers } from '../engine/sampler/gridSampler'
import type { DotInstance, DotStyle, Field, FrameContext, GridConfig, Layer, ThemeTokens } from '../engine'
import type { WidgetContext } from '../widgets/types'
import { staticLayers } from '../widgets/registry'

export type DotSource = { field: Field } | { layers: (ctx: WidgetContext) => Layer[] }
/** Interaction fields of the frame context (P2), filled by the input layer in `DotCanvas`. */
export type InteractionContext = Pick<FrameContext, 'hover' | 'pressed' | 'focus' | 'pointers'>

/**
 * Static sample cache across board visits. A static preset (not `animated`, no `clock`) is a pure
 * function of its grid, style, theme and data, so returning to a board reuses the dots it sampled last
 * time instead of re-sampling every card. Keyed by the layers function (as `withChrome` hands it out),
 * the theme object and a JSON key of grid + style + t + data; LRU, bounded to `CACHE_LIMIT` entries.
 * Cached arrays are shared between mounts: treat them as read-only (the renderers and motion helpers do).
 */
const CACHE_LIMIT = 200
const cache = new Map<string, DotInstance[]>()
/** Layers functions of the static presets (registered as their boards load: `widgets/registry`). */
const isStatic = (layers: object) => staticLayers.has(layers)
const ids = new WeakMap<object, number>()
let nextId = 1
const idOf = (o: object) => { let id = ids.get(o); if (id === undefined) ids.set(o, (id = nextId++)); return id }
function cached(key: string, sample: () => DotInstance[]): DotInstance[] {
  const hit = cache.get(key)
  if (hit) { cache.delete(key); cache.set(key, hit); return hit } // most recently used goes last
  const dots = sample()
  cache.set(key, dots)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  return dots
}

/**
 * Sample a field or layer-set onto the grid, memoised on primitive style/grid values so a
 * widget only re-samples when something visible changed (or `t` advanced for animation).
 */
const NONE: DotInstance[] = []
/**
 * `enabled: false` skips sampling entirely (cards whose entrance has not started yet).
 * `ix` adds hover / pressed / focus / pointers to the layers' context (omitted at rest).
 */
export function useDotField(source: DotSource, grid: GridConfig, style: DotStyle, theme: ThemeTokens, t = 0, data: Record<string, number> = {}, enabled = true, ix?: InteractionContext): DotInstance[] {
  const { cols, rows, pitch } = grid
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps } = style
  const dataKey = JSON.stringify(data)
  const ixKey = ix ? JSON.stringify(ix) : ''
  const field = 'field' in source ? source.field : undefined
  const layers = 'layers' in source ? source.layers : undefined
  return useMemo(() => {
    if (!enabled) return NONE
    const g = { cols, rows, pitch }, s = { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps }
    const extra = ixKey ? JSON.parse(ixKey) as InteractionContext : undefined
    // a broken preset renders blank instead of taking the whole board down
    try {
      if (!layers) return sampleField(field!, g, s, theme)
      const sample = () => sampleLayers(layers({ t, data: JSON.parse(dataKey), grid: g, ...extra }), g, s, theme)
      // interaction frames (hover / press / focus / pointers) are transient: never cache them
      return !extra && isStatic(layers) ? cached(`${idOf(layers)}|${idOf(theme)}|${JSON.stringify([g, s, t])}|${dataKey}`, sample) : sample()
    } catch (error) { console.error('useDotField: sampling failed', error); return [] }
  }, [field, layers, cols, rows, pitch, shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, theme, t, dataKey, enabled, ixKey])
}
