/**
 * Field IR → compact bytecode for device interpreters (MASTER-PLAN §3.12; C twin: `targets/esp32/dotvm.c`).
 * A stack VM over float32: every push rounds to f32, so it reproduces `referenceField(ast, env, { f32: true })`.
 *
 * Layout: 'd' 'v' version nLocals maxStack nData, then nData × (len, ASCII key), then code ending in END.
 * Operands are little-endian. JZ/JMP jump forward only; NEXT is the only backward edge (a bounded `for`),
 * and interpreters also cap the steps per dot, so crafted code can't hang a device.
 * `verifyBytecode` checks opcodes, operands, slots, jump targets and the stack depth statically.
 */
import { IRError, IR_FUNCTIONS, validate, type CoreFn, type Node, type PackFn } from './ast'
import { irMath, smallPow } from './runtime'

export const BC_VERSION = 1
/** Stack depth the device VM reserves (`DV_STACK` in dotvm.h). */
export const BC_STACK = 32
/** Step budget per dot (`DV_MAX_STEPS`): a program over it yields NaN (→ dark). */
export const BC_MAX_STEPS = 1 << 16

export const OP = {
  END: 0x00, PUSHF: 0x01, PUSHI: 0x02, U: 0x03, V: 0x04, T: 0x05, PX: 0x06, PY: 0x07, PD: 0x08,
  DATA: 0x09, LOAD: 0x0a, STORE: 0x0b, NEG: 0x0c,
  ADD: 0x10, SUB: 0x11, MUL: 0x12, DIV: 0x13, MOD: 0x14, POW: 0x15, POWI: 0x16,
  LT: 0x17, LE: 0x18, GT: 0x19, GE: 0x1a, EQ: 0x1b, NE: 0x1c,
  /** Builtins 0x20…0x33 in `IR_FUNCTIONS` order (sin … sdRing). */
  FN: 0x20,
  JZ: 0x38, JMP: 0x39, FOR: 0x3a, NEXT: 0x3b,
} as const
/**
 * The core builtins, snapshot when this module loads. It loads with the IR core (first load), before any lazy pack
 * registers into IR_FUNCTIONS, so pack builtins never get opcodes and 0x20–0x33 never shift; compileBytecode also
 * rejects them by name. (Module-level code here ships in first load: keep it free of pack logic.)
 */
