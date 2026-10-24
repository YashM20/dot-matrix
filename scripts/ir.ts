/**
 * Field IR v0 checks: parser errors and limits, JSON round trip, JS backends ≡ the GLSL-semantics
 * reference interpreter on 20 test fields over a 48×48 grid, and a hash snapshot of the emitted
 * GLSL so codegen drift is caught. Real GPU parity (WebGL2 readback) is pending P5.
 *
 *   npx tsx scripts/ir.ts            # run the checks
 *   npx tsx scripts/ir.ts --update   # rewrite goldens/ir-glsl.json after an intended codegen change
 *
 * `pnpm verify` runs the same checks through `irChecks()`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { cellU } from '../src/engine/sampler/gridSampler'
import { IRError, compileJS, deserialize, emitGLSL, parse, referenceField, serialize, type IREnv, type IRNode } from '../src/engine/ir'

type Assert = (name: string, cond: boolean, detail?: string) => void
const GLSL_FILE = 'goldens/ir-glsl.json'

/** The 20 parity fields: each exercises a different corner of the grammar and GLSL semantics. */
export const IR_TEST_FIELDS: Record<string, string> = {
  ripple: 'let d = length(u - .5, v - .5); .5 + .5 * sin(d * 40 - t * 4)',
  plasma: 'let x = u * 6; let y = v * 6; (sin(x + t) + sin(y * 1.3 - t * .7) + sin((x + y) * .7 + t * .5) + sin(length(x - 3, y - 3) * 1.5 - t)) / 8 + .5',
  modNegative: '((u - .5) * 7.3 - t) % 1.7 / 1.7 + (-7 % 3) * .01 + (7 % -3) * .01',
  fractNegative: 'fract((v - .5) * -5.5 + t * .3)',
  smoothstepEdges: 'smoothstep(.2, .6, u) * smoothstep(.9, .4, v) + smoothstep(.3, .4, u * 3 - 1) * .25',
  stepCompare: 'step(.5, u) * .3 + (v < .25) * .2 - (u >= v) * .1 + (u == u) * .1 + (v != .5) * .1 + (u <= .5) * .05 + (v > u) * .05',
  ternary: 'u < .3 ? v : u < .6 ? 1 - v : (u * v > .2 ? .5 : 0)',
  letShadow: 'let x = u * 2; let x = x * x - 1; let y = x + v; (let x = y * .5; x) + x * .1',
  forSum: 'for i in 0..16 with s = 0 { s + sin(u * (i + 1) * 3 + t) / (i + 1) } * .5 + .5',
  forNested: 'for i in 0..4 with a = 0 { a + for j in 0..6 with b = 0 { b + hash(i + floor(u * 8), j + floor(v * 8)) } / 24 }',
  forInExpr: '.5 + 3 * (for i in 1..7 with m = 1 { let r = length(u - hash(i, 1), v - hash(i, 2)); min(m, r) }) - .5 * v',
  hashGrid: 'hash(floor(u * 48), floor(v * 48) + floor(t * 2)) + hash(-u * 9.1, v - 3.33) * .001',
  sdf: 'let p = u - .5; let q = v - .5; let c = sdCircle(p, q, .3); let b = sdBox(p - .1, q + .05, .2, .1); let r = sdRing(p, q, .4, .02); smoothstep(.02, 0, min(min(c, b), r))',
  powers: '(u * 2 - 1) ^ 3 * .5 + .5 - v ^ 2 + 2 ^ -1 + (v + .1) ^ 1.7 + (u - .5) ^ 2.5 + (v - .5) ^ 0 + u ^ 1',
  precedence: '1 - 2 - 3 + 2 * 3 % 4 / 5 + -2 ^ 2 + 2 ^ 3 ^ .5 + u - -v + +u',
  inputs: 'let d = length(u - pointer.x, v - pointer.y); data.value * smoothstep(.4, 0, d) + pointer.down * .2 + data.k * .01 + data.missing + data.constructor',
  dial: 'let a = fract(atan(u - .5, .5 - v) / TAU); let r = length(u - .5, v - .5); (a < data.value) * smoothstep(.05, .02, abs(r - .35)) + PI * 0',
  builtins: 'mix(clamp(u * 3 - 1, 0, 1), max(cos(v * 9), abs(sign(u - .5))), sqrt(v)) * exp(-u) + floor(v * 4) / 8',
  clampOrder: 'clamp(u, .7, .3) + max(u, v) - min(u, v) + clamp(v * 2 - .5, 0, 1) * .1',
  loopWork: 'for i in 0..4 with s = 0 { s + for j in 0..8 with q = 0 { q + (fract(u * i + v * j + t) < .5) } } / 32',
}
const ENVS: IREnv[] = [
  { t: 0 },
  { t: 1.3, data: { value: .62, k: -2.5 }, pointer: { x: .3, y: .7, down: true } },
  { t: 7.77, data: { value: -1.4, k: 3 }, pointer: { x: 1.2, y: -.4 } },
]
const N = 48

