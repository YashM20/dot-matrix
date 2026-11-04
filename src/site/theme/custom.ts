/**
 * The custom hue (docs/LAYOUT-THEME-PLAN.md §4 "Custom hue", T6), lazy: the THEME popover and TOOLS › THEME load it
 * when the custom swatch is used. It runs the preset generator (`accents.ts`) in the browser for one hue: chroma and
 * lightness come from the presets around that hue and are clamped by the same rules (gamut, 3:1 dots, 4.5:1 text,
 * distinct from the greys under colour-vision deficiency; `scripts/site/theme.ts` sweeps all 360 hues), so no pick
 * can be illegible. The result is CSS for both schemes, which the store applies and stores for the boot script (the
 * store never reads that copy back: it makes it again here from the hue).
 */
import { customCss, generateHue } from './accents'
import type { Scheme } from './names'
import { provideCustom, type CustomHue } from './theme'

/** Dots on the hue track: one every 10°. */
export const TRACK_STEPS = 36
export const normHue = (h: number): number => ((Math.round(h) % 360) + 360) % 360
/** The custom accent for a hue: its hue and the theme CSS of both schemes (`setTheme({ accent: 'custom', custom })`). */
export const customHue = (hue: number): Required<CustomHue> => { const h = normHue(hue); return { hue: h, css: customCss(h) } }
// the store makes every custom hue's CSS with this from now on (`setTheme` never takes CSS from a caller)
provideCustom(customHue)
/** The hue a preset is built on, to start the slider where the visitor already is. */
export { ACCENT_SPECS } from './accents'

const tracks = new Map<Scheme, string[]>()
/** The generated accent solid every 10° on a scheme: the slider's track, drawn as dots in their own colours. */
export function trackOf(scheme: Scheme): string[] {
  let t = tracks.get(scheme)
  if (!t) tracks.set(scheme, t = Array.from({ length: TRACK_STEPS }, (_, i) => generateHue(scheme, (i * 360) / TRACK_STEPS).roles.red))
  return t
}
