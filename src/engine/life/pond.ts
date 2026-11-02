/**
 * The koi scene (docs/living-matter/L-pond.md §L1): a `World` (physics/world.ts) whose one flat state holds the koi
 * (head agents + argonaut spines), the food pellets, Elias wave-equation water at tile resolution and a foam field;
 * and `drawKoiPond`, which paints a state into a glyph-tile raster (bank stones, water glyphs, foam, shadows, koi
 * bodies, pellets, lily pads). Engine side only: no chrome, no React. Shared by the `pond-koi` card and the L4 hero.
 *
 * The code lives in `pond/`, split by concern:
 * - `layout.ts`: the spec, the state layout (slot offsets) and the constants;
 * - `world.ts`: `createKoiPond`, the world's step (input, autopilot, pellets, wake, foam), init and blend;
 * - `koi.ts`: koi steering, burst and glide, startles and their contagion;
 * - `heal.ts`: the heal back to the loop, in which the koi swim back to their scripted places (#90);
 * - `views.ts`: read-outs for cards, checks and probes;
 * - `paint.ts`, `draw.ts`, `type.ts`: drawing (shared helpers, the DOTS look, the TYPE look).
 * This file is the public surface; the slot indices stay inside `pond/`.
 */
export {
  CASCADE, CONTAG_R, CONTAG_S, DEFAULT_BODY_STYLE, FLICK, GULP_SHOW, HUNGER_BITE, HUNGER_RATE, KOI_HALF_WIDTH, KOI_LIGHT, KOI_SLOTS,
  MODE_BEND, MODE_BURST, MODE_CRUISE, MODE_ESCAPE, MODE_GLIDE, PEL_EATEN, PEL_FALLING, PEL_FLOATING, PEL_OFF, PEL_SINKING, phaseSteps,
  POND_DT, pondLayout, SATED, TILT_DRIFT, TILT_K,
  type BodyStyle, type KoiPond, type KoiPondSpec, type PondLayout,
} from './pond/layout'
export { createKoiPond } from './pond/world'
export { koiBulge, koiView, pelletViews, pondGlobals, setKoiHunger, type KoiView, type PelletView } from './pond/views'
export type { KoiDrawOpts } from './pond/paint'
export { drawKoiPond } from './pond/draw'
export { KOI_TYPE_TILES } from './pond/type'
