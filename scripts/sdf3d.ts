/**
 * Checks for the 3D SDF pack (`src/engine/sdf3d`, #69, docs/IQ-PLAN.md IQ8) and the scenes board:
 * - primitives: the distance at known points, negative inside, 1-Lipschitz on a random sweep;
 * - operators: round, onion, elongate (both forms), revolution and extrusion against the 3D shapes they rebuild,
 *   twist and bend as the identity on their axis, uniform scale, limited repetition;
 * - the tracer hits a sphere at the analytic t, the tetrahedron normal matches a central difference, the three
 *   soft shadows stay in [0, 1], are 1 in the open and 0 behind a wall;
 * - fog and light: the fog curve, the height fog against a numeric integral, the rig's lights, the gamma example;
 * - the determinism lint on the module and the board files;
 * - the board: four cards with a credit each, the same dots for the same t, at most one red element a card.
 *   Frame time is printed as a warning only (4 ms × load).
 * Exported as `sdf3dChecks(assert)`; also runnable alone: `npx tsx scripts/sdf3d.ts`.
 */
import type { Assert } from './lib/check'
import { detLint } from './lib/detLint'
import { medianLoaded } from './lib/load'
import { sdBox as sdBox2, sdCircle } from '../src/engine/sdf/basic'
import * as P from '../src/engine/sdf3d/prims'
import * as O from '../src/engine/sdf3d/ops'
import { calcNormal, lookAt, softShadow, softShadowImproved, softShadowInner, sphereTrace } from '../src/engine/sdf3d/march'
import { fogAmount, gamma, heightFog, outdoorLight, SKY_RGB, SUN_RGB } from '../src/engine/sdf3d/light'
import { mulberry32 } from '../src/engine/sampler/jitter'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { creditsOf, withChrome } from '../src/widgets/types'
import { scenesBoard } from '../src/widgets/boards/scenes'

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps
const rnd = mulberry32(69), r = (a: number, b: number) => a + (b - a) * rnd()
type Sd = P.Sd3

