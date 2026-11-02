/**
 * Per-function checks for the filtered fields (`src/engine/filter/`, #65, docs/IQ-PLAN.md IQ4), called by
 * scripts/filter.ts: every box filter against a brute-force supersample of its plain pattern over the footprint, the
 * triangle-filtered checkers against a tent-weighted one, fcos against a numeric integral of the cosine, the mean of
 * each filtered pattern over a period against the plain one (band-limited mean preservation), a zero footprint giving
 * the plain value bit for bit, and a vanishing one converging to it.
 */
import type { Assert } from './lib/check'
import { mulberry32 } from '../src/engine/sampler/jitter'
import { dcos, TAU } from '../src/engine/noise/trig'
import { fbm2 } from '../src/engine/noise/gradient'
import {
  checkers, checkersBox, checkersTriangle, crosses, fcos, fcosApprox, ffbm2, filteredCheckers, filteredCrosses, filteredGrid,
  filteredSquares, filteredXor, filterSample, fract, grid, patternField, squares, supersampled, xor, type Pattern,
} from '../src/engine/filter'

type P2 = (x: number, y: number) => number
interface Pair { name: string; plain: P2; filtered: Pattern; period: number }
const PAIRS: Pair[] = [
  { name: 'filteredCheckers', plain: checkers, filtered: filteredCheckers, period: 2 },
  { name: 'checkersBox', plain: checkers, filtered: checkersBox, period: 2 },
  { name: 'filteredGrid', plain: (x, y) => grid(x, y), filtered: (x, y, a, b, c, d) => filteredGrid(x, y, a, b, c, d), period: 1 },
  { name: 'filteredSquares', plain: (x, y) => squares(x, y), filtered: (x, y, a, b, c, d) => filteredSquares(x, y, a, b, c, d), period: 1 },
  { name: 'filteredCrosses', plain: (x, y) => crosses(x, y), filtered: (x, y, a, b, c, d) => filteredCrosses(x, y, a, b, c, d), period: 1 },
  { name: 'filteredXor', plain: xor, filtered: filteredXor, period: 256 },
]
const e = (x: number) => x.toExponential(1)

/** Midpoint-rule mean of `f` over the box [x ± wx/2] × [y ± wy/2], n × n samples. */
function boxMean(f: P2, x: number, y: number, wx: number, wy: number, n: number): number {
  let s = 0
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) s += f(x + ((i + .5) / n - .5) * wx, y + ((j + .5) / n - .5) * wy)
  return s / (n * n)
}
/** Tent-weighted mean of `f` (weight (1 − |t|) per axis over [x ± wx] × [y ± wy]), n × n samples. */
function tentMean(f: P2, x: number, y: number, wx: number, wy: number, n: number): number {
  let s = 0, z = 0
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const tx = 2 * (i + .5) / n - 1, ty = 2 * (j + .5) / n - 1, k = (1 - Math.abs(tx)) * (1 - Math.abs(ty))
    s += k * f(x + tx * wx, y + ty * wy); z += k
  }
  return s / z
}