const FNS = Object.keys(IR_FUNCTIONS) as CoreFn[]
const BIN: Record<string, number> = { '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD, '^': OP.POW, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE, '==': OP.EQ, '!=': OP.NE }
const INPUT_OP = { u: OP.U, v: OP.V, t: OP.T, 'pointer.x': OP.PX, 'pointer.y': OP.PY, 'pointer.down': OP.PD } as const
/** Operand bytes per opcode (absent = invalid opcode). */
const OPERANDS = new Map<number, number>([[OP.PUSHF, 4], [OP.PUSHI, 1], [OP.DATA, 1], [OP.LOAD, 1], [OP.STORE, 1], [OP.POWI, 1], [OP.JZ, 2], [OP.JMP, 2], [OP.FOR, 3], [OP.NEXT, 5]])
for (const o of [OP.END, OP.U, OP.V, OP.T, OP.PX, OP.PY, OP.PD, OP.NEG, ...Object.values(BIN)]) OPERANDS.set(o, 0)
FNS.forEach((_, i) => OPERANDS.set(OP.FN + i, 0))
/** Stack effect: pops, then pushes. */
const effect = (op: number): [number, number] => {
  if (op >= OP.FN && op < OP.FN + FNS.length) return [IR_FUNCTIONS[FNS[op - OP.FN]], 1]
  if (op >= OP.ADD && op <= OP.NE && op !== OP.POWI) return [2, 1]
  switch (op) {
    case OP.NEG: case OP.POWI: return [1, 1]
    case OP.STORE: case OP.JZ: return [1, 0]
    case OP.END: return [1, 0]
    case OP.JMP: case OP.FOR: case OP.NEXT: return [0, 0]
    default: return [0, 1]
  }
}

export interface BytecodeInfo { bytes: number; code: number; constants: number; locals: number; stack: number; data: string[]; /** Worst-case instructions per dot. */ steps: number }

/** Compile a validated AST to bytecode. Throws `IRError` if it exceeds the device limits (stack, slots, u16 loop bounds). */
export function compileBytecode(ast: Node): Uint8Array {
  const info = validate(ast), data = info.data
  const code: number[] = []
  let depth = 0, maxDepth = 0, locals = 0, maxLocals = 0
  const fail = (msg: string): never => { throw new IRError(`bytecode: ${msg}`) }
  const emit = (op: number, ...operands: number[]) => {
    const [pop, push] = effect(op)
    depth += push - pop; if (depth > maxDepth) maxDepth = depth
    code.push(op, ...operands)
  }
  const u16 = (x: number) => [x & 255, (x >> 8) & 255]
  const f32 = (x: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, x, true); return [...b] }
  const slot = () => { const s = locals++; if (locals > maxLocals) maxLocals = locals; if (s > 255) fail('more than 256 locals'); return s }
  const patch = (at: number) => { const off = code.length - (at + 3); if (off > 0xffff) fail('jump too far'); code[at + 1] = off & 255; code[at + 2] = off >> 8 }
  const c = (n: Node, scope: ReadonlyMap<string, number>): void => {
    switch (n.k) {
      case 'num': return Number.isInteger(n.v) && !Object.is(n.v, -0) && n.v >= -128 && n.v <= 127 ? emit(OP.PUSHI, n.v & 255) : emit(OP.PUSHF, ...f32(n.v))
      case 'in': return emit(INPUT_OP[n.name])
      case 'data': return emit(OP.DATA, data.indexOf(n.key))
      case 'ref': return emit(OP.LOAD, scope.get(n.name)!)
      case 'neg': c(n.a, scope); return emit(OP.NEG)
      case 'call': {
        const k = FNS.indexOf(n.fn as CoreFn), pack: PackFn[] = ['noise', 'fbm', 'turb', 'voronoi']
        // pack builtins (noise, fbm, turb, voronoi) are CPU/GPU only: the device VM has no opcode for them
        if (k < 0 || pack.includes(n.fn as PackFn)) throw new IRError(`${n.fn}() is not in device bytecode v${BC_VERSION}`)
        n.args.forEach(a => c(a, scope)); return emit(OP.FN + k)
      }
      case 'bin': {
        c(n.a, scope)
        if (n.op === '^') { const k = smallPow(n.b); if (k >= 0) return emit(OP.POWI, k) }
        c(n.b, scope); return emit(BIN[n.op])
      }
      case 'cond': {
        c(n.c, scope)
        const jz = code.length; emit(OP.JZ, 0, 0)
        c(n.a, scope)
        const jmp = code.length; emit(OP.JMP, 0, 0); depth--
        patch(jz); c(n.b, scope); patch(jmp); return
      }
      case 'let': {
        c(n.value, scope); const s = slot(); emit(OP.STORE, s)
        c(n.body, new Map(scope).set(n.name, s)); locals--; return
      }
      case 'for': {
        if (n.to > 0xffff) fail('loop bound above 65535')
        c(n.init, scope)
        const acc = slot(), idx = slot()
        emit(OP.STORE, acc); emit(OP.FOR, idx, ...u16(n.from))
        const top = code.length
        c(n.body, new Map(scope).set(n.acc, acc).set(n.i, idx)); emit(OP.STORE, acc)
        const back = code.length + 6 - top
        if (back > 0xffff) fail('loop body too long')
        emit(OP.NEXT, idx, ...u16(n.to), ...u16(back)); emit(OP.LOAD, acc)
        locals -= 2; return
      }
    }
  }
  c(ast, new Map())
  emit(OP.END)
  if (maxDepth > BC_STACK) fail(`needs stack depth ${maxDepth}, the device VM has ${BC_STACK}`)
  if (data.length > 255) fail('more than 255 data keys')
  const keys = data.flatMap(k => [k.length, ...[...k].map(ch => ch.charCodeAt(0))])
  const out = Uint8Array.from([0x64, 0x76, BC_VERSION, maxLocals, maxDepth, data.length, ...keys, ...code])
  const { steps } = verifyBytecode(out)
  if (steps > BC_MAX_STEPS) fail(`${steps} steps per dot, the device budget is ${BC_MAX_STEPS}`)
  return out
}

