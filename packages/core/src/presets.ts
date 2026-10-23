/**
 * `@dot480/core/presets`: the card library (every board in the playground). A preset is plain data
 * plus a pure `layers(ctx)` function; `withChrome(preset)` adds the card label, ready for `sampleLayers`.
 * Separate subpath so `@dot480/core` stays small for callers who only build their own fields.
 */
import { widgetById, widgetPresets } from '../../../src/widgets'
import type { WidgetPreset } from '../../../src/widgets/types'

export { boardById, boardIds, boards, type BoardDef } from '../../../src/widgets'
export { CARD, TILE, baseStyle, tileStyle, layer, layoutFor, presetField, toneRamp, withChrome, type ToneStop, type WidgetContext } from '../../../src/widgets/types'
export type { WidgetPreset as CardPreset }

/** Every card preset, in board order. */
export const cardPresets: readonly WidgetPreset[] = widgetPresets
/** A card preset by id (`'timer'`, `'ui-knob'`, …), or undefined. */
export const presetById = (id: string): WidgetPreset | undefined => widgetById(id)
