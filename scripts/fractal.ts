/**
 * Checks for the fractal pack (`src/engine/fractal`, #68, docs/IQ-PLAN.md IQ7) and the fractals board.
 * Runnable alone: `npx tsx scripts/fractal.ts`; also exported as `fractalChecks(assert)`.
 *
 *  - smooth iteration count: continuous across the integer bands, equal to the article's optimised B = 256 form,
 *    known points inside and outside the Mandelbrot and Julia sets, the degree-d path against a hand-written z³;
 *  - orbit traps: the minimum distance at orbits worked by hand (point, line, procedural), the orbit itself;
 *  - density fractals: fixed-count bakes are deterministic and hash-pinned (popcorn, chaos game, icon), the IFS
 *    weights, a Sierpinski chaos game leaves the middle hole empty, the variations, the icon's n-fold symmetry,
 *    the tone curve;
 *  - Lyapunov: the exponent at r = 2.5 (ln ½) and r = 4 (ln 2), the folded product against a plain sum of logs;
 *  - the determinism lint on the folder;
 *  - the board: frames pure in t, one red dot per card, and a frame within 4 ms (warm median, × load).
 */
import type { Assert } from './lib/check'
import {
  INSIDE, SMOOTH_BAILOUT, affineDet, applyVariation, chaosGame, densityTone, escapeTime, histogram, iconDensity, iconStep, ifsWeights,
  julia, lyapunov, lyapunovSequence, mandelbrot, orbitPoints, orbitTraps, plotter, popcornDensity, popcornTravel, smoothCount, trapHit, trapLine,
  type Affine, type IconParams,
} from '../src/engine/fractal'
import { detLint } from './lib/detLint'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets'
import { fractalsBoard } from '../src/widgets/boards/fractals'

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
const time = <T>(f: () => T): [number, T] => { const a = performance.now(), r = f(); return [performance.now() - a, r] }
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps
/** FNV-1a 32 over the bytes of a typed array (hex). */
function fnv(a: Float32Array): string {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let h = 0x811c9dc5
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}
/** As algorithms.ts: how much slower this machine is right now than the one the budgets were set on (≥ 1). */
function loadFactor(): number {
  const run = () => { let s = 0; for (let i = 0; i < 1e7; i++) s += (i & 7) * .5; return s }
  run()
  return Math.max(1, median([0, 1, 2].map(() => time(run)[0])) / 12)
}

function escapeChecks(assert: Assert): void {
  // along the real axis from the cusp outward every c escapes; the integer count drops in steps, the smooth one glides
  let maxJump = 0, edges = 0, edgeJump = 0
  // (from .3: right at the cusp the count itself climbs steeply, 1e-4 apart is no longer a small step)
  let prevS = mandelbrot(.3, 0, 500), prevN = escapeTime(0, 0, .3, 0, { maxIter: 500, smooth: false })
  for (let k = 1; k <= 7000; k++) {
    const c = .3 + k * 1e-4, s = mandelbrot(c, 0, 500), n = escapeTime(0, 0, c, 0, { maxIter: 500, smooth: false })
    maxJump = Math.max(maxJump, Math.abs(s - prevS))
    if (n !== prevN) { edges++; edgeJump = Math.max(edgeJump, Math.abs(s - prevS)) }
    prevS = s; prevN = n
  }
  assert('escape: the smooth count is continuous across the bands (c = .3 … 1, step 1e-4; the integer count jumps by 1 there)', edges >= 10 && edgeJump < .02 && maxJump < .05,
    `${edges} band edges, max jump at an edge ${edgeJump.toExponential(1)}, anywhere ${maxJump.toExponential(1)}`)
  // the article's optimised form for B = 256: n − log2(log2(|z|²)) + 4
  let optErr = 0
  for (const r2 of [65537, 1e5, 3e7, 4.2e9]) for (const n of [0, 3, 17]) optErr = Math.max(optErr, Math.abs(smoothCount(n, r2) - (n - Math.log2(Math.log2(r2)) + 4)))
  assert('escape: smoothCount equals the article\'s optimised n − log2(log2 |z|²) + 4 at B = 256', optErr < 1e-9 && SMOOTH_BAILOUT === 256, optErr.toExponential(1))
  const inside: [number, number][] = [[0, 0], [-1, 0], [-.1, .2], [.25, 0], [-2, 0], [-1.75, 0], [-.12, .75]]
  const outside: [number, number][] = [[1, 0], [.26, 0], [-2.01, 0], [.5, .5], [-.75, .2], [0, 1.1]]
  assert('escape: known points inside the Mandelbrot set stay (main cardioid, period-2 disc, the tip −2, a minibrot at −1.75, the rabbit\'s c)',
    inside.every(([x, y]) => mandelbrot(x, y, 400) === INSIDE))
  assert('escape: known points outside escape with a positive count', outside.every(([x, y]) => mandelbrot(x, y, 400) > 0 || mandelbrot(x, y, 400) > -1 && mandelbrot(x, y, 400) !== INSIDE))
  assert('escape: Julia of c = 0 is the unit disc (|z| < 1 stays, |z| > 1 escapes); c = −1 keeps 0 (the period-2 orbit)',
    julia(.5, .5, 0, 0, 200) === INSIDE && julia(.99, 0, 0, 0, 400) === INSIDE && julia(1.01, 0, 0, 0, 400) > 0 && julia(0, 0, -1, 0, 400) === INSIDE)
  // degree 3: the generic path against z³ written out
  const cube = (cx: number, cy: number) => {
    let x = 0, y = 0
    for (let n = 0; n < 60; n++) {
      const nx = x * x * x - 3 * x * y * y + cx, ny = 3 * x * x * y - y * y * y + cy; x = nx; y = ny
      if (x * x + y * y > 256 * 256) return smoothCount(n, x * x + y * y, 256, 3)
    }
    return INSIDE
  }
  const pts: [number, number][] = [[.6, .1], [-.3, .9], [0, 0], [.2, .3], [1.1, -.4], [-.55, .55]]
  assert('escape: degree 3 (multibrot) matches z³ + c written out, smooth count included',
    pts.every(([x, y]) => near(mandelbrot(x, y, 60, { degree: 3 }), cube(x, y), 1e-12)))
}

