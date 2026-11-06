import { useMemo } from 'react'
import { sampleField, sampleLayers } from '../engine/sampler/gridSampler'
import type { DotInstance, DotStyle, Field, FrameContext, GridConfig, Layer, ThemeTokens } from '../engine'
import type { WidgetContext } from '../widgets/types'
import { staticLayers } from '../widgets/registry'

export type DotSource = { field: Field } | { layers: (ctx: WidgetContext) => Layer[] }
/** Interaction fields of the frame context (P2), filled by the input layer in `DotCanvas`. */
export type InteractionContext = Pick<FrameContext, 'hover' | 'pressed' | 'focus' | 'pointers' | 'reducedMotion'>

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
/** One frame of the source. A module function, so the React Compiler can compile the hook around its try/catch. */
function sampleSource(field: Field | undefined, layers: ((ctx: WidgetContext) => Layer[]) | undefined, g: GridConfig, s: DotStyle, theme: ThemeTokens, t: number, dataKey: string, extra: InteractionContext | undefined): DotInstance[] {
  // a broken preset renders blank instead of taking the whole board down
  try {
    if (!layers) return sampleField(field!, g, s, theme)
    const sample = () => sampleLayers(layers({ t, data: JSON.parse(dataKey), grid: g, ...extra }), g, s, theme)
    // interaction frames (hover / press / focus / pointers) are transient: never cache them. A still under reduced
    // motion with no input is as fixed as any other still, under its own key
    const rest = !extra || (extra.reducedMotion === true && Object.keys(extra).length === 1)
    return rest && isStatic(layers) ? cached(`${idOf(layers)}|${idOf(theme)}|${JSON.stringify([g, s, t])}|${dataKey}${extra ? '|still' : ''}`, sample) : sample()
  } catch (error) { console.error('useDotField: sampling failed', error); return [] }
}

export function useDotField(source: DotSource, grid: GridConfig, style: DotStyle, theme: ThemeTokens, t = 0, data: Record<string, number> = {}, enabled = true, ix?: InteractionContext): DotInstance[] {
  const { cols, rows, pitch } = grid
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, gap } = style
  const dataKey = JSON.stringify(data)
  const ixKey = ix ? JSON.stringify(ix) : ''
  const field = 'field' in source ? source.field : undefined
  const layers = 'layers' in source ? source.layers : undefined
  return useMemo(() => {
    if (!enabled) return NONE
    const g = { cols, rows, pitch }, s = { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, gap }
    const extra = ixKey ? JSON.parse(ixKey) as InteractionContext : undefined
    return sampleSource(field, layers, g, s, theme, t, dataKey, extra)
  }, [field, layers, cols, rows, pitch, shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, gap, theme, t, dataKey, enabled, ixKey])
}
