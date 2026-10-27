/**
 * `gpuIR`: a Field IR program as a GPU pass. Kept apart from `passes.ts` so the Field IR core (parser,
 * compiler, GLSL emitter) is not a static import of the renderer: only the boards that build IR
 * programs pull it in, and it stays out of first load (docs/living-matter/F0-foundation.md, F0.11).
 */
import type { IREnv, IRProgram } from '../../ir'
import { emitGLSL, parse, irProgram } from '../../ir'
import type { CellBounds } from '../../types'
import type { GPUField } from './passes'

const glslCache = new Map<string, { glsl: string; data: string[] }>()
/**
 * A Field IR program as a GPU pass: on WebGL2 the value is computed per dot on the GPU at `density`×
 * the layer's lattice; everywhere else it is the CPU program's Field (`irProgram(src)(env)`).
 */
export function gpuIR(src: string, env: IREnv = {}, opts: { density?: number; program?: IRProgram; bounds?: CellBounds } = {}): GPUField {
  const program = opts.program ?? irProgram(src, { mode: 'function' })
  let g = glslCache.get(src)
  if (!g) glslCache.set(src, (g = { glsl: emitGLSL(parse(src)), data: program.info.data }))
  const f: GPUField = program(env)
  if (opts.bounds) f.bounds = opts.bounds
  f.gpu = { density: opts.density ?? 1, ir: { ...g, env } }
  return f
}
