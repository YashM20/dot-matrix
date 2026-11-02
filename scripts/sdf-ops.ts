/**
 * Checks for the SDF operators (`src/engine/sdf/smin.ts`, `repeat.ts`, `xor.ts`; #63, docs/IQ-PLAN.md IQ2). The
 * distance, sign and Lipschitz checks per operator sit in the scripts/sdf-cases.ts table; this file holds the
 * properties: the smooth minimums (rigid ones equal min past their reach, all ≤ min, symmetric, normalised,
 * exponential associative), the mix factor, the smooth booleans and their gradients, the repetitions against
 * brute-force minimums over many cells, and xor against the article's case table.
 * Called from scripts/sdf.ts (`sdfOpsChecks(assert)`); also runnable alone: `npx tsx scripts/sdf-ops.ts`.
 */
import type { Assert } from './lib/check'
import { cellR } from './sdf-cases'
import * as S from '../src/engine/sdf'
import { mulberry32 } from '../src/engine/sampler/jitter'

type Smin = (a: number, b: number, k: number) => number
/** The rigid kernels, each with its reach k / g(0) in units of k. */
const RIGID: [string, Smin, number][] = [
  ['sminQuad', S.sminQuad, 4], ['sminCubic', S.sminCubic, 6], ['sminQuartic', S.sminQuartic, 16 / 3], ['sminCircular', S.sminCircular, 1 / (1 - Math.SQRT1_2)],
]
const ALL: [string, Smin][] = [...RIGID.map(([n, f]): [string, Smin] => [n, f]), ['sminExp', S.sminExp], ['sminRoot', S.sminRoot]]
const H = 1e-5

