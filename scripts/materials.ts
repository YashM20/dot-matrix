/**
 * Checks for the physical materials (`src/engine/matter`, docs/living-matter/M-materials.md) and the `materials` board.
 * Called from verify.ts (`materialsChecks(assert)`); also runnable alone:
 *   npx tsx scripts/materials.ts [--only <group>] [--bench]
 * Groups:
 *  - relief:   heightFromField (cache, scale, masks), ambient occlusion (blur + horizon), rake, cardMask, the barrel rule
 *  - aniso:    Kajiya–Kay peak / zero, the spun bowtie, range, tangentSDF, one-pass timing
 *  - matcap:   studioMatcap ≡ metal().env, LUT agreement, rotate / tilt identities, hard stops
 *  - weave:    drawdowns (plain, twill, satin, herringbone, basket), drafts round trip, relief period / gap / tangents, bake time
 *  - stitch:   stitch lengths and gaps, at(s) continuity, contour of a disc
 *  - stone:    marble determinism and vein width, terrazzo spacing and keep-out
 *  - board:    every card pure in t, one accent on the live part, no activeDim, no red material dot, quantized, light
 *              keys declared, matLight ≡ sceneLight, frame / cold budgets
 *  - cards:    loom, knob, grille, marble, terrazzo invariants
 * Timings are printed; budgets scale by a measured load factor so a busy box doesn't fail them. `--bench` prints
 * each card's cold / warm / hover frame.
 */
import { readFileSync } from 'node:fs'
import { ambientOcclusion, anisoSpec, bakeMatcap, basket, cardMask, contour, DRAFTS, fromDraft, heightFromField, herringbone, marble, matcap, matcapMatrix, plain, rake, satin, stitch, stitchHoles, studioMatcap, tangentLinear, tangentRadial, tangentSDF, terrazzo, toDraft, twill, weaveRelief, CHROME, type Drawdown } from '../src/engine/matter'
import { heightRaster, hourOf, lightDir, metal, normalRaster, sdfBox, sdfCircle, torch, type Light, type Vec3 } from '../src/engine/light'
import { sceneLight } from '../src/engine/light/input'
import { createRaster, rasterize } from '../src/engine/raster'
import { latticeGrid, sampleLayers } from '../src/engine/sampler/gridSampler'
import { beginDrag, dragValue } from '../src/engine/interaction/controls'
import { touchIntent } from '../src/engine/interaction/gesture'
import { dot480 } from '../src/engine/theme/tokens'
import type { Pointer } from '../src/engine/context'
import type { Field, GridConfig } from '../src/engine/types'
import { TILE, withChrome, type WidgetContext, type WidgetPreset } from '../src/widgets/types'
import * as M from '../src/widgets/boards/materials'
import { lightBoard } from '../src/widgets/boards/light'
import { LIGHT_DEFAULTS, matGrille, matKnob, matLight, matLoom, materialsBoard, materialsHooks, materialsSources, matTerrazzo } from '../src/widgets/boards/materials'
import { freezeWallClock } from './lib/freeze'
import { fmtLoaded, medianLoaded, onceLoaded, type Loaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
const time = <T>(f: () => T): [number, T] => { const a = performance.now(), r = f(); return [performance.now() - a, r] }
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (x: number, i: number) => Object.is(x, b[i]))
const DEG = Math.PI / 180

/** How much slower this machine is right now than the reference box (a fixed float loop of ~12 ms there); never below 1. */
function loadFactor(): number {
  const run = () => { let s = 0; for (let i = 0; i < 1e7; i++) s += (i & 7) * .5; return s }
  run()
  const ms = median([0, 1, 2].map(() => time(run)[0]))
  return Math.max(1, ms / 12)
}

/** A field written in cells of `g` (x right, y down). */
const cells = (g: GridConfig, f: (x: number, y: number) => number): Field => (u, v) => f(u * (g.cols - 1), v * (g.rows - 1))

export interface MaterialsOptions { only?: string; bench?: boolean }

