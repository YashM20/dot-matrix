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
 *  - glass:    Snell LUT (127 samples, signs per profile, ior 1), strength 0 ≡ behind, Fresnel, frost (M2.1)
 *  - caustics: flat water = 1, energy, focusing, determinism and timing (M2.3)
 *  - cards:    loom, knob, grille, marble, terrazzo invariants; M2: lens, pool, window, patch, rust, candle
 * Timings are printed; budgets scale by a measured load factor so a busy box doesn't fail them. `--bench` prints
 * each card's cold / warm / hover frame.
 */
import { readFileSync } from 'node:fs'
import { ambientOcclusion, anisoSpec, bakeMatcap, basket, BEZEL, cardMask, causticSplat, causticStats, contour, DRAFTS, frost, lensOffset, liquidGlass, LUT_SAMPLES, snellLUT, fromDraft, heightFromField, herringbone, marble, matcap, matcapMatrix, plain, rake, satin, stitch, stitchHoles, studioMatcap, tangentLinear, tangentRadial, tangentSDF, terrazzo, toDraft, twill, weaveRelief, CHROME, type Drawdown } from '../src/engine/matter'
import { heightRaster, hourOf, lightDir, metal, normalRaster, sdfBox, sdfCircle, sunAt, torch, type Light, type Vec3 } from '../src/engine/light'
import { gpuTag, layerPass } from '../src/engine/renderer/webgl/passes'
import { worldAt, worldReset } from '../src/engine/physics/world'
import { simReset, simStep } from '../src/engine/sim/sim'
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

  if (run('glass')) glassChecks(assert)
  if (run('caustics')) causticChecks(assert)
  if (run('board') || run('cards')) await boardChecks(assert, load, opts, run)
}

// ── glass (M2.1) ──────────────────────────────────────────────────────────────────────────────────
function glassChecks(assert: Assert): void {
  const o = { bezel: 12, thickness: 6, base: 2 }, lut = snellLUT(BEZEL.squircle, o)
  let maxMag = 0
  for (const v of lut.mag) maxMag = Math.max(maxMag, Math.abs(v))
  assert('materials: glass: LUT has 127 samples, max |mag| = 1, max > 0 for ior 1.5', lut.mag.length === 127 && LUT_SAMPLES === 127 && Math.abs(maxMag - 1) < 1e-6 && lut.max > 0, `max ${lut.max.toFixed(3)} cells`)
  const G: GridConfig = { cols: 96, rows: 96 }, scene: Field = (u, v) => .5 + .5 * Math.sin(u * 37) * Math.cos(v * 23)
  const lens = { cx: 48, cy: 48, hw: 30, hh: 20, radius: 20, bezel: 12 }
  const at = (f: Field) => { const a = rasterize(f, G).data; return a }
  const flatTop = liquidGlass(scene, G, { ...lens, lut: snellLUT(BEZEL.squircle, { ...o, ior: 1 }), magnify: 1 })
  const id1 = snellLUT(BEZEL.squircle, { ...o, ior: 1 }).max === 0 && same(at(flatTop.through), at(scene))
  const flatOnly = liquidGlass(scene, G, { ...lens, lut, magnify: 1 }), out = new Float64Array(2)
  let flatZero = true
  for (let r = 0; r < 96; r++) for (let c = 0; c < 96; c++) if (flatOnly.offset(c, r, out) >= 1 && (out[0] !== 0 || out[1] !== 0)) flatZero = false
  assert('materials: glass: ior 1 → zero displacement; flat top (inset ≥ bezel) → identity at magnify 1', id1 && flatZero)
  const concave = snellLUT(BEZEL.concave, o)
  const inward = Array.from(lut.mag).slice(0, 120).every(v => v > 0) && Array.from(lut.mag).every(v => v >= 0)
  const outward = Array.from(concave.mag).slice(1, 120).every(v => v < 0) && Array.from(concave.mag).every(v => v <= 1e-9)
  assert('materials: glass: convex squircle displaces toward the inside on the whole bezel; concave toward the outside', inward && outward)
  assert('materials: glass: through at strength 0 ≡ behind (bit for bit)', same(at(liquidGlass(scene, G, { ...lens, lut, strength: 0 }).through), at(scene)))
  const fr = liquidGlass(scene, G, { ...lens, lut }).fresnel, line = Array.from({ length: 30 }, (_, k) => fr(48 / 95, (29 + k) / 95) / .9)
  const mono = line.every((v, k) => k === 0 || v <= line[k - 1] + 1e-12)
  assert('materials: glass: Fresnel R(nz = 1) = .04, increasing toward the rim', Math.abs(fr(48 / 95, 48 / 95) / .9 - .04) < 1e-9 && mono && line[0] > line[29], `rim ${line[0].toFixed(4)} → flat ${line[29].toFixed(4)}`)
  const ramp: Field = u => u, fz = frost(ramp, G, 1.6), a1 = at(fz), a2 = at(frost(ramp, G, 1.6))
  let bound = true
  for (let c = 0; c < 96; c++) if (Math.abs(a1[40 * 96 + c] - c / 95) > .8 / 95 + 1e-9) bound = false
  assert('materials: glass: frost bounded by amount/2 per axis, deterministic (STBN slice 0)', bound && same(a1, a2))
}