function sminChecks(assert: Assert): void {
  const rnd = mulberry32(0x5317)
  for (const [name, f] of ALL) {
    let over = 0, asym = 0, norm = 0, past = 0
    const reach = RIGID.find(r => r[0] === name)?.[2]
    for (let i = 0; i < 4000; i++) {
      const a = (rnd() * 2 - 1) * 5, b = (rnd() * 2 - 1) * 5, k = .05 + rnd() * .8
      const d = f(a, b, k)
      if (d > Math.min(a, b)) over++
      if (d !== f(b, a, k)) asym++
      norm = Math.max(norm, Math.abs(f(a, a, k) - (a - k)))
      // rigid: exactly min once |a − b| ≥ reach·k; a gap drawn at the reach and beyond
      if (reach) { const g = reach * k * (1 + rnd()), e = f(a, a + g, k); if (e !== a || f(a + g, a, k) !== a) past++ }
    }
    assert(`sdf ${name}: ≤ min(a, b), symmetric, smin(a, a, k) = a − k`, !over && !asym && norm < 1e-12,
      `${over} over min, ${asym} asymmetric, normalisation off by ${norm.toExponential(1)}`)
    if (reach) assert(`sdf ${name}: equals min(a, b) once |a − b| ≥ ${reach.toFixed(2)}k`, !past, `${past}/4000 differ`)
  }
  // the non-rigid two approach min: the root within k²/|a − b|, the exponential within k·2^(−|a − b|/k)/ln 2
  let rootOff = 0, expOff = 0
  for (const g of [1, 3, 10, 40, 200]) for (const k of [.1, .5, 1]) {
    const dr = 0 - S.sminRoot(0, g, k), de = 0 - S.sminExp(0, g, k)
    if (!(dr > 0 && dr <= k * k / g * (1 + 1e-12))) rootOff++
    if (!(de >= 0 && de <= k * 2 ** (-g / k) / Math.LN2 * (1 + 1e-9))) expOff++
  }
  assert('sdf sminRoot, sminExp: tend to min(a, b) as |a − b| grows (within k²/|a − b| and k·2^(−|a − b|/k)/ln 2)', !rootOff && !expOff, `${rootOff} root, ${expOff} exp out of bound`)
  let assoc = 0
  for (let i = 0; i < 2000; i++) {
    const a = rnd() * 4 - 2, b = rnd() * 4 - 2, c = rnd() * 4 - 2, k = .1 + rnd() * .5
    assoc = Math.max(assoc, Math.abs(S.sminExp(a, S.sminExp(b, c, k), k) - S.sminExp(S.sminExp(a, b, k), c, k)))
  }
  assert('sdf sminExp: associative', assoc < 1e-12, `max |Δ| = ${assoc.toExponential(1)}`)
  // the mix factor
  const o = new Float64Array(1), o2 = new Float64Array(1)
  for (const [name, mix, plain, reach] of [['sminQuadMix', S.sminQuadMix, S.sminQuad, 4], ['sminCubicMix', S.sminCubicMix, S.sminCubic, 6]] as const) {
    let range = 0, dOff = 0, flip = 0, ends = 0, jump = 0
    for (let i = 0; i < 4000; i++) {
      const a = (rnd() * 2 - 1) * 3, b = (rnd() * 2 - 1) * 3, k = .05 + rnd() * .6
      const d = mix(a, b, k, o), m = o[0]
      if (!(m >= 0 && m <= 1)) range++
      dOff = Math.max(dOff, Math.abs(d - plain(a, b, k)))
      mix(b, a, k, o2)
      if (Math.abs(m + o2[0] - 1) > 1e-12) flip++
      // past the reach the nearer one wins outright: m = 0 when a is far below b, 1 when b is far below a
      if (mix(a, a + reach * k * 1.01, k, o) !== a || o[0] !== 0 || (mix(a + reach * k * 1.01, a, k, o), o[0] !== 1)) ends++
      // continuous across a = b: ½ from both sides
      mix(a, a + 1e-9, k, o); const lo = o[0]; mix(a + 1e-9, a, k, o)
      if (Math.abs(lo - .5) > 1e-6 || Math.abs(o[0] - .5) > 1e-6) jump++
    }
    assert(`sdf ${name}: factor in [0, 1], ½ at a = b, 0 / 1 past the reach, m(a, b) + m(b, a) = 1, distance = ${plain.name}`,
      !range && dOff < 1e-12 && !flip && !ends && !jump, `${range} out of range, distance off by ${dOff.toExponential(1)}, ${flip} not complementary, ${ends} ends, ${jump} jumps`)
  }
  // smooth booleans: bounded by the hard ones, equal to them past the reach
  let sub = 0, int = 0
  for (let i = 0; i < 4000; i++) {
    const a = (rnd() * 2 - 1) * 3, b = (rnd() * 2 - 1) * 3, k = .05 + rnd() * .5
    const s = S.smoothSubtract(a, b, k), t = S.smoothIntersect(a, b, k), far = Math.abs(a + b) >= 4 * k, far2 = Math.abs(a - b) >= 4 * k
    if (s < Math.max(a, -b) || (far && s !== Math.max(a, -b))) sub++
    if (t < Math.max(a, b) || (far2 && t !== Math.max(a, b))) int++
  }
  assert('sdf smoothSubtract, smoothIntersect: ≥ the hard max, equal to it past the reach', !sub && !int, `${sub} subtract, ${int} intersect`)
}

function gradChecks(assert: Assert): void {
  const disc: S.Sdg2 = (x, y, o) => S.sdgCircle(x + .8, y, 1, o), box: S.Sdg2 = (x, y, o) => S.sdgBox(x - .6, y - .3, 1, .7, o)
  const discP = (x: number, y: number) => S.sdCircle(x + .8, y, 1), boxP = (x: number, y: number) => S.sdBox(x - .6, y - .3, 1, .7)
  const cases: [string, S.Sdg2, (x: number, y: number) => number][] = [
    ['sdgSmoothUnion', S.sdgSmoothUnion(disc, box, .3), (x, y) => S.smoothUnion(discP(x, y), boxP(x, y), .3)],
    ['sdgSmoothSubtract', S.sdgSmoothSubtract(box, disc, .3), (x, y) => S.smoothSubtract(boxP(x, y), discP(x, y), .3)],
    ['sdgSmoothIntersect', S.sdgSmoothIntersect(disc, box, .3), (x, y) => S.smoothIntersect(discP(x, y), boxP(x, y), .3)],
  ]
  for (const [name, g, plain] of cases) {
    const o = new Float64Array(2), rnd = mulberry32(0x6a1), N = 2000
    let dOff = 0, long = 0, match = 0
    for (let i = 0; i < N; i++) {
      const x = (rnd() * 2 - 1) * 3.5, y = (rnd() * 2 - 1) * 3.5
      const d = g(x, y, o), gx = o[0], gy = o[1]
      dOff = Math.max(dOff, Math.abs(d - plain(x, y)))
      if (Math.hypot(gx, gy) > 1 + 1e-9) long++
      const fx = (plain(x + H, y) - plain(x - H, y)) / (2 * H), fy = (plain(x, y + H) - plain(x, y - H)) / (2 * H)
      if (Math.hypot(fx - gx, fy - gy) < 1e-4) match++
    }
    assert(`sdf ${name}: d = the plain form, gradient = finite difference, |g| ≤ 1`, dOff < 1e-12 && !long && match >= .97 * N,
      `d off by ${dOff.toExponential(1)}, ${long} longer than 1, ${match}/${N} match`)
  }
}

