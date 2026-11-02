/**
 * Checks for the shaping pack (`src/engine/shape`, #64, docs/IQ-PLAN.md IQ3): every ported remap, smoothstep and
 * sigmoid against reference values at known points (from the articles or worked by hand), every inverse round trip
 * over a sweep, every derivative (and the integral smoothstep's slope) against a central finite difference, and the
 * 0 / 1 endpoints, symmetry and monotonicity where the articles state them.
 * Exported as `shapeChecks(assert)`; also runnable alone: `npx tsx scripts/shape.ts`.
 */
import type { Assert } from './lib/check'
import { smoothstep } from '../src/engine/math'
import {
  almostIdentity, almostUnitIdentity, cubicPulse, doubleBump, expImpulse, expStep, gain, integralSmoothstep, parabola,
  pcurve, polyImpulse, quaImpulse, rationalBump, sincImpulse, smoothAbs, smoothAbsPoly, sustainedImpulse, tone,
  truncFalloff,
  SMOOTHSTEPS, smoothstepCubic, smoothstepCubicInv, smoothstepCubicRational, smoothstepPiecewise, smoothstepPiecewiseInv,
  smoothstepPiecewiseQuadratic, smoothstepQuadRational, smoothstepQuartic, smoothstepQuintic, smoothstepRational,
  smoothstepRationalInv, smoothstepTrig,
  SIGMOIDS, sigmoidS1, sigmoidS2, sigmoidS3, sigmoidT1, sigmoidTanh, sigmoidTrig,
} from '../src/engine/shape'

type F = (x: number) => number
const sweep = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n)
const maxErr = (xs: number[], err: F) => xs.reduce((m, x) => Math.max(m, Math.abs(err(x))), 0)
/** Central difference, h = 1e-5. */
const fd = (f: F, x: number, h = 1e-5) => (f(x + h) - f(x - h)) / (2 * h)
/** Second central difference. */
const fd2 = (f: F, x: number, h = 1e-4) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)
const monotone = (f: F, xs: number[], dir = 1) => xs.every((x, i) => i === 0 || dir * (f(x) - f(xs[i - 1])) > 0)
const near = (a: number, b: number, eps = 1e-12) => Math.abs(a - b) <= eps
const e = (x: number) => x.toExponential(1)
const UNIT = sweep(0, 1, 64)

