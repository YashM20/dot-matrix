/**
 * Field IR → straight-line code. One emitter, two dialects: GLSL ES 3.0 (the GPU path) and JS (the
 * optional `new Function` backend). Because the JS dialect shares the emitter, the parity tests
 * that run it also cover the GLSL backend's hoisting, naming and loop structure.
 *
 * `let`s become declarations, `for` folds become counted loops with the accumulator hoisted in
 * front, and everything else is a fully parenthesised expression.
 */
import { validate, type FnName, type Input, type Node } from './ast'
import { smallPow } from './runtime'

interface Dialect {
  num(v: number): string
  input(name: Input): string
  data(key: string, index: number): string
  call(fn: FnName, args: string[], helpers: Set<string>): string
  cmp(op: string, a: string, b: string): string
  cond(c: string, a: string, b: string): string
  mod(a: string, b: string): string
  pow(a: string, b: string): string
  one: string
  decl(name: string, e: string): string
  loop(k: string, from: number, to: number): string
  index(k: string): string
}

const glslNum = (v: number) => { let s = String(v); if (!/[.eE]/.test(s)) s += '.0'; return v < 0 ? `(${s})` : s }
const vec2 = (a: string[], i = 0) => `vec2(${a[i]}, ${a[i + 1]})`

const GLSL: Dialect = {
  num: glslNum,
  input: n => ({ u: 'uv.x', v: 'uv.y', t: 't', 'pointer.x': 'pointer.x', 'pointer.y': 'pointer.y', 'pointer.down': 'pointer.z' })[n],
  data: key => `data_${key}`,
  call: (fn, a, helpers) => {
    switch (fn) {
      case 'length': return `length(${vec2(a)})`
      case 'sdCircle': return `(length(${vec2(a)}) - ${a[2]})`
      case 'sdRing': return `(abs(length(${vec2(a)}) - ${a[2]}) - ${a[3]})`
      case 'sdBox': helpers.add('sdBox'); return `ir_sdBox(${vec2(a)}, ${vec2(a, 2)})`
      case 'hash': helpers.add('hash'); return `ir_hash(${a[0]}, ${a[1]})`
      default: return `${fn}(${a.join(', ')})`
    }
  },
  cmp: (op, a, b) => `float(${a} ${op} ${b})`,
  cond: (c, a, b) => `(${c} != 0.0 ? ${a} : ${b})`,
  mod: (a, b) => `mod(${a}, ${b})`,
  pow: (a, b) => `pow(abs(${a}), ${b})`,
  one: '1.0',
  decl: (n, e) => `float ${n} = ${e};`,
  loop: (k, from, to) => `for (int ${k} = ${from}; ${k} < ${to}; ++${k}) {`,
  index: k => `float(${k})`,
}

const JS: Dialect = {
  num: v => (v < 0 ? `(${v})` : String(v)),
  input: n => ({ u: 'u', v: 'v', t: 't', 'pointer.x': 'px', 'pointer.y': 'py', 'pointer.down': 'pd' })[n],
  data: (_, i) => `D[${i}]`,
  call: (fn, a) => `M.${fn}(${a.join(', ')})`,
  cmp: (op, a, b) => `(${a} ${op === '==' ? '===' : op === '!=' ? '!==' : op} ${b} ? 1 : 0)`,
  cond: (c, a, b) => `(${c} !== 0 ? ${a} : ${b})`,
  mod: (a, b) => `M.mod(${a}, ${b})`,
  pow: (a, b) => `M.pow(${a}, ${b})`,
  one: '1',
  decl: (n, e) => `let ${n} = ${e};`,
  loop: (k, from, to) => `for (let ${k} = ${from}; ${k} < ${to}; ${k}++) {`,
  index: k => k,
}

interface Emitted { lines: string[]; result: string; helpers: Set<string>; data: string[] }
const SIMPLE = /^[A-Za-z][A-Za-z0-9_.]*$|^[0-9.e+-]+$/

