/**
 * `@dot480/core`: the curated public API of the Dot/480 engine (`src/engine`).
 * Every visual is `Field → Grid Sampler → Renderer`. This entry only names what callers build with;
 * helpers the engine uses internally (glyph tables, mask tables, path math, hashing) stay out.
 * Framework-free, zero runtime dependencies, no side effects on import.
 */
// ── core types ──
export type { CellBounds, DotInstance, DotStyle, Field, GridConfig, Layer, ThemeTokens, Tone } from '../../../src/engine/types'
export type { Control, FrameContext, LayerSource, Pointer } from '../../../src/engine/context'

// ── theme ──
export { dot480, deerflowMosaic, presets as themes, type PresetName as ThemeName } from '../../../src/engine/theme/tokens'

// ── sampler ──
export { colorFor, latticeGrid, sampleField, sampleLayers, toneColor } from '../../../src/engine/sampler/gridSampler'
export { quantize } from '../../../src/engine/sampler/quantize'

// ── renderers ──
export { renderSVG } from '../../../src/engine/renderer/svgRenderer'
export { renderCanvas } from '../../../src/engine/renderer/canvasRenderer'
export { squircleExponent } from '../../../src/engine/renderer/shapePath'

// ── layout + text (cell space; text stays dot-aligned) ──
export {
  barsAt, bounded, centeredBarsAt, combine, dim, discCells, dotAt, hRule, place, placeCells, polylineCells,
  rectCells, ringCells, scaleOf, spriteAt, textAt, textSize, toCell, vRule,
} from '../../../src/engine/layout'
export { glyphMetrics, textField, textWidth, type TextOptions } from '../../../src/engine/fields/bitmapFont'
export { cjkTextField } from '../../../src/engine/fields/cjkFallback'

// ── fields (generators) ──
export { breathingField, concentricRingsField, dialField, ringField, sunburstField } from '../../../src/engine/fields/polarField'
export { cachedIconField, iconField, iconPaths } from '../../../src/engine/fields/iconSDF'
export { bayerDither, floydSteinbergDither, imageToLuminanceField, type LuminanceOptions } from '../../../src/engine/fields/haltoneField'
export {
  amplitudeField, amplitudesFromAnalyser, ecgAmplitudes, mirroredTraceField, speechAmplitudes, sumOfSinesAmplitudes, traceField,
  type AmplitudeOptions,
} from '../../../src/engine/fields/waveformField'
export { catmullRomField } from '../../../src/engine/fields/splineField'
export { gridField } from '../../../src/engine/fields/heatmapField'
export { poissonDiscPoints, scatterField } from '../../../src/engine/fields/scatterField'
export { corridorField, perspectiveProjection } from '../../../src/engine/fields/projection3D'
export {
  checkerField, concentricWaveField, domainRepeat, gradientField, modulatedRingField, radialWarp, sinWarp, spiralField,
  truchetField, warpDomain, waveField,
} from '../../../src/engine/fields/warpedField'

// ── math ──
export { clamp, hash01, mix, smoothstep } from '../../../src/engine/math'

// ── clock + motion ──
export { createMasterClock, quantizeTime, sharedClock, type ClockOptions, type MasterClock } from '../../../src/engine/clock'
export { cubicBezier, duration, ease, progress, type Ease, type EaseName } from '../../../src/engine/motion/easing'
export { maskByName, masks, type Mask, type MaskName } from '../../../src/engine/motion/masks'
export { revealDots, transitionDots, type RevealOptions } from '../../../src/engine/motion/reveal'
export { criticalSpring, DataSprings, underdampedSpring, type SpringState } from '../../../src/engine/motion/spring'
export {
  decodeText, splitFlapCells, splitFlapText, type DecodeOptions, type FlapCell, type SplitFlapOptions,
} from '../../../src/engine/motion/text'
export { migrate, migrationLayers, type MigrateOptions, type Migration, type MigrationLayerOptions } from '../../../src/engine/migrate/migrate'
export { morph, morphSDF, type MorphOptions } from '../../../src/engine/migrate/morph'

// ── interaction (controls → data patches; hosts wire the pointer events) ──
export {
  beginDrag, controlRange, dragValue, keyValue, pick, releaseValue, settle, toLocal,
  type CellPoint, type ControlPatch, type ControlRange, type DragStart,
} from '../../../src/engine/interaction/controls'

// ── Field IR (also a subpath: `@dot480/core/ir`) ──
export * as ir from './ir'

// ── raster + light ──
export {
  createRaster, latticeSpace, rasterize, rasterMax, rasterSum, rasterWindow, sample, tightBounds, type Raster, type SpaceId,
} from '../../../src/engine/raster/raster'
export { blur, cut, dilate, distanceRaster, erode, moat, outline, threshold } from '../../../src/engine/raster/ops'
export { sdfBox, sdfCircle, sdfRing, sdfSubtract, sdfUnion } from '../../../src/engine/light/sdf'
export {
  heightRaster, normalRaster, stackHeights, type HeightProfile, type HeightRaster, type HeightSpec, type NormalRaster,
} from '../../../src/engine/light/height'
export {
  bloom, illuminate, lambert, lightDir, phong, torch, type Light, type PointLight, type ShadeOptions, type Vec3,
} from '../../../src/engine/light/shade'
export {
  emissive, fabric, glass, gloss, hourOf, matte, metal, placed, STUDIO, sunAt, toneBands,
  type EmissiveOptions, type FabricOptions, type GlassOptions, type GlossOptions, type MaterialOptions, type MetalOptions,
  type Placement, type Studio, type ToneBand,
} from '../../../src/engine/light/material'

// ── simulation ──
export {
  createSim, fallingSand, grayScott, grayScottField, life, lifeField, lifeStamp, SAND, sandCount, sandField, simAt, simAtStep,
  simField, simGridField, simLoop, simMapField, simPhase, simReset, simStep, simView,
  type GrayScottOptions, type LifeOptions, type SandEmitter, type SandOptions, type Sim, type SimEdge, type SimSpec,
} from '../../../src/engine/sim/sim'

// ── halftone (photos / live media) ──
export {
  halftone, halftoneStream, rasterChanges, type HalftoneOptions, type HalftoneStream, type HalftoneStreamOptions,
} from '../../../src/engine/halftone/halftone'
export { blueNoise, stbn } from '../../../src/engine/halftone/mask'

// ── describe (accessible text for a card / board) ──
export {
  controlValueText, describe, describeBoard,
  type BoardDescription, type CardDescription, type ControlDescription, type Describable, type DescribableBoard,
} from '../../../src/engine/describe'