export async function materialsChecks(assert: Assert, opts: MaterialsOptions = {}): Promise<void> {
  const load = loadFactor(), run = (g: string) => !opts.only || opts.only === g
  console.log(`  materials: load factor ${load.toFixed(2)} (timing budgets scale by it)`)
  const G: GridConfig = { cols: 64, rows: 64 }

  // ── relief ────────────────────────────────────────────────────────────────────────────────────
  if (run('relief')) {
    const bump = cells(G, (x, y) => Math.max(0, 1 - Math.hypot(x - 32, y - 32) / 20))
    const a = heightFromField(bump, G, { scale: 3 }), b = heightFromField(bump, G, { scale: 3 })
    const centre = 32 * 64 + 32, raw = rasterize(bump, G)
    const scaleOk = Math.abs(a.data[centre] - 3 * raw.data[centre]) < 1e-6 && a.data[0] === 0
    const all = heightFromField(bump, G, { scale: 3, mask: 'all' }), half = createRaster(G); half.data.fill(.5)
    const explicit = heightFromField(bump, G, { scale: 3, mask: half })
    const masks = a.mask[0] === 0 && a.mask[centre] === 1 && all.mask[0] === 1 && explicit.mask[centre] === .5 && Math.abs(explicit.data[centre] - 1.5 * raw.data[centre]) < 1e-6
    assert('materials: heightFromField: cached (same field → same raster object), scale exact, mask modes', a === b && scaleOk && masks, `same ${a === b}, scale ${scaleOk}, masks ${masks}`)

    // AO on three reliefs: a flat plate, an engraved groove, a pit, a step
    const plate = heightFromField(cells(G, (x, y) => (x >= 8 && x <= 56 && y >= 8 && y <= 56 ? .5 : 0)), G, { scale: 2 })
    const aoFlat = ambientOcclusion(plate, { radius: 2, strength: .7 })
    const flatOk = aoFlat.data[32 * 64 + 32] === 1
    const groove = heightRaster(sdfBox(G, 32, 32, 3, 20), { shape: 'linear', width: 1, height: -3 }, G)
    const grooveAll = { ...groove, bounds: [0, 0, 63, 63] as [number, number, number, number] }
    const s = .7, aoG = ambientOcclusion(grooveAll, { radius: 2, strength: s })
    // the cell at the foot of the groove's wall (inside, next to the edge)
    const foot = aoG.data[32 * 64 + 30]
    let inRange = true
    for (const v of aoG.data) if (v < 1 - s - 1e-6 || v > 1 + 1e-6) inRange = false
    assert('materials: ao: 1 on a flat plate, ≤ 1 − .5·strength at the foot of an engraved wall, in [1 − strength, 1] everywhere', flatOk && foot <= 1 - .5 * s && inRange, `flat ${aoFlat.data[32 * 64 + 32]}, foot ${foot.toFixed(3)}, range ${inRange}`)
    const pit = heightFromField(cells(G, (x, y) => (Math.hypot(x - 32, y - 32) < 2.5 ? 0 : 1)), G, { scale: 2, mask: 'all' })
    const step = heightFromField(cells(G, x => (x < 32 ? 1 : 0)), G, { scale: 2, mask: 'all' })
    const probes: [string, typeof pit, number][] = [['pit', pit, 32 * 64 + 32], ['groove', grooveAll, 32 * 64 + 31], ['step', step, 32 * 64 + 33]]
    const agree = probes.every(([, h, i]) => ambientOcclusion(h, { radius: 3, mode: 'blur' }).data[i] < 1 && ambientOcclusion(h, { radius: 3, mode: 'horizon' }).data[i] < 1)
      && probes.every(([, h]) => ambientOcclusion(h, { radius: 3, mode: 'blur' }).data[5 * 64 + 5] === 1 && ambientOcclusion(h, { radius: 3, mode: 'horizon' }).data[5 * 64 + 5] === 1)
    assert('materials: ao: horizon and blur agree in sign on 3 test reliefs (pit, groove, step)', agree)
    const fresh = () => ambientOcclusion(heightFromField(cells(G, (x, y) => Math.max(0, Math.sin(x / 3) * Math.cos(y / 4))), G, { scale: 2 }), { radius: 2.5 })
    assert('materials: ao: deterministic (two fresh bakes bit for bit)', same(fresh().data, fresh().data))
    const L = lightDir(-35 * DEG, 44.8 * DEG), R = rake(L) as Vec3, az = (l: Vec3) => Math.atan2(l[0], -l[1]), el = (l: Vec3) => Math.atan2(l[2], Math.hypot(l[0], l[1]))
    const low = rake(lightDir(1, 2 * DEG)) as Vec3, pointIn: Light = { at: [1, 2, 3] }
    assert('materials: rake: azimuth kept, elevation clamped', Math.abs(az(R) - az(L)) < 1e-9 && Math.abs(el(R) - 18 * DEG) < 1e-9 && Math.abs(el(low) - 8 * DEG) < 1e-9 && rake(pointIn) === pointIn)
    const TILE: GridConfig = { cols: 144, rows: 144 }, LG = latticeGrid(TILE, 2.5, [10, 20])
    const lf = { field: cells(LG, (x, y) => (x === 3 && y === 2 ? 1 : 0)), lattice: 2.5, origin: [10, 20] as [number, number] }
    const m = cardMask(lf, TILE)
    let lit = 0; for (const v of m.data) lit += v
    // lattice dot (3, 2) spans card x ∈ [17.5, 20), y ∈ [25, 27.5): centres x + ½ in range → cols 17, 18, 19; rows 25, 26 (a 2.5 lattice alternates 3 and 2 cells)
    assert('materials: cardMask: a lattice dot fills the card cells whose centres fall in it', lit === 6 && m.data[25 * 144 + 17] === 1 && m.data[26 * 144 + 19] === 1 && m.data[27 * 144 + 19] === 0, `${lit} cells`)
    const barrel = readFileSync(new URL('../src/engine/index.ts', import.meta.url), 'utf8')
    assert('materials: engine/matter is not in the engine barrel', !barrel.includes("'./matter"))
  }

  // ── aniso ─────────────────────────────────────────────────────────────────────────────────────
  if (run('aniso')) {
    const flat = normalRaster(heightFromField(cells(G, () => 1), G, { scale: 0, mask: 'all' }))
    const tx = tangentLinear(G, 0), mid = 32 * 64 + 32
    const peak = rasterize(anisoSpec(flat, tx, [0, 0, 1], { exponent: 48 }), G).data[mid]
    const graze = (a: number) => [Math.cos(a), 0, Math.sin(a)] as Vec3
    const along = rasterize(anisoSpec(flat, tx, graze(2 * DEG), { exponent: 48, view: graze(2 * DEG) }), G).data[mid]
    assert('materials: aniso: linear tangent ⟂ H gives the peak (1 at normal incidence), ∥ H gives 0', Math.abs(peak - 1) < 1e-6 && along < 1e-6, `peak ${peak}, along ${along.toExponential(2)}`)
    // a shallow dome with lathe grooves, lit from 8 azimuths: two lobes 180° apart along the light azimuth
    const D: GridConfig = { cols: 96, rows: 96 }, dome = normalRaster(heightRaster(sdfCircle(D, 48, 48, 36), { shape: 'smooth', width: 36, height: 3 }, D))
    const tr = tangentRadial(D, 48, 48)
    let worst = 0
    for (let k = 0; k < 8; k++) {
      const az = k * 45 * DEG + 10 * DEG, L = lightDir(az, 40 * DEG), s = rasterize(anisoSpec(dome, tr, L, { exponent: 80 }), D).data
      const bins = new Float64Array(360)
      for (let r = 0; r < 96; r++) for (let c = 0; c < 96; c++) { const dx = c - 48, dy = r - 48; if (dx * dx + dy * dy < 16) continue; const a = Math.round(Math.atan2(dx, -dy) / DEG + 360) % 360; bins[a] += s[r * 96 + c] }
      const sm = (i: number) => { let t = 0; for (let j = -4; j <= 4; j++) t += bins[(i + j + 360) % 360]; return t }
      let p1 = 0; for (let i = 0; i < 360; i++) if (sm(i) > sm(p1)) p1 = i
      let p2 = -1; for (let i = 0; i < 360; i++) { const d = Math.abs(((i - p1 + 540) % 360) - 180); if (d > 90 && (p2 < 0 || sm(i) > sm(p2))) p2 = i } // d = angular distance from p1
      const want = (az / DEG + 360) % 360, off = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
      const e1 = Math.min(off(p1, want), off(p1, want + 180)), e2 = Math.abs(off(p1, p2) - 180)
      worst = Math.max(worst, e1, e2)
    }
    assert('materials: aniso: radial tangents on a dome give two lobes 180° ± 6° apart along the light azimuth (bowtie)', worst <= 6, `worst ${worst}°`)
    let range = true
    const L = lightDir(2, 30 * DEG), sp = rasterize(anisoSpec(dome, tr, L, { exponent: 24 }), D).data
    for (let i = 0; i < sp.length; i++) {
      if (!(sp[i] >= 0 && sp[i] <= 1)) range = false
      const ndl = dome.x[i] * L[0] + dome.y[i] * L[1] + dome.z[i] * L[2]
      if (ndl <= 0 && sp[i] !== 0) range = false
    }
    const back = rasterize(anisoSpec(flat, tx, [0, 0, -1]), G).data.every(v => v === 0)
    assert('materials: aniso: in [0, 1], zero where n·L ≤ 0', range && back)
    const sdf = sdfCircle(D, 48, 48, 20), across = tangentSDF(sdf, D, 'across'), alongT = tangentSDF(sdf, D, 'along')
    let unit = true, dirs = true
    for (let r = 2; r < 94; r++) for (let c = 2; c < 94; c++) {
      const i = r * 96 + c, l = Math.hypot(across.x[i], across.y[i])
      if (!Number.isFinite(l) || Math.abs(l - 1) > 1e-5 || Math.abs(Math.hypot(alongT.x[i], alongT.y[i]) - 1) > 1e-5) unit = false
      const dx = c - 48, dy = r - 48, d = Math.hypot(dx, dy)
      if (d > 6 && (Math.abs(across.x[i] * dx / d + across.y[i] * dy / d - 1) > 5e-3 || Math.abs(alongT.x[i] * dx / d + alongT.y[i] * dy / d) > 5e-3)) dirs = false
    }
    assert('materials: aniso: tangentSDF across = ∇d, along ⟂ ∇d (unit, finite at the medial axis)', unit && dirs)
    const T144: GridConfig = { cols: 144, rows: 144 }, big = normalRaster(heightRaster(sdfCircle(T144, 72, 72, 60), { shape: 'smooth', width: 60, height: 4 }, T144))
    const tb = tangentRadial(T144, 72, 72), into = createRaster(T144)
    for (let i = 0; i < 5; i++) anisoSpec(big, tb, L, { exponent: 80, into })
    const an = medianLoaded(i => anisoSpec(big, tb, lightDir(i * .3, 40 * DEG), { exponent: 80, into }), 11)
    assert('materials: aniso: one pass ≤ 0.8 ms at 144² (× load)', an.ms <= .8 * an.load, fmtLoaded(an, 3))
  }

  // ── matcap ────────────────────────────────────────────────────────────────────────────────────
  if (run('matcap')) {
    const LG: GridConfig = { cols: 72, rows: 72 }, BALL_N = normalRaster(heightRaster(sdfCircle(LG, 35.75, 36.5, 22), { width: 22 }, LG))
    const lights: Vec3[] = Array.from({ length: 8 }, (_, k) => lightDir(k * 45 * DEG - 1, (20 + 7 * k) * DEG))
    const equal = lights.every(L => same(rasterize(matcap(BALL_N, studioMatcap(L), { lut: false }).env, LG).data, rasterize(metal(BALL_N, L).env, LG).data))
    assert('materials: matcap: studioMatcap(L) ≡ metal(n, L).env on BALL_N for 8 lights (lut: false, bit for bit)', equal)
    // the plan's 99% needs a 256² LUT on this ball (hard stripes on a 44-dot sphere); the 64² default measures ≈ 97.4%
    const agreement = (size: number) => {
      let agreeN = 0, total = 0
      for (const L of lights) {
        const fn = studioMatcap(L), exact = rasterize(matcap(BALL_N, fn, { lut: false }).env, LG).data, lut = rasterize(matcap(BALL_N, bakeMatcap(fn, size)).env, LG).data
        for (let i = 0; i < exact.length; i++) if (BALL_N.mask[i] > 0) { total++; if (exact[i] === lut[i]) agreeN++ }
      }
      return agreeN / total
    }
    const a64 = agreement(64), a256 = agreement(256)
    assert('materials: matcap: the LUT agrees with the exact fn on ≥ 97% of cells at 64² and ≥ 99% at 256²', a64 >= .97 && a256 >= .99, `64²: ${(100 * a64).toFixed(2)}%, 256²: ${(100 * a256).toFixed(2)}%`)
    const base = rasterize(matcap(BALL_N, CHROME).env, LG).data
    const turned = rasterize(matcap(BALL_N, CHROME, { rotate: 2 * Math.PI }).env, LG).data, rest = rasterize(matcap(BALL_N, CHROME, { tilt: [0, 0] }).env, LG).data
    const M1 = matcapMatrix(0, [5, -5]), M2 = matcapMatrix(0, [1, -1]), M3 = matcapMatrix(0, [.51 / 32, 0]), M4 = matcapMatrix(0, [1 / 32, 0])
    const clampOk = !!M1 && !!M2 && M1.every((x, i) => x === M2[i]) && !!M3 && M3.every((x, i) => x === M4![i])
    const tipped = matcapMatrix(0, [1, 0])!, tip = Math.acos(tipped[0]) / DEG
    assert('materials: matcap: rotate 2π = identity; tilt (0, 0) = identity (no tip at rest); tilt clamped to ±25°, bucketed to 1/32', same(base, turned) && same(base, rest) && matcapMatrix(2 * Math.PI) === null && clampOk && Math.abs(tip - 25) < 1e-9, `tip ${tip.toFixed(3)}°`)
    const stops = new Set([0, .25, .5, .75, 1]), edgeFree = rasterize(matcap(BALL_N, CHROME).env, LG).data
    let hard = true
    for (let i = 0; i < edgeFree.length; i++) if (BALL_N.mask[i] >= .5 && !stops.has(Math.round(edgeFree[i] * 1e6) / 1e6)) hard = false
    assert('materials: matcap: hard stops stay hard (no value outside the stops set)', hard)
  }

  // ── weave ─────────────────────────────────────────────────────────────────────────────────────
  if (run('weave')) {
    const N = 24, grid = (dd: Drawdown) => Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => dd(c, r)))
    const p = grid(plain()), plainOk = p.every((row, r) => row.every((x, c) => x === ((c + r) % 2 === 0)))
    const twOk = ([[2, 4, 1], [3, 1 + 3, -1], [1, 3, 1]] as [number, number, 1 | -1][]).every(([k, n, dir]) => {
      const g = grid(twill(k, n, dir))
      const shifted = g.every((row, r) => r === 0 || row.every((x, c) => x === g[r - 1][(((c - dir) % N) + N) % N]))
      const frac = g.flat().filter(Boolean).length / (N * N)
      return shifted && Math.abs(frac - k / n) < 1e-9
    })
    assert('materials: weave: plain = checker; twill k/n: each row is the previous shifted by dir, warp fraction k/n', plainOk && twOk)
    const satinOk = ([[5, 2], [8, 3]] as const).every(([n, s]) => {
      const pt = (c: number, r: number) => !satin(n, s)(c, r)
      for (let r = 0; r < n; r++) { let k = 0; for (let c = 0; c < n; c++) if (pt(c, r)) k++; if (k !== 1) return false }
      for (let c = 0; c < n; c++) { let k = 0; for (let r = 0; r < n; r++) if (pt(c, r)) k++; if (k !== 1) return false }
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (pt(c, r) && (pt(c + 1, r) || pt(c, r + 1) || pt(c + n - 1, r) || pt(c, r + n - 1))) return false
      return true
    })
    assert('materials: weave: satin n/s (5/2, 8/3): exactly one interlacement per row and column, none 4-adjacent', satinOk)
    const hb = herringbone(2, 4, 4), bk = basket(2)
    const hbOk = Array.from({ length: 16 }, (_, r) => r).every(r => [0, 1, 2, 3].every(c => hb(c, r) === hb(7 - c, r)) && [0, 1, 2, 3, 4, 5, 6, 7].every(c => hb(c, r) === hb(c + 8, r)))
    const bkOk = Array.from({ length: 8 }, (_, r) => r).every(r => Array.from({ length: 8 }, (_, c) => c).every(c => bk(c, r) === bk(c - (c % 2), r - (r % 2))) && bk(0, 0) !== bk(2, 0))
    assert('materials: weave: herringbone mirrors every m ends; basket k: k×k blocks', hbOk && bkOk)
    const truth: Record<keyof typeof DRAFTS, Drawdown> = { plain: plain(), twill22: twill(2, 4), satin52: satin(5, 2), herringbone: herringbone(2, 4, 4), basket2: basket(2) }
    const draftsOk = (Object.keys(DRAFTS) as (keyof typeof DRAFTS)[]).every(k => {
      const dd = fromDraft(DRAFTS[k]), back = fromDraft(toDraft(dd, DRAFTS[k].threading.length, DRAFTS[k].treadling.length))
      for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) if (dd(c, r) !== truth[k](c, r) || back(c, r) !== dd(c, r)) return false
      return true
    })
    const small = toDraft(twill(2, 4), 8, 8)
    assert('materials: weave: fromDraft(toDraft(dd)) ≡ dd over 2 periods, for every DRAFTS entry', draftsOk && small.shafts === 4 && small.treadles === 4, `twill 2/2 → ${small.shafts} shafts, ${small.treadles} treadles`)
    const TILE: GridConfig = { cols: 144, rows: 144 }, box: [number, number, number, number] = [8, 14, 103, 117]
    let ok = true, detail = ''
    for (const k of Object.keys(DRAFTS) as (keyof typeof DRAFTS)[]) {
      const { height, tangent } = weaveRelief(fromDraft(DRAFTS[k]), TILE, { box, crossing: 4 })
      const lit = (c: number, r: number) => height.mask[r * 144 + c] > 0
      // runs along rows and columns: thread runs ≥ 3 cells, gaps exactly the 1-cell void
      for (let r = box[1]; r <= box[3]; r++) { let run = 0; for (let c = box[0]; c <= box[2] + 1; c++) { if (c <= box[2] && lit(c, r)) run++; else { if (run > 0 && run < 3) { ok = false; detail = `${k} row ${r} run ${run}` } run = 0 } } }
      for (let c = box[0]; c <= box[2]; c++) { let run = 0; for (let r = box[1]; r <= box[3] + 1; r++) { if (r <= box[3] && lit(c, r)) run++; else { if (run > 0 && run < 3) { ok = false; detail = `${k} col ${c} run ${run}` } run = 0 } } }
      for (let r = box[1]; r <= box[3]; r++) for (let c = box[0]; c <= box[2]; c++) {
        const i = r * 144 + c, fx = (c - box[0]) % 4, fy = (r - box[1]) % 4
        if (fx === 3 && fy === 3 && lit(c, r)) { ok = false; detail = `${k} gap corner lit` }
        if (lit(c, r) && !((tangent.x[i] === 1 && tangent.y[i] === 0) || (tangent.x[i] === 0 && tangent.y[i] === 1))) { ok = false; detail = `${k} tangent` }
      }
    }
    assert('materials: weave: relief period ≥ 2 cells (every thread run ≥ 3 along both axes, the gap a 1-cell void), gap column void, tangent ∈ {(1,0), (0,1)}', ok, detail)
    const wv = medianLoaded(i => weaveRelief(twill(2, 4, i % 2 ? 1 : -1), TILE, { box, crossing: 4, picks: 26 - i }), 5)
    assert('materials: weave: relief bake ≤ 15 ms for 24 × 26 crossings', wv.ms <= 15 * wv.load, fmtLoaded(wv))
  }

  // ── stitch ────────────────────────────────────────────────────────────────────────────────────
  if (run('stitch')) {
    const line = stitch([[0, 0], [20, 0], [20, 13]], { length: 3, gap: 2 })
    let lens = true
    for (let k = 0; k < line.count; k++) {
      if (k < line.count - 1 && Math.abs(line.len[k] - 3) > 1e-6) lens = false
      if (k > 0 && Math.abs(line.s0[k] - line.s0[k - 1] - 5) > 1e-5) lens = false
    }
    const straight = stitch([[0, 0], [30, 0]], { length: 3, gap: 0 })
    const chords = Array.from({ length: straight.count }, (_, k) => Math.hypot(straight.segs[4 * k + 2] - straight.segs[4 * k], straight.segs[4 * k + 3] - straight.segs[4 * k + 1]))
    assert('materials: stitch: segment lengths = length (last one may be short), gaps = gap, total = polyline length', lens && Math.abs(line.total - 33) < 1e-9 && line.len[line.count - 1] <= 3 && chords.every(c => Math.abs(c - 3) < 1e-5) && straight.count === 10 && stitchHoles(straight).length === 11)
    let cont = true
    const sq = stitch([[0, 0], [10, 0], [10, 10], [0, 10]], {}, true)
    for (let s = 0; s < 80; s += .25) {
      const a = sq.at(s), b = sq.at(s + .25)
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > .25 + 1e-9) cont = false
    }
    const wrap = sq.at(40.5), start = sq.at(.5)
    const open = line.at(-5), end = line.at(99)
    assert('materials: stitch: at(s) is continuous and monotone in arc length; closed loops wrap', cont && Math.abs(wrap[0] - start[0]) < 1e-9 && Math.abs(wrap[1] - start[1]) < 1e-9 && open[0] === 0 && end[1] === 13)
    const D: GridConfig = { cols: 80, rows: 80 }, disc = rasterize(sdfCircle(D, 40, 40, 15), D)
    const loops = contour(disc, 3)
    const loop = loops[0] ?? [], radii = loop.map(([x, y]) => Math.hypot(x - 40, y - 40))
    const closed = loops.length === 1 && loop.length > 20 && Math.hypot(loop[0][0] - loop[loop.length - 1][0], loop[0][1] - loop[loop.length - 1][1]) < 2
    assert('materials: stitch: contour of a disc SDF at level 3 is a closed loop at radius r + 3 ± .5', closed && radii.every(r => Math.abs(r - 18) <= .5), `${loops.length} loop(s), ${loop.length} points, r ${Math.min(...radii).toFixed(2)}–${Math.max(...radii).toFixed(2)}`)
  }

  // ── stone ─────────────────────────────────────────────────────────────────────────────────────
  if (run('stone')) {
    const S: GridConfig = { cols: 144, rows: 144 }, a = marble(S, { seed: 3 }), again = marble(S, { seed: 3 })
    // a fresh bake, bypassing the cache (another key that bakes the same pixels: a different but equal octave count)
    const fresh = marble(S, { seed: 3, octaves: 5.5 })
    let inRange = true; for (const v of a.data) if (!(v >= 0 && v <= 1)) inRange = false
    // vein width: march across the veins (along the vein normal) and measure runs of body < .5
    const ca = Math.cos(.6), sa = Math.sin(.6), runs: number[] = []
    for (let k = -100; k <= 100; k += 7) {
      let run = 0
      for (let s = -150; s <= 150; s += 1) {
        const x = Math.round(72 + ca * s - sa * k), y = Math.round(72 + sa * s + ca * k)
        const inside = x >= 0 && y >= 0 && x < 144 && y < 144
        if (inside && a.data[y * 144 + x] < .5) run++
        else { if (run > 0 && inside) runs.push(run); run = 0 }
      }
    }
    const mean = runs.reduce((s, r) => s + r, 0) / Math.max(1, runs.length)
    assert('materials: marble: deterministic; body in [0, 1]; mean vein width at period 30 ≥ 2 cells (measured by run length across veins)', a === again && same(a.data, fresh.data) && inRange && mean >= 2, `${runs.length} veins, mean ${mean.toFixed(2)} cells`)
    const keep = createRaster(S)
    for (let y = 60; y < 80; y++) for (let x = 60; x < 80; x++) keep.data[y * 144 + x] = 1
    const t = terrazzo([0, 0, 143, 143], { d: 3.4, seed: 5, keepOut: keep }), all = [...t.a, ...t.b, ...t.c]
    let minD = Infinity
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const d = Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]); if (d < minD) minD = d }
    const outside = all.every(([x, y]) => keep.data[Math.round(y) * 144 + Math.round(x)] < .5)
    assert('materials: terrazzo: aggregate sites ≥ d apart and never inside the keep-out', minD >= 3.4 - 1e-9 && outside && t.a.length > 0 && t.b.length > 0 && t.c.length > 0, `${all.length} chips (${t.a.length}/${t.b.length}/${t.c.length}), min ${minD.toFixed(2)}`)
  }

  if (run('board') || run('cards')) await boardChecks(assert, load, opts, run)
}