function remapChecks(assert: Assert): void {
  const almost = (x: number) => almostIdentity(x, 0.4, 0.1)
  assert('shape: almostIdentity is n at 0, identity above m, joins x at m with slope 1',
    near(almost(0), 0.1) && almost(0.7) === 0.7 && near(almost(0.4), 0.4) && Math.abs(fd(almost, 0.4 - 1e-4) - 1) < 1e-3 && almost(0.2) > 0.1,
    `f(0) ${almost(0)}, f(m) ${almost(0.4)}, slope below m ${fd(almost, 0.4 - 1e-4).toFixed(5)}`)
  assert('shape: almostIdentity with n = 0, m = 1 is almostUnitIdentity',
    maxErr(UNIT, x => almostIdentity(x, 1, 0) - almostUnitIdentity(x)) < 1e-15)
  assert('shape: smoothAbsPoly is n/2 at 0, n at ±n, |x| outside, C1 at the joins',
    near(smoothAbsPoly(0, 0.4), 0.2) && near(smoothAbsPoly(0.4, 0.4), 0.4) && near(smoothAbsPoly(-0.4, 0.4), 0.4) &&
      smoothAbsPoly(-1.5, 0.4) === 1.5 && Math.abs(fd(x => smoothAbsPoly(x, 0.4), 0.4) - 1) < 1e-4,
    `slope at n ${fd(x => smoothAbsPoly(x, 0.4), 0.4).toFixed(6)}`)
  assert('shape: smoothAbs is sqrt(x² + n²) (3, 4 → 5; 0 → n; even)',
    smoothAbs(3, 4) === 5 && smoothAbs(0, 0.3) === 0.3 && smoothAbs(-2, 0.5) === smoothAbs(2, 0.5))

  const T = 2, ist = (x: number) => integralSmoothstep(x, T)
  assert('shape: integralSmoothstep reference values (x = 1, T = 2 → 0.1875; T → T/2; x − T/2 beyond)',
    near(ist(1), 0.1875) && near(ist(T), T / 2) && ist(5) === 4 && ist(0) === 0, `${ist(1)}, ${ist(T)}, ${ist(5)}`)
  const slopeErr = maxErr(sweep(0.01, 4, 200), x => fd(ist, x) - (x < T ? smoothstepCubic(x / T) : 1))
  assert('shape: integralSmoothstep slope = smoothstep(0, T, x) (finite difference), never above 1',
    slopeErr < 1e-8 && sweep(0, 6, 300).every(x => fd(ist, x) <= 1 + 1e-9), `max err ${e(slopeErr)}`)
  const pos = (t: number) => t >= T ? t - 0.5 * T : (t / T) ** 3 * (T - t * 0.5) // the smoothstepintegral article's form
  assert('shape: integralSmoothstep matches the smoothstepintegral article\'s position(t, T)',
    maxErr(sweep(0, 5, 100), x => ist(x) - pos(x)) < 1e-14)

  for (const k of [2, 8, 32]) {
    const xs = sweep(0, 4, 400)
    assert(`shape: expImpulse k=${k} peaks at exactly 1 at x = 1/k, 0 at 0`,
      near(expImpulse(1 / k, k), 1) && expImpulse(0, k) === 0 && xs.every(x => expImpulse(x, k) <= 1 + 1e-15))
    const xq = Math.sqrt(1 / k)
    assert(`shape: quaImpulse k=${k} peaks at 1 at x = sqrt(1/k)`,
      near(quaImpulse(xq, k), 1) && xs.every(x => quaImpulse(x, k) <= 1 + 1e-15) && Math.abs(fd(x => quaImpulse(x, k), xq)) < 1e-6)
    for (const n of [2, 3, 5]) {
      const xp = Math.pow(k * (n - 1), -1 / n)
      assert(`shape: polyImpulse k=${k} n=${n} peaks at 1 at x = [k(n−1)]^(−1/n)`,
        near(polyImpulse(xp, k, n), 1, 1e-12) && xs.every(x => polyImpulse(x, k, n) <= 1 + 1e-12) && Math.abs(fd(x => polyImpulse(x, k, n), xp)) < 1e-5)
    }
  }
  assert('shape: polyImpulse with n = 2 is quaImpulse', maxErr(sweep(0, 3, 90), x => polyImpulse(x, 8, 2) - quaImpulse(x, 8)) < 1e-14)
  assert('shape: sustainedImpulse is 0 at 0, 1 at x = f, settles back to 1',
    sustainedImpulse(0, 0.4, 8) === 0 && near(sustainedImpulse(0.4, 0.4, 8), 1) && near(sustainedImpulse(20, 0.4, 8), 1, 1e-9) &&
      near(sustainedImpulse(0.2, 0.4, 8), 0.25) && sustainedImpulse(0.6, 0.4, 8) > 1)
  assert('shape: sincImpulse is 1 at x = 1/k, ~0 at 0 and at the integer zeros, max 1',
    [2, 4, 8].every(k => sincImpulse(1 / k, k) === 1 && Math.abs(sincImpulse(0, k)) < 1e-15 && Math.abs(sincImpulse(2 / k, k)) < 1e-15 &&
      sweep(0, 2, 400).every(x => sincImpulse(x, k) <= 1)))
  assert('shape: truncFalloff is 1 at 0, ¼ at m/2, 0 from m on, decreasing',
    truncFalloff(0, 2) === 1 && truncFalloff(1, 2) === 0.25 && truncFalloff(2, 2) === 0 && truncFalloff(3, 2) === 0 &&
      monotone(x => truncFalloff(x, 2), sweep(0, 2, 64), -1))

  assert('shape: almostUnitIdentity keeps 0 and 1, slope 0 at 0 and 1 at 1, increasing',
    almostUnitIdentity(0) === 0 && almostUnitIdentity(1) === 1 && Math.abs(fd(almostUnitIdentity, 0)) < 1e-9 &&
      Math.abs(fd(almostUnitIdentity, 1) - 1) < 1e-9 && monotone(almostUnitIdentity, UNIT) && almostUnitIdentity(0.5) === 0.375)
  for (const k of [0.25, 0.5, 2, 5]) {
    const g = (x: number) => gain(x, k)
    assert(`shape: gain k=${k} keeps 0, ½, 1, increases, and gain(·, 1/k) inverts it`,
      g(0) === 0 && g(0.5) === 0.5 && g(1) === 1 && monotone(g, UNIT) && maxErr(UNIT, x => gain(g(x), 1 / k) - x) < 1e-12)
  }
  assert('shape: gain reference values (k = 1 identity; 0.25, k = 2 → 0.125)',
    maxErr(UNIT, x => gain(x, 1) - x) < 1e-15 && near(gain(0.25, 2), 0.125) && near(gain(0.75, 2), 0.875))
  assert('shape: parabola is 0 at the ends, 1 in the middle (0.25, k = 1 → 0.75; k = 2 → 0.5625)',
    parabola(0, 2) === 0 && parabola(1, 2) === 0 && parabola(0.5, 3) === 1 && near(parabola(0.25, 1), 0.75) && near(parabola(0.25, 2), 0.5625))
  for (const [a, b] of [[1, 4], [2, 4], [4, 0.5], [3, 3]]) {
    const c = a / (a + b)
    assert(`shape: pcurve a=${a} b=${b} is 0 at the ends and peaks at 1 at a/(a+b)`,
      pcurve(0, a, b) === 0 && pcurve(1, a, b) === 0 && near(pcurve(c, a, b), 1, 1e-12) && UNIT.every(x => pcurve(x, a, b) <= 1 + 1e-12))
  }
  assert('shape: pcurve with a = b = 1 is parabola(·, 1)', maxErr(UNIT, x => pcurve(x, 1, 1) - parabola(x, 1)) < 1e-15)
  for (const k of [-0.5, 0, 2, 8]) {
    assert(`shape: tone k=${k} keeps 0 and 1 and increases`,
      tone(0, k) === 0 && near(tone(1, k), 1) && monotone(x => tone(x, k), UNIT))
  }
  assert('shape: tone(0.5, 1) = 2/3, tone(·, 0) is identity', near(tone(0.5, 1), 2 / 3) && maxErr(UNIT, x => tone(x, 0) - x) === 0)

  const c = 0.3, w = 0.5
  assert('shape: cubicPulse is 1 at c, 0 at and beyond c ± w',
    cubicPulse(c, c, w) === 1 && cubicPulse(c + w, c, w) === 0 && cubicPulse(c - w, c, w) === 0 && cubicPulse(2, c, w) === 0)
  assert('shape: cubicPulse = smoothstep(c−w, c, x) − smoothstep(c, c+w, x) (the article\'s stated equivalent)',
    maxErr(sweep(-1, 1.5, 250), x => cubicPulse(x, c, w) - (smoothstep(c - w, c, x) - smoothstep(c, c + w, x))) < 1e-14)
  assert('shape: rationalBump is 1 at 0, ½ at x = 1/√k, positive everywhere',
    rationalBump(0, 4) === 1 && near(rationalBump(0.5, 4), 0.5) && rationalBump(1e3, 4) > 0)
  for (const k of [2, 4, 8]) {
    const xp = Math.pow(k - 1, -1 / k), norm = k / Math.pow(k - 1, 1 - 1 / k)
    assert(`shape: doubleBump k=${k} has slope 1 at 0, is odd, and the article's factor makes its peak 1`,
      Math.abs(fd(x => doubleBump(x, k), 0) - 1) < 1e-6 && near(doubleBump(-0.7, k), -doubleBump(0.7, k)) &&
        near(doubleBump(xp, k) * norm, 1, 1e-12) && Math.abs(fd(x => doubleBump(x, k), xp)) < 1e-5)
  }
  for (const k of [1, 2, 8]) {
    assert(`shape: expStep k=${k} is 1 at 0, ½ at 1, decreasing`,
      expStep(0, k) === 1 && expStep(1, k) === 0.5 && monotone(x => expStep(x, k), sweep(0, 1.5, 60), -1))
  }
}

