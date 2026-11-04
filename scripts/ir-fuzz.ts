/**
 * Field IR front-end fuzz (#158). A seeded PRNG writes random programs from the grammar, mutates them (characters,
 * tokens, splices, cuts, deep nesting), mutates their JSON ASTs (wrong kinds, `__proto__` / `constructor` /
 * `toString` as names, builtins and data keys, huge or non-finite numbers, deep nesting, missing fields, sparse or
 * fake argument lists, loop bounds near 2^53, cycles) and mutates the JSON text (`__proto__` keys, `1e999`, cuts).
 * Every case goes through parse, validate (and with it the cost model), emitJS, emitGLSL, both JS backends and device
 * bytecode. The checks:
 *  - nothing throws anything but `IRError`, and no case runs away;
 *  - every accepted program reads a finite value in [0, 1] at 6 sample points, the same on the closure tree and
 *    `new Function`, and its emitted body passes the token allowlist (so registered cards keep `new Function`);
 *  - the cases it found stay fixed (see `FOUND`).
 * Same seed, same cases: a failure reproduces. The sandbox checks (allowlist, closures only) are `scripts/ir-sandbox.ts`.
 *
 *   npx tsx scripts/ir-fuzz.ts      # fuzz + sandbox checks; `pnpm verify` runs both through `irFuzzChecks()` / `irSandboxChecks()`
 */
import { pathToFileURL } from 'node:url'
import { IR_FUNCTIONS, IRError, compileBytecode, compileJS, deserialize, emitGLSL, emitJS, parse, validate, verifyBytecode, type IREnv, type IRNode } from '../src/engine/ir'
import { allowedBody } from '../src/engine/ir/allow'
import '../src/engine/noise/ir'
import { EXAMPLES } from '../src/components/dwitter/examples'
import type { Assert } from './lib/check'

type Rand = { (): number; int(n: number): number; pick<T>(a: readonly T[]): T }
/** mulberry32: small, seeded, the same sequence on every machine. */
export function rng(seed: number): Rand {
  let s = seed >>> 0
  const r = (() => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = Math.imul(s ^ (s >>> 15), s | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }) as Rand
  r.int = n => Math.floor(r() * n)
  r.pick = a => a[r.int(a.length)]
  return r
}

const SEED = 158, RANDOM = 1500, SOURCE_MUTANTS = 1500, AST_MUTANTS = 1500, TEXT_MUTANTS = 400
const NAMES = ['a', 'b', 'x', 'y', 'acc', 'i', 'j', 'l1_x', 'k1', 'tmp1', 'M', 'D', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'eval', 'Function', 'window', 'noise']
const DATA_KEYS = ['value', 'k', 'x', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'length']
const ENVS: IREnv[] = [{ t: 0 }, { t: 7.3, data: { value: .6, k: -2, x: 1e6, constructor: 3, toString: 2 }, pointer: { x: .3, y: .7, down: true } }]
const POINTS: [number, number][] = [[0, 0], [.25, .75], [1, 1]]

