/**
 * Field IR (`dot`) v0: a tiny, pure, size-bounded expression language for fields.
 *   parse(src) → AST → compileJS(ast)(env) → Field     (CPU; closure tree, CSP-safe)
 *                    → emitGLSL(ast)                    (GPU; GLSL ES 3.0 function)
 *                    → serialize(ast) / deserialize()   (JSON, validated, no eval)
 *                    → compileBytecode(ast)             (f32 stack VM bytecode for devices; runBytecode / targets/esp32/dotvm.c)
 * Grammar and semantics: docs/DOT-MATRIX-ENGINE-PLAN.md › Field IR.
 */
import type { FrameContext } from '../context'
import type { GridConfig } from '../types'
import { compileJS, type CompileOptions, type IREnv, type IRProgram } from './compile'
import { parse } from './parse'

export { IR_FUNCTIONS, IR_LIMITS, IRError, deserialize, serialize, validate, type IRInfo, type Node as IRNode } from './ast'
export { parse } from './parse'
export { compileJS, type CompileOptions, type IREnv, type IRProgram } from './compile'
export { emitGLSL, emitJS } from './emit'
export { reference, referenceField } from './reference'
export { BC_MAX_STEPS, BC_STACK, BC_VERSION, OP as BC_OP, bytecodeInfo, compileBytecode, loadBytecode, runBytecode, verifyBytecode, type BytecodeInfo, type BytecodeProgram } from './bytecode'

const cache = new Map<string, IRProgram>()
/** Parse + compile IR source once (memoised by source and mode). Throws `IRError` on bad source. */
export function irProgram(src: string, opts: CompileOptions = {}): IRProgram {
  const key = `${opts.mode ?? 'closure'}${opts.raw ? '+raw' : ''}\n${src}`
  let p = cache.get(key)
  if (!p) {
    // tag each frame's field with its source so a card spec can carry it as an `ir` layer (src/spec)
    const run = compileJS(parse(src), opts), from = opts.raw ? { ir: src, raw: true } : { ir: src }
    cache.set(key, (p = Object.assign((env?: IREnv) => { const f = run(env); f.from = from; return f }, { info: run.info, mode: run.mode })))
  }
  return p
}

/**
 * IR inputs from a frame context: `t`, `data`, and the primary pointer mapped from card cells to
 * the u/v of `rect` = [col, row, w, h] on `grid` (default: the whole grid).
 */
export function contextEnv(ctx: FrameContext, grid: GridConfig, rect: [number, number, number, number] = [0, 0, grid.cols, grid.rows]): IREnv {
  const p = ctx.pointers?.find(q => !q.up), [col, row, w, h] = rect
  return { t: ctx.t, data: ctx.data, pointer: p && { x: (p.x - col) / w, y: (p.y - row) / h, down: p.down } }
}