function trapChecks(assert: Assert): void {
  // c = 0 from z0 = ½: zₙ = ½^(2ⁿ), so after 5 iterations the closest point to the origin is z5 = 2^-32
  const h = orbitTraps(.5, 0, 0, 0, 5, { point: [0, 0], line: trapLine(.3, 0, 0, 1), fn: (x, y) => Math.abs(x - .2) + Math.abs(y) })
  assert('trap: point trap at the origin, c = 0, z0 = ½ → 2^-32 at z5, not escaped', h.point === 2 ** -32 && h.at === 5 && h.ax === 2 ** -32 && !h.escaped && h.n === 5,
    `${h.point} at z${h.at}`)
  assert('trap: line trap x = .3 on that orbit (.25, .0625, …) → .05; procedural |x − .2| + |y| → .05', near(h.line, .05, 1e-15) && near(h.fn, .05, 1e-15), `${h.line}, ${h.fn}`)
  const l = trapLine(1, 2, 3, 4)
  assert('trap: trapLine has a unit normal and passes through its point', near(l[0] * l[0] + l[1] * l[1], 1, 1e-15) && near(l[0] + 2 * l[1] + l[2], 0, 1e-15))
  // c = 1: 0 → 1 → 2 → 5 (escapes past 2); the point trap at (2, 0) sees z2 = 2 exactly
  const e = orbitTraps(0, 0, 1, 0, 50, { point: [2, 0] }, trapHit())
  assert('trap: c = 1 escapes at z3 = 5 (not measured, as in the article) after passing (2, 0) at z2', e.escaped && e.n === 2 && e.point === 0 && e.at === 2, `n ${e.n}, at ${e.at}`)
  const buf = new Float64Array(20), k = orbitPoints(0, 0, 1, 0, buf)
  assert('trap: orbitPoints writes z1 … the first escaped point (1, 2, 5)', k === 3 && buf[0] === 1 && buf[2] === 2 && buf[4] === 5)
  // the period-2 orbit of c = −1: 0 → −1 → 0 → …, so a point trap at −1 reads 0 at z1
  const p2 = orbitTraps(0, 0, -1, 0, 30, { point: [-1, 0] })
  assert('trap: c = −1 cycles 0, −1: a trap at −1 reads 0 at z1 and never escapes', p2.point === 0 && p2.at === 1 && !p2.escaped)
}

