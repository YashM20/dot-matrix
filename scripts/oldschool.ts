/**
 * Checks for the oldschool pack (`src/engine/oldschool`, #67, docs/IQ-PLAN.md IQ6) and its board:
 * - plane deformations: every formula pair of the article at known points, the look-up table against direct
 *   evaluation, the texture wrap;
 * - dynamic clouds: the drift of each octave, the clear-sky threshold, the march, and the same bits for the same t
 *   in any order;
 * - feedback: the quad's corners, the fade, the border the copy never writes, and a replay from t that matches a
 *   straight run step for step;
 * - the board: six cards, each with its credit, the same dots for the same t, and a frame budget.
 * Exported as `oldschoolChecks(assert)`; also runnable alone: `npx tsx scripts/oldschool.ts`.
 */
import type { Assert } from './lib/check'
import { medianLoaded } from './lib/load'
import { DEFORMATIONS, deformLUT, deformRead, wrap01, type UV } from '../src/engine/oldschool/deform'
import { CLOUD_OCTAVES, CLOUD_RAY, cloudCover, cloudFbm, cloudGrid, cloudMarch, cloudShade } from '../src/engine/oldschool/clouds'
import { feedbackFrame, feedbackQuad, feedbackSim, feedbackZoom, sampleTexture } from '../src/engine/oldschool/feedback'
import { simAt, simAtStep, simReset } from '../src/engine/sim/sim'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { creditsOf, withChrome } from '../src/widgets/types'
import { oldschoolBoard } from '../src/widgets/boards/oldschool'

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps
const fnv = (xs: ArrayLike<number>) => { const f = new Float32Array(xs.length); f.set(xs); const u = new Uint8Array(f.buffer); let h = 0x811c9dc5; for (const b of u) h = Math.imul(h ^ b, 16777619) >>> 0; return h }

function deformChecks(assert: Assert): void {
  const uv: UV = [0, 0], at = (name: keyof typeof DEFORMATIONS, x: number, y: number) => [...DEFORMATIONS[name](x, y, uv)]
  // reference values worked by hand from the article's formulas (r = √(x² + y²), a = atan2(y, x))
  const cases: [keyof typeof DEFORMATIONS, number, number, number, number][] = [
    ['invert', .5, 0, 2, 0], ['invert', 0, -.25, 0, -4],
    ['twist', 0, 0, 0, 0], ['twist', .5, 0, .5 * Math.cos(1), .5 * Math.sin(1)],
    ['tunnel', 0, .5, .6, 1.5], ['tunnel', 1, 0, .2, 0],
    ['star', .5, 0, .06, .01], ['star', 0, 1, .02 + .03 * Math.cos(1.5 * Math.PI), .03 * Math.sin(1.5 * Math.PI)],
    ['lens', 0, 0, 0, 0], ['lens', .6, .8, .06 / .61, .08 / .61],
    ['rings', 1, 0, 0, Math.sin(7)], ['rings', 0, -2, -.25, Math.sin(14)],
    ['swirl', 1, 0, Math.cos(1), Math.sin(1)], ['swirl', 0, 0, 0, 0],
    ['flower', 1, 0, 1 / 1.5, 0], ['flower', 0, .5, 1 / 1.5, 1.5],
    ['floor', .5, .25, 2, 4], ['floor', -1, -.5, -2, 2],
  ]
  const bad = cases.filter(([n, x, y, u, v]) => { const [a, b] = at(n, x, y); return !near(a, u, 1e-5) || !near(b, v, 1e-5) })
  assert('oldschool: the eight formula pairs and the worked example hit their values at known points',
    !bad.length, bad.length ? bad.map(([n, x, y]) => `${n}(${x}, ${y}) = ${at(n, x, y).map(z => z.toFixed(6))}`).join('; ') : `${cases.length} points`)
  const twistR = Math.hypot(...at('twist', .3, .4)), swirlR = Math.hypot(...at('swirl', .3, .4))
  assert('oldschool: twist and swirl keep the radius (pure rotations)', near(twistR, .5, 1e-5) && near(swirlR, .5, 1e-5), `${twistR}, ${swirlR}`)
  assert('oldschool: wrap01 keeps the repeat positive and reads non-finite as 0',
    wrap01(1.25) === .25 && wrap01(-.25) === .75 && wrap01(Infinity) === 0 && wrap01(NaN) === 0 && wrap01(-Infinity) === 0)
  const W = 32, H = 24, lut = deformLUT(W, H, DEFORMATIONS.tunnel)
  let off = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [u, v] = at('tunnel', -1 + 2 * i / W, -1 + 2 * j / H), k = (j * W + i) * 2
    // Object.is: a NaN where the formula is finite (or a number at a pole) counts as off
    if (Number.isFinite(u) ? !Object.is(lut[k], Math.fround(u)) || !Object.is(lut[k + 1], Math.fround(v)) : !Object.is(lut[k], NaN)) off++
  }
  assert('oldschool: the look-up table is the formula at the article\'s pixel centres (x = −1 + 2i/w), poles as NaN', off === 0, `${off} of ${W * H} off`)
  const tex = (u: number, v: number) => u * 10 + v, r = deformRead(lut, 5, tex, .5, .25)
  assert('oldschool: a table read shifts by the scroll and wraps', near(r, wrap01(lut[10] + .5) * 10 + wrap01(lut[11] + .25), 1e-12), r.toFixed(6))
}

