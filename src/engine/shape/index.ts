/**
 * Shaping and easing pack (#64, docs/IQ-PLAN.md IQ3): remapping functions, smoothstep variants and sigmoids,
 * ported from Inigo Quilez's articles (MIT, see THIRD-PARTY-NOTICES.md). Framework-free, no state.
 * Kept out of the engine barrel: import `src/engine/shape` (or one of its files) by path.
 */
export * from './remap'
export * from './smoothstep'
export * from './sigmoid'
