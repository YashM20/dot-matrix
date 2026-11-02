/**
 * Checks for the 2D SDF library (`src/engine/sdf/`, #62, docs/IQ-PLAN.md IQ1). Per primitive (table in
 * scripts/sdf-cases.ts): the distance at known points, the sign (negative inside), 1-Lipschitz on a random sweep
 * and on a lattice through the axes (that one catches GLSL `sign(0)` holes on a cell grid), and, for the exact
 * ones, |∇d| ≈ 1 off the medial axis (L1 norm for the L∞ set). Per `sdg*`: the gradient against a central
 * difference, unit length, and d against its plain counterpart. Plus the modifiers with gradients, the `sdfField`
 * adapter, the determinism lint on the module, and the `light/sdf.ts` helpers pinned bit for bit.
 * Called from verify.ts (`sdfChecks(assert)`); also runnable alone: `npx tsx scripts/sdf.ts`.
 */
import { detLint } from './lib/detLint'
import type { Assert } from './lib/check'
import { CASES, type Case, type Sd } from './sdf-cases'
import * as L from '../src/engine/light/sdf'
import * as S from '../src/engine/sdf'
import { mulberry32 } from '../src/engine/sampler/jitter'
import type { GridConfig } from '../src/engine/types'

type Sdg = (x: number, y: number, out: Float64Array) => number
const H = 1e-5

/** FNV-1a over the IEEE-754 bits of a list of doubles. */
function fnv(values: number[]): string {
  const f = new Float64Array(1), b = new Uint8Array(f.buffer)
  let h = 0x811c9dc5
  for (const v of values) { f[0] = v; for (let i = 0; i < 8; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) } }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Every check on one primitive; returns the failures (empty = pass) and a short summary. */
function checkCase(c: Case): { fails: string[]; info: string } {
  const fails: string[] = [], tol = c.tol ?? 1e-9, slack = c.slack ?? 1e-9, exact = c.exact ?? true, signed = c.signed ?? true
  const metric = c.linf ? (dx: number, dy: number) => Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot
  for (const [x, y, d] of c.at ?? []) {
    const got = c.f(x, y)
    if (!(Math.abs(got - d) <= tol * Math.max(1, Math.abs(d)))) fails.push(`d(${x}, ${y}) = ${got}, want ${d}`)
  }
  if (signed) {
    for (const [x, y] of c.inside ?? []) if (!(c.f(x, y) < 0)) fails.push(`(${x}, ${y}) should be inside: ${c.f(x, y)}`)
    for (const [x, y, d] of c.at ?? []) if (d !== 0 && Math.sign(c.f(x, y)) !== Math.sign(d)) fails.push(`sign at (${x}, ${y})`)
  } else {
    let neg = 0
    for (let i = 0; i < 400; i++) if (c.f(i % 20 * .4 - 4, Math.floor(i / 20) * .4 - 4) < 0) neg++
    if (neg) fails.push(`${neg} negative values from an unsigned SDF`)
  }
  for (const [x, y] of c.outside ?? []) if (!(c.f(x, y) > 0)) fails.push(`(${x}, ${y}) should be outside: ${c.f(x, y)}`)
  // 1-Lipschitz: random pairs (near and far), then neighbours on a lattice that runs through x = 0 and y = 0
  const rnd = mulberry32(0x5df), span = 4
  let worst = 0, nan = 0, where = '', nanAt = ''
  const lip = (ax: number, ay: number, bx: number, by: number) => {
    if (c.domain && !(c.domain(ax, ay) && c.domain(bx, by))) return
    const da = c.f(ax, ay), db = c.f(bx, by)
    if (!Number.isFinite(da) || !Number.isFinite(db)) { nan++; nanAt = `(${ax}, ${ay})`; return }
    const over = Math.abs(da - db) - metric(ax - bx, ay - by) - slack * (1 + Math.abs(da))
    if (over > worst) { worst = over; where = `(${ax.toFixed(3)}, ${ay.toFixed(3)}) → (${bx.toFixed(3)}, ${by.toFixed(3)})` }
  }
  for (let i = 0; i < 3000; i++) {
    const ax = (rnd() * 2 - 1) * span, ay = (rnd() * 2 - 1) * span
    const near = i % 3 !== 0, r = near ? rnd() * .3 : span * 2, t = rnd() * Math.PI * 2
    lip(ax, ay, ax + r * Math.cos(t), ay + r * Math.sin(t))
  }
  const step = .125
  for (let y = -span; y <= span; y += step) for (let x = -span; x <= span; x += step) { lip(x, y, x + step, y); lip(x, y, x, y + step) }
  if (nan) fails.push(`${nan} non-finite values on the sweep, e.g. at ${nanAt}`)
  if (worst > 0) fails.push(`not 1-Lipschitz: |Δd| exceeds |Δp| by ${worst.toExponential(2)} at ${where}`)
  // |∇d| = 1 (L2), or |gx| + |gy| = 1 (L∞), at all but a few points (the medial axis has no gradient)
  let good = 0
  const N = 2000
  if (exact) {
    for (let i = 0; i < N; i++) {
      const x = (rnd() * 2 - 1) * span, y = (rnd() * 2 - 1) * span
      if (c.domain && !c.domain(x, y)) { good++; continue }
      const gx = (c.f(x + H, y) - c.f(x - H, y)) / (2 * H), gy = (c.f(x, y + H) - c.f(x, y - H)) / (2 * H)
      const g = c.linf ? Math.abs(gx) + Math.abs(gy) : Math.hypot(gx, gy)
      if (Math.abs(g - 1) < 1e-3) good++
    }
    if (good < .97 * N) fails.push(`|∇d| = 1 at only ${good}/${N} points`)
  }
  const info = `${c.at?.length ?? 0} known points${signed ? ', sign' : ''}, 1-Lipschitz${exact ? `, |∇d| = 1 at ${good}/${N}` : ''}`
  return { fails, info }
}