function cloudChecks(assert: Assert): void {
  // each octave drifts as a whole: fbm(x, y, t) = fbm(x + vel·t, y + vel·t, 0), on both axes
  const drift = CLOUD_OCTAVES.every(o => [0, 1, 2, 3, 4].every(i => {
    const [vx, vy] = o.vel
    return near(cloudFbm(.1 * i, .3, 2.5, 7, [o]), cloudFbm(.1 * i + vx * 2.5, .3 + vy * 2.5, 0, 7, [o]), 1e-12)
  }))
  assert('oldschool: each cloud octave drifts at its own velocity', drift)
  const fs = Array.from({ length: 400 }, (_, i) => cloudFbm(i * .037, i * .011, 1.3, 5))
  const lo = Math.min(...fs), hi = Math.max(...fs)
  assert('oldschool: the fbm stays in [0, .9375] (weights .5 + .25 + .125 + .0625)', lo >= 0 && hi <= .9375, `${lo.toFixed(3)}..${hi.toFixed(3)}`)
  assert('oldschool: cover is 0 below the threshold, 1 above the sharpness, linear between',
    cloudCover(.3, .4, .6) === 0 && cloudCover(.7, .4, .6) === 1 && near(cloudCover(.5, .4, .6), .5, 1e-12))
  const full = cloudShade(() => 1), clear = cloudShade(() => 0)
  assert('oldschool: the march is 0 in clear sky and (.1 + .4 + .7 + 1)/4 under full cover', clear === 0 && near(full, .55, 1e-12) && CLOUD_RAY.length === 4, `${full}`)
  const at = (i: number, j: number): [number, number] => [i * .02, j * .02]
  const spec = { a: .45, b: .6, seed: 67 }, g1 = cloudGrid(40, 30, 1.3, spec, at), h1 = fnv(g1)
  cloudGrid(40, 30, 9, spec, at)
  const g2 = cloudGrid(40, 30, 1.3, spec, at)
  assert('oldschool: clouds are a pure function of t (same bits after another t)', fnv(g2) === h1, h1.toString(16))
  const grid = new Float32Array(9).fill(0); grid[1] = 1; grid[2] = 1
  assert('oldschool: a baked march reads the cells toward the sun, clear sky off the grid',
    near(cloudMarch(grid, 3, 3, 0, 0, 1, 0), (.4 + .7 + 0) / 4, 1e-6) && cloudMarch(grid, 3, 3, 2, 2, 1, 0) === 0)
}

