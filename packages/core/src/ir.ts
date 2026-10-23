/** `@dot480/core/ir`: Field IR v0 — parse → compile to a `Field` (CPU) or emit GLSL (GPU); JSON round-trip. */
export {
  contextEnv, compileJS, deserialize, emitGLSL, IR_FUNCTIONS, IR_LIMITS, IRError, irProgram, parse, serialize, validate,
  type CompileOptions, type IREnv, type IRInfo, type IRNode, type IRProgram,
} from '../../../src/engine/ir'
