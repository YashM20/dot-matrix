/**
 * Living scenes (docs/living-matter/L-pond.md, docs/LIFE.md): wave-equation water (`ripple`), dot micro-glyph tiles
 * (`glyphTiles`), creature spines (`chain`), fish bodies and markings (`body`), Reynolds steering (`steer`) and the
 * koi pond scene (`pond`). L2 adds agents, oscillators and growth.
 *
 * Lazy: not re-exported from `src/engine/index.ts` (the barrel is first-load code; the same rule as
 * `src/engine/algo` and `src/engine/noise`). Boards import `engine/life` directly. Deterministic: this directory is in
 * the determinism lint (`scripts/lib/detLint.ts` DET_PATHS), so no engine-specific `Math.*` anywhere in it.
 */
export * from './ripple'
export * from './glyphTiles'
export * from './chain'
export * from './body'
export * from './steer'
export * from './pond'
