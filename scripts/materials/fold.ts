/**
 * Materials checks, fold group (scripts/materials.ts `--only fold`): the paper fold on `/workshop/`
 * (docs/living-matter/X-advanced.md #17). The operator: folding keeps the sheet's area (facets in sheet and in card
 * space), every facet sits by an isometry (its face flipped exactly when it is a reflection), a fold in progress keeps
 * distances in 3D and fixes the crease, a finished turn lands on the next flat state's layers, unfolding returns the
 * exact sheet, posed normals are unit and face the viewer. The card: the loop wraps, the red is the moving crease only,
 * each unfold retraces its fold, the file is in the determinism lint, and the frame cost.
 */
import { creaseLine, foldFlat, foldPoint, mapPoly, polyArea, pose, rasterFold, reflectAffine, type Posed } from '../../src/engine/matter/fold'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../../src/widgets/types'
import { foldHooks as F } from '../../src/widgets/boards/workshop-fold'
import { workshopBoard } from '../../src/widgets/boards/workshop'
import { DET_PATHS, detLint } from '../lib/detLint'
import { fmtLoaded, medianLoaded } from '../lib/load'
import { type Assert, same, type MaterialsOptions } from './util'
import { atClock } from './board'

const frame = (p: WidgetPreset, t: number) => atClock(() => sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, dot480))
const key = (p: WidgetPreset, t: number) => JSON.stringify(frame(p, t))
const dist3 = (a: readonly number[], b: readonly number[]) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

