/**
 * Card spec v1 (MASTER-PLAN P6): JSON cards — `validateSpec`, `specToPreset`, `presetToSpec`, `migrateSpec`.
 * Lives above `src/widgets` (it builds `WidgetPreset`s with `layoutFor`), so not under `src/engine`,
 * which must not depend on the widget layer; it is framework-free all the same (no React, no deps).
 */
import { migrateSpec } from './migrate'
import { SpecError, type CardSpec, type SpecIssue } from './types'
import { validateSpec } from './validate'

export * from './types'
export { validateSpec, type SpecResult } from './validate'
export { specToPreset, buildLayer, layerGrid, formatNumber, specLayerOf, type BuildOptions, type SpecPreset } from './build'
export { presetToSpec, exportPreset, bakeLayer, type ExportOptions, type ExportReport } from './export'
export { migrateSpec, specVersion } from './migrate'
export { GENERATOR_PARAMS } from './generators'

/** Parse (if a string), migrate and validate a spec document. */
export function loadSpec(input: unknown): { ok: true; spec: CardSpec; errors: [] } | { ok: false; errors: SpecIssue[] } {
  let json = input
  if (typeof input === 'string') { try { json = JSON.parse(input) } catch { return { ok: false, errors: [{ path: '$', message: 'not JSON' }] } } }
  let spec: CardSpec
  try { spec = migrateSpec(json) } catch (e) { return { ok: false, errors: e instanceof SpecError ? e.errors : [{ path: '$', message: String(e) }] } }
  const v = validateSpec(spec)
  return v.ok ? { ok: true, spec, errors: [] } : { ok: false, errors: v.errors }
}