const fnv1a = (str: string) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }
const diff = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || a === b ? 0 : Math.abs(a - b)
const throws = (f: () => unknown, re: RegExp): string => { try { f(); return 'no error' } catch (e) { return e instanceof IRError && re.test(e.message) ? '' : `wrong error: ${(e as Error).message}` } }

export function irChecks(assert: Assert, opts: { update?: boolean } = {}) {
  // ── parser: values, precedence, errors with positions ──
  const val = (src: string, env: IREnv = {}) => compileJS(parse(src), { raw: true })(env)(.25, .75)
  assert('ir: precedence (-2^2 = -4, 2^3^2 = 512, 1-2-3 = -4, 2+3*4 = 14)', val('-2^2') === -4 && val('2^3^2') === 512 && val('1-2-3') === -4 && val('2+3*4') === 14)
  assert('ir: % is GLSL mod (floored), not JS %', val('-7 % 3') === 2 && val('7 % -3') === -2 && val('-1.5 % 1') === .5)
  assert('ir: comparisons 1/0, ternary, lets, u/v/t/data/pointer', val('u < v') === 1 && val('u > v ? 3 : 4') === 4 && val('let a = 2; let a = a * a; a') === 4
    && val('t + data.x + pointer.x', { t: 1, data: { x: 2 }, pointer: { x: .5, y: 0 } }) === 3.5 && val('pointer.x + pointer.y + pointer.down') === -2)
  assert('ir: for fold (sum 0..9 = 45, product of 1..6 = 720)', val('for i in 0..10 with s = 0 { s + i }') === 45 && val('for i in 1..7 with p = 1 { p * i }') === 720)
  const lines = 'let a = 1;\nlet b = a +\n  zz;\nb'
  assert('ir: unknown identifier names it with line:col', throws(() => parse('u + foo'), /unknown identifier "foo" at 1:5/) === '' && throws(() => parse(lines), /"zz" at 3:3/) === '')
  const bad: [string, string, RegExp][] = [
    ['source > 4 kB', 'u+'.repeat(2100) + 'u', /more than 4096/],
    ['> 2k nodes', '1+'.repeat(1100) + '1', /more than 2000 nodes/],
    ['loop > 64', 'for i in 0..65 with s = 0 { s }', /more than 64/],
    ['loop bound not literal', 'for i in 0..u with s = 0 { s }', /integer literals/],
    ['nested work > 1024', 'for i in 0..64 with s = 0 { for j in 0..64 with q = 0 { q } }', /4096 times per dot/],
    ['unknown function', 'foo(1)', /unknown function "foo"/],
    ['arity', 'sin(1, 2)', /sin\(\) takes 1/],
    ['no JS access: constructor', 'constructor', /unknown identifier/],
    ['no JS access: globalThis', 'globalThis', /unknown identifier/],
    ['no JS access: member', 'u.constructor', /unexpected "\."/],
    ['no JS access: __proto__', 'data.__proto__', /invalid data key/],
    ['no strings / brackets', 'u["x"]', /unexpected character/],
    ['reserved binding', 'let t = 1; t', /reserved/],
    ['chained comparison', 'u < v < 1', /do not chain/],
    ['deep nesting', '('.repeat(200) + 'u' + ')'.repeat(200), /nesting deeper/],
    ['trailing input', 'u v', /unexpected "v"/],
  ]
  const badOut = bad.map(([name, src, re]) => { const r = throws(() => parse(src), re); return r ? `${name}: ${r}` : '' }).filter(Boolean)
  assert(`ir: ${bad.length} rejected programs give clear errors`, badOut.length === 0, badOut.join('; '))

  // ── JSON: round trip + validation of tampered input ──
  const asts: Record<string, IRNode> = Object.fromEntries(Object.entries(IR_TEST_FIELDS).map(([k, src]) => [k, parse(src)]))
  const roundTrip = Object.entries(asts).filter(([, a]) => JSON.stringify(deserialize(serialize(a))) !== JSON.stringify(a)).map(([k]) => k)
  assert('ir: serialize → deserialize round-trips all 20 fields', roundTrip.length === 0, roundTrip.join(', '))
  const env = (ast: unknown) => JSON.stringify({ dot: 1, ast })
  const tampered: [string, RegExp][] = [
    [env({ k: 'ref', name: 'x' }), /unknown identifier "x" at \$\.name/],
    [env({ k: 'eval', src: 'alert(1)' }), /unknown node kind/],
    [env({ k: 'call', fn: 'constructor', args: [] }), /unknown function/],
    [env({ k: 'call', fn: 'sin', args: [] }), /takes 1/],
    [env({ k: 'for', i: 'i', from: 0, to: 1000, acc: 's', init: { k: 'num', v: 0 }, body: { k: 'ref', name: 's' } }), /more than 64/],
    [env({ k: 'bin', op: '&&', a: { k: 'num', v: 1 }, b: { k: 'num', v: 1 } }), /unknown operator/],
    [env({ k: 'num', v: '1' }), /finite/],
    [JSON.stringify({ dot: 2, ast: { k: 'num', v: 1 } }), /not a dot v1/],
    ['{', /not JSON/],
  ]
  const tamperOut = tampered.map(([json, re], i) => { const r = throws(() => deserialize(json), re); return r ? `#${i}: ${r}` : '' }).filter(Boolean)
  assert(`ir: deserialize rejects ${tampered.length} tampered programs`, tamperOut.length === 0, tamperOut.join('; '))

  // ── parity: closure tree and new Function ≡ GLSL-semantics reference, 48×48 × 3 envs ──
  let worst = 0, worstName = '', drift32 = 0
  const parityFails: string[] = []
  for (const [name, ast] of Object.entries(asts)) {
    const closure = compileJS(ast, { raw: true }), fn = compileJS(ast, { raw: true, mode: 'function' }), viaJSON = compileJS(deserialize(serialize(ast)), { raw: true })
    if (fn.mode !== 'function') parityFails.push(`${name}: new Function unavailable`)
    let m = 0
    for (const e of ENVS) {
      const a = closure(e), b = fn(e), c = viaJSON(e), ref64 = referenceField(ast, e), ref32 = referenceField(ast, e, { f32: true })
      for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
        const u = cellU(col, N), v = cellU(r, N), ref = ref64(u, v), x = a(u, v)
        m = Math.max(m, diff(x, ref), diff(b(u, v), ref), diff(c(u, v), x))
        if (col % 4 === 0 && r % 4 === 0) { const r32 = ref32(u, v); if (Number.isFinite(r32) && Number.isFinite(ref)) drift32 = Math.max(drift32, Math.abs(r32 - ref)) }
      }
    }
    if (!(m <= 1e-6)) parityFails.push(`${name}: ${m.toExponential(2)}`)
    if (m > worst) { worst = m; worstName = name }
  }
  assert('ir: JS (closure + new Function) ≡ GLSL-semantics reference on 20 fields, 48×48 × 3 envs (≤ 1e-6)', parityFails.length === 0,
    parityFails.length ? parityFails.join(', ') : `max |Δ| ${worst.toExponential(2)}${worstName ? ` (${worstName})` : ''}; float32 drift (informational) ${drift32.toExponential(2)}`)
  const clamped = compileJS(parse('v > .5 ? sqrt(-1) : u * 4 - 2'))()
  assert('ir: Field output clamps to [0,1] and NaN → 0', clamped(.1, .1) === 0 && clamped(.9, .1) === 1 && clamped(.9, .9) === 0 && Math.abs(clamped(.6, .1) - .4) < 1e-12)

  // ── GLSL codegen snapshot ──
  const glsl = Object.fromEntries(Object.entries(asts).map(([k, a]) => [k, fnv1a(emitGLSL(a))]))
  const sample = emitGLSL(asts.inputs)
  assert('ir: GLSL signature, data params, helpers only when used', sample.includes('float field(vec2 uv, float t, vec3 pointer, float data_constructor, float data_k, float data_missing, float data_value)')
    && emitGLSL(asts.hashGrid).includes('ir_hash(') && !emitGLSL(asts.ripple).includes('ir_') && emitGLSL(asts.forNested).includes('for (int k'))
  if (opts.update || !existsSync(GLSL_FILE)) {
    writeFileSync(GLSL_FILE, JSON.stringify({ about: 'FNV-1a 32 of emitGLSL() per IR test field (scripts/ir.ts). Re-baseline with `npx tsx scripts/ir.ts --update` when a codegen change is intended.', fields: glsl }, null, 1) + '\n')
    console.log(`${GLSL_FILE}: wrote ${Object.keys(glsl).length} GLSL hashes`)
  }
  const golden: Record<string, string> = JSON.parse(readFileSync(GLSL_FILE, 'utf8')).fields
  const drift = Object.keys({ ...glsl, ...golden }).filter(k => glsl[k] !== golden[k])
  assert('ir: emitGLSL output matches goldens/ir-glsl.json (20 fields)', drift.length === 0, drift.length ? `changed: ${drift.join(', ')}` : '')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let failures = 0
  irChecks((name, cond, detail = '') => {
    if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
    else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
  }, { update: process.argv.includes('--update') })
  if (failures) { console.error(`\n${failures} IR check(s) failed`); process.exit(1) }
}
