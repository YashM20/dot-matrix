/**
 * Deterministic scalar math: the same bits in every JS engine (V8, JSC, SpiderMonkey) and on every run.
 *
 * Rule: only `+ − × /`, `Math.floor/round/trunc/abs/min/max/sqrt/imul/fround`, comparisons, table reads and
 * typed-array bit views (a pure copy of the IEEE-754 bits).
 * ECMAScript implements those as correctly rounded IEEE-754 doubles with no FMA contraction, so they agree
 * everywhere; `Math.sin`, `Math.exp`, `Math.pow`, `Math.atan2`, `Math.hypot`, … are only "implementation-approximated"
 * and differ between engines (20k `Math.sin` outputs hash differently under V8 and JSC). Anything a deterministic
 * step needs (a sim, a seeded layout, a golden) comes from here; tracks never write their own helpers.
 * `scripts/noise.ts` holds the accuracy gates and the FNV hashes (`goldens/noise.json`) that pin the bits.
 */
import { mulberry32 } from '../sampler/jitter'

export const TAU = Math.PI * 2
const INV_TAU = 1 / TAU
/** sin(x) to ~2e-7 from +, ×, round only (bit-identical in every engine). Moved verbatim from algo/attractor.ts. */
export function dsin(x: number): number {
  // reduce to [-π, π], then fold to [-π/2, π/2] (sin(π - x) = sin x)
  x -= Math.round(x * INV_TAU) * TAU
  if (x > Math.PI / 2) x = Math.PI - x
  else if (x < -Math.PI / 2) x = -Math.PI - x
  const x2 = x * x
  // Taylor to x^13 on [-π/2, π/2]: truncation error < 6e-8
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800))))))
}
export const dcos = (x: number) => dsin(x + Math.PI / 2)

/**
 * Table sine for hot loops: 4096 `dsin` samples per turn + linear interpolation (error < 3e-7), built once.
 * As deterministic as `dsin` (floor, ×, +, table reads) and ~4× cheaper; the orbit only needs determinism.
 */
const LUT_N = 4096, LUT_K = LUT_N / TAU
let lut: Float64Array | undefined
export function tsin(x: number): number {
  const t = lut ?? (lut = Float64Array.from({ length: LUT_N + 1 }, (_, i) => dsin((i / LUT_N) * TAU)))
  const f = x * LUT_K, i = Math.floor(f), j = i & (LUT_N - 1), a = t[j]
  return a + (t[j + 1] - a) * (f - i)
}
export const tcos = (x: number) => tsin(x + Math.PI / 2)

const HALF_PI = Math.PI / 2, QUARTER_PI = Math.PI / 4
/** tan(π/8) = √2 − 1: above it, atan(a) = π/4 + atan((a − 1)/(a + 1)) keeps the series argument ≤ 0.4142. */
const TAN_PI_8 = Math.SQRT2 - 1
/**
 * atan2(y, x) in (−π, π], max error ≤ 1e-9 rad, bit-identical across engines.
 * Octant reduction (a = min/max ∈ [0, 1]), then a > tan(π/8) → (a − 1)/(a + 1) + π/4, then the odd
 * Taylor series to x¹⁹ on |a| ≤ 0.4142 (truncation < 5e-9). datan2(0, 0) = 0; signed zeros are
 * ignored (datan2(−0, −1) = π, where Math.atan2 gives −π); NaN in → NaN out. Two infinities read as the diagonal.
 */
export function datan2(y: number, x: number): number {
  if (y !== y || x !== x) return NaN
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y
  if (ay === 0 && ax === 0) return 0
  const swap = ay > ax
  let a = ax === ay ? 1 : swap ? ax / ay : ay / ax, off = 0
  if (a > TAN_PI_8) { a = (a - 1) / (a + 1); off = QUARTER_PI }
  const a2 = a * a
  let r = off + a * (1 + a2 * (-1 / 3 + a2 * (1 / 5 + a2 * (-1 / 7 + a2 * (1 / 9 + a2 * (-1 / 11 + a2 * (1 / 13 + a2 * (-1 / 15 + a2 * (1 / 17 + a2 * (-1 / 19))))))))))
  if (swap) r = HALF_PI - r
  if (x < 0) r = Math.PI - r
  return y < 0 ? -r : r
}

