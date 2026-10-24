/**
 * DOTS tab helpers without React (verify imports these): compile a source once, and turn a program
 * plus its frame inputs into the card's layers — one Field IR layer on the chosen lattice, through
 * the normal Field → Grid Sampler → Renderer pipeline.
 */
import { IRError, irProgram, type IREnv, type IRProgram } from '../../engine/ir'
import type { Layer } from '../../engine/types'
import { SHARE_GRIDS, type SharedProgram } from '../../lib/share'
import { tileStyle } from '../../widgets/types'

export const DOTS_STYLE = tileStyle
/** A `data.<key>` slider starts here (a missing key would read 0, which hides most `data`-driven programs). */
export const DATA_DEFAULT = .5

export type Compiled = { program: IRProgram; error?: undefined } | { program?: undefined; error: IRError }
/** Parse + compile (memoised in `irProgram`). Shared links go through here too: a bad program is an error, never run. */
export function compileSource(src: string): Compiled {
  try { return { program: irProgram(src, { mode: 'function' }) } }
  catch (e) { return { error: e instanceof IRError ? e : new IRError(String((e as Error)?.message ?? e)) } }
}

export const gridOf = (p: Pick<SharedProgram, 'grid'>) => SHARE_GRIDS[p.grid]

export function programLayers(program: IRProgram, env: IREnv, p: Pick<SharedProgram, 'lattice' | 'tone'>): Layer[] {
  return [{ field: program(env), tone: p.tone, ...(p.lattice > 1 && { lattice: p.lattice }) }]
}

/** Every referenced `data.<key>` at its slider value (default `DATA_DEFAULT`). */
export function dataFor(keys: readonly string[], values: Readonly<Record<string, number>>): Record<string, number> {
  const d: Record<string, number> = {}
  for (const k of keys) d[k] = Object.prototype.hasOwnProperty.call(values, k) ? values[k] : DATA_DEFAULT
  return d
}

/** A program's display name: the first word of its leading `// name: …` comment, else "untitled". */
export function programName(src: string): string {
  const m = /^\s*\/\/\s*([A-Za-z0-9][\w -]{0,23})/.exec(src)
  return (m?.[1].split(/[:—-]/)[0].trim() || 'untitled').toLowerCase()
}