function feedbackChecks(assert: Assert): void {
  const uv: [number, number] = [0, 0], a = .7, s = .9
  const corner = (x: number, y: number, phi: number) => { feedbackQuad(x, y, a, s, uv); return near(uv[0], .5 + s * Math.cos(a + phi), 1e-6) && near(uv[1], .5 + s * Math.sin(a + phi), 1e-6) }
  assert('oldschool: the quad\'s corners read 0.5 + s·(cos, sin)(a + 0, π/2, π, 3π/2), the centre 0.5',
    corner(-1, 1, 0) && corner(-1, -1, Math.PI / 2) && corner(1, -1, Math.PI) && corner(1, 1, 1.5 * Math.PI) && (feedbackQuad(0, 0, a, s, uv), near(uv[0], .5) && near(uv[1], .5)))
  assert('oldschool: the article\'s zoom is .8 + .3 sin .2t', near(feedbackZoom(0), .8) && near(feedbackZoom(Math.PI * 2.5), 1.1, 1e-6))
  const N = 16, B = 3, src = new Float32Array(N * N).fill(1), dst = new Float32Array(N * N)
  src[0] = .5
  const flat = new Float32Array(N * N).fill(1), out = new Float32Array(N * N)
  feedbackFrame(flat, out, N, B, .3, .8, .75)
  feedbackFrame(src, dst, N, B, .3, .8, .75)
  let inner = true, border = true
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const inside = i >= B && j >= B && i < N - B && j < N - B, v = dst[j * N + i]
    if (inside && !(v > 0 && v <= .75)) inner = false
    if (inside && out[j * N + i] !== .75) inner = false
    if (!inside && v !== src[j * N + i]) border = false
  }
  assert('oldschool: one frame fades the copy by .75 and leaves the border as it was', inner && border)
  assert('oldschool: a clear read is 0 off the texture, a repeat read wraps',
    sampleTexture(src, N, 2, 2, 'clear') === 0 && near(sampleTexture(src, N, 2.5, 2.5), 1))
  const spec = {
    size: 24, border: 3, dt: .05, lead: 1, period: 4, every: 10,
    init: (t: Float32Array, n: number) => { for (let i = 0; i < n; i++) { t[i] = 1; t[(n - 1) * n + i] = .5 } },
    source: (t: Float32Array, n: number, k: number) => { t[n + (k % (n - 2)) + 1] = 1 },
  }
  const straight = feedbackSim(spec), steps: number[] = []
  for (let k = 0; k <= 90; k++) steps.push(fnv(simAtStep(straight, k)))
  const scrub = feedbackSim(spec), order = [57, 3, 90, 12, 57, 0, 41, 88, 20]
  const replay = order.every(k => fnv(simAtStep(scrub, k)) === steps[k])
  simReset(scrub)
  const cold = fnv(simAt(scrub, 3.3)) === steps[20 + 66 % 80]
  assert('oldschool: the feedback texture replays from t: any order of steps gives the straight run\'s bits', replay && cold, `${order.length} scrubs`)
}

function boardChecks(assert: Assert): void {
  const ids = oldschoolBoard.map(p => p.id)
  assert('oldschool: the board has 4 to 6 cards, each crediting its article', ids.length >= 4 && ids.length <= 6 &&
    oldschoolBoard.every(p => { const c = creditsOf(p)[0]; return c?.by.includes('Inigo Quilez') && /^https:\/\/iquilezles\.org\/articles\/(deform|dynclouds|feedbackfx)\/$/.test(c.source) }), ids.join(' '))
  const dots = (i: number, t: number) => { const p = oldschoolBoard[i]; return sampleLayers(withChrome(p)({ t, data: {} }), p.grid, p.style, dot480) }
  const key = (i: number, t: number) => JSON.stringify(dots(i, t))
  const same = oldschoolBoard.every((_, i) => { const a = key(i, 1.3); key(i, 7.9); return key(i, 1.3) === a })
  assert('oldschool: every card draws the same dots for the same t', same)
  // a red element is one group of red dots: dots link when their centres are within 16 px (the sun's bands, a brick
  // pair across its mortar), so two separate red things count as 2
  const groups = (pts: { x: number; y: number }[]) => {
    const up = pts.map((_, i) => i), find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])))
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) if ((pts[a].x - pts[b].x) ** 2 + (pts[a].y - pts[b].y) ** 2 <= 256) up[find(a)] = find(b)
    return new Set(pts.map((_, i) => find(i))).size
  }
  const reds = oldschoolBoard.map((_, i) => groups(dots(i, 1.3).filter(d => d.color === dot480.dotActive)))
  assert('oldschool: at most one red element per card, and only the accent red', reds.every(n => n <= 1), reds.join(' '))
  for (const [i, p] of oldschoolBoard.entries()) {
    let t = 30
    const { ms, load } = medianLoaded(() => dots(i, (t += 1 / 12)), 9)
    assert(`oldschool: ${p.id} frame ≤ ${(4 * load).toFixed(1)} ms (4 ms × load)`, ms <= 4 * load, `${ms.toFixed(2)} ms, load ${load.toFixed(2)}`)
  }
}

export function oldschoolChecks(assert: Assert): void {
  deformChecks(assert)
  cloudChecks(assert)
  feedbackChecks(assert)
  boardChecks(assert)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('oldschool')
  oldschoolChecks(assert)
  done('oldschool checks passed')
}