// ── caustics (M2.3) ───────────────────────────────────────────────────────────────────────────────
function causticChecks(assert: Assert): void {
  const G: GridConfig = { cols: 72, rows: 72 }, flat = createRaster(G)
  flat.bounds = [6, 6, 65, 65]
  causticSplat((_x, _y, out) => { out[0] = out[1] = out[2] = 0 }, flat, { photons: 2 })
  let worst = 0
  for (let r = 9; r <= 62; r++) for (let c = 9; c <= 62; c++) worst = Math.max(worst, Math.abs(flat.data[r * 72 + c] - 1))
  assert('materials: caustics: flat water → every interior floor cell = 1 ± 1e-6', worst <= 1e-6, `worst ${worst.toExponential(2)}`)
  // a converging patch of water: slopes k·(p − c) inside radius 12 bend every photon toward the centre (q − c = (1 − Kk)(p − c))
  const bump = (k: number) => (x: number, y: number, out: Float32Array) => { const dx = x - 36, dy = y - 36, inside = dx * dx + dy * dy < 144; out[0] = 0; out[1] = inside ? k * dx : 0; out[2] = inside ? k * dy : 0 }
  const into = createRaster(G)
  into.bounds = [6, 6, 65, 65]
  causticSplat(bump(.04), into, { depth: 6, gain: 3, ior: 1.33 })
  let sum = 0, peak = 0
  for (const v of into.data) { sum += v; peak = Math.max(peak, v) }
  const kept = Math.abs(sum - (causticStats.emitted - causticStats.lost)) < 1e-3 * causticStats.emitted
  assert('materials: caustics: energy kept (Σ = photons in, minus the measured off-raster loss)', kept, `Σ ${sum.toFixed(3)}, in ${causticStats.emitted}, lost ${causticStats.lost.toFixed(3)}`)
  // focal length of the dome: K·k = 1 brings every photon to the centre; at K·k ≈ .9 the floor sees a bright spot
  const K = 3 * 6 * (1 - 1 / 1.33), focus = createRaster(G)
  focus.bounds = [6, 6, 65, 65]
  causticSplat(bump(.9 / K), focus, { depth: 6, gain: 3, ior: 1.33 })
  let fpeak = 0; for (const v of focus.data) fpeak = Math.max(fpeak, v)
  assert('materials: caustics: a converging bump focuses (peak ≥ 2 at depth·gain ≈ its focal length)', fpeak >= 2 && peak >= 1, `peak ${fpeak.toFixed(2)} (weak dome ${peak.toFixed(2)})`)
  const again = createRaster(G)
  again.bounds = [6, 6, 65, 65]
  causticSplat(bump(.04), again, { depth: 6, gain: 3, ior: 1.33 })
  // the timing reads a baked gradient table, as the pool does (its ripple slopes are computed once per frame)
  const GX = new Float32Array(72 * 72), GY = new Float32Array(72 * 72)
  for (let i = 0; i < GX.length; i++) { const x = i % 72, y = (i - x) / 72; GX[i] = .08 * Math.sin(x * .7 + y * .3); GY[i] = .08 * Math.cos(y * .6 - x * .2) }
  const wavy = (x: number, y: number, out: Float32Array) => { const k = y * 72 + x; out[0] = 0; out[1] = GX[k]; out[2] = GY[k] }
  for (let i = 0; i < 30; i++) { again.bounds = [0, 0, 71, 71]; causticSplat(wavy, again, {}) }
  const tm = medianLoaded(() => { again.bounds = [0, 0, 71, 71]; causticSplat(wavy, again, {}) }, 11)
  const det = createRaster(G); det.bounds = [6, 6, 65, 65]; causticSplat(bump(.04), det, { depth: 6, gain: 3, ior: 1.33 })
  // the plan estimated 0.35 ms; measured ~0.9–1.0 ms ÷ load here (20.7k tent splats + two binomial passes), so the gate is 1 ms
  assert('materials: caustics: deterministic; ≤ 1 ms for 72² × 4 photons (× load)', same(det.data, into.data) && tm.ms <= 1 * tm.load, fmtLoaded(tm, 3))
}