export function filterUnitChecks(assert: Assert): void {
  const rnd = mulberry32(0x1f4)
  const pts = Array.from({ length: 24 }, () => [rnd() * 40 - 20, rnd() * 40 - 20, .1 + rnd() * 2.9, .1 + rnd() * 2.9])
  // box filters ≡ brute-force supersample (anisotropic boxes; the footprint given as dpdx = (wx, 0), dpdy = (0, wy))
  for (const p of PAIRS) {
    const N = p.name === 'filteredXor' ? 96 : 160
    let worst = 0
    for (const [x, y, wx, wy] of pts) worst = Math.max(worst, Math.abs(p.filtered(x, y, wx, 0, 0, wy) - boxMean(p.plain, x, y, wx, wy, N)))
    assert(`filter ${p.name} matches a ${N}² brute-force box supersample`, worst < 2.5 / N, `max |Δ| ${e(worst)}`)
  }
  // the footprint edges in any order and sign give the same kernel (w = max(|dpdx|, |dpdy|) per component)
  {
    let worst = 0
    for (const [x, y, wx, wy] of pts) worst = Math.max(worst, Math.abs(filteredCheckers(x, y, wx, 0, 0, wy) - filteredCheckers(x, y, -wx * .5, -wy, wx, wy * .25)))
    assert('filter kernel: w = max(|dpdx|, |dpdy|) per axis', worst === 0, `max |Δ| ${worst}`)
  }
  // checkersBox (triangle signal) ≡ filteredCheckers (the filterable-procedurals listing), to rounding
  {
    let worst = 0
    for (const [x, y, wx, wy] of pts) worst = Math.max(worst, Math.abs(checkersBox(x, y, wx, 0, 0, wy) - filteredCheckers(x, y, wx, 0, 0, wy)))
    assert('filter checkersBox ≡ filteredCheckers', worst < 1e-12, `max |Δ| ${e(worst)}`)
  }
  // triangle-filtered checkers ≡ tent-weighted supersample (half width w)
  {
    const N = 200
    let worst = 0
    for (const [x, y, wx, wy] of pts) worst = Math.max(worst, Math.abs(checkersTriangle(x, y, wx, 0, 0, wy) - tentMean(checkers, x, y, wx, wy, N)))
    assert(`filter checkersTriangle matches a ${N}² tent-weighted supersample`, worst < 2 / N, `max |Δ| ${e(worst)}`)
  }
  // a zero footprint is the plain pattern, bit for bit; a vanishing one converges to it away from the edges
  {
    const all: [string, P2, Pattern][] = [...PAIRS.map(p => [p.name, p.plain, p.filtered] as [string, P2, Pattern]), ['checkersTriangle', checkers, checkersTriangle]]
    const zero: string[] = [], conv: string[] = []
    for (const [name, plain, f] of all) {
      for (let i = 0; i < 400; i++) {
        const x = rnd() * 60 - 30, y = rnd() * 60 - 30
        if (f(x, y, 0, 0, 0, 0) !== plain(x, y)) { zero.push(`${name}(${x.toFixed(3)}, ${y.toFixed(3)})`); break }
        // the finest feature edge is a multiple of 1 / 10 (grid) or 1 / 3 (squares, crosses): stay 1e-3 clear of all of them
        const edge = (t: number) => Math.min(...[1, 3, 10].map(k => Math.abs(fract(t * k + .5) - .5) / k))
        if (edge(x) < 1e-3 || edge(y) < 1e-3) continue
        const w = 1e-4, d = Math.abs(f(x, y, w, 0, 0, w) - plain(x, y))
        if (d > 1e-6) { conv.push(`${name} ${e(d)}`); break }
      }
    }
    assert('filter zero footprint ≡ the plain pattern (every function)', !zero.length, zero.join('; '))
    assert('filter footprint → 0 converges to the plain pattern (w = 1e-4, |Δ| ≤ 1e-6)', !conv.length, conv.join('; '))
  }
  // band-limited mean preservation: over one period the filtered mean equals the plain one
  {
    const bad: string[] = []
    let worst = 0
    for (const p of PAIRS.filter(q => q.period <= 2)) for (const w of [.37, 1, 2.3]) {
      const n = 240, h = p.period / n
      let a = 0, b = 0
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i + .5) * h + .123, y = (j + .5) * h - .456; a += p.plain(x, y); b += p.filtered(x, y, w, 0, 0, w) }
      const d = Math.abs(a - b) / (n * n)
      worst = Math.max(worst, d)
      if (d > 2e-3) bad.push(`${p.name} w ${w}: ${e(d)}`)
    }
    assert('filter box filters preserve the pattern mean over a period', !bad.length, bad.length ? bad.join('; ') : `max |Δmean| ${e(worst)}`)
  }
  fcosChecks(assert)
  fbmChecks(assert)
  supersampleChecks(assert)
}