/** Brute force over every cell within `r` of the point's own: the true distance and its argmin. */
function brute(px: number, py: number, sx: number, sy: number, sd: S.SdCell, r = 4): [number, number, number] {
  const cx = Math.round(px / sx), cy = Math.round(py / sy)
  let d = Infinity, bx = 0, by = 0
  for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) {
    const e = sd(px - sx * i, py - sy * j, i, j)
    if (e < d) { d = e; bx = i; by = j }
  }
  return [d, bx, by]
}

function repeatChecks(assert: Assert): void {
  const rnd = mulberry32(0x7e9), o = new Float64Array(2), N = 6000
  // periodicity: the same point shifted by whole periods (2 periods for the mirror), same distance, id shifted
  const disc: S.SdCell = (x, y) => S.sdBox(x - .1, y + .05, .3, .2)
  let per = 0, perId = 0, mir = 0
  for (let i = 0; i < N; i++) {
    const x = (rnd() * 2 - 1) * 6, y = (rnd() * 2 - 1) * 6, m = Math.floor(rnd() * 21) - 10, n = Math.floor(rnd() * 21) - 10
    const d = S.repGrid(x, y, 1.3, .8, disc, o), ix = o[0], iy = o[1]
    const e = S.repGrid(x + m * 1.3, y + n * .8, 1.3, .8, disc, o)
    per = Math.max(per, Math.abs(d - e))
    if (Math.abs(d - e) < 1e-12 && (o[0] !== ix + m || o[1] !== iy + n)) perId++
    mir = Math.max(mir, Math.abs(S.repMirror(x, y, 1, 1, disc) - S.repMirror(x + 2 * m, y + 2 * n, 1, 1, disc)))
  }
  assert('sdf repGrid, repMirror: a whole-period shift keeps the distance (and shifts the id)', per < 1e-9 && !perId && mir < 1e-9,
    `max |Δ| ${per.toExponential(1)} grid, ${mir.toExponential(1)} mirror; ${perId} ids not shifted`)
  // the neighbour check against brute force, with instances that change size and turn per cell
  const varied: S.SdCell = (x, y, i, j) => { const a = .3 * (cellR(j, i) - .28), c = Math.cos(a), s = Math.sin(a); return S.sdBox(c * x + s * y, -s * x + c * y, cellR(i, j), .8 * cellR(i, j)) }
  let off = 0, idOff = 0, naive = 0
  for (let i = 0; i < N; i++) {
    const x = (rnd() * 2 - 1) * 8, y = (rnd() * 2 - 1) * 8
    const d = S.repGrid(x, y, 1, 1, varied, o), [bd, bx, by] = brute(x, y, 1, 1, varied)
    off = Math.max(off, Math.abs(d - bd))
    if (Math.abs(d - bd) < 1e-12 && varied(x - o[0], y - o[1], o[0], o[1]) !== d) idOff++
    if (bx !== Math.round(x) || by !== Math.round(y)) naive++
  }
  assert('sdf repGrid (2 × 2 cells) = brute force over 9 × 9 cells, instances varying per cell', off < 1e-12 && !idOff && naive > 0,
    `max |Δ| = ${off.toExponential(1)}; ${idOff} wrong ids; the point's own cell is not the nearest at ${naive}/${N}, so one cell alone would be wrong there`)
  // limited: brute force over the whole block, ids clamped to it
  const NX = 5, NY = 3, SX = 1.1, SY = .9, sized: S.SdCell = (x, y, i, j) => S.sdCircle(x, y, .15 + .06 * i + .05 * j)
  let lim = 0, outside = 0
  for (let i = 0; i < N; i++) {
    const x = (rnd() * 2 - 1) * 9, y = (rnd() * 2 - 1) * 7
    const d = S.repLimited(x, y, SX, SY, NX, NY, sized, o)
    let bd = Infinity
    for (let j = 0; j < NY; j++) for (let k = 0; k < NX; k++) bd = Math.min(bd, sized(x - SX * (k - 2), y - SY * (j - 1), k, j))
    lim = Math.max(lim, Math.abs(d - bd))
    if (o[0] < 0 || o[0] > NX - 1 || o[1] < 0 || o[1] > NY - 1) outside++
  }
  const same: S.SdCell = (x, y) => S.sdCircle(x, y, .3), far = (x: number, y: number) => (S.repLimited(x, y, SX, SY, NX, NY, same, o), `${o[0]},${o[1]}`)
  const edges = far(50, 0) === '4,1' && far(-50, 0) === '0,1' && far(0, 50) === '2,2' && far(-50, -50) === '0,0'
  let even = 0
  for (let i = 0; i < 2000; i++) {
    const x = (rnd() * 2 - 1) * 5, y = (rnd() * 2 - 1) * 5, d = S.repLimited(x, y, 1, 1, 4, 2, (lx, ly) => S.sdCircle(lx, ly, .3))
    let bd = Infinity
    for (const cx of [-1.5, -.5, .5, 1.5]) for (const cy of [-.5, .5]) bd = Math.min(bd, S.sdCircle(x - cx, y - cy, .3))
    even = Math.max(even, Math.abs(d - bd))
  }
  assert('sdf repLimited = brute force over the block (5 × 3, and 4 × 2 for even counts), ids clamped at the edges',
    lim < 1e-12 && even < 1e-12 && !outside && edges, `max |Δ| ${lim.toExponential(1)} odd, ${even.toExponential(1)} even; ${outside} ids outside; far ids ${edges ? 'clamped' : 'wrong'}`)
  // rotational: a whole sector apart gives the same distance and the next sector; brute force over all sectors, away
  // from the centre (near it every instance is about as far, so a bigger one further round can win: see repPolar)
  const n = 7, sp = 2 * Math.PI / n, petal: S.SdSector = (x, y, id) => S.sdEllipse(x - 2, y, .3 + .04 * id, .25)
  let rot = 0, rotId = 0, rotBrute = 0
  for (let i = 0; i < N; i++) {
    const r = .75 + rnd() * 3.25, t = rnd() * 2 * Math.PI, x = r * Math.cos(t), y = r * Math.sin(t), m = 1 + Math.floor(rnd() * (n - 1))
    const circle: S.SdSector = (lx, ly) => S.sdCircle(lx - 2, ly, .5)
    const d = S.repPolar(x, y, n, circle, o), id = o[0]
    const e = S.repPolar(r * Math.cos(t + m * sp), r * Math.sin(t + m * sp), n, circle, o)
    rot = Math.max(rot, Math.abs(d - e))
    if (Math.abs(d - e) < 1e-6 && Math.abs(S.sdCircle(x - 2 * Math.cos(id * sp), y - 2 * Math.sin(id * sp), .5) - d) < 1e-6 && o[0] !== (id + m) % n) rotId++
    let bd = Infinity
    for (let k = 0; k < n; k++) { const c = Math.cos(k * sp), s = Math.sin(k * sp); bd = Math.min(bd, petal(c * x + s * y, -s * x + c * y, k)) }
    rotBrute = Math.max(rotBrute, Math.abs(S.repPolar(x, y, n, petal) - bd))
  }
  assert('sdf repPolar: a whole sector apart, same distance and the next sector id; = brute force over all 7 sectors (r ≥ 0.75)', rot < 1e-6 && !rotId && rotBrute < 1e-6,
    `max |Δ| ${rot.toExponential(1)} rotated, ${rotBrute.toExponential(1)} vs brute force; ${rotId} ids off`)
  // rectangular perimeter: brute force over the instances on the outline, and their ids
  let rect = 0, rectId = 0
  for (const [nx, ny] of [[4, 3], [5, 5], [2, 6]]) {
    const hx = (nx - 1) / 2, hy = (ny - 1) / 2, ring: [number, number][] = []
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) ring.push([i, j])
    for (let i = 0; i < 2000; i++) {
      const x = (rnd() * 2 - 1) * (hx + 2) * .9, y = (rnd() * 2 - 1) * (hy + 2) * .9
      const d = S.repRect(x, y, nx, ny, .9, (lx, ly) => S.sdBox(lx, ly, .25, .25), o)
      let bd = Infinity
      for (const [i2, j2] of ring) bd = Math.min(bd, S.sdBox(x - .9 * (i2 - hx), y - .9 * (j2 - hy), .25, .25))
      rect = Math.max(rect, Math.abs(d - bd))
      if (!ring.some(([a, b]) => a === o[0] && b === o[1]) || Math.abs(S.sdBox(x - .9 * (o[0] - hx), y - .9 * (o[1] - hy), .25, .25) - d) > 1e-12) rectId++
    }
  }
  assert('sdf repRect = brute force over the outline instances (4 × 3, 5 × 5, 2 × 6), ids on the outline', rect < 1e-12 && !rectId,
    `max |Δ| = ${rect.toExponential(1)}, ${rectId} wrong ids`)
}

