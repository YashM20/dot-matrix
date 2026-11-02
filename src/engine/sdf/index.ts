/**
 * The 2D SDF library (#62, docs/IQ-PLAN.md IQ1): Inigo Quilez's 2D distance functions, their analytic gradients,
 * the robust ellipse, C² rounded boxes and the L∞ set, plus the operators (#63, IQ2): smooth minimums, domain
 * repetition and xor, ported to plain TypeScript (MIT; see THIRD-PARTY-NOTICES.md).
 *
 * Primitives take a point (px, py) and their shape parameters and return a signed distance: centred on the origin,
 * y-up, negative inside. `sdfField` turns a bound one into a cell-unit `Field`. Deterministic (no engine-specific
 * `Math.*`; scanned by the determinism lint). Kept out of the engine barrel: import it by path.
 */
export * from './basic'
export * from './polygons'
export * from './arcs'
export * from './curves'
export * from './ellipse'
export * from './corners'
export * from './gradients'
export * from './linf'
export * from './ops'
export * from './smin'
export * from './repeat'
export * from './xor'
export * from './field'
export type { Out2 } from './util'
/** The cell-unit Field helpers that predate this module; same functions, unchanged. */
export { sdfBox, sdfCircle, sdfRing, sdfSubtract, sdfUnion } from '../light/sdf'