interface GradCase { name: string; g: Sdg; plain: Sd; tol?: number; plainOnly?: (x: number, y: number) => boolean }
const GRADS: GradCase[] = [
  { name: 'sdgCircle', g: (x, y, o) => S.sdgCircle(x, y, 1.5, o), plain: (x, y) => S.sdCircle(x, y, 1.5) },
  { name: 'sdgPie', g: (x, y, o) => S.sdgPie(x, y, Math.sin(.9), Math.cos(.9), 2, o), plain: (x, y) => S.sdPie(x, y, Math.sin(.9), Math.cos(.9), 2) },
  { name: 'sdgArc', g: (x, y, o) => S.sdgArc(x, y, Math.sin(2), Math.cos(2), 2, .3, o), plain: (x, y) => S.sdArc(x, y, Math.sin(2), Math.cos(2), 2, .3) },
  { name: 'sdgSegment', g: (x, y, o) => S.sdgSegment(x, y, -1, -.5, 1.5, 1, .4, o), plain: (x, y) => S.sdSegment(x, y, -1, -.5, 1.5, 1) - .4 },
  { name: 'sdgVesica', g: (x, y, o) => S.sdgVesica(x, y, 2, 1, o), plain: (x, y) => S.sdVesica(y, x, Math.sqrt(3), 1) },
  { name: 'sdgBox', g: (x, y, o) => S.sdgBox(x, y, 2, 1, o), plain: (x, y) => S.sdBox(x, y, 2, 1) },
  { name: 'sdgCross', g: (x, y, o) => S.sdgCross(x, y, 2, .6, o), plain: (x, y) => S.sdCross(x, y, 2, .6), plainOnly: (x, y) => S.sdCross(x, y, 2, .6) > 0 },
  { name: 'sdgPentagon', g: (x, y, o) => S.sdgPentagon(x, y, 1.5, o), plain: (x, y) => S.sdPentagon(x, -y, 1.5), tol: 1e-7 },
  { name: 'sdgHexagon', g: (x, y, o) => S.sdgHexagon(x, y, 1.5, o), plain: (x, y) => S.sdHexagon(x, y, 1.5) },
  { name: 'sdgTriangleIsosceles', g: (x, y, o) => S.sdgTriangleIsosceles(x, y, 1, 2, o), plain: (x, y) => S.sdTriangleIsosceles(x, y, 1, 2) },
  { name: 'sdgTriangle', g: (x, y, o) => S.sdgTriangle(x, y, -1, -1, 2, 0, 0, 2, o), plain: (x, y) => S.sdTriangle(x, y, -1, -1, 2, 0, 0, 2) },
  { name: 'sdgQuad', g: (x, y, o) => S.sdgQuad(x, y, [-2, -1, 1, -1.5, 2, 1, -1, 2], o), plain: (x, y) => S.sdPolygon(x, y, [-2, -1, 1, -1.5, 2, 1, -1, 2]) },
  { name: 'sdgEllipse (4 steps)', g: (x, y, o) => S.sdgEllipse(x, y, 2, 1, o), plain: (x, y) => S.sdEllipseRobust(x, y, 2, 1, 12), tol: 5e-4 },
  { name: 'sdgEllipse (8 steps)', g: (x, y, o) => S.sdgEllipse(x, y, 2, 1, o, 8), plain: (x, y) => S.sdEllipseRobust(x, y, 2, 1, 12), tol: 1e-6 },
  { name: 'sdgMoon', g: (x, y, o) => S.sdgMoon(x, y, 1, 2, 1.5, o), plain: (x, y) => S.sdMoon(x, y, 1, 2, 1.5) },
  { name: 'sdgParabola', g: (x, y, o) => S.sdgParabola(x, y, .7, o), plain: (x, y) => S.sdParabola(x, y, .7), tol: 1e-7 },
  { name: 'sdgTrapezoid', g: (x, y, o) => S.sdgTrapezoid(x, y, 2, 1, 1, o), plain: (x, y) => S.sdTrapezoid(x, y, 2, 1, 1) },
  { name: 'sdgHeart', g: (x, y, o) => S.sdgHeart(x, y, o), plain: (x, y) => S.sdHeart(x, y) },
  { name: 'sdgRound (over sdgBox)', g: S.sdgRound((x, y, o) => S.sdgBox(x, y, 1.5, .5, o), .5), plain: S.opRound((x, y) => S.sdBox(x, y, 1.5, .5), .5) },
  { name: 'sdgOnion (over sdgHexagon)', g: S.sdgOnion((x, y, o) => S.sdgHexagon(x, y, 2, o), .3), plain: S.opOnion((x, y) => S.sdHexagon(x, y, 2), .3) },
]