// ── random programs from the grammar ──
function num(r: Rand): string {
  switch (r.int(6)) {
    case 0: return String(r.int(10))
    case 1: return (r() * 10).toFixed(r.int(4))
    case 2: return `.${r.int(1000)}`
    case 3: return `${r.int(9) + 1}e${r.int(2) ? '-' : ''}${r.int(30)}`
    case 4: return r.pick(['1e308', '1.7976931348623157e308', '5e-324', '0.0000001', '123456789012345678901234567890', '0'])
    default: return String(Math.round(r() * 100) / 100)
  }
}
function expr(r: Rand, depth: number, scope: string[], loops: number): string {
  if (depth <= 0 || r() < .25) {
    switch (r.int(scope.length ? 5 : 4)) {
      case 0: return num(r)
      case 1: return r.pick(['u', 'v', 't', 'PI', 'TAU'])
      case 2: return r() < .5 ? `pointer.${r.pick(['x', 'y', 'down'])}` : `data.${r.pick(DATA_KEYS)}`
      case 3: return num(r)
      default: return r.pick(scope)
    }
  }
  const e = () => expr(r, depth - 1, scope, loops)
  switch (r.int(9)) {
    case 0: return `-${e()}`
    case 1: return `(${e()} ${r.pick(['+', '-', '*', '/', '%'])} ${e()})`
    case 2: return `(${e()} ^ ${r() < .5 ? r.int(10) : e()})`
    case 3: return `(${e()} ${r.pick(['<', '<=', '>', '>=', '==', '!='])} ${e()})`
    case 4: return `(${e()} ? ${e()} : ${e()})`
    case 5: case 6: { const [fn, n] = r.pick(Object.entries(IR_FUNCTIONS)); return `${fn}(${Array.from({ length: n }, () => e()).join(', ')})` }
    case 7: { const name = r.pick(NAMES); return `(let ${name} = ${e()}; ${expr(r, depth - 1, [...scope, name], loops)})` }
    default: {
      if (loops >= 2) return e()
      const i = r.pick(NAMES), acc = r.pick(NAMES), from = r.int(4), to = from + 1 + r.int(loops ? 6 : 12)
      return `for ${i} in ${from}..${to} with ${acc} = ${e()} { ${expr(r, depth - 1, [...scope, i, acc], loops + 1)} }`
    }
  }
}

// ── source mutations ──
const CHARS = [...'abcuvtxyz0123456789.eE_+-*/%^<>=!?:;,(){}[]"\'`\\$@#~ \n\t', ' ', 'é', '\u0000', '𝑥']
const TOKENS = ['__proto__', 'constructor', 'toString', 'prototype', 'data.__proto__', 'data.constructor', 'data.toString', 'pointer.constructor', 'pointer.__proto__',
  'M.sin', 'D[0]', 'this', 'globalThis', 'eval(u)', 'new Function', 'Function("x")', 'for', 'let', 'in', 'with', '..', '1e308', '1e999', '-1e999', '9007199254740993',
  '0x10', '1e', '1.2.3', '//', '"', '`${u}`', 'sin(', 'gl_x', 'a__b', '_a', 'fbm(u, v, 1e9, 1)', 'for i in 0..64 with s = 0 {', '}', 'mod(u, v)', 'pow(u, 2)',
  'for i in 9007199254740992..9007199254740994 with s = 0 { s + 1 }', 'for i in 65530..65540 with s = 0 { s }', 'for i in 4294967295..4294967297 with s = 0 { s }']
function mutateSrc(r: Rand, src: string): string {
  let s = src
  for (let n = 1 + r.int(3); n > 0; n--) {
    const at = r.int(s.length + 1), len = r.int(Math.min(12, s.length - at) + 1), k = 1 + r.int(150)
    switch (r.int(7)) {
      case 0: s = s.slice(0, at) + s.slice(at + len); break
      case 1: s = s.slice(0, at) + r.pick(CHARS) + s.slice(at); break
      case 2: s = s.slice(0, at) + r.pick(TOKENS) + s.slice(at); break
      case 3: s = s.slice(0, at) + s.slice(at, at + len) + s.slice(at); break
      case 4: s = s.slice(0, at); break
      case 5: s = r.pick([() => '('.repeat(k) + s + ')'.repeat(k), () => '-'.repeat(k) + s, () => 'u^'.repeat(k) + s, () => 'u+'.repeat(k * 10) + s, () => 'let a = 1; '.repeat(k) + s])(); break
      default: s = s.slice(0, at) + r.pick(CHARS) + s.slice(at + 1)
    }
  }
  return s
}

// ── JSON AST mutations ──
type Obj = Record<string, unknown>
const WEIRD: unknown[] = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'prototype', 'gl_x', 'a__b', '_a', '', ' ', 'u', 'pointer.x', 'pointer.constructor',
  'mod', 'pow', 'sin', 'noise', 'let', 'num', 'call', 1e308, -1e308, Infinity, -Infinity, NaN, 2 ** 53, 2 ** 53 + 2, 65535, 65536, -1, 1.5, -0, 5e-324, '0', '1', true, false,
  null, [], {}, [1], { k: 'num', v: 1 }, BigInt(10), 'x'.repeat(5000)]