function primChecks(assert: Assert): void {
  // [name, sd, known points [x, y, z, d], an inside point]
  const cases: [string, Sd, [number, number, number, number][], [number, number, number]][] = [
    ['sphere', (x, y, z) => P.sdSphere(x, y, z, 1), [[2, 0, 0, 1], [0, 0, 0, -1], [0, 3, 4, 4]], [0, .5, 0]],
    ['box', (x, y, z) => P.sdBox(x, y, z, 1, 2, 3), [[2, 0, 0, 1], [0, 0, 0, -1], [2, 3, 3, Math.SQRT2], [0, 0, 5, 2]], [.5, .5, .5]],
    ['round box', (x, y, z) => P.sdRoundBox(x, y, z, 1, 1, 1, .25), [[2, 0, 0, 1], [0, 0, 0, -1], [1, 1, 1, Math.sqrt(3) * .25 - .25]], [0, 0, 0]],
    ['box frame', (x, y, z) => P.sdBoxFrame(x, y, z, 1, 1, 1, .1), [[0, 0, 0, .8 * Math.SQRT2], [1, 1, 0, 0], [2, 1, 1, 1]], [.9, .9, .5]],
    ['torus', (x, y, z) => P.sdTorus(x, y, z, 2, .5), [[2, 0, 0, -.5], [0, 0, 0, 1.5], [2, 1, 0, .5], [0, 0, 3, .5]], [0, 0, 2]],
    ['link', (x, y, z) => P.sdLink(x, y, z, .5, 1, .2), [[1, 0, 0, -.2], [1, .5, 0, -.2], [0, 1.5, 0, -.2], [0, 0, 0, .8]], [-1, .3, 0]],
    ['capsule', (x, y, z) => P.sdCapsule(x, y, z, 0, 0, 0, 0, 2, 0, .5), [[1, 1, 0, .5], [0, 3, 0, .5], [0, -1, 0, .5], [0, 1, 0, -.5]], [0, 1, .2]],
    ['vertical capsule', (x, y, z) => P.sdVerticalCapsule(x, y, z, 2, .5), [[1, 1, 0, .5], [0, 3, 0, .5], [0, -1, 0, .5]], [0, 1, 0]],
    ['capped cylinder', (x, y, z) => P.sdCappedCylinder(x, y, z, 1, 2), [[2, 0, 0, 1], [0, 3, 0, 1], [0, 0, 0, -1], [2, 3, 0, Math.SQRT2]], [.5, 1, 0]],
    ['rounded cylinder', (x, y, z) => P.sdRoundedCylinder(x, y, z, 1, .2, 2), [[2, 0, 0, 1], [0, 3, 0, 1], [0, 0, 0, -1]], [.5, 1, 0]],
    ['plane', (x, y, z) => P.sdPlane(x, y, z, 0, 1, 0, 0), [[5, 2, -3, 2], [0, -1, 0, -1]], [0, -1, 0]],
  ]
  const bad: string[] = []
  for (const [name, sd, at, inside] of cases) {
    for (const [x, y, z, d] of at) if (!near(sd(x, y, z), d, 1e-9)) bad.push(`${name}(${x}, ${y}, ${z}) = ${sd(x, y, z)}, want ${d}`)
    if (!(sd(...inside) < 0)) bad.push(`${name}: (${inside}) should be inside`)
    // 1-Lipschitz: |d(p) − d(q)| ≤ |p − q|
    for (let i = 0; i < 300; i++) {
      const a: [number, number, number] = [r(-3, 3), r(-3, 3), r(-3, 3)], b: [number, number, number] = [a[0] + r(-.3, .3), a[1] + r(-.3, .3), a[2] + r(-.3, .3)]
      if (Math.abs(sd(...a) - sd(...b)) > Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) + 1e-9) { bad.push(`${name}: not 1-Lipschitz near (${a.map(v => v.toFixed(2))})`); break }
    }
  }
  const e = P.sdEllipsoid(2, 0, 0, 1, 2, 3), e0 = P.sdEllipsoid(1, 0, 0, 1, 2, 3)
  if (!(e > 0 && e <= 1 + 1e-12 && near(e0, 0, 1e-12) && P.sdEllipsoid(0, 0, 0, 1, 2, 3) < 0)) bad.push(`ellipsoid bound: ${e}, ${e0}`)
  assert('sdf3d: primitives hit their distances at known points, are negative inside and 1-Lipschitz', !bad.length, bad.join('; ') || `${cases.length + 1} shapes`)
}

