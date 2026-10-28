/**
 * Field IR noise pack: `noise(x, y, seed)`, `fbm(x, y, oct, seed)`, `turb(x, y, oct, seed)` and
 * `voronoi(x, y, seed, mode)` as IR builtins. A side-effect import (`import '…/engine/noise/ir'`, idempotent)
 * registers, into the IR core's existing tables (the zero-byte hook of F0-foundation §4: the core gains no registry
 * code, only emit.ts's one-line GLSL branch):
 *  - the name and arity (`IR_FUNCTIONS`, so the parser and validator accept the call),
 *  - the JS implementation (`irMath`, used by both JS backends),
 *  - the oracle (`IR_REF`, the reference interpreter: the plain library function),
 *  - the GLSL prelude (`GLSL_HELPERS.noise`, emitted once per program that calls any of them) and a key per builtin.
 * The IR core sits in first load; this pack does not, so only lazy chunks that compile user or spec IR import it.
 * Pack names are not reserved words (`IR_RESERVED` snapshots the core names before this runs):
 * `let noise = 3; noise + noise(u, v, 1)` parses. Device bytecode rejects them.
 *
 * | builtin | arity | meaning |
 * | `noise(x, y, seed)` | 3 | `noise2` |
 * | `fbm(x, y, oct, seed)` | 4 | `fbm2`; `oct` floored and clamped to 1..8 (GLSL loops to a constant 8 with an early break) |
 * | `turb(x, y, oct, seed)` | 4 | `turb2` |
 * | `voronoi(x, y, seed, mode)` | 4 | `voronoiMode`: mode = metric·4 + out; metric 0 l2, 1 l1, 2 linf; out 0 f1, 1 f2, 2 f2−f1, 3 id/2³² |
 */
import { IR_FUNCTIONS, type PackFn } from '../ir/ast'
import { GLSL_HELPERS } from '../ir/emit'
import { IR_REF } from '../ir/reference'
import { irMath } from '../ir/runtime'
import { fbm2, noise2, turb2 } from './gradient'
import { NOISE_GLSL } from './glsl'
import { voronoiMode } from './voronoi'

const PACK: Record<PackFn, [number, (...a: number[]) => number]> = {
  noise: [3, (x, y, s) => noise2(x, y, s)],
  fbm: [4, (x, y, o, s) => fbm2(x, y, o, s)],
  turb: [4, (x, y, o, s) => turb2(x, y, o, s)],
  voronoi: [4, (x, y, s, m) => voronoiMode(x, y, s, m)],
}
for (const [name, [n, f]] of Object.entries(PACK) as [PackFn, [number, (...a: number[]) => number]][]) {
  ;(IR_FUNCTIONS as Record<string, number>)[name] = n
  irMath[name] = f
  IR_REF[name] = f
  GLSL_HELPERS[name] = name === 'noise' ? NOISE_GLSL : ''
}

/** The pack's builtin names (also a handle for consumers that only need the import's side effect). */
export const IR_NOISE_BUILTINS = Object.keys(PACK) as PackFn[]