const KINDS = ['num', 'in', 'data', 'ref', 'neg', 'bin', 'cond', 'call', 'let', 'for', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '', 'NUM']
const FIELDS = ['k', 'v', 'name', 'key', 'op', 'fn', 'args', 'a', 'b', 'c', 'value', 'body', 'i', 'acc', 'from', 'to', 'init']
const FN_NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'mod', 'pow', 'eval', 'call', 'apply', ...Object.keys(IR_FUNCTIONS)]
/** Every node object under `holder.root`, with where it hangs (arrays are walked, not listed). */
function nodesOf(holder: Obj): [Obj, Obj, string][] {
  const out: [Obj, Obj, string][] = [], seen = new Set<unknown>()
  const walk = (o: unknown, parent: Obj, key: string) => {
    if (typeof o !== 'object' || o === null || seen.has(o) || out.length > 4000) return
    seen.add(o)
    if (!Array.isArray(o)) out.push([o as Obj, parent, key])
    for (const k of Object.keys(o)) walk((o as Obj)[k], o as Obj, k)
  }
  walk(holder.root, holder, 'root')
  return out
}
function mutateAst(r: Rand, ast: IRNode): unknown {
  const holder: Obj = { root: structuredClone(ast) }
  for (let n = 1 + r.int(3); n > 0; n--) {
    const list = nodesOf(holder)
    if (!list.length) break
    const [o, parent, key] = r.pick(list)
    switch (r.int(10)) {
      case 0: o.k = r.pick(KINDS); break
      case 1: o[r.pick(FIELDS)] = structuredClone(r.pick(WEIRD)); break
      case 2: { const ks = Object.keys(o); if (ks.length) delete o[r.pick(ks)]; break }
      case 3: parent[key] = r.pick([null, [], 5, 'u', {}, { k: 'num' }, { k: 'call', fn: 'sin' }]); break
      case 4: { let w: unknown = o; for (let d = 40 + r.int(200); d > 0; d--) w = { k: 'neg', a: w }; parent[key] = w; break }
      case 5: {
        if (o.k !== 'call' || !Array.isArray(o.args)) { o.k = 'call'; break }
        const a = o.args as unknown[]
        r.pick([() => { a.pop() }, () => { a.push({ k: 'in', name: 'u' }) }, () => { o.args = new Array(a.length) }, () => { o.args = { length: a.length, 0: a[0] } }, () => { o.args = 'u' }])()
        break
      }
      case 6: {
        if (o.k !== 'for') { o.k = 'for'; break }
        o[r.pick(['from', 'to'])] = r.pick([2 ** 53, 2 ** 53 + 2, 1e300, -1, 1.5, 65535, 65536, 0, '3', null])
        if (r() < .5 && typeof o.from === 'number') o.to = o.from + 2
        break
      }
      case 7: if (o.k === 'data' || r() < .5) { o.k = 'data'; o.key = r.pick([...WEIRD, ...DATA_KEYS]) } else { o.k = 'ref'; o.name = r.pick([...WEIRD, ...NAMES]) } break
      case 8: if (o.k === 'call') o.fn = r.pick(FN_NAMES); else { o.k = 'num'; o.v = r.pick(WEIRD) } break
      default: if (r() < .3) o.a = o; else Object.assign(o, structuredClone(r.pick(list)[0]))
    }
  }
  return holder.root
}
function mutateText(r: Rand, text: string): string {
  const braces = [...text.matchAll(/\{/g)].map(m => m.index!), at = braces.length ? r.pick(braces) + 1 : 0
  switch (r.int(5)) {
    case 0: return text.slice(0, at) + '"__proto__":{"k":"num","v":1},' + text.slice(at)
    case 1: return text.slice(0, at) + '"k":"call","fn":"constructor","args":[],' + text.slice(at)
    case 2: return text.replace(/-?\d+(\.\d+)?(e[+-]?\d+)?/, r.pick(['1e999', '-1e999', '-0', '9007199254740993', '1e-999']))
    case 3: return text.slice(0, r.int(text.length + 1))
    default: { const i = r.int(text.length + 1); return text.slice(0, i) + r.pick(CHARS) + text.slice(i + 1) }
  }
}

// ── one case: through every stage ──
/** `accepted`: programs that reached the backends; `hits`: cases with at least one. */
interface Run { cases: number; hits: number; accepted: number; failures: string[]; values: string[]; allow: string[]; slowest: number; slow: string }
const show = (x: unknown) => { try { return String(JSON.stringify(x)).slice(0, 80) } catch { return typeof x } }
/** Run `f`; an `IRError` is a rejection, anything else a failure. */
function stage<T>(run: Run, where: string, f: () => T): T | undefined {
  try { return f() } catch (e) {
    if (!(e instanceof IRError)) run.failures.push(`${where}: ${(e as Error)?.constructor?.name ?? typeof e} ${String((e as Error)?.message ?? e).slice(0, 80)}`)
    return undefined
  }
}
/** An accepted program: emit, both backends at the sample points, bytecode. Nothing here may throw but bytecode's `IRError`. */
function exercise(run: Run, ast: IRNode, where: string) {
  run.accepted++
  try {
    const js = emitJS(ast)
    if (!allowedBody(js.body, js.data.length)) run.allow.push(`${where}: ${js.body.slice(0, 120)}`)
    emitGLSL(ast)
    const closure = compileJS(ast), fn = compileJS(ast, { mode: 'function' })
    if (fn.mode !== 'function') run.allow.push(`${where}: fell back to the closure tree`)
    for (const env of ENVS) {
      const a = closure(env), b = fn(env)
      for (const [u, v] of POINTS) {
        const x = a(u, v), y = b(u, v)
        if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1 && Math.abs(x - y) <= 1e-9)) { run.values.push(`${where} at (${u}, ${v}) t=${env.t}: closure ${x}, function ${y}`); return }
      }
    }
  } catch (e) { run.failures.push(`${where} (accepted, then threw): ${(e as Error)?.message ?? e}`); return }
  stage(run, `${where} bytecode`, () => verifyBytecode(compileBytecode(ast)))
}
function source(run: Run, src: string, where: string) {
  const ast = stage(run, `${where} parse`, () => parse(src))
  if (ast) exercise(run, ast, `${where} ${show(src.slice(0, 60))}`)
}
/** A mutated AST: as an object (`direct`, what a caller of `validate` could pass) and as JSON, its text mutated at `textRate`. */
function json(run: Run, r: Rand, m: unknown, where: string, direct: boolean, textRate: number) {
  if (direct && stage(run, `${where} validate`, () => validate(m))) exercise(run, m as IRNode, `${where} ${show(m)}`)
  let text: string | undefined
  try { text = JSON.stringify({ dot: 1, ast: m }) } catch { /* cycles and BigInt are not JSON */ }
  if (text === undefined) return
  if (r() < textRate) text = mutateText(r, text)
  const back = stage(run, `${where} deserialize`, () => deserialize(text))
  if (back) exercise(run, back, `${where} json ${text.slice(0, 80)}`)
}