function opChecks(assert: Assert): void {
  const sphere: Sd = (x, y, z) => P.sdSphere(x, y, z, 1), pts = Array.from({ length: 200 }, () => [r(-3, 3), r(-3, 3), r(-3, 3)] as [number, number, number])
  const all = (f: (p: [number, number, number]) => boolean) => pts.every(f)
  const bad: string[] = []
  if (!all(p => near(O.opRound(sphere, .25)(...p), sphere(...p) - .25))) bad.push('round')
  if (!all(p => near(O.opOnion(sphere, .1)(...p), Math.abs(sphere(...p)) - .1) && near(O.onion(sphere(...p), .1), Math.abs(sphere(...p)) - .1))) bad.push('onion')
  // elongating a sphere along y by h is the vertical capsule of height 2h, moved down by h
  if (!all(p => near(O.opElongate(sphere, 0, .7, 0)(...p), P.sdVerticalCapsule(p[0], p[1] + .7, p[2], 1.4, 1)))) bad.push('elongate (capsule)')
  // the exact form on a sphere is the rounded box; both forms agree outside
  if (!all(p => near(O.opElongateExact(sphere, .5, .4, .3)(...p), P.sdRoundBox(p[0], p[1], p[2], 1.5, 1.4, 1.3, 1), 1e-9))) bad.push('elongate exact (round box)')
  if (!all(p => O.opElongate(sphere, .5, .4, .3)(...p) <= 0 || near(O.opElongate(sphere, .5, .4, .3)(...p), O.opElongateExact(sphere, .5, .4, .3)(...p), 1e-9))) bad.push('elongate forms differ outside')
  // revolving a 2D circle at radius 2 is a torus; extruding a 2D box is a 3D box
  if (!all(p => near(O.opRevolution((a, b) => sdCircle(a, b, .5), 2)(...p), P.sdTorus(...p, 2, .5)))) bad.push('revolution (torus)')
  if (!all(p => near(O.opExtrusion((a, b) => sdBox2(a, b, 1, .5), .75)(...p), P.sdBox(...p, 1, .5, .75)))) bad.push('extrusion (box)')
  const box: Sd = (x, y, z) => P.sdBox(x, y, z, .5, .8, .3)
  if (!all(p => near(O.opTwist(box, 3)(p[0], 0, p[2]), box(p[0], 0, p[2]), 1e-6))) bad.push('twist is the identity at y = 0')
  if (!all(p => near(O.opCheapBend(box, 3)(0, p[1], p[2]), box(0, p[1], p[2]), 1e-6))) bad.push('bend is the identity at x = 0')
  // twisting a shape round its own axis of symmetry changes nothing: a cylinder stays a cylinder
  if (!all(p => near(O.opTwist((x, y, z) => P.sdCappedCylinder(x, y, z, 1, 2), 2.5)(...p), P.sdCappedCylinder(...p, 1, 2), 1e-5))) bad.push('twist keeps a cylinder')
  if (!all(p => near(O.opScale(sphere, 2)(...p), P.sdSphere(...p, 2), 1e-12))) bad.push('scale')
  if (!all(p => near(O.opSymX(box)(...p), box(Math.abs(p[0]), p[1], p[2])))) bad.push('mirror')
  const rep = O.opLimitedRepetition(sphere, 4, 1, 0, 0)
  if (!(near(rep(4, 0, 0), -1) && near(rep(-4, 0, 0), -1) && near(rep(8, 0, 0), 3) && near(rep(2, 0, 0), 1))) bad.push('limited repetition')
  if (!(O.opUnion(1, 2) === 1 && O.opSubtraction(1, 2) === 2 && O.opIntersection(1, 2) === 2 && O.smoothUnion(1, 1, .1) < 1)) bad.push('booleans')
  assert('sdf3d: round, onion, elongate, revolution, extrusion, twist, bend, scale, mirror and repetition', !bad.length, bad.join('; ') || `${pts.length} points`)
}

