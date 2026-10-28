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
import { heightRaster, lightDir, metal, normalRaster, sdfBox, sdfCircle, type Light, type Vec3 } from '../src/engine/light'
import { createRaster, distanceRaster, rasterize } from '../src/engine/raster'
import { latticeGrid } from '../src/engine/sampler/gridSampler'
import type { Field, GridConfig } from '../src/engine/types'

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
    const ms = median(Array.from({ length: 11 }, (_, i) => time(() => anisoSpec(big, tb, lightDir(i * .3, 40 * DEG), { exponent: 80, into }))[0]))
    assert('materials: aniso: one pass ≤ 0.8 ms at 144² (× load)', ms <= .8 * load, `${ms.toFixed(3)} ms`)
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
    const ms = median(Array.from({ length: 5 }, (_, i) => time(() => weaveRelief(twill(2, 4, i % 2 ? 1 : -1), TILE, { box, crossing: 4, picks: 26 - i }))[0]))
    assert('materials: weave: relief bake ≤ 15 ms for 24 × 26 crossings', ms <= 15 * load, `${ms.toFixed(2)} ms`)
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

  // BOARD-CHECKS
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
  let failures = 0
  await materialsChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }, { only, bench: args.includes('--bench') })
  if (failures) process.exit(1)
}