function emit(ast: Node, d: Dialect): Emitted {
  const { data } = validate(ast)
  const helpers = new Set<string>()
  let id = 0
  const fresh = (prefix: string, name = '') => `${prefix}${++id}${name ? '_' + name : ''}`
  const gen = (n: Node, scope: ReadonlyMap<string, string>, out: string[]): string => {
    switch (n.k) {
      case 'num': return d.num(n.v)
      case 'in': return d.input(n.name)
      case 'data': return d.data(n.key, data.indexOf(n.key))
      case 'ref': return scope.get(n.name)!
      case 'neg': return `(-${gen(n.a, scope, out)})`
      case 'cond': { const c = gen(n.c, scope, out), a = gen(n.a, scope, out); return d.cond(c, a, gen(n.b, scope, out)) }
      case 'call': return d.call(n.fn, n.args.map(a => gen(a, scope, out)), helpers)
      case 'bin': {
        const a = gen(n.a, scope, out)
        if (n.op === '^') {
          const k = smallPow(n.b)
          if (k < 0) return d.pow(a, gen(n.b, scope, out))
          if (k === 0) return d.one
          let x = a
          if (!SIMPLE.test(a)) { x = fresh('tmp'); out.push(d.decl(x, a)) }
          return k === 1 ? x : `(${Array(k).fill(x).join(' * ')})`
        }
        const b = gen(n.b, scope, out)
        if (n.op === '%') return d.mod(a, b)
        if (n.op === '+' || n.op === '-' || n.op === '*' || n.op === '/') return `(${a} ${n.op} ${b})`
        return d.cmp(n.op, a, b)
      }
      case 'let': {
        const name = fresh('l', n.name)
        out.push(d.decl(name, gen(n.value, scope, out)))
        return gen(n.body, new Map(scope).set(n.name, name), out)
      }
      case 'for': {
        const acc = fresh('l', n.acc), k = fresh('k'), i = fresh('l', n.i)
        out.push(d.decl(acc, gen(n.init, scope, out)))
        const inner: string[] = [d.decl(i, d.index(k))]
        const r = gen(n.body, new Map(scope).set(n.i, i).set(n.acc, acc), inner)
        inner.push(`${acc} = ${r};`)
        out.push(d.loop(k, n.from, n.to), ...inner.map(l => '  ' + l), '}')
        return acc
      }
    }
  }
  const lines: string[] = []
  const result = gen(ast, new Map(), lines)
  return { lines, result, helpers, data }
}

const GLSL_HELPERS: Record<string, string> = {
  sdBox: 'float ir_sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }',
  hash: [
    'uint ir_fmix(uint h) { h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; return h ^ (h >> 16u); }',
    'uint ir_fixed(float x) { return (isnan(x) || isinf(x)) ? 0u : uint(int(floor(x * 256.0 + 0.5))); }',
    'float ir_hash(float a, float b) {',
    '  uint h = ir_fmix(ir_fixed(a) + 0x9e3779b9u);',
    '  h = ir_fmix((h ^ ir_fixed(b)) + 0x7f4a7c15u);',
    '  h = ir_fmix(h + 0x165667b1u);',
    '  return float(h >> 8u) * (1.0 / 16777216.0);',
    '}',
  ].join('\n'),
}

/**
 * GLSL ES 3.0 source for a program: helpers it needs, then
 * `float <name>(vec2 uv, float t, vec3 pointer[, float data_<key>…])` returning the raw (unclamped)
 * value. `uv` is the sampler's u/v (v grows downwards), `pointer` = (x, y, down) in u/v; data
 * parameters follow in sorted key order. The host declares `precision highp float;`.
 */
export function emitGLSL(ast: Node, opts: { name?: string } = {}): string {
  const { lines, result, helpers, data } = emit(ast, GLSL)
  const params = ['vec2 uv', 'float t', 'vec3 pointer', ...data.map(k => `float data_${k}`)].join(', ')
  return [
    '// dot field IR v0 (generated)',
    ...[...helpers].sort().map(h => GLSL_HELPERS[h]),
    `float ${opts.name ?? 'field'}(${params}) {`,
    ...lines.map(l => '  ' + l),
    `  return ${result};`,
    '}',
    '',
  ].join('\n')
}

/** JS source of the body of `function (u, v, t, px, py, pd, D, M)`; `D` holds the data values in sorted key order. */
export function emitJS(ast: Node): { body: string; data: string[] } {
  const { lines, result, data } = emit(ast, JS)
  return { body: `${lines.join('\n')}\nreturn ${result};`, data }
}