function checkGrad(c: GradCase): string[] {
  const fails: string[] = [], o = new Float64Array(2), tol = c.tol ?? 1e-9, rnd = mulberry32(0x9d5), N = 2000
  let match = 0, unit = 0, dOff = 0, compared = 0
  for (let i = 0; i < N; i++) {
    const x = (rnd() * 2 - 1) * 3.5, y = (rnd() * 2 - 1) * 3.5
    const d = c.g(x, y, o), gx = o[0], gy = o[1]
    if (!c.plainOnly || c.plainOnly(x, y)) { compared++; if (!(Math.abs(d - c.plain(x, y)) <= tol * Math.max(1, Math.abs(d)))) dOff++ }
    if (Math.abs(Math.hypot(gx, gy) - 1) < 1e-6) unit++
    const fx = (c.g(x + H, y, o) - c.g(x - H, y, o)) / (2 * H), fy = (c.g(x, y + H, o) - c.g(x, y - H, o)) / (2 * H)
    if (Math.hypot(fx - gx, fy - gy) < 1e-4) match++
  }
  if (dOff) fails.push(`d differs from the plain SDF at ${dOff}/${compared} points`)
  if (unit < N) fails.push(`|g| ≠ 1 at ${N - unit}/${N} points`)
  if (match < .97 * N) fails.push(`gradient matches the finite difference at only ${match}/${N} points`)
  return fails
}

/** The light/sdf.ts helpers on a fixed sweep, hashed; pinned from main before this module existed. */
const LIGHT_HASH = '8126e108'
function lightSweep(sdf: typeof L): number[] {
  const g: GridConfig = { cols: 41, rows: 25 }
  const fs = [sdf.sdfCircle(g, 20, 12, 7.5), sdf.sdfBox(g, 20, 12, 12, 6, 3), sdf.sdfBox(g, 9, 7, 5, 3), sdf.sdfRing(g, 20, 12, 9, 1.5)]
  fs.push(sdf.sdfUnion(fs[0], fs[2]), sdf.sdfSubtract(fs[1], fs[0]))
  const out: number[] = []
  for (const f of fs) for (let r = 0; r <= 48; r++) for (let c = 0; c <= 80; c++) out.push(f(c / 80, r / 48))
  return out
}

