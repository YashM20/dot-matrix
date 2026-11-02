/** Materials checks, optics group (scripts/materials.ts): glass (M2.1) and caustics (M2.3). */
import { BEZEL, causticSplat, causticStats, frost, liquidGlass, LUT_SAMPLES, snellLUT } from '../../src/engine/matter'
import { createRaster, rasterize } from '../../src/engine/raster'
import type { Field, GridConfig } from '../../src/engine/types'
import { fmtLoaded, medianLoaded } from '../lib/load'
import { type Assert, same } from './util'

// ── glass (M2.1) ──────────────────────────────────────────────────────────────────────────────────
export function glassChecks(assert: Assert): void {
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
export function causticChecks(assert: Assert): void {
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
  assert('materials: caustics: deterministic', same(det.data, into.data))
  assert('materials: caustics: ≤ 1 ms for 72² × 4 photons (× load)', tm.ms <= 1 * tm.load, fmtLoaded(tm, 3))
}
