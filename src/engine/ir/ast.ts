/**
 * Field IR (`dot`) v0 — AST, limits, the builtin table and the validator.
 * A program is one pure scalar expression of (u, v, t, pointer, data) with `let` bindings and
 * bounded `for` folds. No closures, no host access: every identifier is resolved against the
 * tables below, so a program can only compute numbers. Grammar: `docs/DOT-MATRIX-ENGINE-PLAN.md` › Field IR.
 */

/** Hard limits — a program over any of them is rejected with an `IRError`. */
export const IR_LIMITS = {
  /** Source characters. */
  source: 4096,
  /** AST nodes. */
  nodes: 2000,
  /** Expression nesting (keeps the recursive parser and evaluators off the stack limit). */
  depth: 96,
  /** Iterations of one `for` (its `to - from`). */
  loop: 64,
  /** Product of the iteration counts of nested `for`s: the worst-case body evaluations per dot. */
  work: 1024,
} as const

export type BinOp = '+' | '-' | '*' | '/' | '%' | '^' | '<' | '<=' | '>' | '>=' | '==' | '!='
export type Input = 'u' | 'v' | 't' | 'pointer.x' | 'pointer.y' | 'pointer.down'

/** Builtin functions and their arity. Every one maps to a GLSL ES 3.0 builtin or a tiny helper. */
export const IR_FUNCTIONS = {
  sin: 1, cos: 1, abs: 1, floor: 1, fract: 1, sqrt: 1, exp: 1, sign: 1,
  min: 2, max: 2, step: 2, atan: 2, length: 2, hash: 2,
  clamp: 3, mix: 3, smoothstep: 3, sdCircle: 3,
  sdBox: 4, sdRing: 4,
} as const
export type CoreFn = keyof typeof IR_FUNCTIONS
/**
 * Builtins of the lazy noise pack (`src/engine/noise/ir.ts`, type only). The pack adds them to `IR_FUNCTIONS` (and
 * `irMath`, `GLSL_HELPERS`, `IR_REF`) on import, so the IR core in first load needs no registry code; until then a
 * call is an unknown function. They are not reserved words: `IR_RESERVED` snapshots the core names at load.
 */
export type PackFn = 'noise' | 'fbm' | 'turb' | 'voronoi'
export type FnName = CoreFn | PackFn
/** A callable builtin: a core one, or a pack one once its pack is imported. */
export const isFn = (name: string): name is FnName => Object.prototype.hasOwnProperty.call(IR_FUNCTIONS, name)

/** Named constants, folded to numbers by the parser. */
export const IR_CONSTANTS: Record<string, number> = { PI: Math.PI, TAU: Math.PI * 2 }
/** Words a binding may not use: keywords, inputs, constants and the core builtins (snapshot at load, so pack builtins stay bindable). */
export const IR_RESERVED = new Set(['let', 'for', 'in', 'with', 'u', 'v', 't', 'pointer', 'data', ...Object.keys(IR_CONSTANTS), ...Object.keys(IR_FUNCTIONS)])

export type Node =
  | { k: 'num'; v: number }
  | { k: 'in'; name: Input }
  | { k: 'data'; key: string }
  | { k: 'ref'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: BinOp; a: Node; b: Node }
  /** `c ? a : b` — `c` is true when non-zero. */
  | { k: 'cond'; c: Node; a: Node; b: Node }
  | { k: 'call'; fn: FnName; args: Node[] }
  /** `let name = value; body` */
  | { k: 'let'; name: string; value: Node; body: Node }
  /** `for i in from..to with acc = init { body }` — acc = init, then acc = body for i = from … to-1; the value is acc. */
  | { k: 'for'; i: string; from: number; to: number; acc: string; init: Node; body: Node }

/** A parse or validation error. `pos` is a source offset (parse) or -1 (AST validation, see `path`). */
export class IRError extends Error {
  readonly pos: number; readonly line: number; readonly col: number; readonly path: string
  constructor(message: string, pos = -1, line = 0, col = 0, path = '') {
    super(pos >= 0 ? `${message} at ${line}:${col}` : path ? `${message} at ${path}` : message)
    this.name = 'IRError'; this.pos = pos; this.line = line; this.col = col; this.path = path
  }
}

/** Binding and data-key names: ASCII identifiers, no leading `_` and no `__` (both reserved in GLSL). */
export const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/
export const validName = (s: string) => IDENT.test(s) && !s.includes('__') && !s.startsWith('gl_')

const BIN_OPS = new Set<string>(['+', '-', '*', '/', '%', '^', '<', '<=', '>', '>=', '==', '!='])
const INPUTS = new Set<string>(['u', 'v', 't', 'pointer.x', 'pointer.y', 'pointer.down'])

export interface IRInfo { nodes: number; depth: number; work: number; data: string[]; pointer: boolean; t: boolean }

/**
 * Check an AST against the grammar and limits (shape, finite numbers, names, scoping, arity,
 * loop bounds, size). Used on deserialized JSON and by every backend; throws `IRError` with a
 * JSON path. Returns what the program reads.
 */