/** Loop bounds near 2^53 hung both JS backends (`k++` stops moving); sparse args and unprintable names threw TypeErrors. */
export const FOUND: [string, () => unknown][] = [
  ['loop bound 2^53 from source', () => parse('for i in 9007199254740992..9007199254740994 with s = 0 { s + 1 }')],
  ['loop bound 2^53 from JSON', () => deserialize(JSON.stringify({ dot: 1, ast: { k: 'for', i: 'i', from: 2 ** 53, to: 2 ** 53 + 2, acc: 's', init: { k: 'num', v: 0 }, body: { k: 'ref', name: 's' } } }))],
  ['sparse args', () => validate({ k: 'call', fn: 'sin', args: new Array(1) })],
  ['a BigInt name', () => validate({ k: 'ref', name: BigInt(10) })],
  ['a cyclic name', () => { const o: Obj = {}; o.o = o; return validate({ k: 'in', name: o }) }],
]

export function irFuzzChecks(assert: Assert) {
  const r = rng(SEED), t0 = performance.now()
  const families: Record<string, Run> = {}
  const family = (name: string, n: number, one: (run: Run, i: number) => void) => {
    const run: Run = families[name] = { cases: 0, hits: 0, accepted: 0, failures: [], values: [], allow: [], slowest: 0, slow: '' }
    for (let i = 0; i < n; i++) {
      const s = performance.now(), before = run.accepted
      run.cases++; one(run, i)
      if (run.accepted > before) run.hits++
      const dt = performance.now() - s
      if (dt > run.slowest) { run.slowest = dt; run.slow = `${name} #${i}` }
    }
  }
  const randomSrc = () => expr(r, 1 + r.int(5), [], 0)
  const seeds = [...EXAMPLES.map(e => e.src), ...Array.from({ length: 40 }, randomSrc)]
  const seedAsts = seeds.flatMap(s => { try { return [parse(s)] } catch { return [] } })
  family('random', RANDOM, (run, i) => source(run, randomSrc(), `random #${i}`))
  family('mutated source', SOURCE_MUTANTS, (run, i) => source(run, mutateSrc(r, r.pick(seeds)), `mutant #${i}`))
  family('mutated AST', AST_MUTANTS, (run, i) => json(run, r, mutateAst(r, r.pick(seedAsts)), `ast #${i}`, true, .3))
  family('mutated JSON text', TEXT_MUTANTS, (run, i) => json(run, r, r.pick(seedAsts), `text #${i}`, false, 1))
  const runs = Object.entries(families), all = (k: 'failures' | 'values' | 'allow') => runs.flatMap(([, x]) => x[k])
  const cases = runs.reduce((n, [, x]) => n + x.cases, 0), accepted = runs.reduce((n, [, x]) => n + x.accepted, 0)
  const counts = runs.map(([k, x]) => `${k} ${x.hits}/${x.cases}`).join(', ')
  const slowest = runs.reduce((m, [, x]) => (x.slowest > m.slowest ? x : m), runs[0][1])

  assert(`ir fuzz: ${cases} cases (seed ${SEED}) through parse, validate, emit, both JS backends and bytecode throw nothing but IRError`, !all('failures').length, all('failures').slice(0, 4).join(' | '))
  assert(`ir fuzz: all ${accepted} accepted programs read a finite value in [0, 1] at ${POINTS.length * ENVS.length} points, the same on closures and new Function`, !all('values').length, all('values').slice(0, 3).join(' | '))
  assert('ir fuzz: every accepted program\'s emitted body passes the allowlist (registered cards keep new Function)', !all('allow').length, all('allow').slice(0, 3).join(' | '))
  assert('ir fuzz: every family reaches the backends and the rejections (accepted / cases)', runs.every(([, x]) => x.hits > x.cases * .02 && x.hits < x.cases), counts)
  assert('ir fuzz: no case runs away (slowest case under 2 s)', slowest.slowest < 2000, `${slowest.slow}: ${slowest.slowest.toFixed(1)} ms; all ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  const found = FOUND.map(([name, f]): [string, string] => { try { f(); return [name, 'accepted'] } catch (e) { return [name, e instanceof IRError ? '' : `${(e as Error).constructor.name}: ${(e as Error).message}`] } }).filter(([, e]) => e)
  assert(`ir fuzz: the ${FOUND.length} cases it found stay fixed (loop bounds near 2^53, sparse args, unprintable names are IRErrors)`, !found.length, found.map(([n, e]) => `${n}: ${e}`).join('; '))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { assert, done } = (await import('./lib/check')).checker('IR fuzz')
  irFuzzChecks(assert)
  ;(await import('./ir-sandbox')).irSandboxChecks(assert)
  done()
}