interface Decoded { locals: number; stack: number; keys: string[]; start: number }
function header(b: Uint8Array): Decoded {
  if (b.length < 7 || b[0] !== 0x64 || b[1] !== 0x76) throw new IRError('bytecode: bad magic')
  if (b[2] !== BC_VERSION) throw new IRError(`bytecode: version ${b[2]}, want ${BC_VERSION}`)
  const keys: string[] = []
  let p = 6
  for (let i = 0; i < b[5]; i++) { const n = b[p++]; if (p + n > b.length) throw new IRError('bytecode: truncated key table'); keys.push(String.fromCharCode(...b.subarray(p, p + n))); p += n }
  return { locals: b[3], stack: b[4], keys, start: p }
}

/** Static check of a bytecode program (what `dv_verify` does on the device). Returns its info. */
export function verifyBytecode(b: Uint8Array): BytecodeInfo {
  const h = header(b), fail = (msg: string, at: number): never => { throw new IRError(`bytecode: ${msg} at byte ${at}`) }
  if (h.stack > BC_STACK) fail(`stack ${h.stack} > ${BC_STACK}`, 4)
  const at = new Map<number, number>()  // expected stack depth at jump targets
  let p = h.start, depth = 0, live = true, constants = 0, ended = false
  const starts = new Set<number>(), loopDepth = new Map<number, number>()
  while (p < b.length) {
    const op = b[p], n = OPERANDS.get(op)
    if (n === undefined) fail(`unknown opcode 0x${op.toString(16)}`, p)
    if (p + 1 + n! > b.length) fail('truncated operand', p)
    if (at.has(p)) { if (live && at.get(p) !== depth) fail('stack depth differs at a jump target', p); depth = at.get(p)!; live = true }
    if (!live) fail('unreachable code', p)
    starts.add(p)
    const [pop, push] = effect(op)
    if (depth < pop) fail('stack underflow', p)
    depth += push - pop
    if (depth > h.stack) fail('stack deeper than declared', p)
    const a = b[p + 1], w = (o: number) => b[p + o] | (b[p + o + 1] << 8)
    if (op === OP.PUSHF) constants++
    if ((op === OP.LOAD || op === OP.STORE) && a >= h.locals) fail('local slot out of range', p)
    if (op === OP.DATA && a >= h.keys.length) fail('data slot out of range', p)
    const next = p + 1 + n!
    if (op === OP.FOR) { if (a >= h.locals) fail('loop slot out of range', p); loopDepth.set(next, depth) }
    if (op === OP.JZ || op === OP.JMP) {
      const to = next + w(1)
      if (to >= b.length) fail('jump out of range', p)
      if (at.has(to) && at.get(to) !== depth) fail('stack depth differs at a jump target', p)
      at.set(to, depth)
      if (op === OP.JMP) live = false
    }
    if (op === OP.NEXT) {
      const to = next - w(4)
      if (a >= h.locals) fail('loop slot out of range', p)
      if (!starts.has(to) || to > p || b[to - 4] !== OP.FOR || b[to - 3] !== a) fail('loop target is not the instruction after its FOR', p)
      if (loopDepth.get(to) !== depth) fail('stack depth differs across a loop', p)
    }
    if (op === OP.END) { if (depth !== 0) fail('END needs exactly one value on the stack', p); ended = true; live = false }
    p = next
  }
  if (!ended) fail('missing END', b.length)
  return { bytes: b.length, code: b.length - h.start, constants, locals: h.locals, stack: h.stack, data: h.keys, steps: staticSteps(b, h.start) }
}

