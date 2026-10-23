/**
 * Field IR bytecode checks (P5-E): the f32 stack VM ≡ the float32 reference interpreter on the 20 IR
 * test fields (48×48 × 3 envs), close to the f64 JS backend, verifier rejects crafted code, sizes.
 *
 *   npx tsx scripts/bytecode.ts          # run the checks + print the size table
 *
 * `pnpm verify` runs the same checks through `bytecodeChecks()`.
 */
import { pathToFileURL } from 'node:url'
import { cellU } from '../src/engine/sampler/gridSampler'
import { BC_OP, IRError, compileBytecode, compileJS, loadBytecode, parse, referenceField, verifyBytecode, type IREnv } from '../src/engine/ir'
import { IR_TEST_FIELDS } from './ir'

type Assert = (name: string, cond: boolean, detail?: string) => void
export const BC_ENVS: IREnv[] = [
  { t: 0 },
  { t: 1.3, data: { value: .62, k: -2.5 }, pointer: { x: .3, y: .7, down: true } },
  { t: 7.77, data: { value: -1.4, k: 3 }, pointer: { x: 1.2, y: -.4 } },
]
const N = 48
const diff = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || a === b ? 0 : Math.abs(a - b)

export function bytecodeChecks(assert: Assert, opts: { table?: boolean } = {}) {
  let worst32 = 0, worst32Name = '', fails: string[] = [], sizes: [string, number, number][] = []
  const f64: string[] = []
  let f64Cells = 0, f64Off = 0
  for (const [name, src] of Object.entries(IR_TEST_FIELDS)) {
    const ast = parse(src), code = compileBytecode(ast), vm = loadBytecode(code), js = compileJS(ast, { raw: true })
    sizes.push([name, code.length, vm.info.steps])
    let m32 = 0, m64 = 0
    for (const e of BC_ENVS) {
      const ref32 = referenceField(ast, e, { f32: true }), jsf = js(e)
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const u = cellU(c, N), v = cellU(r, N), x = vm.run(Math.fround(u), Math.fround(v), Math.fround(e.t ?? 0), e.data, e.pointer)
        m32 = Math.max(m32, diff(x, ref32(u, v)))
        const d = diff(x, jsf(u, v)); f64Cells++
        if (d > 1e-5) f64Off++
        if (Number.isFinite(d)) m64 = Math.max(m64, d)
      }
    }
    if (!(m32 <= 1e-5)) fails.push(`${name}: ${m32.toExponential(2)}`)
    if (m32 > worst32) { worst32 = m32; worst32Name = name }
    f64.push(`${name} ${m64.toExponential(1)}`)
  }
  assert('bytecode: f32 VM ≡ float32 reference on 20 IR fields, 48×48 × 3 envs (≤ 1e-5)', fails.length === 0,
    fails.length ? fails.join(', ') : `max |Δ| ${worst32.toExponential(2)}${worst32Name ? ` (${worst32Name})` : ''}`)
  const within = 1 - f64Off / f64Cells
  assert('bytecode: f32 VM vs f64 JS backend: ≥ 99% of samples within 1e-5 (rest = float32 rounding at hash/floor/step edges)', within >= .99,
    `${(within * 100).toFixed(2)}% within; per-field max ${f64.join(', ')}`)
  const total = sizes.reduce((s, [, b]) => s + b, 0), big = sizes.reduce((a, b) => (b[1] > a[1] ? b : a))
  const median = [...sizes].sort((a, b) => a[1] - b[1])[sizes.length >> 1][1]
  assert('bytecode: programs are small (median ≤ 512 B, all ≤ 1 kB)', median <= 512 && big[1] <= 1024,
    `median ${median} B, largest ${big[0]} ${big[1]} B, total ${total} B for 20 fields`)
  if (opts.table) console.table(Object.fromEntries(sizes.map(([n, b, s]) => [n, { bytes: b, 'steps/dot': s }])))

  // verifier: crafted programs are rejected before they run
  const good = compileBytecode(parse('for i in 0..4 with s = 0 { s + i } + u'))
  const bad = (name: string, edit: (b: Uint8Array) => Uint8Array, re: RegExp) => {
    try { verifyBytecode(edit(good.slice())); return `${name}: accepted` } catch (e) { return e instanceof IRError && re.test(e.message) ? '' : `${name}: ${(e as Error).message}` }
  }
  const at = (op: number) => (b: Uint8Array) => b.indexOf(op, 6)
  const crafted = [
    bad('magic', b => { b[0] = 0; return b }, /bad magic/),
    bad('version', b => { b[2] = 9; return b }, /version/),
    bad('unknown opcode', b => { b[b.length - 1] = 0xff; return Uint8Array.from([...b, 0]) }, /unknown opcode/),
    bad('slot out of range', b => { b[at(BC_OP.STORE)(b) + 1] = 200; return b }, /slot out of range/),
    bad('backward jump via NEXT to a non-loop', b => { const i = at(BC_OP.NEXT)(b); b[i + 4] = 1; b[i + 5] = 0; return b }, /loop target/),
    bad('jump out of range', () => Uint8Array.from([0x64, 0x76, 1, 0, 1, 0, BC_OP.U, BC_OP.JZ, 200, 0, BC_OP.U, BC_OP.END]), /jump out of range/),
    bad('stack underflow', () => Uint8Array.from([0x64, 0x76, 1, 0, 1, 0, BC_OP.ADD, BC_OP.END]), /underflow/),
    bad('declared stack too small', b => { b[4] = 1; return b }, /deeper than declared/),
    bad('missing END', b => b.subarray(0, b.length - 1), /missing END|END needs/),
    bad('truncated operand', () => Uint8Array.from([0x64, 0x76, 1, 0, 1, 0, BC_OP.PUSHF, 0, 0]), /truncated/),
  ].filter(Boolean)
  assert('bytecode: verifier rejects 10 crafted programs (magic, opcodes, slots, jumps, stack, END)', crafted.length === 0, crafted.join('; '))
  // step budget: a crafted loop that rewrites its own index is cut off, not hung
  const spin = Uint8Array.from([0x64, 0x76, 1, 1, 1, 0, BC_OP.FOR, 0, 0, 0, BC_OP.PUSHI, 0, BC_OP.STORE, 0, BC_OP.NEXT, 0, 10, 0, 10, 0, BC_OP.U, BC_OP.END])
  let spun = 'not run'
  try { const r = loadBytecode(spin).run(.5, .5, 0); spun = Number.isNaN(r) ? '' : `returned ${r}` } catch (e) { spun = (e as Error).message }
  assert('bytecode: self-resetting loop hits the step budget and returns NaN (dark dot)', spun === '', spun)
  let tooBig = ''
  const heavy = `for i in 0..32 with s = 0 { s + for j in 0..32 with q = 0 { q + ${Array(30).fill('sin(u * j)').join(' + ')} } }`
  try { compileBytecode(parse(heavy)) } catch (e) { tooBig = (e as Error).message }
  assert('bytecode: compile rejects programs over the device step budget', /steps per dot/.test(tooBig), tooBig || 'accepted')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let failures = 0
  bytecodeChecks((name, cond, detail = '') => {
    if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
    else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
  }, { table: true })
  if (failures) { console.error(`\n${failures} bytecode check(s) failed`); process.exit(1) }
}
