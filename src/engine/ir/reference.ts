/**
 * Reference interpreter for the Field IR, written from the GLSL ES 3.0 spec formulas rather than
 * the engine helpers: `mod(x,y) = x − y·floor(x/y)`, `fract(x) = x − floor(x)`,
 * `mix(x,y,a) = x·(1−a) + y·a`, `smoothstep` = clamp-then-Hermite, `clamp = min(max(x,lo),hi)`,
 * `min(x,y) = y < x ? y : x`, `step(e,x) = x < e ? 0 : 1`, hash = the uint ops of the GLSL helper.
 * It walks the AST directly (no compilation) and is the oracle the JS backends are tested
 * against until real GPU parity lands (P5). `f32: true` rounds every value to float32, a rough
 * stand-in for `highp` drift (informational only: GPU transcendentals are not correctly rounded).
 */
import type { Node } from './ast'
import type { IREnv } from './compile'

interface Scope { name: string; value: number; up: Scope | null }
const lookup = (s: Scope | null, name: string): number => { for (; s; s = s.up) if (s.name === name) return s.value; throw new Error(`unbound ${name}`) }

/** GLSL `uint` multiply/xor/shift on JS numbers. */
const u32 = (x: number) => x >>> 0
const umul = (a: number, b: number) => u32(Math.imul(a, b))
const fmix = (h: number) => { h = u32(h ^ (h >>> 16)); h = umul(h, 0x85ebca6b); h = u32(h ^ (h >>> 13)); h = umul(h, 0xc2b2ae35); return u32(h ^ (h >>> 16)) }
const fixed = (x: number) => (Number.isNaN(x) || !Number.isFinite(x) ? 0 : u32(Math.floor(x * 256 + .5) | 0))

/** The reference value of `ast` at one (u, v). */
export const reference = (ast: Node, env: IREnv, u: number, v: number, opts: { f32?: boolean } = {}): number => referenceField(ast, env, opts)(u, v)

/** The reference interpreter bound to one frame's inputs: (u, v) → raw value. */
export function referenceField(ast: Node, env: IREnv, opts: { f32?: boolean } = {}): (u: number, v: number) => number {
  const F = opts.f32 ? Math.fround : (x: number) => x
  const p = env.pointer
  const input = { u: 0, v: 0, t: F(env.t ?? 0), 'pointer.x': F(p ? p.x : -1), 'pointer.y': F(p ? p.y : -1), 'pointer.down': p?.down ? 1 : 0 }
  const datum = (key: string) => { const d = env.data; const x = d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : 0; return F(typeof x === 'number' ? x : 0) }
  const min = (x: number, y: number) => (y < x ? y : x), max = (x: number, y: number) => (x < y ? y : x)
  const clamp = (x: number, lo: number, hi: number) => min(max(x, lo), hi)
  const length = (x: number, y: number) => F(Math.sqrt(F(F(x * x) + F(y * y))))
  const fn = (name: string, a: number[]): number => {
    switch (name) {
      case 'sin': return Math.sin(a[0])
      case 'cos': return Math.cos(a[0])
      case 'abs': return Math.abs(a[0])
      case 'floor': return Math.floor(a[0])
      case 'fract': return a[0] - Math.floor(a[0])
      case 'sqrt': return Math.sqrt(a[0])
      case 'exp': return Math.exp(a[0])
      case 'sign': return a[0] > 0 ? 1 : a[0] < 0 ? -1 : 0
      case 'min': return min(a[0], a[1])
      case 'max': return max(a[0], a[1])
      case 'step': return a[1] < a[0] ? 0 : 1
      case 'atan': return Math.atan2(a[0], a[1])
      case 'length': return length(a[0], a[1])
      case 'clamp': return clamp(a[0], a[1], a[2])
      case 'mix': return F(F(a[0] * F(1 - a[2])) + F(a[1] * a[2]))
      case 'smoothstep': { const t = clamp(F(F(a[2] - a[0]) / F(a[1] - a[0])), 0, 1); return F(F(t * t) * F(3 - F(2 * t))) }
      case 'sdCircle': return length(a[0], a[1]) - a[2]
      case 'sdRing': return Math.abs(F(length(a[0], a[1]) - a[2])) - a[3]
      case 'sdBox': {
        const dx = F(Math.abs(a[0]) - a[2]), dy = F(Math.abs(a[1]) - a[3])
        return F(length(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0))
      }
      case 'hash': {
        let h = fmix(u32(fixed(a[0]) + 0x9e3779b9))
        h = fmix(u32((h ^ fixed(a[1])) + 0x7f4a7c15))
        h = fmix(u32(h + 0x165667b1))
        return (h >>> 8) * (1 / 16777216)
      }
    }
    throw new Error(`no builtin ${name}`)
  }
  const ev = (n: Node, s: Scope | null): number => {
    switch (n.k) {
      case 'num': return F(n.v)
      case 'in': return input[n.name]
      case 'data': return datum(n.key)
      case 'ref': return lookup(s, n.name)
      case 'neg': return -ev(n.a, s)
      case 'cond': { const c = ev(n.c, s), a = ev(n.a, s), b = ev(n.b, s); return c !== 0 ? a : b }
      case 'call': return F(fn(n.fn, n.args.map(a => ev(a, s))))
      case 'let': return ev(n.body, { name: n.name, value: ev(n.value, s), up: s })
      case 'for': {
        let acc = ev(n.init, s)
        for (let i = n.from; i < n.to; i++) acc = ev(n.body, { name: n.acc, value: acc, up: { name: n.i, value: F(i), up: s } })
        return acc
      }
      case 'bin': {
        const a = ev(n.a, s), b = ev(n.b, s)
        switch (n.op) {
          case '+': return F(a + b)
          case '-': return F(a - b)
          case '*': return F(a * b)
          case '/': return F(a / b)
          case '%': return F(a - F(b * Math.floor(F(a / b))))
          case '^': {
            if (n.b.k === 'num' && Number.isInteger(n.b.v) && n.b.v >= 0 && n.b.v <= 8) { let r = n.b.v ? a : 1; for (let j = 1; j < n.b.v; j++) r = F(r * a); return r }
            return F(Math.pow(Math.abs(a), b))
          }
          case '<': return a < b ? 1 : 0
          case '<=': return a <= b ? 1 : 0
          case '>': return a > b ? 1 : 0
          case '>=': return a >= b ? 1 : 0
          case '==': return a === b ? 1 : 0
          case '!=': return a !== b ? 1 : 0
        }
      }
    }
    throw new Error('bad node')
  }
  return (u, v) => { input.u = F(u); input.v = F(v); return ev(ast, null) }
}