/** Worst-case executed instructions per dot (loops expanded by their bounds). */
function staticSteps(b: Uint8Array, start: number): number {
  const ends: { top: number; end: number; count: number }[] = []
  for (let p = start; p < b.length; p += 1 + OPERANDS.get(b[p])!) {
    if (b[p] === OP.NEXT) { const next = p + 6, top = next - (b[p + 4] | (b[p + 5] << 8)), to = b[p + 2] | (b[p + 3] << 8); ends.push({ top, end: next, count: to }) }
  }
  // FOR before each loop holds `from`; find it to get the iteration count
  for (const l of ends) { const f = l.top - 4; if (b[f] === OP.FOR) l.count -= b[f + 2] | (b[f + 3] << 8) }
  let steps = 0
  for (let p = start; p < b.length; p += 1 + OPERANDS.get(b[p])!) {
    let m = 1
    for (const l of ends) if (p >= l.top && p < l.end) m *= l.count
    steps += m
  }
  return steps
}

/** Size and shape of a compiled program. */
export const bytecodeInfo = (b: Uint8Array): BytecodeInfo => verifyBytecode(b)

// ── float32 VM ──
const F = Math.fround
const min = (x: number, y: number) => (y < x ? y : x), max = (x: number, y: number) => (x < y ? y : x)
const len = (x: number, y: number) => F(Math.sqrt(F(F(x * x) + F(y * y))))
const fn32: ((s: Float32Array, k: number) => number)[] = ([
  (a: number) => Math.sin(a), (a: number) => Math.cos(a), Math.abs, Math.floor, (a: number) => a - Math.floor(a), Math.sqrt, Math.exp,
  (a: number) => (a > 0 ? 1 : a < 0 ? -1 : 0),
  min, max, (e: number, x: number) => (x < e ? 0 : 1), Math.atan2, len, irMath.hash,
  (x: number, lo: number, hi: number) => min(max(x, lo), hi),
  (a: number, b: number, t: number) => F(F(a * F(1 - t)) + F(b * t)),
  (a: number, b: number, x: number) => { const t = min(max(F(F(x - a) / F(b - a)), 0), 1); return F(F(t * t) * F(3 - F(2 * t))) },
  (x: number, y: number, r: number) => len(x, y) - r,
  (x: number, y: number, hw: number, hh: number) => { const dx = F(Math.abs(x) - hw), dy = F(Math.abs(y) - hh); return F(len(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0)) },
  (x: number, y: number, r: number, w: number) => Math.abs(F(len(x, y) - r)) - w,
] as ((...a: number[]) => number)[]).map((f, i) => {
  const n = IR_FUNCTIONS[FNS[i]]
  return n === 1 ? (s, k) => f(s[k]) : n === 2 ? (s, k) => f(s[k], s[k + 1]) : n === 3 ? (s, k) => f(s[k], s[k + 1], s[k + 2]) : (s, k) => f(s[k], s[k + 1], s[k + 2], s[k + 3])
})

export interface BytecodeProgram {
  keys: string[]
  info: BytecodeInfo
  /** Raw (unclamped) float32 value at (u, v); `data` by key (missing = 0), pointer absent = (-1, -1, up). */
  run(u: number, v: number, t: number, data?: Readonly<Record<string, number>>, pointer?: { x: number; y: number; down?: boolean | number }): number
}