function smoothstepChecks(assert: Assert): void {
  const refs: [string, F, number, number][] = [
    ['cubic', smoothstepCubic, 0.25, 0.15625], ['quartic', smoothstepQuartic, 0.5, 0.4375],
    ['quintic', smoothstepQuintic, 0.25, 0.103515625], ['quadRational', smoothstepQuadRational, 0.25, 0.1],
    ['cubicRational', smoothstepCubicRational, 0.25, 1 / 28], ['piecewiseQuadratic', smoothstepPiecewiseQuadratic, 0.25, 0.125],
    ['trig', smoothstepTrig, 1 / 3, 0.25],
  ]
  for (const [name, f, x, y] of refs) assert(`shape: smoothstep ${name} reference value f(${x.toFixed(3)}) = ${y.toFixed(6)}`, near(f(x), y, 1e-14), `${f(x)}`)

  for (const [name, v] of Object.entries(SMOOTHSTEPS)) {
    const { f, inv } = v
    assert(`shape: smoothstep ${name} keeps 0 and 1, slope 0 at both ends, increasing`,
      f(0) === 0 && near(f(1), 1, 1e-15) && Math.abs(fd(f, 1e-5)) < 1e-4 && Math.abs(fd(f, 1 - 1e-5)) < 1e-4 && monotone(f, UNIT))
    if (v.symmetric) assert(`shape: smoothstep ${name} is symmetric, f(1 − x) = 1 − f(x)`, maxErr(UNIT, x => f(1 - x) - (1 - f(x))) < 1e-14)
    if (v.continuity >= 2) {
      const d2 = Math.max(Math.abs(fd2(f, 1e-4)), Math.abs(fd2(f, 1 - 1e-4)))
      assert(`shape: smoothstep ${name} is C2 (second derivative ~0 at both ends)`, d2 < 1e-2, `|f''| ${e(d2)}`)
    }
    if (!inv) continue
    const a = maxErr(UNIT, x => inv(f(x)) - x), b = maxErr(UNIT, y => f(inv(y)) - y)
    assert(`shape: smoothstep ${name} inverse round-trips both ways`, a < 1e-9 && b < 1e-12, `inv∘f ${e(a)}, f∘inv ${e(b)}`)
    assert(`shape: smoothstep ${name} inverse keeps 0 and 1${v.symmetric ? ', and ½' : ''}`,
      near(inv(0), 0, 1e-15) && near(inv(1), 1, 1e-15) && (!v.symmetric || near(inv(0.5), 0.5, 1e-15)))
  }
  assert('shape: inverse cubic smoothstep (ismoothstep closed form) reference values',
    near(smoothstepCubicInv(0.15625), 0.25, 1e-15) && near(smoothstepCubicInv(0.84375), 0.75, 1e-15))

  for (const n of [1.5, 2, 3, 5]) {
    const f = (x: number) => smoothstepRational(x, n), inv = (y: number) => smoothstepRationalInv(y, n)
    assert(`shape: smoothstepRational n=${n} keeps 0, ½, 1, increases, and its inverse round-trips`,
      f(0) === 0 && f(1) === 1 && near(f(0.5), 0.5) && monotone(f, UNIT) && maxErr(UNIT, x => inv(f(x)) - x) < 1e-6 && maxErr(UNIT, y => f(inv(y)) - y) < 1e-12)
    const p = (x: number) => smoothstepPiecewise(x, n), pinv = (y: number) => smoothstepPiecewiseInv(y, n)
    assert(`shape: smoothstepPiecewise n=${n} keeps 0, ½, 1, equals gain(·, n), and its inverse round-trips`,
      p(0) === 0 && p(1) === 1 && p(0.5) === 0.5 && maxErr(UNIT, x => p(x) - gain(x, n)) < 1e-15 && maxErr(UNIT, x => pinv(p(x)) - x) < 1e-6 && maxErr(UNIT, y => p(pinv(y)) - y) < 1e-12)
  }
  assert('shape: smoothstepRational n = 2 and 3 are the quadratic and cubic rationals',
    maxErr(UNIT, x => smoothstepRational(x, 2) - smoothstepQuadRational(x)) < 1e-15 && maxErr(UNIT, x => smoothstepRational(x, 3) - smoothstepCubicRational(x)) < 1e-15)
  assert('shape: smoothstepPiecewise n = 2 is the piecewise quadratic', maxErr(UNIT, x => smoothstepPiecewise(x, 2) - smoothstepPiecewiseQuadratic(x)) < 1e-15)
}