function xorChecks(assert: Assert): void {
  const rnd = mulberry32(0x0c5)
  // the article's case table, and two of its eight min/max rewrites
  const cases = (a: number, b: number) => (a > 0 && b > 0 ? Math.min(a, b) : a < 0 && b > 0 ? -Math.min(-a, b) : a > 0 && b < 0 ? -Math.min(a, -b) : Math.min(-a, -b))
  let off = 0
  for (let i = 0; i < 4000; i++) {
    const a = (rnd() * 2 - 1) * 3, b = (rnd() * 2 - 1) * 3, x = S.opXor(a, b)
    if (x !== cases(a, b) || x !== Math.max(Math.min(a, b), Math.min(-a, -b)) || x !== -Math.min(Math.max(-a, -b), Math.max(a, b))) off++
  }
  assert('sdf opXor = the article\'s four sign cases and its min/max rewrites', !off, `${off}/4000 differ`)
  // exact: |xor| is the distance to the nearer outline, min(|a|, |b|), and |∇d| = 1 off the edges
  const f = (x: number, y: number) => S.opXor(S.sdBox(x, y, 1.5, .8), S.sdCircle(x - 1, y - .5, 1))
  let mag = 0, unit = 0
  const N = 2000
  for (let i = 0; i < N; i++) {
    const x = (rnd() * 2 - 1) * 3.5, y = (rnd() * 2 - 1) * 3.5, a = S.sdBox(x, y, 1.5, .8), b = S.sdCircle(x - 1, y - .5, 1)
    mag = Math.max(mag, Math.abs(Math.abs(f(x, y)) - Math.min(Math.abs(a), Math.abs(b))))
    const gx = (f(x + H, y) - f(x - H, y)) / (2 * H), gy = (f(x, y + H) - f(x, y - H)) / (2 * H)
    if (Math.abs(Math.hypot(gx, gy) - 1) < 1e-3) unit++
  }
  assert('sdf opXor exact: |d| = min(|a|, |b|), |∇d| = 1 off the edges', mag < 1e-15 && unit >= .97 * N, `max |Δ| = ${mag.toExponential(1)}, |∇d| = 1 at ${unit}/${N}`)
}

export function sdfOpsChecks(assert: Assert): void {
  sminChecks(assert)
  gradChecks(assert)
  repeatChecks(assert)
  xorChecks(assert)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('sdf ops')
  sdfOpsChecks(assert)
  done('sdf ops checks passed')
}