function marchChecks(assert: Assert): void {
  const sphere: Sd = (x, y, z) => P.sdSphere(x, y, z - 1, 1)
  // from (0, 0, −4) straight on: t = 4; from (0, .6, −4) along z: t = 5 − √(1 − .36) = 4.2
  const t1 = sphereTrace(sphere, 0, 0, -4, 0, 0, 1, 0, 20, 1e-5), t2 = sphereTrace(sphere, 0, .6, -4, 0, 0, 1, 0, 20, 1e-5)
  const miss = sphereTrace(sphere, 0, 1.2, -4, 0, 0, 1, 0, 20, 1e-5)
  assert('sdf3d: the sphere tracer hits a sphere at the analytic t, misses past its rim', near(t1, 4, 1e-4 * 4) && near(t2, 4.2, 1e-4 * 4.2) && miss === -1, `${t1}, ${t2}, ${miss}`)
  const cam = lookAt([0, 0, -4], [0, 0, 0], 2, 60)
  assert('sdf3d: lookAt faces the target and a dot covers 2/(rows·fl) radians', near(cam.wz, 1) && near(cam.vy, 1) && near(cam.cell, 2 / 120))
  // tetrahedron normal vs a central difference, on three shapes, at points on their surfaces
  const shapes: [string, Sd][] = [['sphere', sphere], ['box', (x, y, z) => P.sdRoundBox(x, y, z, 1, .6, .8, .1)], ['torus', (x, y, z) => P.sdTorus(x, y, z, 1, .3)]]
  const n: [number, number, number] = [0, 0, 0], H = 1e-5
  let worst = 1, hits = 0
  for (const [, sd] of shapes) for (let i = 0; i < 100; i++) {
    const ox = r(-.5, .5), oy = r(-.5, .5), t = sphereTrace(sd, ox, oy, -4, 0, 0, 1, 0, 20, 1e-8, 400)
    if (t < 0) continue
    const p: [number, number, number] = [ox, oy, -4 + t]
    calcNormal(sd, p[0], p[1], p[2], 1e-4, n)
    const g = [sd(p[0] + H, p[1], p[2]) - sd(p[0] - H, p[1], p[2]), sd(p[0], p[1] + H, p[2]) - sd(p[0], p[1] - H, p[2]), sd(p[0], p[1], p[2] + H) - sd(p[0], p[1], p[2] - H)]
    const gl = Math.hypot(...g)
    if (gl > 0) { worst = Math.min(worst, (n[0] * g[0] + n[1] * g[1] + n[2] * g[2]) / gl); hits++ }
  }
  assert('sdf3d: the tetrahedron normal matches a central difference (cos ≥ 0.9999)', worst >= .9999 && hits > 150, `${worst.toFixed(6)} over ${hits} hits`)
  // soft shadows: 1 with nothing in the way, 0 behind a wall, in [0, 1] everywhere
  const wall: Sd = (x, y, z) => P.sdBox(x, y - 1, z, 2, .1, 2)
  const variants = [
    (ox: number, oy: number, oz: number, lx: number, ly: number, lz: number) => softShadow(wall, ox, oy, oz, lx, ly, lz, .02, 10, 8),
    (ox: number, oy: number, oz: number, lx: number, ly: number, lz: number) => softShadowImproved(wall, ox, oy, oz, lx, ly, lz, .02, 10, .1),
    (ox: number, oy: number, oz: number, lx: number, ly: number, lz: number) => softShadowInner(wall, ox, oy, oz, lx, ly, lz, .02, 10, .1),
  ]
  const open = variants.map(f => f(5, 0, 0, 0, 1, 0)), under = variants.map(f => f(0, 0, 0, 0, 1, 0))
  let range = true
  for (let i = 0; i < 400; i++) {
    const l = [r(-1, 1), r(.1, 1), r(-1, 1)], ll = Math.hypot(...l)
    for (const f of variants) { const s = f(r(-3, 3), r(-.5, .5), r(-3, 3), l[0] / ll, l[1] / ll, l[2] / ll); if (!(s >= 0 && s <= 1)) range = false }
  }
  assert('sdf3d: the three soft shadows are 1 in the open, 0 under a slab, and stay in [0, 1]',
    open.every(s => near(s, 1, 1e-9)) && under.every(s => near(s, 0, 1e-3)) && range, `open ${open.map(s => s.toFixed(3))}, under ${under.map(s => s.toFixed(3))}`)
}