function sigmoidChecks(assert: Assert): void {
  // Reference values at x = 1, worked by hand from the article's formulas.
  const at1: [string, F, number][] = [
    ['trig', sigmoidTrig, 0.6390929], ['tanh', sigmoidTanh, 0.7615942], ['s1', sigmoidS1, 0.5],
    ['s2', sigmoidS2, Math.SQRT1_2], ['s3', sigmoidS3, 0.7937005], ['t1', sigmoidT1, Math.SQRT2 - 1],
  ]
  for (const [name, f, y] of at1) assert(`shape: sigmoid ${name} reference value f(1) ≈ ${y.toFixed(7)}`, near(f(1), y, 5e-8), `${f(1)}`)
  // The article's Graphtoy link draws these expressions; T1 appears there stretched to slope 1, as T1(2x).
  const graphtoy: [F, F][] = [
    [sigmoidTrig, x => Math.atan(x * Math.PI / 2) * (2 / Math.PI)], [sigmoidTanh, x => Math.tanh(x)], [sigmoidS1, x => x / (1 + Math.abs(x))],
    [x => sigmoidT1(2 * x), x => 2 * x / (1 + Math.sqrt(1 + 4 * x * x))], [sigmoidS2, x => x / Math.sqrt(1 + x * x)],
    [sigmoidS3, x => x / Math.cbrt(1 + x * x * Math.abs(x))],
  ]
  assert('shape: the sigmoids match the article\'s Graphtoy expressions', graphtoy.every(([f, g]) => maxErr(sweep(-5, 5, 200), x => f(x) - g(x)) < 1e-15))

  const xs = sweep(-4, 4, 160), ys = sweep(-0.99, 0.99, 198)
  for (const [name, { f, inv, d }] of Object.entries(SIGMOIDS)) {
    const slope0 = name === 't1' ? 0.5 : 1
    assert(`shape: sigmoid ${name} is odd, 0 at 0, slope ${slope0} there, increasing, inside (−1, 1)`,
      f(0) === 0 && maxErr(xs, x => f(-x) + f(x)) < 1e-15 && near(d(0), slope0, 1e-15) && monotone(f, xs) &&
        [-5, 5].every(x => Math.abs(f(x)) < 1) && [-1e6, 1e6].every(x => Math.abs(f(x)) <= 1) && f(1e6) > 0.99)
    const a = maxErr(xs, x => inv(f(x)) - x), b = maxErr(ys, y => f(inv(y)) - y)
    assert(`shape: sigmoid ${name} inverse round-trips both ways`, a < 1e-9 && b < 1e-12, `inv∘f ${e(a)}, f∘inv ${e(b)}`)
    const de = maxErr(xs, x => fd(f, x) - d(x))
    assert(`shape: sigmoid ${name} derivative matches a finite difference`, de < 1e-5, `max err ${e(de)}`)
  }
}

export function shapeChecks(assert: Assert): void {
  remapChecks(assert)
  smoothstepChecks(assert)
  sigmoidChecks(assert)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('shape')
  shapeChecks(assert)
  done('shape checks passed')
}
