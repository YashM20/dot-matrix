/**
 * Field IR sandbox checks (#158): code is only ever built from registered card sources, and only from bodies the
 * token allowlist (`src/engine/ir/allow.ts`) accepts.
 *  - allowlist: a real emitted body passes; tampered bodies (property access, strings, comments, calls on values,
 *    undeclared names, out-of-range data, `eval`, `this`) are refused and `buildFunction` returns null; a program
 *    whose emitted body breaks the allowlist compiles to the closure tree;
 *  - closures only: with a spy on the global `Function`, the visitor paths (DOTS / MAKE `compileSource`, studio and
 *    editor `compileCard` with IR, sites and spec layers, `specToPreset`) never construct one, and a registered
 *    path (`irProgram(src, { mode: 'function' })`) does;
 *  - the callers: no file under src/ outside the engine and the registered IR boards calls `irProgram(`,
 *    `compileJS(` or `emitJS(`, asks for `mode: 'function'` / `irMode`, or holds `new Function`; nothing in src/
 *    calls `eval(`; the visitor callers use `compileUntrusted`.
 *
 *   npx tsx scripts/ir-sandbox.ts   # also run by `npx tsx scripts/ir-fuzz.ts` and by `pnpm verify` through `irSandboxChecks()`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IR_FUNCTIONS, compileJS, emitJS, irProgram, parse } from '../src/engine/ir'
import { allowedBody } from '../src/engine/ir/allow'
import { buildFunction } from '../src/engine/ir/compile'
import '../src/engine/noise/ir'
import { compileSource } from '../src/components/dwitter/program'
import { compileCard, importDots, irLayer, sitesLayer, type SpecLayer } from '../src/components/studio/doc'
import { specToPreset } from '../src/spec'
import type { Assert } from './lib/check'

/** Files allowed to build code: the IR module itself and the registered card presets. */
const TRUSTED = ['src/engine/', 'src/widgets/boards/ir.ts', 'src/widgets/boards/gpu.ts']
/** Visitor callers: each must compile through `compileUntrusted`. */
const VISITOR = ['src/components/dwitter/program.ts', 'src/components/studio/doc.ts', 'src/essay/figures/FigIR.tsx', 'src/spec/build.ts']
const FORBIDDEN: [string, RegExp][] = [
  ['irProgram(', /\birProgram\s*\(/], ['compileJS(', /\bcompileJS\s*\(/], ['emitJS(', /\bemitJS\s*\(/], ['new Function', /\bnew\s+Function\b/],
  ["mode: 'function'", /\bmode\s*:\s*['"`]function['"`]/], ['irMode', /\birMode\b/],
]
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [] })
/** Source without comments (a doc comment may name `irProgram(` without calling it). */
const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

export function irSandboxChecks(assert: Assert) {
  // ── the allowlist ──
  const real = emitJS(parse('let a = u * 2; for i in 0..3 with s = 0 { s + sin(a * i) + data.k } + (v > .5 ? 1 : 0) + u ^ 3 % 2 + noise(u, v, 1)'))
  const n = real.data.length
  assert('ir allowlist: a real emitted body (lets, a loop, data, a comparison, pow, mod, a pack builtin) passes and builds',
    allowedBody(real.body, n) && buildFunction(real.body, n) !== null, real.body.replace(/\n/g, ' ').slice(0, 120))
  const ret = real.body.lastIndexOf('return ')
  const tamper: [string, string][] = [
    ['property access through M', real.body.replace('M.sin(', 'M.constructor.constructor("return this")(')],
    ['a call on a value', real.body.slice(0, ret) + 'return (u)(v);'],
    ['a string', real.body.slice(0, ret) + 'return "x";'],
    ['a template', real.body.slice(0, ret) + 'return `${u}`;'],
    ['a comment', real.body.slice(0, ret) + '// x\n' + real.body.slice(ret)],
    ['this', real.body.slice(0, ret) + 'return this;'],
    ['eval', real.body.slice(0, ret) + 'return eval(u);'],
    ['globalThis', real.body.slice(0, ret) + 'return globalThis;'],
    ['an undeclared generated name', real.body.slice(0, ret) + 'return l99_x;'],
    ['a second declaration of a name', real.body.replace(/let (l\d+_a) = /, 'let $1 = 1;\nlet $1 = ')],
    ['data out of range', real.body.replace(`D[${n - 1}]`, `D[${n}]`)],
    ['data by string key', real.body.replace(`D[${n - 1}]`, 'D["constructor"]')],
    ['a builtin that is not one', real.body.replace('M.sin(', 'M.hasOwnProperty(')],
    ['a method of a builtin', real.body.replace('M.sin(', 'M.sin.call(')],
    ['a bare M', real.body.slice(0, ret) + 'return M;'],
    ['a unicode escape', real.body.slice(0, ret) + 'return \\u0065val;'],
    ['new', real.body.slice(0, ret) + 'return new M.sin(u);'],
    ['a dangling let', real.body + '\nlet'],
  ]
  const passed = tamper.filter(([, b]) => allowedBody(b, n) || buildFunction(b, n) !== null).map(([k]) => k)
  assert(`ir allowlist: ${tamper.length} tampered bodies are refused and never built`, !passed.length && tamper.every(([, b]) => b !== real.body), passed.join(', ') || tamper.filter(([, b]) => b === real.body).map(([k]) => `${k} (tamper missed)`).join(', '))
  // an emitter bug, simulated: a builtin the validator knows but the runtime doesn't, so the body calls something off the list
  ;(IR_FUNCTIONS as Record<string, number>).fuzzProbe = 1
  let fellBack = false
  try { fellBack = compileJS(parse('fuzzProbe(u) + 1'), { mode: 'function' }).mode === 'closure' } finally { delete (IR_FUNCTIONS as Record<string, number>).fuzzProbe }
  assert('ir allowlist: a program whose emitted body breaks the allowlist compiles to the closure tree', fellBack)

  // ── visitor programs never reach new Function ──
  const RealFunction = globalThis.Function
  let built = 0
  const unique = `${Date.now() % 100000}.${Math.floor(Math.random() * 1e6)}`
  globalThis.Function = new Proxy(RealFunction, { construct(target, args) { built++; return Reflect.construct(target, args) } })
  let visitor = -1, registered = -1, modes = '', err = ''
  try {
    const dots = compileSource(`u * v + ${unique}`)
    modes = dots.program?.mode ?? `error ${dots.error?.message}`
    const card = importDots({ src: `sin(u * 9 + t) * .5 + .5 + ${unique} * 0`, grid: 'square', lattice: 3, tone: 'auto' })
    const spec: SpecLayer = { id: 'sbx', name: 'spec', kind: 'spec', tone: 'preset', z: 2, blend: 'normal', visible: true, spec: { kind: 'ir', src: `v * .5 + ${unique} * 0`, lattice: 2 } }
    card.layers.push(sitesLayer({ src: `u + ${unique} * 0`, z: 1 }), spec, irLayer(`max(u, v) + ${unique} * 0`, { name: 'two', z: 3 }))
    const compiled = compileCard(card), ctx = { t: .5, data: {} }
    for (const l of compiled.layers(ctx)) l.field(.5, .5)
    const example = JSON.parse(readFileSync('examples/specs/ir-ripple.json', 'utf8'))
    example.layers[0].src = `u * ${unique} * 0 + v`
    example.layers.push({ kind: 'text', bind: `t + ${unique}`, at: [0, 0] }, { kind: 'sites', points: [[4, 4]], bind: `u * ${unique}` })
    for (const l of specToPreset(example).layers(ctx)) l.field(.5, .5)
    visitor = built
    irProgram(`u - ${unique}`, { mode: 'function' })
    registered = built - visitor
  } catch (e) { err = (e as Error).message } finally { globalThis.Function = RealFunction }
  assert('ir sandbox: visitor programs (DOTS, MAKE and studio cards with IR, sites and spec layers, card specs) never construct a Function; a registered card does',
    !err && visitor === 0 && registered === 1 && modes === 'closure', err || `visitor paths built ${visitor}, the registered path built ${registered}, DOTS mode ${modes}`)

  // ── the callers ──
  const files = walk('src').map(f => f.replace(/\\/g, '/'))
  const bad = files.filter(f => !TRUSTED.some(t => f.startsWith(t))).flatMap(f => { const c = code(f); return FORBIDDEN.filter(([, re]) => re.test(c)).map(([k]) => `${f}: ${k}`) })
  const evals = files.filter(f => /\beval\s*\(/.test(code(f)))
  const builders = files.filter(f => /\bnew\s+Function\b/.test(code(f)))
  const missing = VISITOR.filter(f => !/\bcompileUntrusted\s*\(/.test(code(f)))
  assert(`ir sandbox: outside the engine and the registered IR boards, none of ${files.length} src files calls irProgram / compileJS / emitJS or asks for mode 'function'; the visitor callers use compileUntrusted`,
    !bad.length && !missing.length && files.length > 100, [...bad, ...missing.map(f => `${f}: no compileUntrusted`)].join('; '))
  assert('ir sandbox: no eval( in src, and new Function only in src/engine/ir/compile.ts', !evals.length && builders.join() === 'src/engine/ir/compile.ts', [...evals, ...builders].join(', '))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { assert, done } = (await import('./lib/check')).checker('IR sandbox')
  irSandboxChecks(assert)
  done()
}