function lightChecks(assert: Assert): void {
  assert('sdf3d: fog is 0 at the eye, 1 − e^(−1) at t = 1/b, rising toward 1', fogAmount(0, .1) === 0 && near(fogAmount(10, .1), 1 - Math.exp(-1), 1e-9) && fogAmount(100, .1) > fogAmount(50, .1))
  // height fog against a midpoint sum of a·e^(−b·y) along the ray, and its level-ray limit
  const a = .05, b = 1.3, oy = .8, dy = .15, t = 9
  let sum = 0
  for (let i = 0; i < 20000; i++) sum += a * Math.exp(-b * (oy + dy * (i + .5) * t / 20000)) * t / 20000
  const level = heightFog(t, oy, 1e-9, a, b)
  assert('sdf3d: height fog is the closed-form integral of a·e^(−b·y) along the ray (and a level ray is its limit)',
    near(heightFog(t, oy, dy, a, b), sum, 1e-6) && near(level, a * Math.exp(-b * oy) * t, 1e-6), `${heightFog(t, oy, dy, a, b)} vs ${sum}`)
  const out: [number, number, number] = [0, 0, 0]
  outdoorLight([0, 1, 0], [0, 1, 0], 1, 1, out)
  const want = [0, 1, 2].map(i => SUN_RGB[i] + SKY_RGB[i])
  const dark: [number, number, number] = [0, 0, 0]
  outdoorLight([0, -1, 0], [0, 1, 0], 0, 0, dark)
  assert('sdf3d: the rig: sun plus sky on a face looking at an overhead sun, nothing on a face looking down in shadow',
    out.every((v, i) => near(v, want[i], 1e-12)) && dark.every(v => v === 0), out.map(v => v.toFixed(3)).join(' '))
  assert('sdf3d: gamma 1/2.2: the article\'s pow(0.2 · 1.25, 1/2.2) ≈ 0.53', near(gamma(.25), .5325, 5e-4) && gamma(0) === 0 && near(gamma(1), 1, 1e-12), gamma(.25).toFixed(4))
}

function boardChecks(assert: Assert): void {
  const det = detLint(['src/engine/sdf3d/', 'src/widgets/boards/scenes'])
  assert('sdf3d: the module and the board pass the determinism lint', !det.violations.length && det.scanned.length >= 8,
    det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') || `${det.scanned.length} files`)
  const ids = scenesBoard.map(p => p.id)
  assert('sdf3d: the scenes board has four cards, each crediting an article', ids.length === 4 &&
    scenesBoard.every(p => { const c = creditsOf(p)[0]; return c?.by.includes('Inigo Quilez') && /^https:\/\/iquilezles\.org\/articles\/[a-zA-Z0-9]+\/$/.test(c.source) }), ids.join(' '))
  const dots = (i: number, t: number) => { const p = scenesBoard[i]; return sampleLayers(withChrome(p)({ t, data: {} }), p.grid, p.style, dot480) }
  const key = (i: number, t: number) => JSON.stringify(dots(i, t))
  assert('sdf3d: every card draws the same dots for the same t', scenesBoard.every((_, i) => { const a = key(i, 1.3); key(i, 7.9); return key(i, 1.3) === a }))
  // one red element: red dots linked when their centres are within 12 px
  const groups = (pts: { x: number; y: number }[]) => {
    const up = pts.map((_, i) => i), find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])))
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) if ((pts[a].x - pts[b].x) ** 2 + (pts[a].y - pts[b].y) ** 2 <= 144) up[find(a)] = find(b)
    return new Set(pts.map((_, i) => find(i))).size
  }
  const reds = scenesBoard.map((_, i) => groups(dots(i, 1.3).filter(d => d.color === dot480.dotActive)))
  assert('sdf3d: exactly one red element per card, in the accent red', reds.every(n => n === 1), reds.join(' '))
  for (const [i, p] of scenesBoard.entries()) {
    let t = 30
    const { ms, load } = medianLoaded(() => dots(i, (t += 1 / 12)), 5)
    const budget = 4 * load
    console.log(`${ms <= budget ? '  ' : '⚠ '}sdf3d: ${p.id} frame ${ms.toFixed(1)} ms (budget ${budget.toFixed(1)} ms = 4 ms × load ${load.toFixed(2)}; warn only)`)
  }
}

export function sdf3dChecks(assert: Assert): void {
  primChecks(assert)
  opChecks(assert)
  marchChecks(assert)
  lightChecks(assert)
  boardChecks(assert)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('sdf3d')
  sdf3dChecks(assert)
  done('sdf3d checks passed')
}
