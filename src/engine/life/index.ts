/**
 * Living scenes (docs/living-matter/L-pond.md, docs/LIFE.md): wave-equation water (`ripple`), dot micro-glyph tiles
 * (`glyphTiles`), creature spines (`chain`), fish bodies and markings (`body`), Reynolds steering and boids (`steer`)
 * and the koi pond scene (`pond`); L2's ecosystems: physarum and ants (`agents`), coupled oscillators
 * (`oscillators`), space colonisation and L-systems (`grow`), the seam blend and press tracker (`loop`), and the
 * jelly, slime, firefly, murmuration and terrarium scenes.
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
export * from './loop'
export * from './agents'
export * from './oscillators'
export * from './grow'
export * from './jelly'
export * from './slime'
export * from './fireflies'
export * from './murmur'
export * from './terrarium'
