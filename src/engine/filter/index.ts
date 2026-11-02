/**
 * Filtered fields for coarse dot grids (IQ4, #65, docs/IQ-PLAN.md): Inigo Quilez's filterable procedurals, box and
 * triangle-filtered checkers, band-limited cosines and fBm, and per-dot supersampling as the generic fallback, ported
 * to plain TypeScript (MIT; see THIRD-PARTY-NOTICES.md). A pattern sampled once per dot aliases on a coarse lattice:
 * stripes, checkers and fine noise shimmer or turn to moiré as they move. These take the dot's footprint (one cell)
 * and return the pattern's mean over it instead. The sampler passes the footprint to fields that opt in
 * (`Field.footprint`; `withFootprint`, `patternField`); every other field is sampled as before.
 *
 * Deterministic (scanned by the determinism lint). Kept out of the engine barrel: import it by path.
 */
export * from './procedural'
export * from './checkers'
export * from './bandlimit'
export * from './supersample'
export * from './field'