// ── exp / log / pow ─────────────────────────────────────────────────────────────────────────────────
/** ln 2 split so k·LN2_HI is exact for |k| < 2¹¹ (fdlibm's constants: LN2_HI has 21 trailing zero bits). */
const LN2_HI = 6.93147180369123816490e-1, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700
/** 2^k for k ∈ [−P2_MAX, P2_MAX], built by exact doubling/halving (powers of two are exact). */
const P2_MAX = 540
let p2: Float64Array | undefined
function pow2Table(): Float64Array {
  if (p2) return p2
  const t = new Float64Array(2 * P2_MAX + 1)
  t[P2_MAX] = 1
  for (let k = 1; k <= P2_MAX; k++) { t[P2_MAX + k] = t[P2_MAX + k - 1] * 2; t[P2_MAX - k] = t[P2_MAX - k + 1] * .5 }
  return (p2 = t)
}
/** Taylor coefficients 1/k! for k = 0…13 (each a correctly rounded division). */
const E2 = 1 / 2, E3 = 1 / 6, E4 = 1 / 24, E5 = 1 / 120, E6 = 1 / 720, E7 = 1 / 5040, E8 = 1 / 40320, E9 = 1 / 362880,
  E10 = 1 / 3628800, E11 = 1 / 39916800, E12 = 1 / 479001600, E13 = 1 / 6227020800
/**
 * e^x, relative error ≤ 1e-13 on [−708, 709], bit-identical across engines.
 * Cody–Waite reduction x = k·ln2 + r (k = round(x / ln2), ln2 split hi/lo so k·ln2_hi is exact), |r| ≤ ln2/2,
 * then a degree-13 Taylor polynomial in Horner form (truncation < 1e-16), then × 2^k built by exact
 * multiplication (powers of two are exact). dexp(0) = 1 exactly; x > 709.78 → Infinity; x < −745.1 → 0; NaN → NaN.
 * Uses: damping exp(−dt/τ) in sims, Lenia growth kernels, falloffs inside deterministic steps.
 */
export function dexp(x: number): number {
  if (x !== x) return NaN
  if (x > 709.782712893384) return Infinity
  if (x < -745.1332191019412) return 0
  const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO
  const p = 1 + r * (1 + r * (E2 + r * (E3 + r * (E4 + r * (E5 + r * (E6 + r * (E7 + r * (E8 + r * (E9 + r * (E10 + r * (E11 + r * (E12 + r * E13))))))))))))
  // 2^k as two exact factors (k ∈ [−1075, 1024]): p·2^k1 stays normal, so the only rounding is the last product
  const t = p2 ?? pow2Table(), k1 = k >> 1
  return p * t[P2_MAX + k1] * t[P2_MAX + k - k1]
}

const SQRT2 = Math.SQRT2
/**
 * The exponent/mantissa split reads the IEEE-754 bits through a typed-array view (a pure bit copy, the same
 * in every engine): x = m·2^e with m ∈ [1, 2), exactly what dividing by 2 until m < 2 would give, without the loop.
 */
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer), HI = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 1 : 0
/** ln x for finite x > 0 (private: dpow's log). Exact split to m ∈ [√½, √2], then 2·atanh((m−1)/(m+1)) to s²¹. */
function dlog(x: number): number {
  F64[0] = x
  let hi = U32[HI], e = (hi >>> 20) - 1023
  if (e === -1023) { F64[0] = x * 18446744073709551616; hi = U32[HI]; e = (hi >>> 20) - 1087 } // subnormal: × 2^64 first
  U32[HI] = (hi & 0x000fffff) | 0x3ff00000
  let m = F64[0]
  if (m > SQRT2) { m *= .5; e++ }
  const s = (m - 1) / (m + 1), s2 = s * s
  const lnm = 2 * s * (1 + s2 * (1 / 3 + s2 * (1 / 5 + s2 * (1 / 7 + s2 * (1 / 9 + s2 * (1 / 11 + s2 * (1 / 13 + s2 * (1 / 15 + s2 * (1 / 17 + s2 * (1 / 19 + s2 / 21))))))))))
  return e * LN2_HI + (e * LN2_LO + lnm)
}