function fcosChecks(assert: Assert): void {
  // fcos ≡ the box mean of cos over [x − w/2, x + w/2] (Simpson, 2000 panels)
  const rnd = mulberry32(0xc05)
  let worst = 0
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 40 - 20, w = rnd() * 12, n = 2000, a = x - w / 2, h = w / n
    let s = Math.cos(a) + Math.cos(a + w)
    for (let k = 1; k < n; k++) s += (k & 1 ? 4 : 2) * Math.cos(a + k * h)
    worst = Math.max(worst, Math.abs(fcos(x, w) - (w > 0 ? s * h / 3 / w : Math.cos(x))))
  }
  assert('filter fcos ≡ the box mean of cos over the footprint (cos × sinc)', worst < 1e-6, `max |Δ| ${e(worst)}`)
  const xs = Array.from({ length: 64 }, (_, i) => i * .37 - 11)
  assert('filter fcos / fcosApprox at w = 0 ≡ dcos, bit for bit', xs.every(x => fcos(x, 0) === dcos(x) && fcosApprox(x, 0) === dcos(x)))
  assert('filter fcosApprox is 0 from w = 2π (one cycle in the footprint)', xs.every(x => fcosApprox(x, TAU) === 0 && fcosApprox(x, 9) === 0))
  // the smoothstep fade against the sinc it replaces, up to w = 2π
  let gap = 0
  for (let k = 0; k <= 200; k++) { const w = k * TAU / 200, h = w / 2; gap = Math.max(gap, Math.abs((h ? Math.sin(h) / h : 1) - fcosApprox(0, w))) }
  assert('filter fcosApprox stays within .2 of the sinc on [0, 2π]', gap < .2, `max gap ${gap.toFixed(3)}`)
  // mean over a period: 0 for every footprint
  let mean = 0
  for (const w of [0, .5, 2, 5]) { let s = 0; for (let k = 0; k < 1000; k++) s += fcos((k + .5) * TAU / 1000, w); mean = Math.max(mean, Math.abs(s / 1000)) }
  assert('filter fcos keeps a zero mean over a period', mean < 1e-9, e(mean))
}

function fbmChecks(assert: Assert): void {
  const rnd = mulberry32(0xfb7), pts = Array.from({ length: 200 }, () => [rnd() * 50 - 25, rnd() * 50 - 25])
  const opts = [[undefined, 0, undefined], [6, 7, undefined], [undefined, 3, { octaves: 5, lacunarity: 2.01, gain: .6 }]] as const
  assert('filter ffbm2 at w = 0 ≡ fbm2, bit for bit', opts.every(([o, s, f]) => pts.every(([x, y]) => ffbm2(x, y, 0, o, s, f) === fbm2(x, y, o, s, f))))
  assert('filter ffbm2 is 0 once octave 0 spans a lattice cell (w ≥ 1)', pts.every(([x, y]) => ffbm2(x, y, 1, 6) === 0 && ffbm2(x, y, 3, 6) === 0))
  // octaves fade from the finest: the variance falls as the footprint grows, and the mean stays put
  const stats = (w: number) => {
    let s = 0, s2 = 0, n = 0
    for (let j = 0; j < 160; j++) for (let i = 0; i < 160; i++) { const v = ffbm2(i * .31, j * .31, w, 6); s += v; s2 += v * v; n++ }
    return [s / n, s2 / n - (s / n) ** 2]
  }
  const ws = [0, .05, .15, .3, .6], st = ws.map(stats)
  assert('filter ffbm2 variance falls as the footprint grows', st.every(([, v], i) => i === 0 || v < st[i - 1][1]), st.map(([, v]) => v.toFixed(4)).join(' > '))
  const drift = Math.max(...st.map(([m]) => Math.abs(m - st[0][0])))
  assert('filter ffbm2 keeps the fbm2 mean (band-limited mean preservation)', drift < .01, `max |Δmean| ${e(drift)}`)
}

function supersampleChecks(assert: Assert): void {
  const f: P2 = (u, v) => checkers(u * 37, v * 37), field = Object.assign((u: number, v: number) => f(u, v), { bounds: [2, 3, 9, 9] as [number, number, number, number] })
  const ss = supersampled(field, 64 * 31, 64), ref = patternField(filteredCheckers, 37)
  let worst = 0, sum = 0, n = 0, same = true
  for (let j = 0; j < 31; j++) for (let i = 0; i < 31; i++) {
    const u = i / 30 + .0071, v = j / 30 - .0033, d = Math.abs(ss(u, v, 1 / 30, 1 / 30) - ref(u, v, 1 / 30, 1 / 30))
    worst = Math.max(worst, d); sum += d; n++
    if (ss(u, v) !== field(u, v)) same = false
  }
  assert('filter supersampled (64² a cell) matches the analytic box filter', worst < .04 && sum / n < .01, `max ${e(worst)}, mean ${e(sum / n)}`)
  assert('filter supersampled with no footprint ≡ the field; detail 0 → one sample', same && filterSample(f, .3, .4, .5, 0, 0, .5, 0) === f(.3, .4))
  assert('filter supersampled is a footprint field with bounds grown by a cell', ss.footprint === true && ss.bounds?.join() === '1,2,10,10', `${ss.bounds}`)
}
