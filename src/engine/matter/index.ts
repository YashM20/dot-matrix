/**
 * Physical materials (docs/living-matter/M-materials.md): relief, AO, anisotropic sheen, matcaps, weaves,
 * stitches, stone, glass v2 and caustics. Each is a pure function from rasters + one light to fields or `Layer[]`;
 * geometry is cached, light is per frame. Not re-exported from `src/engine/index.ts` (first load): import
 * `engine/matter` directly.
 */
export * from './relief'
export * from './aniso'
export * from './matcap'
export * from './weave'
export * from './stitch'
export * from './stone'
export * from './surface'
// M2
export * from './glass'
export * from './caustics'
// M3 (the workshop board): `knit`, `wood`, `leather` and the step code `sand`, `mercury`, `thread` are imported by path, never
// through this barrel: the materials board imports it, and its chunk would carry them (measured: +2 kB gz).