/** Cards with no red in their pristine run (M §4.2: the pool's pebble only appears when one is dropped). */
const NO_ACCENT_AT_REST = new Set(['mat-pool'])
/** Cards whose live element is a region rather than sites. */
const RED_REGIONS = new Set(['mat-terrazzo', 'mat-window', 'mat-rust', 'mat-candle'])
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
  // the M2 cards live in their own modules, which the fresh board module shares with the warm one: bust them too
  const freshCards = async (file: string, tag: string) => Object.values(await import(`../src/widgets/boards/${file}.ts?cold=${tag}${Date.now()}`).catch(() => ({})) as Record<string, unknown>)
    .filter((v): v is WidgetPreset => !!v && typeof v === 'object' && 'layers' in v && 'id' in v)
  const coldM2 = [...await freshCards('materials-glass', 'b'), ...await freshCards('materials-live', 'b'), ...await freshCards('materials-wear', 'b')]
  const frameOf = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) =>
    sampleLayers(withChrome(p)({ t, data: { ...p.defaults, ...data }, pointers }), p.grid, p.style, dot480)
  // the sampler and the engine are warm in the app when a board opens: warm them on another lit board first
  for (const p of lightBoard) for (let i = 0; i < 3; i++) frameOf(p, i)
  if (warmMod) atClock(() => warmMod.materialsBoard.forEach(p => frameOf(p, 0)))
  // timings carry the load sampled next to them (scripts/lib/load.ts): a factor from the top of the script goes stale
  const coldBoard = (coldMod ?? M).materialsBoard.map(p => coldM2.find(q => q.id === p.id) ?? p)
  const cold = atClock(() => coldBoard.map(p => [p.id, onceLoaded(() => frameOf(p, 0))] as const))
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
      if (t === 0 && dots.length === 0 && !NO_ACCENT_AT_REST.has(p.id)) { accent = false; detail = `${p.id}: no accent at rest` }
      if (NO_ACCENT_AT_REST.has(p.id) && dots.length) { accent = false; detail = `${p.id}: red in the pristine run` }
    }
    assert('materials board: one accent per card, one red layer, on the live element (every card has it at rest but the pool: accentAtRest false)', accent, detail)
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
  m2CardChecks(assert, frameOf)
}