/** Verify once and return a reusable VM bound to `code`. */
export function loadBytecode(code: Uint8Array): BytecodeProgram {
  const info = verifyBytecode(code), h = header(code), b = code
  const stack = new Float32Array(Math.max(1, h.stack)), loc = new Float32Array(Math.max(1, h.locals)), dat = new Float32Array(Math.max(1, h.keys.length))
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const run: BytecodeProgram['run'] = (u, v, t, data, pointer) => {
    h.keys.forEach((k, i) => { const x = data && Object.prototype.hasOwnProperty.call(data, k) ? data[k] : 0; dat[i] = typeof x === 'number' ? x : 0 })
    const px = F(pointer ? pointer.x : -1), py = F(pointer ? pointer.y : -1), pd = pointer?.down ? 1 : 0
    let p = h.start, sp = 0, steps = 0
    const s = stack
    for (;;) {
      if (++steps > BC_MAX_STEPS) return NaN
      const op = b[p++]
      if (op >= OP.FN && op < OP.FN + FNS.length) {
        const n = IR_FUNCTIONS[FNS[op - OP.FN]]
        sp -= n; s[sp] = fn32[op - OP.FN](s, sp); sp++
        continue
      }
      switch (op) {
        case OP.END: return s[sp - 1]
        case OP.PUSHF: s[sp++] = dv.getFloat32(p, true); p += 4; break
        case OP.PUSHI: s[sp++] = (b[p++] << 24) >> 24; break
        case OP.U: s[sp++] = u; break
        case OP.V: s[sp++] = v; break
        case OP.T: s[sp++] = t; break
        case OP.PX: s[sp++] = px; break
        case OP.PY: s[sp++] = py; break
        case OP.PD: s[sp++] = pd; break
        case OP.DATA: s[sp++] = dat[b[p++]]; break
        case OP.LOAD: s[sp++] = loc[b[p++]]; break
        case OP.STORE: loc[b[p++]] = s[--sp]; break
        case OP.NEG: s[sp - 1] = -s[sp - 1]; break
        case OP.POWI: { const k = b[p++], a = s[sp - 1]; let r = k ? a : 1; for (let j = 1; j < k; j++) r = F(r * a); s[sp - 1] = r; break }
        case OP.JZ: { const off = b[p] | (b[p + 1] << 8); p += 2; if (s[--sp] === 0) p += off; break }
        case OP.JMP: p += 2 + (b[p] | (b[p + 1] << 8)); break
        case OP.FOR: loc[b[p]] = b[p + 1] | (b[p + 2] << 8); p += 3; break
        case OP.NEXT: {
          const i = b[p], to = b[p + 1] | (b[p + 2] << 8), back = b[p + 3] | (b[p + 4] << 8)
          p += 5; loc[i] = loc[i] + 1; if (loc[i] < to) p -= back
          break
        }
        default: {
          const y = s[--sp], x = s[sp - 1]
          switch (op) {
            case OP.ADD: s[sp - 1] = x + y; break
            case OP.SUB: s[sp - 1] = x - y; break
            case OP.MUL: s[sp - 1] = x * y; break
            case OP.DIV: s[sp - 1] = x / y; break
            case OP.MOD: s[sp - 1] = x - F(y * Math.floor(F(x / y))); break
            case OP.POW: s[sp - 1] = Math.pow(Math.abs(x), y); break
            case OP.LT: s[sp - 1] = x < y ? 1 : 0; break
            case OP.LE: s[sp - 1] = x <= y ? 1 : 0; break
            case OP.GT: s[sp - 1] = x > y ? 1 : 0; break
            case OP.GE: s[sp - 1] = x >= y ? 1 : 0; break
            case OP.EQ: s[sp - 1] = x === y ? 1 : 0; break
            case OP.NE: s[sp - 1] = x !== y ? 1 : 0; break
          }
        }
      }
    }
  }
  return { keys: h.keys, info, run }
}

const loaded = new WeakMap<Uint8Array, BytecodeProgram>()
/** Run `code` at one (u, v): the TS twin of `dv_eval`. Verified and cached per buffer. */
export function runBytecode(code: Uint8Array, u: number, v: number, t = 0, data?: Readonly<Record<string, number>>, pointer?: { x: number; y: number; down?: boolean | number }): number {
  let p = loaded.get(code)
  if (!p) loaded.set(code, (p = loadBytecode(code)))
  return p.run(u, v, t, data, pointer)
}