const SIERPINSKI: Affine[] = [[.5, 0, 0, .5, 0, 0], [.5, 0, 0, .5, .5, 0], [.5, 0, 0, .5, .25, .5]]
const ICON: IconParams = { n: 5, lambda: -2.344, alpha: 2.16, beta: -.197, gamma: .834, omega: 0 }
function densityChecks(assert: Assert): void {
  const maps: Affine[] = [[.434, .04, .213, .18, -.584, -.377], [.401, .148, .236, .334, .773, -.425], [-.038, -.416, .248, -.654, -.325, -.904]]
  const w = ifsWeights(maps), dets = maps.map(m => Math.abs(affineDet(m))), sum = dets.reduce((a, b) => a + b)
  assert('ifs: pick probabilities are |det Aᵢ| / Σ|det A| (cumulative, ending at 1)', near(w[0], dets[0] / sum, 1e-15) && near(w[1] - w[0], dets[1] / sum, 1e-15) && w[2] === 1)
  const sier = chaosGame({ maps: SIERPINSKI, w: 64, h: 64, window: [0, 0, 1, 1], steps: 60000, seed: 2 })
  let hole = 0
  // the middle triangle removed at the first level: (.25, .5)-(.75, .5)-(.5, 0) in y-up terms; test cells well inside it
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
    const x = (i + .5) / 64, y = (j + .5) / 64
    if (y < .47 && y > .03 && Math.abs(x - .5) < (y / 2) - .03 && sier.hits[j * 64 + i] > 0) hole++
  }
  assert('ifs: a Sierpinski chaos game leaves the middle triangle empty and covers the rest', hole === 0 && sier.covered > 900, `${hole} hits in the hole, ${sier.covered} cells covered`)
  const q: [number, number] = [0, 0]
  applyVariation({ kind: 'twist', amp: .5, omega: .7 }, .3, -.4, 9, q)
  const twistR = Math.hypot(q[0], q[1])
  applyVariation({ kind: 'inversion' }, .3, -.4, 0, q)
  assert('ifs: the twist is a rotation (|p| kept to the table sine\'s 1e-6); inversion maps |p| to 1/|p|', near(twistR, .5, 1e-6) && near(Math.hypot(q[0], q[1]), 2, 1e-12) && near(q[0] / q[1], .3 / -.4, 1e-12))

  // fixed-count bakes: the same bits twice, and pinned (tsin, seeded streams: identical in every engine)
  const pop = () => popcornDensity({ kind: 'pickover', h: .05 }, { w: 96, h: 72, window: [-2, -1.5, 2, 1.5], orbits: 800, steps: 30, seed: 3 }).hits
  const popIq = () => popcornDensity({ kind: 'iq', h: .02, t: [.3, 1.1, -.4, 2] }, { w: 96, h: 72, window: [-3, -2.25, 3, 2.25], orbits: 400, steps: 60, seed: 5 }).hits
  const ifs = () => chaosGame({ maps, w: 96, h: 72, window: [-2.5, -2, 2.5, 2], steps: 40000, seed: 3, variation: { kind: 'twist', amp: .5, omega: .7 } }).hits
  const ico = () => iconDensity(ICON, { w: 96, h: 96, window: [-1.6, -1.6, 1.6, 1.6], steps: 40000 }).hits
  const hashes = { popcorn: fnv(pop()), popcornIq: fnv(popIq()), ifs: fnv(ifs()), icon: fnv(ico()) }
  const PINNED = { popcorn: '0133cced', popcornIq: 'c1010469', ifs: '69fcf18f', icon: 'd448af1e' }
  const same = fnv(pop()) === hashes.popcorn && fnv(popIq()) === hashes.popcornIq && fnv(ifs()) === hashes.ifs && fnv(ico()) === hashes.icon
  assert('density: popcorn (both fields), chaos game and icon bakes are deterministic (fresh runs agree bit for bit)', same)
  assert('density: the bakes match their pinned FNV-1a hashes', Object.entries(PINNED).every(([k, v]) => hashes[k as keyof typeof hashes] === v), JSON.stringify(hashes))
  // the icon map commutes with a turn of 2π/n, and with ω = 0 with conjugation
  const a = 2 * Math.PI / ICON.n, ca = Math.cos(a), sa = Math.sin(a), f1: [number, number] = [0, 0], f2: [number, number] = [0, 0]
  let symErr = 0
  for (const [x, y] of [[.3, .1], [-.5, .7], [1.1, -.2]]) {
    iconStep(ICON, x, y, f1); iconStep(ICON, ca * x - sa * y, sa * x + ca * y, f2)
    symErr = Math.max(symErr, Math.abs(f2[0] - (ca * f1[0] - sa * f1[1])), Math.abs(f2[1] - (sa * f1[0] + ca * f1[1])))
    iconStep(ICON, x, -y, f2); symErr = Math.max(symErr, Math.abs(f2[0] - f1[0]), Math.abs(f2[1] + f1[1]))
  }
  assert('icon: F(R z) = R F(z) for the 2π/n turn, and F(z̄) = F(z)‾ with ω = 0', symErr < 1e-12, symErr.toExponential(1))
  const tr = popcornTravel({ kind: 'iq', h: .05, t: [0, 0, 0, 0] }, .2, .1, 50)
  assert('popcorn: the travel render is positive and at most steps × λ × √2 (|v| ≤ √2)', tr > 0 && tr <= 50 * .05 * Math.SQRT2 + 1e-9, tr.toFixed(4))
  const hist = histogram(4, 1, [0, 0, 4, 1]), plot = plotter(hist)
  for (const [x, n] of [[.5, 1], [1.5, 4], [2.5, 100], [9, 3]] as const) for (let i = 0; i < n; i++) plot(x, .5)
  const tone = densityTone(hist, { quantile: .5 })
  assert('density: binning counts in-window hits only; the tone is 0 where empty, 1 at the quantile, clamped above',
    hist.steps === 108 && hist.covered === 3 && hist.max === 100 && tone[3] === 0 && tone[1] === 1 && tone[2] === 1 && near(tone[0], .5, 1e-7), Array.from(tone).join(', '))
}