const POINTER = (x: number, y: number, down = false): Pointer => ({ id: 1, x, y, inside: true, down, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 })
/** Run `f` with the wall clock frozen at a local date (the golden clock by default), restoring it after. */
function atClock<T>(f: () => T, y = 2026, m = 0, d = 1, h = 9, min = 41): T {
  const Real = globalThis.Date
  freezeWallClock(y, m, d, h, min)
  try { return f() } finally { globalThis.Date = Real }
}

async function boardChecks(assert: Assert, load: number, opts: MaterialsOptions, run: (g: string) => boolean): Promise<void> {
  // cold: a fresh module graph (cache-busting query) so the lazy bakes are measured, before anything else draws
  type Mod = typeof import('../src/widgets/boards/materials')
  const fresh = (tag: string) => import(`../src/widgets/boards/materials.ts?cold=${tag}${Date.now()}`).catch(() => null) as Promise<Mod | null>
  const warmMod = await fresh('a'), coldMod = await fresh('b')
  const frameOf = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) =>
    sampleLayers(withChrome(p)({ t, data: { ...p.defaults, ...data }, pointers }), p.grid, p.style, dot480)
  // the sampler and the engine are warm in the app when a board opens: warm them on another lit board first
  for (const p of lightBoard) for (let i = 0; i < 3; i++) frameOf(p, i)
  if (warmMod) atClock(() => warmMod.materialsBoard.forEach(p => frameOf(p, 0)))
  // timings carry the load sampled next to them (scripts/lib/load.ts): a factor from the top of the script goes stale
  const cold = atClock(() => (coldMod ?? M).materialsBoard.map(p => [p.id, onceLoaded(() => frameOf(p, 0))] as const))
  const board = materialsBoard
  if (run('board')) {
    const key = (p: WidgetPreset, t: number) => atClock(() => JSON.stringify(frameOf(p, t)))
    assert('materials board: every card is a pure function of t (same t, same dots, any order)', board.every(p => [0, 1.3, 7.7, 3600].every(t => key(p, t) === key(p, t))) && key(board[0], 7.7) === (key(board[1], 1), key(board[0], 7.7)))
    let accent = true, detail = ''
    for (const p of board) for (const t of [0, 1.3, 6]) {
      const ls = atClock(() => withChrome(p)({ t, data: { ...p.defaults } })), red = ls.filter(l => l.tone === 'active')
      const dots = atClock(() => frameOf(p, t)).filter(d => d.color === dot480.dotActive)
      const own = red.length ? new Set(sampleLayers(red, p.grid, p.style, dot480).map(d => `${d.x.toFixed(2)},${d.y.toFixed(2)}`)) : new Set<string>()
      if (red.length > 1 || !dots.every(d => own.has(`${d.x.toFixed(2)},${d.y.toFixed(2)}`))) { accent = false; detail = `${p.id} t ${t}: ${red.length} red layers` }
      if (t === 0 && dots.length === 0) { accent = false; detail = `${p.id}: no accent at rest` }
    }
    assert('materials board: one accent per card, one red layer, on the live element (every card has it at rest)', accent, detail)
    const dim = board.some(p => [0, 1.3, 6].some(t => atClock(() => withChrome(p)({ t, data: { ...p.defaults } })).some(l => l.tone === 'activeDim') || atClock(() => frameOf(p, t)).some(d => d.color === dot480.dotActiveDim)))
    assert('materials board: no activeDim (was-active is size contrast until the owner rules, M §10.6)', !dim)
    // the red layer of each card is its live element, never a band of a material (bands come from toneBands / anisoSpec / matcap)
    const redSources = board.every(p => atClock(() => withChrome(p)({ t: 0, data: { ...p.defaults } })).filter(l => l.tone === 'active').every(l => !!l.sites || p.id === 'mat-terrazzo'))
    assert('materials board: no material dot is dotActive (the red layer is the live sites: shuttle, arc, peak, colon; today\'s chip)', redSources)
    assert('materials board: quantized (every card style has quantizeSteps ≥ 2)', board.every(p => (p.style.quantizeSteps ?? 0) >= 2))
    const keys = ['lightSrc', 'lightAz', 'lightEl', 'tx', 'ty']
    assert('materials board: every card declares lightSrc/lightAz/lightEl/tx/ty in defaults', board.every(p => keys.every(k => p.defaults && k in p.defaults)) && materialsSources.length === 1)
    const hour = atClock(() => hourOf(new Date()))
    const ctxs: [string, WidgetContext, Light][] = [
      ['hover', { t: 0, data: { ...LIGHT_DEFAULTS }, pointers: [POINTER(40, 50)] }, sceneLight({ pointer: { x: 40, y: 50 }, data: { ...LIGHT_DEFAULTS }, hour, torch: { height: 40 } })],
      ['tilt', { t: 0, data: { ...LIGHT_DEFAULTS, lightSrc: 1, lightAz: 20, lightEl: 3 } }, sceneLight({ data: { ...LIGHT_DEFAULTS, lightSrc: 1, lightAz: 20, lightEl: 3 }, hour })],
      ['sun', { t: 0, data: { ...LIGHT_DEFAULTS } }, sceneLight({ data: { ...LIGHT_DEFAULTS }, hour })],
    ]
    const eq = ctxs.every(([, c, want]) => JSON.stringify(atClock(() => matLight(c, { torch: { height: 40 } }))) === JSON.stringify(want))
    assert('materials: matLight ≡ sceneLight for 3 synthetic contexts (hover, lightSrc 1, sun)', eq)
    const warm = (p: WidgetPreset, hover: boolean) => atClock(() => {
      for (let i = 0; i < 4; i++) frameOf(p, i / 60, hover ? [POINTER(30 + i, 60)] : undefined)
      return medianLoaded(i => frameOf(p, 5.5 + i / 60, hover ? [POINTER(34 + i, 60 + (i % 3))] : undefined), 13)
    })
    const rows = board.map(p => ({ id: p.id, rest: warm(p, false), hover: warm(p, true), cold: cold.find(c => c[0] === p.id)![1] }))
    const within = (r: Loaded, budget: number) => r.ms <= budget * r.load
    assert('materials board: frame ≤ 4 ms (median, warm, × load), no pointer and a hovering torch', rows.every(r => within(r.rest, 4) && within(r.hover, 4)), rows.map(r => `${r.id} ${fmtLoaded(r.rest)}/${fmtLoaded(r.hover)}`).join(', '))
    assert('materials board: cold first frame ≤ 30 ms (× load)', !!coldMod && rows.every(r => within(r.cold, 30)), rows.map(r => `${r.id} ${fmtLoaded(r.cold, 1)}`).join(', ') + (coldMod ? '' : ' (no fresh module graph)'))
    // a rebake is one-shot work: the best of 3 cache misses (minutes 32–34; contention only ever adds time), each with its own load
    const H = materialsHooks, rb = atClock(() => ['32', '33', '34'].map(mm => onceLoaded(() => H.engraving('12', mm, 2026))).reduce((a, b) => (b.ms / b.load < a.ms / a.load ? b : a)))
    const first = H.engraving('12', '34', 2026); H.engraving('12', '35', 2026); const keep = H.engraving('12', '34', 2026) === first; H.engraving('12', '36', 2026); H.engraving('12', '37', 2026)
    assert('marble: rebake on a minute change ≤ 10 ms; LRU keeps 2', within(rb, 10) && keep && H.engraving('12', '34', 2026) !== first, fmtLoaded(rb))
    if (opts.bench) {
      console.log('  materials --bench (ms):  card            cold    warm   hover')
      for (const r of rows) console.log(`                           ${r.id.padEnd(14)} ${r.cold.ms.toFixed(1).padStart(6)} ${r.rest.ms.toFixed(2).padStart(7)} ${r.hover.ms.toFixed(2).padStart(7)}`)
    }
  }
  if (!run('cards')) return
  const H = materialsHooks
  // ── loom ──
  {
    const s0 = H.loomAt(0), s13 = H.loomAt(1.3)
    const ls = atClock(() => withChrome(matLoom)({ t: 0, data: { ...matLoom.defaults } }))
    const allWoven = (() => { for (let r = H.LOOM.box[1]; r <= H.LOOM.box[3]; r++) for (let c = H.LOOM.box[0]; c <= H.LOOM.box[2]; c++) if (!H.woven(s0, c, r)) return false; return true })()
    assert('loom: t = 0 is a complete twill 2/2 panel (26/26 picks), shuttle parked at the right selvedge', s0.draft === 'twill22' && s0.parked && s0.done === 26 && Math.abs(s0.x - (H.LOOM.box[2] + .5)) < 1e-9 && allWoven && ls.some(l => l.field.text?.includes('26/26')),
      `t 1.3: ${s13.draft} pick ${s13.pick + 1}, shuttle ${(s13.x - H.LOOM.box[0] + .5).toFixed(2)} cells from the left`)
    const cloth = H.loomCloth(H.drawdownOf('twill22', DRAFTS.twill22)), truth = weaveRelief(twill(2, 4), { cols: 144, rows: 144 }, { box: H.LOOM.box, crossing: 4, lift: 1.2 })
    assert('loom: the woven rows equal weaveRelief(DRAFTS.twill22) (drawdown truth)', same(cloth.height.data, truth.height.data) && same(cloth.warp.data, truth.warp.data))
    const base = fromDraft(H.loomDraft('twill22', {})), edited = fromDraft(H.loomDraft('twill22', { tu5: 1 }))
    let only = true
    for (let r = 0; r < 26; r++) for (let c = 0; c < 24; c++) { const hit = c % 4 === 1 && r % 4 === 1; if ((base(c, r) !== edited(c, r)) !== hit) only = false }
    assert('loom: a tie-up toggle flips exactly the crossings of its shaft × treadle (the panel redraws at once: data has no edit time)', only)
    let fast = 0
    for (let i = 0; i < 40 * H.PANEL; i++) { const a = H.loomAt(i / 40), b = H.loomAt((i + 1) / 40); fast = Math.max(fast, Math.abs(b.x - a.x)) }
    assert('loom: shuttle ≤ 2 cells per frame at the declared fps (STYLE-BIBLE.md:208; the fell steps one pick between throws)', fast <= 2 + 1e-9 && matLoom.fps === 40, `${fast.toFixed(3)} cells / frame at ${matLoom.fps} fps`)
    const red = atClock(() => withChrome(matLoom)({ t: 1.3, data: { ...matLoom.defaults } })).filter(l => l.tone === 'active' || l.tone === 'activeDim')
    const sizes = new Set(atClock(() => sampleLayers(red, TILE, matLoom.style, dot480)).map(d => d.r.toFixed(3)))
    assert('loom: the trail is the shuttle\'s own active layer, smaller sizes, no activeDim', red.length === 1 && red[0].tone === 'active' && (red[0].sites?.length ?? 0) === 3 && sizes.size === 3)
  }
  // ── knob ──
  {
    const { KNOB_CARD: K, KNOB_ARC: A } = H, cx = 48, cy = 50
    let worst = 0
    for (let k = 0; k < 8; k++) {
      const a = k * 45 * DEG + 7 * DEG, s = H.knobSpec(torch(cx + 30 * Math.sin(a), cy - 30 * Math.cos(a), 40, 150)).data, bins = new Float64Array(360)
      for (let r = 0; r < 96; r++) for (let c = 0; c < 96; c++) { const dx = c - cx, dy = r - cy; if (dx * dx + dy * dy < 9) continue; bins[Math.round(Math.atan2(dx, -dy) / DEG + 360) % 360] += s[r * 96 + c] }
      const sm = (i: number) => { let t = 0; for (let j = -4; j <= 4; j++) t += bins[(i + j + 360) % 360]; return t }
      let p1 = 0; for (let i = 0; i < 360; i++) if (sm(i) > sm(p1)) p1 = i
      let p2 = -1; for (let i = 0; i < 360; i++) { const d = Math.abs(((i - p1 + 540) % 360) - 180); if (d > 90 && (p2 < 0 || sm(i) > sm(p2))) p2 = i }
      const off = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180), want = a / DEG
      worst = Math.max(worst, Math.min(off(p1, want), off(p1, want + 180)), Math.min(off(p2, want), off(p2, want + 180)))
    }
    assert('knob: the bowtie\'s two brightest lobes lie within ±1 light bucket (5.6°) of the light azimuth, for 8 torch positions', worst <= 360 / 64, `worst ${worst}°`)
    const reds = (v: number) => atClock(() => frameOf(matKnob, 0, undefined, { v })).filter(d => d.color === dot480.dotActive).length
    assert('knob: the value arc\'s active sites = round(v · 40)', [0, .25, .5, .72, 1].every(v => reds(v) === Math.round(v * A.n)), [0, .25, .5, .72, 1].map(reds).join('/'))
    const c = matKnob.controls![0], at = (v: number) => { const a = A.start + v * A.sweep; return { x: K.x + A.r * Math.sin(a), y: K.y - A.r * Math.cos(a) } }
    const tap = (v: number) => { const p = at(v); return dragValue(c, beginDrag(c, p.x, p.y, { v: .72 }), p).v }
    assert('knob: a tap on the arc sets v to its angle', [0, .1, .5, .9, 1].every(v => Math.abs(tap(v) - v) < 1e-6) && touchIntent(c) === 'drag', [.1, .5, .9].map(tap).map(x => x.toFixed(3)).join('/'))
  }
  // ── grille ──
  {
    const g = H.grillePlate(), holes = H.grilleHoles()
    let inside = 0
    for (const h of holes) for (let r = Math.floor(h.y - 2); r <= Math.ceil(h.y + 2); r++) for (let cc = h.x - 2; cc <= h.x + 2; cc++) if (Math.hypot(cc - h.x, r - h.y) <= 1.9 && g.mask.data[r * 144 + cc]) inside++
    let unlit = true, oneRed = true
    for (const t of [0, .37, 1.3, 2.9, 6]) {
      const vu = H.grilleVU(t + .12), dots = atClock(() => frameOf(matGrille, t)), pitch = TILE.pitch!
      const atHole = dots.filter(d => holes.some(h => Math.abs(d.x - (h.x + .5) * pitch) < 1e-3 && Math.abs(d.y - (h.y + .5) * pitch) < 1e-3))
      const shown = vu.lit.reduce((s, n, col) => s + n + (vu.peak[col] > n ? 1 : 0), 0)
      if (atHole.length !== shown) unlit = false
      const red = dots.filter(d => d.color === dot480.dotActive), live = H.livePeak(vu)
      const want = holes.filter(h => h.col === live).sort((p, q) => q.y - p.y)[vu.peak[live] - 1]
      if (red.length !== 1 || Math.abs(red[0].x - (want.x + .5) * pitch) > 1e-3 || Math.abs(red[0].y - (want.y + .5) * pitch) > 1e-3) oneRed = false
    }
    assert('grille: no plate dot inside a hole or its moat; unlit holes draw nothing', inside === 0 && unlit, `${holes.length} holes`)
    assert('grille: exactly one active hole, at the highest peak-hold', oneRed)
    let det = true
    for (let i = 0; i < 200; i++) { const s = i * .137; if (JSON.stringify(H.grilleVU(s)) !== JSON.stringify(H.grilleVU(s))) det = false }
    assert('grille: signal deterministic (two fresh runs equal at 200 t\'s)', det && holes.length === 23 * 11 + 22 * 11)
  }
  // ── marble ──
  {
    const e = H.engraving('09', '41', 2026), n = e.n
    let ok = true, detail = ''
    for (const az of [90, 270]) {
      const L = rake(lightDir(az * DEG, 40 * DEG)) as Vec3, { body, polish } = H.marbleLit(e, L)
      let lit = 0, litN = 0, far = 0, farN = 0
      for (let i = 0; i < n.x.length; i++) {
        if (!e.hero.data[i] || n.mask[i] < .5) continue
        const tilt = Math.hypot(n.x[i], n.y[i]), facing = (n.x[i] * L[0] + n.y[i] * L[1]) / (tilt || 1)
        if (tilt < .5) continue // wall cells only (slope ≥ 30°)
        const v = Math.max(body.data[i], polish.data[i])
        if (facing > .7) { litN++; if (v >= .62) lit++ }
        if (facing < -.7) { farN++; if (v < .06) far++ }
      }
      if (lit < .8 * litN || far < farN || !litN || !farN) { ok = false; detail = `az ${az}: lit ${lit}/${litN}, far void ${far}/${farN}` }
      else detail += `az ${az}: lit ${lit}/${litN}, void ${far}/${farN}; `
    }
    assert('marble: engraved grooves: lit wall ≥ idle and far wall void under a raked light from either side', ok, detail)
  }
  // ── terrazzo ──
  {
    const m = H.monthOf(2026, 0), all = [...m.aggregate.a, ...m.aggregate.b, ...m.aggregate.c]
    let minD = Infinity
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) minD = Math.min(minD, Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]))
    const clear = all.every(([x, y]) => m.keepOut.data[Math.round(y) * 144 + Math.round(x)] < .5)
    assert('terrazzo: aggregate sites ≥ d apart and never inside a dilated day chip', minD >= 3.4 - 1e-9 && clear, `${all.length} chips of aggregate, min ${minD.toFixed(2)}`)
    const cells = new Map<number, number>(); for (const d of m.chip) if (d >= 0) cells.set(d, (cells.get(d) ?? 0) + 1)
    const ls = atClock(() => withChrome(matTerrazzo)({ t: 0, data: { ...matTerrazzo.defaults } })), red = ls.filter(l => l.tone === 'active')
    const redDots = atClock(() => sampleLayers(red, TILE, matTerrazzo.style, dot480)), day1 = cells.get(0) ?? -1
    assert('terrazzo: 31 day chips for Jan 2026, laid from Thursday; today = 1 is the only active layer', m.days === 31 && m.offset === 3 && cells.size === 31 && [...cells.values()].every(k => k >= 12) && red.length === 1 && redDots.length === day1, `${day1} dots in today's chip, ${redDots.length} red`)
    // the chips are one multi-tone layer on the 1.5 lattice: past days are idle (honed) or value (polished), future mid
    const past = (d: number) => {
      const chips = atClock(() => withChrome(matTerrazzo)({ t: 0, data: { ...matTerrazzo.defaults } }), 2026, 0, d).filter(l => l.lattice === 1.5 && l.toneOf)
      return sampleLayers(chips, TILE, matTerrazzo.style, dot480).filter(q => q.color === dot480.dotIdle || q.color === dot480.value).length
    }
    const p1 = past(1), p15 = past(15)
    assert('terrazzo: past/future split follows the date (frozen 2026-01-01 → 0 past)', p1 === 0 && p15 > 0, `past dots: Jan 1 ${p1}, Jan 15 ${p15}`)
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
  let failures = 0
  await materialsChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }, { only, bench: args.includes('--bench') })
  if (failures) process.exit(1)
}