export function foldChecks(assert: Assert, opts: MaterialsOptions): void {
  const card = workshopBoard.find(p => p.id === 'mat-fold')!, S = F.SHEET, C = F.CREASES, K = C.length
  const [x0, y0, x1, y1] = F.FOLD.sheet, area = (x1 - x0) * (y1 - y0)

  // area: every flat state and a few mid-fold poses, in sheet space and in card space
  let worst = 0, count = 0
  for (let k = 0; k <= K; k++) {
    const fs = foldFlat(S, C, k)
    count = fs.length
    const sheet = fs.reduce((s, f) => s + Math.abs(polyArea(f.poly)), 0), card2 = fs.reduce((s, f) => s + Math.abs(polyArea(mapPoly(f.m, f.poly))), 0)
    worst = Math.max(worst, Math.abs(sheet - area) / area, Math.abs(card2 - area) / area)
    if (k < K) for (const th of [.7, 2.4]) worst = Math.max(worst, Math.abs(pose(fs, creaseLine(C[k]), th).reduce((s, p) => s + Math.abs(polyArea(p.facet.poly)), 0) - area) / area)
  }
  assert('fold: folding keeps the area (the facets sum to the sheet, in sheet and card space, flat and mid-fold)', worst < 1e-9 && count > K, `worst ${worst.toExponential(1)}, ${count} facets folded`)

  // every facet sits by an isometry; its back is up exactly when that isometry is a reflection
  let iso = true
  for (let k = 0; k <= K; k++) for (const f of foldFlat(S, C, k)) {
    const [a, b, c, d] = f.m, det = a * d - b * c
    if (Math.abs(a * a + c * c - 1) > 1e-12 || Math.abs(b * b + d * d - 1) > 1e-12 || Math.abs(a * b + c * d) > 1e-12 || Math.abs(Math.abs(det) - 1) > 1e-12 || (det < 0) !== f.back) iso = false
  }
  assert('fold: every facet lies by an isometry of the sheet, back up exactly when it is a reflection', iso)

  // a fold in progress: 3D distances kept, the crease fixed; θ = π is the reflection, and twice that is the identity
  let turn = 0, fixed = 0, refl = 0
  for (let k = 0; k < K; k++) {
    const L = creaseLine(C[k]), pts: number[][] = []
    for (const f of foldFlat(S, C, k)) { const w = mapPoly(f.m, f.poly); for (let i = 0; i < w.length; i += 2) if ((w[i] - L.x) * L.nx + (w[i + 1] - L.y) * L.ny > 1e-6) pts.push([w[i], w[i + 1], 0]) }
    for (const th of [.4, Math.PI / 2, 2.2, Math.PI]) {
      const q = pts.map(p => foldPoint(L, th, p[0], p[1])), tol = th === Math.PI ? 1e-9 : 1e-4
      for (let i = 0; i < q.length; i += 3) for (let j = i + 1; j < q.length; j += 5) turn = Math.max(turn, Math.abs(dist3(q[i], q[j]) - dist3(pts[i], pts[j])) / tol)
      for (const s of [-40, 0, 25]) { const on = foldPoint(L, th, L.x - L.ny * s, L.y + L.nx * s); fixed = Math.max(fixed, dist3(on, [L.x - L.ny * s, L.y + L.nx * s, 0])) }
    }
    const m2 = reflectAffine(reflectAffine([1, 0, 0, 1, 0, 0], L), L)
    refl = Math.max(refl, Math.abs(m2[0] - 1), Math.abs(m2[1]), Math.abs(m2[2]), Math.abs(m2[3] - 1), Math.abs(m2[4]), Math.abs(m2[5]))
  }
  assert('fold: a fold across a crease is an isometry (3D distances kept while it turns, the crease fixed, a reflection twice is the identity)', turn <= 1 && fixed < 1e-9 && refl < 1e-9, `distance error ${turn.toFixed(3)} of its tolerance, crease moves ${fixed.toExponential(1)}, reflection² − I ${refl.toExponential(1)}`)

  // a finished turn (θ = π) is the next flat state: the same facets, outlines, layers and faces, so a fold ends with no jump
  let land = true
  for (let k = 0; k < K; k++) {
    const a = pose(foldFlat(S, C, k), creaseLine(C[k]), Math.PI), b = pose(foldFlat(S, C, k + 1), null, 0)
    if (a.length !== b.length || a.some((p, i) => p.key !== b[i].key || p.front !== b[i].front || p.pts.some((v, j) => Math.abs(v - b[i].pts[j]) > 1e-9))) land = false
  }
  assert('fold: a fold turned to θ = π lands on the next flat state (outlines, layers and faces)', land)

  // unfolding returns the exact sheet: one facet, its outline the sheet's own numbers, every cell of it one tone
  const flatT = F.CYCLE - F.FOLD.flat / 2 - F.FOLD.offset, ff = F.foldFrame(flatT), flat = F.posedAt(ff)
  const sh = F.shadeFold(flat, [-.4, -.5, .77], null)
  const tones = new Set<number>()
  let cells = 0
  for (let i = 0; i < sh.top.length; i++) if (sh.top[i] >= 0) { cells++; tones.add(sh.tones[i] * 10 + Math.round(sh.values.data[i] * 100)) }
  const exact = ff.phase === 'flat' && flat.length === 1 && flat[0].pts.every((v, i) => Object.is(v, S[i])) && flat[0].front
  assert('fold: unfolding returns the exact sheet (one facet, the sheet outline bit for bit, every cell one tone)', exact && cells === (x1 - x0 + 1) * (y1 - y0 + 1) && tones.size === 1, `${flat.length} facet, ${cells} cells, ${tones.size} tone`)

  // posed normals: unit and facing the viewer, over the whole loop
  let unit = 0, facing = true
  const poses: Posed[][] = []
  for (let i = 0; i < 120; i++) poses.push(F.posedAt(F.foldFrame(i * F.CYCLE / 120)))
  for (const ps of poses) for (const p of ps) { unit = Math.max(unit, Math.abs(Math.hypot(p.n[0], p.n[1], p.n[2]) - 1)); if (p.n[2] < 0) facing = false }
  assert('fold: facet normals are unit and face the viewer (120 frames over the loop)', unit < 1e-12 && facing, `|n| − 1 up to ${unit.toExponential(1)}`)

  // the loop wraps, and each unfold retraces its fold (the rest after fold k ≡ the gap after unfolding to k)
  const wrap = [0, .3, 2.9, 6.1, 9.4, 12.2].every(t => { const a = F.foldFrame(t), b = F.foldFrame(t + F.CYCLE); return a.k === b.k && a.phase === b.phase && a.active === b.active && Math.abs(a.theta - b.theta) < 1e-9 })
  const FS = F.FOLD.fold + F.FOLD.rest, US = F.FOLD.unfold + F.FOLD.gap, folding = K * FS
  const restT = (k: number) => (k - 1) * FS + F.FOLD.fold + F.FOLD.rest / 2 - F.FOLD.offset
  const gapT = (k: number) => folding + F.FOLD.hold + (K - 1 - k) * US + F.FOLD.unfold + F.FOLD.gap / 2 - F.FOLD.offset
  const sheetAt = (t: number) => { const s = F.shadeFold(F.posedAt(F.foldFrame(t)), [-.4, -.5, .77], null); return [s.values.data, s.tones] as const }
  const retrace = [1, 2, 3, 4].every(k => {
    const a = sheetAt(restT(k)), b = sheetAt(gapT(k))
    return F.foldFrame(restT(k)).k === k && F.foldFrame(gapT(k)).k === k && same(a[0], b[0]) && same(a[1], b[1])
  })
  const holdT = folding + F.FOLD.hold / 2 - F.FOLD.offset, ends = key(card, holdT) === key(card, holdT + F.CYCLE) && key(card, flatT) === key(card, flatT - F.CYCLE)
  assert('fold: the loop wraps (t and t + cycle agree) and each unfold retraces its fold (the same frame folded to k either way)', wrap && retrace && ends, `cycle ${F.CYCLE.toFixed(2)} s`)

  // red: the moving crease and nothing else; none while the sheet rests
  const reds = (t: number) => frame(card, t).filter(d => d.color === dot480.dotActive).length, f0 = F.foldFrame(0)
  const L0 = creaseLine(C[f0.active]), on = F.shadeFold(F.posedAt(f0), [-.4, -.5, .77], L0).red.every(([x, y]) => Math.abs((x - L0.x) * L0.nx + (y - L0.y) * L0.ny) < .5)
  assert('fold: t = 0 is mid-fold with the moving crease in red (on its line); no red while folded, flat or resting', f0.phase === 'fold' && f0.active === 2 && reds(0) > 0 && on && reds(holdT) === 0 && reds(flatT) === 0 && reds(restT(2)) === 0,
    `red ${reds(0)} at t 0, ${reds(holdT)} folded, ${reds(flatT)} flat`)
  const top = new Int16Array(144 * 144), covered = rasterFold(F.posedAt(F.foldFrame(holdT)), 144, 144, top)
  assert('fold: the folded glider is smaller than the sheet and stays on the card', !!covered && covered[3] < y1 && covered[0] >= 0 && covered[2] <= 143, `${covered?.join(',')}`)

  const det = detLint(['src/engine/matter/fold'])
  assert('fold: the operator is in the determinism lint (by file) and clean', (DET_PATHS as readonly string[]).includes('src/engine/matter/fold') && det.scanned.length === 1 && !det.violations.length, det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; '))
  if (!opts.quick) {
    for (let i = 0; i < 4; i++) frame(card, i / 12)
    const run = medianLoaded(i => frame(card, .2 + i / 12), 13)
    assert('fold: a frame ≤ 4 ms while it folds (median, warm, × load)', run.ms <= 4 * run.load, fmtLoaded(run))
  }
}
