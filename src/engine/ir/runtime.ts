/**
 * Field IR runtime semantics on the CPU — the builtins both JS backends call. They follow GLSL ES
 * 3.0 where GLSL defines a result (`%` is GLSL `mod`, floored; `min`/`max`/`clamp`/`step` use the
 * spec formulas) and the engine's own helpers elsewhere (`mix`, `smoothstep`, `len`, `hash32`).
 * `scripts/ir.ts` checks them against an independent GLSL-spec interpreter (`reference.ts`).
 */
import { hash32, len, mix, smoothstep } from '../math'
import type { FnName } from './ast'

/** Exponents written as an integer literal 0…8 are expanded to multiplications (sign-preserving). */
export const smallPow = (b: { k: string; v?: number }) => (b.k === 'num' && Number.isInteger(b.v) && b.v! >= 0 && b.v! <= 8 ? b.v! : -1)

export const irMath: Record<FnName | 'mod' | 'pow', (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, abs: Math.abs, floor: Math.floor, sqrt: Math.sqrt, exp: Math.exp, sign: Math.sign,
  fract: x => x - Math.floor(x),
  min: (a, b) => (b < a ? b : a),
  max: (a, b) => (a < b ? b : a),
  step: (edge, x) => (x < edge ? 0 : 1),
  atan: Math.atan2,
  length: len,
  /** uint32 murmur hash of the 1/256 fixed-point inputs, top 24 bits → [0, 1) (exact in float32). */
  hash: (a, b) => (hash32(a, b) >>> 8) / 16777216,
  clamp: (x, lo, hi) => { const m = x < lo ? lo : x; return hi < m ? hi : m },
  mix,
  smoothstep,
  sdCircle: (x, y, r) => len(x, y) - r,
  sdBox: (x, y, hw, hh) => { const dx = Math.abs(x) - hw, dy = Math.abs(y) - hh; return len(dx > 0 ? dx : 0, dy > 0 ? dy : 0) + Math.min(dx > dy ? dx : dy, 0) },
  sdRing: (x, y, r, w) => Math.abs(len(x, y) - r) - w,
  /** GLSL `mod`: x - y·floor(x/y) (sign of y), not JS `%`. */
  mod: (a, b) => a - b * Math.floor(a / b),
  /** GLSL `pow` is undefined for a negative base; the IR defines `a ^ b` as pow(|a|, b). */
  pow: (a, b) => Math.pow(Math.abs(a), b),
}