export function sdfChecks(assert: Assert): void {
  for (const c of CASES) {
    const { fails, info } = checkCase(c)
    assert(`sdf ${c.name}`, !fails.length, fails.length ? fails.slice(0, 4).join('; ') : info)
  }
  for (const c of GRADS) {
    const fails = checkGrad(c)
    assert(`sdf ${c.name}: gradient = finite difference, |g| = 1, d = plain`, !fails.length, fails.join('; '))
  }
  // C² corners: the circle corner is the ordinary rounded box
  let worst = 0
  for (let i = 0; i < 4000; i++) {
    const x = (i % 80) / 10 - 4, y = Math.floor(i / 80) / 6 - 4
    worst = Math.max(worst, Math.abs(S.sdBoxCorners(x, y, 2, 1, S.cornerCircle, .5, .2, .7, .1) - S.sdRoundedBox(x, y, 2, 1, .5, .2, .7, .1)))
  }
  assert('sdf sdBoxCorners(cornerCircle) = sdRoundedBox (4 radii)', worst < 1e-12, `max |Δ| = ${worst.toExponential(1)}`)
  // ∂²d/∂x² just past the join (x = bx − r = 1.4), half a cell above the top edge: 0 along the side, so a C²
  // corner starts near 0 there while the circle jumps to its curvature
  const dxx = (corner: S.CornerSdf) => {
    const f = (x: number) => S.sdBoxCorners(x, 1.5, 2, 1, corner, .6), x = 1.401, e = 1e-3
    return (f(x + e) - 2 * f(x) + f(x - e)) / (e * e)
  }
  const jump = { circle: dxx(S.cornerCircle), parabola: dxx(S.cornerParabola), cosine: dxx(S.cornerCosine), cubic: dxx(S.cornerCubic) }
  assert('sdf C² corners: no curvature jump at the join (cosine, cubic), unlike the circle and parabola',
    jump.cosine < .02 && jump.cubic < .02 && jump.circle > .5 && jump.parabola > .3,
    Object.entries(jump).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '))
  // the Field adapter: cell units, centre, scale, rotation and the y flip
  const grid: GridConfig = { cols: 41, rows: 21 }
  const at = (f: (u: number, v: number) => number, col: number, row: number) => f(col / 40, row / 20)
  const disc = S.sdfField(grid, (x, y) => S.sdCircle(x, y, 1), { cx: 20, cy: 10, scale: 4 })
  const bar = S.sdfField(grid, (x, y) => S.sdBox(x, y, 6, 1), { cx: 20, cy: 10, angle: Math.PI / 2 })
  const tip = S.sdfField(grid, (x, y) => S.sdHeart(x, y), { cx: 20, cy: 15, scale: 10, flipY: true })
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  assert('sdf sdfField: cell units, centre, scale, angle, flipY',
    near(at(disc, 24, 10), 0) && near(at(disc, 20, 10), -4) && near(at(disc, 30, 10), 6) && near(at(bar, 20, 4), 0) && near(at(bar, 23, 10), 2) &&
    near(at(tip, 20, 15), 0) && near(at(tip, 20, 5), 0) && at(tip, 20, 10) < 0,
    `disc ${at(disc, 24, 10).toFixed(3)} / ${at(disc, 20, 10).toFixed(3)}, bar ${at(bar, 20, 4).toFixed(3)}, heart tip ${at(tip, 20, 15).toFixed(3)} notch ${at(tip, 20, 5).toFixed(3)}`)
  // light/sdf.ts: the same functions through the new index, and the same bits as before
  const same = S.sdfCircle === L.sdfCircle && S.sdfBox === L.sdfBox && S.sdfRing === L.sdfRing && S.sdfUnion === L.sdfUnion && S.sdfSubtract === L.sdfSubtract
  assert('sdf re-exports the light/sdf.ts helpers unchanged', same)
  const h = fnv(lightSweep(L))
  assert('sdf light/sdf.ts helpers bit-identical on a fixed sweep', h === LIGHT_HASH, `${h} (pinned ${LIGHT_HASH})`)
  const lint = detLint(['src/engine/sdf/'])
  assert('sdf determinism lint: no engine-specific Math.* in src/engine/sdf/', !lint.violations.length && lint.scanned.length > 0,
    lint.violations.length ? lint.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') : `${lint.scanned.length} files`)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('sdf')
  sdfChecks(assert)
  done('sdf checks passed')
}