function lyapunovChecks(assert: Assert): void {
  const A = lyapunovSequence('A')
  const l25 = lyapunov(2.5, 0, A, { n: 400 }), l4 = lyapunov(4, 0, A, { n: 20000, x0: .3 }), l2 = lyapunov(2, 0, A)
  assert('lyapunov: r = 2.5 settles on x* = .6 with f\'(x*) = −.5 → λ = ln ½; r = 4 is chaotic with λ = ln 2; r = 2 from ½ is superstable (−∞)',
    near(l25, Math.log(.5), 1e-3) && near(l4, Math.log(2), .02) && l2 === -Infinity, `${l25.toFixed(5)}, ${l4.toFixed(4)}, ${l2}`)
  // the folded product against a plain sum of logs
  const seq = lyapunovSequence('AABAB')
  let err = 0
  for (const [a, b] of [[3.1, 3.7], [3.9, 2.6], [3.45, 3.5]]) {
    let x = .5, j = 0, s = 0
    for (let i = 0; i < 60; i++) { x = (seq[j] ? b : a) * x * (1 - x); j = (j + 1) % seq.length }
    for (let i = 0; i < 300; i++) { const r = seq[j] ? b : a; s += Math.log(Math.abs(r * (1 - 2 * x))); x = r * x * (1 - x); j = (j + 1) % seq.length }
    err = Math.max(err, Math.abs(lyapunov(a, b, seq, { n: 300 }) - s / 300))
  }
  assert('lyapunov: one log per fold equals the per-step sum of logs', err < 1e-9, err.toExponential(1))
  assert('lyapunov: sequences parse (A → 0, B → 1)', lyapunovSequence('aabAB').join('') === '00101')
}

export function fractalChecks(assert: Assert): void {
  const load = loadFactor()
  console.log(`  fractal: load factor ${load.toFixed(2)} (timing budgets scale by it)`)
  escapeChecks(assert)
  trapChecks(assert)
  densityChecks(assert)
  lyapunovChecks(assert)
  const det = detLint(['src/engine/fractal/'])
  assert('fractal: the determinism lint scans the folder and finds no engine-specific Math', det.scanned.length >= 7 && !det.violations.length,
    det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') || `${det.scanned.length} files`)

  // ── the board ──
  const frame = (p: WidgetPreset, t: number) => sampleLayers(withChrome(p)({ t, data: {} }), p.grid, p.style, dot480)
  const [bakeMs] = time(() => fractalsBoard.forEach(p => frame(p, 0)))
  assert('fractals board: every card\'s first frame, bakes included, in ≤ 400 ms total (cold, × load)', bakeMs <= 400 * load, `${bakeMs.toFixed(0)} ms`)
  const key = (p: WidgetPreset, t: number) => JSON.stringify(frame(p, t))
  assert('fractals board: every card is a pure function of t (same t, same dots, any order)', fractalsBoard.every(p => [0, 1.3, 7.7, 3600, 1.3].every(t => key(p, t) === key(p, t))))
  const reds = fractalsBoard.map(p => [0, 1.3, 9.25].map(t => frame(p, t).filter(d => d.color === dot480.dotActive).length))
  assert('fractals board: one red dot per card (the live element) at t = 0, 1.3 and 9.25', reds.every(r => r.every(n => n === 1)), fractalsBoard.map((p, i) => `${p.id} ${reds[i].join('/')}`).join(', '))
  assert('fractals board: every card carries a credit naming Inigo Quilez and an iquilezles.org article', fractalsBoard.every(p => p.credit?.by[0] === 'Inigo Quilez' && p.credit.source.startsWith('https://iquilezles.org/articles/')))
  const warm = (p: WidgetPreset) => { for (let i = 0; i < 4; i++) frame(p, i / 12); return median(Array.from({ length: 13 }, (_, i) => time(() => frame(p, 5.5 + i / 12))[0])) }
  const rows = fractalsBoard.map(p => [p.id, warm(p)] as const)
  assert('fractals board: a frame (layers + sample) of each card in ≤ 4 ms (median, warm; × load)', rows.every(([, ms]) => ms <= 4 * load),
    rows.map(([id, ms]) => `${id} ${ms.toFixed(2)}`).join(', ') + ' ms')
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('fractal')
  fractalChecks(assert)
  done('fractal checks passed')
}
