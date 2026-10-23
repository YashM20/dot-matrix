/**
 * C VM parity: build targets/esp32/dotvm.c + test/dvtest.c with whatever C compiler exists
 * (gcc / clang / cc / zig cc / tcc on PATH, else MSVC found through vswhere) and compare it with
 * the TS VM on the 20 IR test fields × 3 envs at 48×48. No compiler → the check reports a skip.
 *
 *   npx tsx targets/test/esp32.ts
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileBytecode, loadBytecode, parse } from '../../src/engine/ir'
import { IR_TEST_FIELDS } from '../../scripts/ir'
import { BC_ENVS } from '../../scripts/bytecode'

type Assert = (name: string, cond: boolean, detail?: string) => void
const ESP = resolve(dirname(fileURLToPath(import.meta.url)), '../esp32')
const SOURCES = [join(ESP, 'dotvm.c'), join(ESP, 'test/dvtest.c')]
const N = 48, NL = String.fromCharCode(10)

const which = (cmd: string) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0
/** MSVC environment from vcvars64.bat (found via vswhere), cached in the temp dir: vcvars alone can take minutes. */
function msvcEnv(): NodeJS.ProcessEnv | null {
  const cache = join(tmpdir(), 'dotvm-msvc-env.json')
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const vswhere = join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe')
  if (process.platform !== 'win32' || !existsSync(vswhere)) return null
  const paths = spawnSync(vswhere, ['-all', '-products', '*', '-property', 'installationPath'], { encoding: 'utf8' }).stdout.split(NL).map(l => l.trim()).filter(Boolean)
  for (const p of paths) {
    const bat = join(p, 'VC/Auxiliary/Build/vcvars64.bat')
    if (!existsSync(bat)) continue
    const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `"call "${bat}" >nul && set"`], { encoding: 'utf8', windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const env: NodeJS.ProcessEnv = {}
    for (const line of r.stdout.split(NL).map(l => l.trim())) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1) }
    if (!env.INCLUDE) continue
    writeFileSync(cache, JSON.stringify(env))
    return env
  }
  return null
}