/**
 * x^y, bit-identical across engines.
 *  - Integer y with |y| ≤ 64: plain repeated multiplication x·x·…·x (same op order every call, so
 *    dpow(x, 2) === x * x and dpow(x, 3) === x * x * x; 1/x^|y| for y < 0).
 *  - Otherwise x > 0: dexp(y · dlog(x)), with a private dlog: mantissa/exponent split read from the IEEE bits (exact),
 *    m ∈ [√½, √2], ln m = 2·atanh(s), s = (m − 1)/(m + 1), odd series to s²¹ (|s| ≤ 0.1716, truncation < 1e-18).
 *  - Accuracy: relative error ≤ 1e-12 when |y·ln x| ≤ 50; ≤ 1e-9 over the whole normal range
 *    (both far inside X-advanced's < 1e-7 bar).
 *  - Edges: dpow(x, 0) = 1 (also for NaN x, as Math.pow); dpow(0, y > 0) = 0; dpow(0, y < 0) = Infinity;
 *    x < 0 with non-integer y → NaN; x < 0 with integer y → sign by parity; NaN → NaN.
 * Uses: specular lobes pow(n·h, shininess) in deterministic steps, superellipse tests in sims, growth curves.
 */
export function dpow(x: number, y: number): number {
  if (y === 0) return 1
  if (x !== x || y !== y) return NaN
  const int = Math.floor(y) === y
  if (int && y <= 64 && y >= -64) {
    const n = y < 0 ? -y : y
    let r = x
    for (let i = 1; i < n; i++) r *= x
    return y < 0 ? 1 / r : r
  }
  if (x === 0) return y > 0 ? 0 : Infinity
  if (x < 0) {
    if (!int) return NaN
    const odd = Math.floor(y * .5) * 2 !== y, r = powPos(-x, y)
    return odd ? -r : r
  }
  return powPos(x, y)
}
const powPos = (x: number, y: number) => (x === Infinity ? (y > 0 ? Infinity : 0) : dexp(y * dlog(x)))

// ── hashing and seeded streams ─────────────────────────────────────────────────────────────────────
/** murmur3 finaliser (as math.ts): full avalanche on 32 bits. */
function fmix32(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
/**
 * Integer lattice hash → uint32: h = imul(a, 0x8da6b343) ^ imul(b, 0xd8163841) ^ imul(c, 0xcb1ab31f),
 * then the murmur3 finaliser (as math.ts:17-21). Inputs are taken as int32 (`| 0`). Use it for lattice
 * cells, entity ids and step counters over the full 32-bit range. `hash32` (math.ts) is for
 * fractional inputs: it scales by 256, so integers alias past ±2²³.
 * Mirrored exactly by GLSL `uint` ops (noise/glsl.ts).
 */
export function ihash(a: number, b = 0, c = 0): number {
  return fmix32(Math.imul(a | 0, 0x8da6b343) ^ Math.imul(b | 0, 0xd8163841) ^ Math.imul(c | 0, 0xcb1ab31f))
}
/** A seeded stream in [0, 1) per entity and step: mulberry32(ihash(seed, id, step)) (mulberry32: sampler/jitter.ts). */
export function rngFor(seed: number, id: number, step = 0): () => number {
  return mulberry32(ihash(seed, id, step))
}