export function validate(ast: unknown): IRInfo {
  let nodes = 0, maxDepth = 0, maxWork = 1, pointer = false, usesT = false
  const data = new Set<string>()
  const fail = (msg: string, path: string): never => { throw new IRError(msg, -1, 0, 0, path || '$') }
  const walk = (n: unknown, scope: ReadonlySet<string>, path: string, depth: number, work: number): void => {
    if (++nodes > IR_LIMITS.nodes) fail(`program has more than ${IR_LIMITS.nodes} nodes`, path)
    if (depth > IR_LIMITS.depth) fail(`nesting deeper than ${IR_LIMITS.depth}`, path)
    if (depth > maxDepth) maxDepth = depth
    if (typeof n !== 'object' || n === null || Array.isArray(n)) return fail('expected a node object', path)
    const o = n as Record<string, unknown>, d = depth + 1
    const name = (key: string) => { const s = o[key]; if (typeof s !== 'string' || !validName(s) || IR_RESERVED.has(s)) fail(`invalid name ${JSON.stringify(s)}`, `${path}.${key}`); return s as string }
    switch (o.k) {
      case 'num': if (typeof o.v !== 'number' || !Number.isFinite(o.v)) fail('number must be finite', `${path}.v`); return
      case 'in': if (typeof o.name !== 'string' || !INPUTS.has(o.name)) fail(`unknown input ${JSON.stringify(o.name)}`, `${path}.name`); if (o.name === 't') usesT = true; else if (o.name !== 'u' && o.name !== 'v') pointer = true; return
      case 'data': { const key = o.key; if (typeof key !== 'string' || !validName(key)) fail(`invalid data key ${JSON.stringify(key)}`, `${path}.key`); data.add(key as string); return }
      case 'ref': { const s = name('name'); if (!scope.has(s)) fail(`unknown identifier "${s}"`, `${path}.name`); return }
      case 'neg': return walk(o.a, scope, `${path}.a`, d, work)
      case 'bin': if (typeof o.op !== 'string' || !BIN_OPS.has(o.op)) fail(`unknown operator ${JSON.stringify(o.op)}`, `${path}.op`); walk(o.a, scope, `${path}.a`, d, work); return walk(o.b, scope, `${path}.b`, d, work)
      case 'cond': walk(o.c, scope, `${path}.c`, d, work); walk(o.a, scope, `${path}.a`, d, work); return walk(o.b, scope, `${path}.b`, d, work)
      case 'call': {
        const fn = o.fn, args = o.args
        if (typeof fn !== 'string' || !isFn(fn)) return fail(`unknown function ${JSON.stringify(fn)}`, `${path}.fn`)
        if (!Array.isArray(args) || args.length !== (IR_FUNCTIONS as Record<string, number>)[fn]) return fail(`${fn}() takes ${(IR_FUNCTIONS as Record<string, number>)[fn]} argument(s)`, `${path}.args`)
        args.forEach((a, i) => walk(a, scope, `${path}.args[${i}]`, d, work)); return
      }
      case 'let': { const s = name('name'); walk(o.value, scope, `${path}.value`, d, work); return walk(o.body, new Set(scope).add(s), `${path}.body`, d, work) }
      case 'for': {
        const i = name('i'), acc = name('acc'), from = o.from, to = o.to
        if (i === acc) fail('loop index and accumulator need different names', `${path}.acc`)
        if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 0 || (to as number) <= (from as number)) fail('loop range must be integer literals 0 ≤ from < to', `${path}.from`)
        const count = (to as number) - (from as number)
        if (count > IR_LIMITS.loop) fail(`loop runs ${count} times, more than ${IR_LIMITS.loop}`, `${path}.to`)
        const w = work * count
        if (w > IR_LIMITS.work) fail(`nested loops run ${w} times per dot, more than ${IR_LIMITS.work}`, `${path}.to`)
        if (w > maxWork) maxWork = w
        walk(o.init, scope, `${path}.init`, d, work)
        return walk(o.body, new Set(scope).add(i).add(acc), `${path}.body`, d, w)
      }
      default: return fail(`unknown node kind ${JSON.stringify(o.k)}`, `${path}.k`)
    }
  }
  walk(ast, new Set(), '$', 0, 1)
  return { nodes, depth: maxDepth, work: maxWork, data: [...data].sort(), pointer, t: usesT }
}

/** JSON envelope of a program: `{ "dot": 1, "ast": … }`. */
export const serialize = (ast: Node): string => JSON.stringify({ dot: 1, ast })
/** Parse and validate a serialized program; never evaluates anything. */
export function deserialize(json: string): Node {
  if (typeof json !== 'string' || json.length > IR_LIMITS.nodes * 64) throw new IRError('serialized program too large')
  let doc: unknown
  try { doc = JSON.parse(json) } catch { throw new IRError('serialized program is not JSON') }
  const env = doc as { dot?: unknown; ast?: unknown } | null
  if (!env || typeof env !== 'object' || env.dot !== 1) throw new IRError('not a dot v1 program')
  validate(env.ast)
  return env.ast as Node
}