export interface Built { exe: string; compiler: string; textBytes?: number }
/** Build the harness once per source hash; null when no compiler is available. */
export function buildHarness(opts: { pathOnly?: boolean } = {}): Built | null {
  const hash = createHash('sha1').update(SOURCES.map(f => readFileSync(f, 'utf8')).join('\0') + readFileSync(join(ESP, 'dotvm.h'), 'utf8')).digest('hex').slice(0, 10)
  const dir = join(tmpdir(), `dotvm-${hash}`), exe = join(dir, process.platform === 'win32' ? 'dvtest.exe' : 'dvtest')
  mkdirSync(dir, { recursive: true })
  const meta = join(dir, 'meta.json')
  if (existsSync(exe) && existsSync(meta)) return { exe, ...JSON.parse(readFileSync(meta, 'utf8')) }
  let built: Omit<Built, 'exe'> | null = null
  for (const cc of ['gcc', 'clang', 'cc', 'tcc']) {
    if (!which(cc)) continue
    const flags = cc === 'tcc' ? [] : ['-std=c99', '-O2', '-ffp-contract=off', '-Wall', '-Wextra']
    execFileSync(cc, [...flags, '-DDV_DOUBLE_MATH=1', '-o', exe, ...SOURCES, '-lm'], { stdio: 'pipe' })
    let textBytes: number | undefined
    if (cc !== 'tcc') { const o = join(dir, 'dotvm.o'); execFileSync(cc, ['-std=c99', '-Os', '-c', '-o', o, SOURCES[0]]); textBytes = coffOrElfText(readFileSync(o)) }
    built = { compiler: `${cc} (PATH)`, textBytes }; break
  }
  if (!built && which('zig')) {
    execFileSync('zig', ['cc', '-std=c99', '-O2', '-ffp-contract=off', '-DDV_DOUBLE_MATH=1', '-o', exe, ...SOURCES, '-lm'], { stdio: 'pipe' })
    built = { compiler: 'zig cc (PATH)' }
  }
  const env = built || opts.pathOnly ? null : msvcEnv()
  if (env) {
    const cl = (...args: string[]) => {
      const r = spawnSync('cl.exe', ['/nologo', ...args], { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      if (r.status !== 0) throw new Error(`cl failed: ${r.error?.message ?? ''}${r.stdout}${r.stderr}`)
    }
    cl('/std:c11', '/W4', '/wd4996', '/O2', '/fp:strict', '/DDV_DOUBLE_MATH=1', '/Fe:dvtest.exe', SOURCES[0], SOURCES[1])
    cl('/std:c11', '/O1', '/GS-', '/c', '/Fo:dotvm_os.obj', SOURCES[0])
    built = { compiler: 'MSVC cl x64 (via vswhere, not on PATH)', textBytes: coffOrElfText(readFileSync(join(dir, 'dotvm_os.obj'))) }
  }
  if (!built) return null
  writeFileSync(meta, JSON.stringify(built))
  return { exe, ...built }
}

/** Sum of executable section sizes in a COFF (MSVC) or ELF64 (gcc/clang) object. */
function coffOrElfText(b: Buffer): number | undefined {
  if (b.readUInt32BE(0) === 0x7f454c46) {
    const shoff = Number(b.readBigUInt64LE(0x28)), shentsize = b.readUInt16LE(0x3a), shnum = b.readUInt16LE(0x3c)
    let sum = 0
    for (let i = 0; i < shnum; i++) { const o = shoff + i * shentsize, flags = Number(b.readBigUInt64LE(o + 8)); if (flags & 4) sum += Number(b.readBigUInt64LE(o + 32)) }
    return sum
  }
  const nsec = b.readUInt16LE(2), opt = b.readUInt16LE(16)
  let sum = 0
  for (let i = 0; i < nsec; i++) { const o = 20 + opt + i * 40, chars = b.readUInt32LE(o + 36); if (chars & 0x20) sum += b.readUInt32LE(o + 16) }
  return sum
}

/** `pathOnly`: skip the (slow) MSVC discovery unless its environment is already cached. */
export function esp32Checks(assert: Assert, opts: { pathOnly?: boolean } = {}) {
  let built: Built | null
  try { built = buildHarness({ pathOnly: opts.pathOnly && !existsSync(join(tmpdir(), 'dotvm-msvc-env.json')) }) } catch (e) { assert('esp32: C VM compiles', false, (e as Error).message.slice(0, 600)); return }
  if (!built) { assert('esp32: C VM parity skipped — no C compiler (gcc/clang/cc/zig/tcc on PATH, no MSVC)', true); return }
  const jobs: Buffer[] = [], expect: Float32Array[] = [], names: string[] = []
  for (const [name, src] of Object.entries(IR_TEST_FIELDS)) {
    const code = compileBytecode(parse(src)), vm = loadBytecode(code)
    for (const e of BC_ENVS) {
      const head = Buffer.alloc(2); head.writeUInt16LE(code.length)
      const env = Buffer.alloc(16 + 1 + vm.keys.length * 4 + 2)
      const p = e.pointer
      env.writeFloatLE(e.t ?? 0, 0); env.writeFloatLE(p ? p.x : -1, 4); env.writeFloatLE(p ? p.y : -1, 8); env.writeFloatLE(p?.down ? 1 : 0, 12)
      env.writeUInt8(vm.keys.length, 16)
      vm.keys.forEach((k, i) => env.writeFloatLE(e.data && Object.prototype.hasOwnProperty.call(e.data, k) ? e.data[k] : 0, 17 + i * 4))
      env.writeUInt16LE(N, 17 + vm.keys.length * 4)
      jobs.push(head, Buffer.from(code), env)
      const out = new Float32Array(N * N)
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) out[r * N + c] = vm.run(Math.fround(c / (N - 1)), Math.fround(r / (N - 1)), Math.fround(e.t ?? 0), e.data, e.pointer)
      expect.push(out); names.push(name + "#" + BC_ENVS.indexOf(e))
    }
  }
  const dir = dirname(built.exe), jf = join(dir, 'jobs.bin'), of = join(dir, 'out.bin')
  writeFileSync(jf, Buffer.concat(jobs))
  execFileSync(built.exe, [jf, of])
  const out = readFileSync(of)
  let off = 0, worst = 0, bad = 0, exact = 0, total = 0, job = 0
  const off1: string[] = []
  for (const exp of expect) {
    const name = names[job++]; let first = ""
    const st = out.readInt32LE(off); off += 4
    if (st !== 0) bad++
    for (let i = 0; i < exp.length; i++, off += 4) {
      const x = out.readFloatLE(off), y = exp[i]; total++
      const d = (Number.isNaN(x) && Number.isNaN(y)) || x === y ? 0 : Math.abs(x - y)
      if (d === 0) exact++
      if (!(d <= 1e-5) && !first) { first = name + " @" + i + " C=" + x + " TS=" + y; off1.push(first) }
      worst = Math.max(worst, Number.isNaN(d) ? Infinity : d)
    }
  }
  assert(`esp32: C VM (${built.compiler}) ≡ TS VM on 20 IR fields × 3 envs, 48×48 (≤ 1e-5)`, bad === 0 && worst <= 1e-5,
    `${bad} load errors, max |Δ| ${worst.toExponential(2)}, ${(exact / total * 100).toFixed(2)}% bit-exact${off1.length ? '; off: ' + off1.join(', ') : ''}${built.textBytes ? `; dotvm.c code ${built.textBytes} B (host -Os/O1 object)` : ''}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let failures = 0
  esp32Checks((name, cond, detail = '') => { if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`); else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ } })
  if (failures) process.exit(1)
}
