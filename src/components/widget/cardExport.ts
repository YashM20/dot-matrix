/**
 * The widget page's exports: the card as a PNG, SVG or HTML snippet. `WidgetPage` loads this module on the first
 * export (`import('./cardExport')`), so the page's own chunk carries none of the export code (#214).
 */
import type { ThemeTokens } from '../../engine/types'
import type { WidgetPreset } from '../../widgets/types'
import { presetSource } from '../../export/source'
import { stillPNG } from '../../export/still'
import { cardHTML, cardSVG, type CardCredit } from '../../export/snippets'

/** Card data over the preset's defaults: what the page shows (live values, typed words). */
type Data = Record<string, number>

/** The card at time `t` as a PNG. */
export const cardPNG = (preset: WidgetPreset, theme: ThemeTokens, t: number, data?: Data) => stillPNG(presetSource(preset, theme, data), t)

/** The card at time `t` as SVG markup, on its themed surface. */
export function cardSVGText(preset: WidgetPreset, theme: ThemeTokens, t: number, info: CardCredit, data?: Data) {
  const src = presetSource(preset, theme, data)
  return cardSVG(src.frame(t), { width: src.width, height: src.height, background: theme.surface, border: theme.hairline, radius: theme.cornerRadiusCard }, info)
}

/** The card's SVG wrapped as a static HTML snippet. */
export const cardHTMLText = (preset: WidgetPreset, theme: ThemeTokens, t: number, info: CardCredit, data?: Data) => cardHTML(cardSVGText(preset, theme, t, info, data), info)
