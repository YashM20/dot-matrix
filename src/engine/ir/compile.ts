/**
 * Field IR → JS `Field`. The default backend is a closure tree (no `eval`, CSP-safe). `mode:
 * 'function'` emits straight-line JS and builds it with `new Function` for speed; if the page's
 * CSP forbids that, it falls back to the closure tree.
 */
import type { Field } from '../types'
import { validate, type IRInfo, type Node } from './ast'
import { emitJS } from './emit'
import { irMath, smallPow } from './runtime'

/** Per-frame inputs. `pointer` is in the field's u/v; absent = (-1, -1), up. Missing data keys read 0. */
export interface IREnv { t?: number; data?: Readonly<Record<string, number>>; pointer?: { x: number; y: number; down?: boolean | number } }
export interface IRProgram {
  /** A Field for one frame's inputs; values are clamped to [0, 1] (NaN → 0) unless compiled `raw`. */
  (env?: IREnv): Field
  info: IRInfo
  mode: 'closure' | 'function'
}
export interface CompileOptions { mode?: 'closure' | 'function'; raw?: boolean }

type K = (s: Float64Array) => number
const U = 0, V = 1, T = 2, PX = 3, PY = 4, PD = 5, INPUTS = 6
const SLOT = { u: U, v: V, t: T, 'pointer.x': PX, 'pointer.y': PY, 'pointer.down': PD } as const

function closures(ast: Node, data: string[]): { k: K; slots: number } {
  let slots = INPUTS + data.length
  const M = irMath
  const c = (n: Node, scope: ReadonlyMap<string, number>): K => {
    switch (n.k) {
      case 'num': { const x = n.v; return () => x }
      case 'in': { const i = SLOT[n.name]; return s => s[i] }
      case 'data': { const i = INPUTS + data.indexOf(n.key); return s => s[i] }
      case 'ref': { const i = scope.get(n.name)!; return s => s[i] }
      case 'neg': { const a = c(n.a, scope); return s => -a(s) }
      case 'cond': { const q = c(n.c, scope), a = c(n.a, scope), b = c(n.b, scope); return s => (q(s) !== 0 ? a(s) : b(s)) }
      case 'call': {
        const f = M[n.fn], [a, b, d, e] = n.args.map(x => c(x, scope))
        switch (n.args.length) {
          case 1: return s => f(a(s))
          case 2: return s => f(a(s), b(s))
          case 3: return s => f(a(s), b(s), d(s))
          default: return s => f(a(s), b(s), d(s), e(s))
        }
      }
      case 'bin': {
        const a = c(n.a, scope)
        if (n.op === '^') {
          const k = smallPow(n.b)
          if (k < 0) { const b = c(n.b, scope); return s => M.pow(a(s), b(s)) }
          return s => { const x = a(s); let r = k ? x : 1; for (let j = 1; j < k; j++) r *= x; return r }
        }
        const b = c(n.b, scope)
        switch (n.op) {
          case '+': return s => a(s) + b(s)
          case '-': return s => a(s) - b(s)
          case '*': return s => a(s) * b(s)
          case '/': return s => a(s) / b(s)
          case '%': return s => M.mod(a(s), b(s))
          case '<': return s => (a(s) < b(s) ? 1 : 0)
          case '<=': return s => (a(s) <= b(s) ? 1 : 0)
          case '>': return s => (a(s) > b(s) ? 1 : 0)
          case '>=': return s => (a(s) >= b(s) ? 1 : 0)
          case '==': return s => (a(s) === b(s) ? 1 : 0)
          default: return s => (a(s) !== b(s) ? 1 : 0)
        }
      }
      case 'let': {
        const i = slots++, value = c(n.value, scope), body = c(n.body, new Map(scope).set(n.name, i))
        return s => { s[i] = value(s); return body(s) }
      }
      case 'for': {
        const acc = slots++, idx = slots++, { from, to } = n
        const init = c(n.init, scope), body = c(n.body, new Map(scope).set(n.i, idx).set(n.acc, acc))
        return s => { s[acc] = init(s); for (let j = from; j < to; j++) { s[idx] = j; s[acc] = body(s) } return s[acc] }
      }
    }
  }
  const k = c(ast, new Map())
  return { k, slots }
}

const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0)
const own = (o: object | undefined, key: string) => o !== undefined && Object.prototype.hasOwnProperty.call(o, key)
function inputs(env: IREnv, data: string[], into: Float64Array) {
  const p = env.pointer
  into[T] = env.t ?? 0
  into[PX] = p ? p.x : -1
  into[PY] = p ? p.y : -1
  into[PD] = p?.down ? 1 : 0
  data.forEach((key, i) => { const x = own(env.data, key) ? env.data![key] : 0; into[INPUTS + i] = typeof x === 'number' ? x : 0 })
}

type Fn = (u: number, v: number, t: number, px: number, py: number, pd: number, D: Float64Array, M: typeof irMath) => number
function tryFunction(ast: Node): { fn: Fn; data: string[] } | null {
  const { body, data } = emitJS(ast)
  try { return { fn: new Function('u', 'v', 't', 'px', 'py', 'pd', 'D', 'M', `"use strict";\n${body}`) as Fn, data } } catch { return null }
}

/** Compile a validated AST to a JS program; call it with the frame's inputs to get a `Field`. */
export function compileJS(ast: Node, opts: CompileOptions = {}): IRProgram {
  const info = validate(ast), out = opts.raw ? (x: number) => x : clamp01
  const gen = opts.mode === 'function' ? tryFunction(ast) : null
  let program: (env?: IREnv) => Field
  if (gen) {
    const { fn, data } = gen
    program = (env = {}) => {
      const s = new Float64Array(INPUTS + data.length)
      inputs(env, data, s)
      const D = s.subarray(INPUTS), t = s[T], px = s[PX], py = s[PY], pd = s[PD]
      return (u, v) => out(fn(u, v, t, px, py, pd, D, irMath))
    }
  } else {
    const { k, slots } = closures(ast, info.data)
    program = (env = {}) => {
      const s = new Float64Array(slots)
      inputs(env, info.data, s)
      return (u, v) => { s[U] = u; s[V] = v; return out(k(s)) }
    }
  }
  return Object.assign(program, { info, mode: gen ? 'function' as const : 'closure' as const })
}