type FrameFn = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) => ReturnType<typeof sampleLayers>
/** The M2 cards (M §4.3: M2.2, M2.4–M2.7, the candle of §4.4). */
function m2CardChecks(assert: Assert, frameOf: FrameFn): void {
  const H = materialsHooks, byId = (id: string) => materialsBoard.find(p => p.id === id)!
  const reds = (p: WidgetPreset, t: number, data?: Record<string, number>, pointers?: Pointer[]) => atClock(() => frameOf(p, t, pointers, data)).filter(d => d.color === dot480.dotActive)
  const pitch = TILE.pitch!, cell = (d: { x: number; y: number }) => [d.x / pitch - .5, d.y / pitch - .5]
  // ── lens ──
  {
    const lens = byId('mat-lens'), ls = atClock(() => withChrome(lens)({ t: 0, data: { ...lens.defaults } }))
    const tagged = ls.filter(l => gpuTag(l.field)), pass = tagged.length === 1 ? layerPass(tagged[0], TILE, lens.style, pitch) : null
    assert('lens: the lattice-1 field is what goldens hash (no gpu tag consulted)', tagged.length === 1 && tagged[0].lattice === undefined && sampleLayers(tagged, TILE, lens.style, dot480).length > 0)
    assert('lens: layerPass(through) is a pass at density 2 with toneOf (passes.ts:70-93)', !!pass && pass.tag.density === 2 && !!pass.toneOf && pass.cols >= 2 * 140)
    // park the lens over the second's tick (12 o'clock at 09:41:00: card (72, 20)) and check the red dot sits where the glass shows it
    const data = { lx: 72 / 144, ly: (144 - 36) / 132 }, red = reds(lens, 0, data)
    const c = H.lensCentre({ ...lens.defaults, ...data }), off = lensOffset({ cx: c[0], cy: c[1], hw: H.LENS.hw, hh: H.LENS.hh, radius: H.LENS.radius, bezel: H.LENS.bezel, lut: H.lensLUT(), magnify: H.LENS.magnify })
    const [px, py] = red.length === 1 ? cell(red[0]) : [NaN, NaN], o = new Float64Array(2), inLens = off(px, py, o) >= 0
    const err = Math.hypot(px + o[0] - 72, py + o[1] - 20)
    assert('lens: the second tick is the only active dot, refracted by the same offset as the scene', red.length === 1 && inLens && err < .1 && reds(lens, 0).length === 1, `p + offset(p) − tick = ${err.toFixed(3)} cells`)
    const ctx0: WidgetContext = { t: 0, data: { ...lens.defaults } }
    assert('lens: tx = ty = 0 → rimAngle −60° exactly', H.lensRim(ctx0, [100, 70]).angle === -60 * DEG && H.lensRim(ctx0, [100, 70]).power === 3 && Math.abs(H.lensRim({ t: 0, data: { ...lens.defaults, tx: 1 } }, [100, 70]).angle + 35 * DEG) < 1e-12)
    const fill = medianLoaded(i => {
      const q = layerPass(atClock(() => withChrome(lens)({ t: 5 + i / 12, data: { ...lens.defaults } })).find(l => gpuTag(l.field))!, TILE, lens.style, pitch)!
      let s = 0
      for (let r = 0; r < q.rows; r++) for (let k = 0; k < q.cols; k++) s += q.field((q.map[0] + k * q.map[1]) / q.den[0], (q.map[2] + r * q.map[3]) / q.den[1])
      return s
    }, 7)
    assert('lens: GPU value fill ≤ 2 ms (the density-2 field over its pass, × load)', fill.ms <= 2 * fill.load, fmtLoaded(fill))
  }
  // ── pool ──
  {
    const pool = byId('mat-pool'), w = H.poolWorld
    worldReset(w)
    assert('pool: t = 0 is the pristine run after its 4 s lead (no pebble, no red)', simStep(w.sim, 0) === 120 && reds(pool, 0).length === 0 && w.mode === 'pristine')
    simReset(w.sim)
    worldAt(w, 3600)
    assert('pool: lead + period ≤ maxSteps (1,020 ≤ 1,080); a cold jump to t = 3600 has lag 0', 120 + 900 <= w.sim.maxSteps && w.sim.maxSteps === 1080 && w.sim.lag === 0, `maxSteps ${w.sim.maxSteps}, lag ${w.sim.lag}`)
    // two loops, then 20 scrubs: the total (checkpoints + 6 working copies) stays ≤ 256 KB and nothing is evicted once warm
    for (let t = 0; t <= 64; t += 1 / 30) worldAt(w, t)
    const before = H.poolMemory().checkpoints
    for (let k = 0; k < 20; k++) worldAt(w, (k * 7.31) % 34)
    const mem = H.poolMemory()
    assert('pool: total memory (checkpoints + 6 working copies) ≤ 256 KB after 2 loops + 20 random scrubs (≈125 KB expected), 0 evictions once warm', mem.bytes <= 256 * 1024 && mem.checkpoints === before && mem.checkpoints <= 8, `${(mem.bytes / 1024).toFixed(1)} KB, ${mem.checkpoints} checkpoints`)
    // a tap at t = 10 drops a pebble: the world forks live, the sinking pebble is the only red, and it heals back after idle
    worldReset(w)
    const at = (t: number, pointers: Pointer[] = []) => atClock(() => frameOf(pool, t, pointers))
    at(9.9)
    at(10, [POINTER(60, 70, true)])
    const live = w.mode === 'live'
    at(10 + 1 / 30)
    const sinking = at(10.4).filter(d => d.color === dot480.dotActive)
    let t = 10.4
    while (w.mode !== 'pristine' && t < 20) { t += 1 / 30; at(t) }
    assert('pool: a tap forks live, the pebble is the only active dot, heals to pristine after idle', live && sinking.length === 1 && w.mode === 'pristine' && t < 20, `live ${live}, red ${sinking.length}, pristine again at t ${t.toFixed(2)}`)
    const src = readFileSync(new URL('../src/widgets/boards/materials-live.ts', import.meta.url), 'utf8')
    const imp = src.match(/import \{([^}]*)\} from '\.\.\/\.\.\/engine\/life\/ripple'/)?.[1].split(',').map(x => x.trim()).sort().join(',')
    assert('pool: uses only createRipple / rippleStep / rippleSplat / rippleGrad (the L1.2 API)', imp === 'createRipple,rippleGrad,rippleSplat,rippleStep' && !/engine\/life\/(?!ripple')/.test(src), imp)
    worldReset(w)
  }
  // ── window ──
  {
    const win = byId('mat-window'), g = H.windowGeometry(), came: [number, number][] = []
    for (let i = 0; i < g.kind.length; i++) if (g.kind[i] === 2) came.push([i % 144, Math.floor(i / 144)])
    const bins = new Map<number, [number, number][]>()
    for (const p of came) { const k = (p[1] >> 3) * 32 + (p[0] >> 3); if (!bins.has(k)) bins.set(k, []); bins.get(k)!.push(p) }
    let minD = Infinity
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
      if (g.lat[j * 96 + i] < 0) continue
      const x = (i + .5) * 1.5 - .5, y = (j + .5) * 1.5 - .5
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of bins.get(((Math.floor(y) >> 3) + a) * 32 + (Math.floor(x) >> 3) + b) ?? []) minD = Math.min(minD, Math.hypot(p[0] - x, p[1] - y))
    }
    const cameSet = new Set(came.map(p => p[1] * 144 + p[0]))
    const onCame = atClock(() => frameOf(win, 1.3)).filter(d => { const [x, y] = cell(d); return Math.abs(x - Math.round(x)) < 1e-6 && Math.abs(y - Math.round(y)) < 1e-6 && cameSet.has(Math.round(y) * 144 + Math.round(x)) })
    const dull = onCame.every(d => d.color === dot480.dotMid || d.color === dot480.dotFaint)
    assert('window: every pane cell is ≥ 1 cell from a came cell (moat); came never brighter than mid', minD >= 1 && dull && came.length > 500, `nearest pane dot ${minD.toFixed(2)} cells from the lead; ${onCame.length} glints on ${came.length} came cells`)
    let hours = true, detail = ''
    for (let h = 0; h < 24; h++) {
      const red = atClock(() => withChrome(win)({ t: 0, data: { ...win.defaults } }), 2026, 0, 1, h, 15).filter(l => l.tone === 'active')
      const lit = red.length === 1 ? sampleLayers(red, TILE, win.style, dot480) : []
      const panes = new Set(lit.map(d => { const i = Math.round((d.x / pitch + .5) / 1.5 - .5), j = Math.round((d.y / pitch + .5) / 1.5 - .5); return g.lat[j * 96 + i] }))
      if (red.length !== 1 || panes.size !== 1 || !panes.has(h % 12)) { hours = false; detail = `hour ${h}: panes ${[...panes].join(',')}` }
    }
    assert('window: hour h lights petal h % 12 only (24 frozen-clock hours)', hours, detail)
    const gains = [6.5, 7.5, 8.5, 10, 12].map(h => H.skyGain(h, sunAt(h)))
    assert('window: day vs night gain monotone in sun elevation', gains.every((v, k) => k === 0 || v >= gains[k - 1]) && H.skyGain(23, sunAt(23)) < gains[0], gains.map(v => v.toFixed(3)).join(' ≤ '))
  }
  // ── patch ──
  {
    const g = H.patchGeo(), t = g.t
    let worst = 0
    for (let r = 50; r < 110; r++) for (let c = 50; c < 95; c++) {
      if (H.boltSdf(c, r) > -.5) continue
      const gx = H.boltSdf(c + .5, r) - H.boltSdf(c - .5, r), gy = H.boltSdf(c, r + .5) - H.boltSdf(c, r - .5), l = Math.hypot(gx, gy)
      if (l < .95) continue // the medial ridge
      const i = r * 144 + c
      worst = Math.max(worst, Math.abs(t.x[i] * -gy / l + t.y[i] * gx / l))
    }
    assert('patch: satin tangents ⟂ the motif\'s iso-lines (|T·∇d⊥| ≤ .05)', worst <= .05, `worst ${worst.toFixed(3)}`)
    const st = g.run
    let ok = true
    for (const tt of [0, .3, .6, 3, 12.6, 24.5, 30]) {
      const s = H.sewing(tt, st.count, st.total), dots = atClock(() => frameOf(byId('mat-patch'), tt)).filter(d => d.color === dot480.dotActive)
      const want = st.at(s.s), [x, y] = dots.length === 1 ? cell(dots[0]) : [NaN, NaN]
      if (tt >= H.SEW.unpick && s.sewn !== Math.floor(s.phase * st.count)) ok = false
      if (!(Math.hypot(x - want[0], y - want[1]) <= .01)) ok = false
    }
    const s0 = H.sewing(0, st.count, st.total)
    assert('patch: stitches sewn = floor(lap phase · count); needle at at(sewn)', ok && s0.sewn === st.count && s0.s === 0, `${st.count} stitches; t 0 → ${s0.sewn} sewn`)
  }
  // ── rust ──
  {
    const rust = byId('mat-rust'), p = H.rustPlate('66')
    let worst = 0
    for (const days of [10, 30, 66, 120, 200, 365]) {
      const want = H.rustCover(days), theta = H.rustThreshold(p, want)
      let n = 0
      for (let i = 0; i < p.rust.length; i++) if (p.n.mask[i] > .5 && p.rust[i] > theta) n++
      worst = Math.max(worst, Math.abs(n / p.total - want))
    }
    assert('rust: coverage(days) within ±1% of 1 − e^(−days/180) (histogram threshold)', worst <= .01 && atClock(() => H.daysSince(new Date())) === 66, `worst ${(100 * worst).toFixed(2)}%`)
    const theta = H.rustThreshold(p, H.rustCover(66))
    let ra = 0, rn = 0, ua = 0, un = 0
    for (let i = 0; i < p.rust.length; i++) { if (!(p.n.mask[i] > .5)) continue; if (p.rust[i] > theta) { ra += p.ao.data[i]; rn++ } else { ua += p.ao.data[i]; un++ } }
    assert('rust: crevices rust before open plate (mean ao of rusted < unrusted)', ra / rn < ua / un, `${(ra / rn).toFixed(3)} < ${(ua / un).toFixed(3)}`)
    const w = H.rustWorld
    worldReset(w)
    const front = reds(rust, 0), ls = atClock(() => withChrome(rust)({ t: 0, data: { ...rust.defaults } }))
    atClock(() => withChrome(rust)({ t: 20, data: { ...rust.defaults } }))
    atClock(() => withChrome(rust)({ t: 20 + 1 / 12, data: { ...rust.defaults, k: 1 } }))
    const forked = w.mode === 'live'
    atClock(() => withChrome(rust)({ t: 20.5, data: { ...rust.defaults } }))
    const sanded = atClock(() => H.rustShown(w.live, new Date()))
    let t = 20.5
    while (w.mode !== 'pristine' && t < 40) { t += 1 / 12; atClock(() => withChrome(rust)({ t, data: { ...rust.defaults } })) }
    assert('rust: front ≤ 250 dots, the only active layer; RESET forks live and heals', front.length > 0 && front.length <= 250 && ls.filter(l => l.tone === 'active').length === 1 && forked && sanded.count === 0 && w.mode === 'pristine', `${front.length} front dots; reset shows ${sanded.count}, pristine again at t ${t.toFixed(1)}`)
    worldReset(w)
  }
  // ── candle ──
  {
    const candle = byId('mat-candle'), top = H.candleTop(9 + 41 / 60), red = reds(candle, 1.3), ys = red.map(d => cell(d)[1]), drips = H.candleDrips()
    assert('candle: the top burns down 4 cells an hour (96 at midnight); the flame is the one red layer, above the wax', Math.abs(top - (H.CANDLE.full + 4 * (9 + 41 / 60))) < 1e-9 && red.length > 6 && ys.every(y => y < top) && drips.length === 3 && drips.every(d => d.length >= 3), `top row ${top.toFixed(1)}, flame ${red.length} dots`)
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
  let failures = 0
  await materialsChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }, { only, bench: args.includes('--bench') })
  if (failures) process.exit(1)
}
