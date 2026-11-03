/**
 * 3D signed distance fields in dots (#69, docs/IQ-PLAN.md IQ8): Inigo Quilez's 3D primitives and operators, the
 * sphere tracer with tetrahedron normals at the dot's footprint, his soft shadows (with Aaltonen's improvement),
 * fog and the outdoors light rig, ported to plain TypeScript (MIT; see THIRD-PARTY-NOTICES.md), plus a renderer
 * that writes one frame into plain buffers for a board to turn into dots.
 *
 * Deterministic (no engine-specific `Math.*`; scanned by the determinism lint). Kept out of the engine barrel:
 * import it by path.
 */
export * from './prims'
export * from './ops'
export * from './march'
export * from './light'
export * from './render'
