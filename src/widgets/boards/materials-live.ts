/**
 * MATERIALS, M2: the two cards with a live fork (docs/living-matter/M-materials.md §4.2), each on a physics `World`:
 * a pure function of t until touched, then live, healing back.
 * - `mat-pool`: sunlight through a rippling pool draws a caustic net on its tiles. The water is track L's ripple
 *   (`engine/life/ripple.ts`, the API frozen at L1.2: only createRipple / rippleStep / rippleSplat / rippleGrad are
 *   used) at tile resolution (36 × 31, 4 cells a cell). The net is a forward photon splat (`causticSplat`) on the 2×
 *   lattice; the tiles are read through the water (`refractFloor`'s offset, inlined per row).
 * - `mat-rust`: a brushed steel "days since" sign rusting as the days go by; RESET sands it clean and time-lapses back.
 *
 * Both are main thread only (their live state is here, as on the pond board): the sampling worker's build resolves
 * this module to `materials-live-worker-stub.ts` (vite.config.ts `mainThreadOnly`), so the ripple, the world and the
 * rust bakes never ship there.
 */
import { createRipple, rippleGrad, rippleSplat, rippleStep } from '../../engine/life/ripple'
import { causticSplat } from '../../engine/matter/caustics'
import { tonedLayer } from '../../engine/matter/surface'
import { createWorld, framePointers, worldAt, type FrameInput, type StepInput, type World } from '../../engine/physics/world'
import { createRaster, type Raster } from '../../engine/raster/raster'
import { ambientOcclusion, cardMask } from '../../engine/matter/relief'
import { anisoSpec, tangentLinear, type TangentRaster } from '../../engine/matter/aniso'
import { normalRaster, type HeightRaster, type NormalRaster } from '../../engine/light/height'
import { lambert } from '../../engine/light/shade'
import { fbm2 } from '../../engine/noise/gradient'
import { stbn } from '../../engine/halftone/mask'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import { hash01 } from '../../engine/math'
import type { Light, Vec3 } from '../../engine/light/shade'
import { TILE, layer, type WidgetContext, type WidgetPreset } from '../types'
import { LIGHT_DEFAULTS, cite, matLight, once, T, tile, valuedSites } from './materials-shared'

// The sampling worker would run its own (pristine) copy of the world and snap back when the pointer leaves.
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'

/** The ripple grid: 36 × 31 cells of 4 card cells, cell (k, m) centred on card (4k + 1.5, 16 + 4m + 1.5). */
export const RIPPLE = { w: 36, h: 31, pitch: 4, oy: 16, damp: .984 }
/** The 2× lattice the floor and the net are drawn on: lattice cell (i, j) is centred on card (2i + .5, 2j + .5). */
const K2 = 2, LG2 = latticeGrid(TILE, K2), COLS = TILE.cols
/** The basin in lattice cells (water inside), with a 2-dot coping round it. */
export const BASIN = { i0: 4, j0: 11, i1: 67, j1: 63, coping: 2 }
/** Floor tiles: 6 lattice dots + 1 dot of grout (period 7 lattice = 14 cells). */
const TILE_P = 7
/**
 * The water (lattice cells): depth, the caustic gain and n, as `causticSplat` takes them; the drips' and pebbles' depth
 * (ripple units) and the breeze, a small splat every 3 steps at a hashed spot that keeps the surface moving between
 * drips, so the net never goes flat. (The plan's drip amp .6 left the slopes too small to bend light visibly at depth 6.)
 */
export const WATER = { depth: 6, gain: 12, ior: 1.33, drip: 2.4, pebble: 3, breeze: 1 }
const cardToRx = (x: number) => (x - 1.5) / RIPPLE.pitch, cardToRy = (y: number) => (y - RIPPLE.oy - 1.5) / RIPPLE.pitch
const latX = (i: number) => (i + .5) * K2 - .5
const inBasinCard = (x: number, y: number) => x >= latX(BASIN.i0) - 1 && x <= latX(BASIN.i1) + 1 && y >= latX(BASIN.j0) - 1 && y <= latX(BASIN.j1) + 1

/** The ripple's water mask: a ripple cell is water when its centre lies over the basin. */
const mask = (() => {
  const m = new Uint8Array(RIPPLE.w * RIPPLE.h)
  for (let y = 0; y < RIPPLE.h; y++) for (let x = 0; x < RIPPLE.w; x++) if (inBasinCard(RIPPLE.pitch * x + 1.5, RIPPLE.oy + RIPPLE.pitch * y + 1.5)) m[y * RIPPLE.w + x] = 1
  return m
})()
export const ripple = createRipple({ w: RIPPLE.w, h: RIPPLE.h, damp: RIPPLE.damp, mask })
/** Pebbles after the ripple planes: 5 slots of (x, y in ripple cells; age in steps; size 0 = empty), then the next slot. */
export const PEBBLES = 5
const PB = ripple.size, NEXT = PB + 4 * PEBBLES, SIZE = NEXT + 1
/** Steps a pebble sinks (1.2 s at dt 1/30). */
export const SINK = 36
const DT = 1 / 30, LEAD = 4, PERIOD = 30, SEED = 480
/** The autopilot: a drip every 1.7–3.1 s at hashed spots, over the lead and one loop (in steps: fps-free). */
export const DRIPS: { n: number; x: number; y: number }[] = (() => {
  const out: { n: number; x: number; y: number }[] = []
  let n = 18
  for (let k = 0; n < Math.round((LEAD + PERIOD) / DT); k++) {
    out.push({ n, x: 3 + hash01(SEED, k, 1) * (RIPPLE.w - 7), y: 3 + hash01(SEED, k, 2) * (RIPPLE.h - 7) })
    n += Math.round((1.7 + 1.4 * hash01(SEED, k, 3)) / DT)
  }
  return out
})()
const dripAt = new Map(DRIPS.map(d => [d.n, d]))

function poolStep(s: Float32Array, n: number, inp: StepInput): void {
  const d = dripAt.get(n)
  if (d) rippleSplat(ripple, s, d.x, d.y, -WATER.drip, 1.5)
  if (n % 3 === 0) rippleSplat(ripple, s, 2 + hash01(SEED, n, 4) * (RIPPLE.w - 5), 2 + hash01(SEED, n, 5) * (RIPPLE.h - 5), (hash01(SEED, n, 6) < .5 ? -1 : 1) * WATER.breeze, 1.2)
  for (const p of inp.pointers) {
    if (p.pressed && mask[Math.round(p.y) * RIPPLE.w + Math.round(p.x)]) dropPebble(s, p.x, p.y)
    else if (!p.down && Math.hypot(p.vx, p.vy) > 1 && mask[Math.round(p.y) * RIPPLE.w + Math.round(p.x)]) rippleSplat(ripple, s, p.x, p.y, -.08, 1.5) // a hovering hand's soft wake
  }
  if (inp.kick) dropPebble(s, RIPPLE.w / 2 - .5, RIPPLE.h / 2 - .5)
  for (let k = 0; k < PEBBLES; k++) if (s[PB + 4 * k + 3] > 0 && s[PB + 4 * k + 2] < SINK) s[PB + 4 * k + 2]++
  rippleStep(ripple, s)
}
function dropPebble(s: Float32Array, x: number, y: number): void {
  rippleSplat(ripple, s, x, y, -WATER.pebble, 1.5)
  const k = Math.round(s[NEXT]) % PEBBLES, o = PB + 4 * k
  s[o] = x; s[o + 1] = y; s[o + 2] = 0; s[o + 3] = 1
  s[NEXT] = (k + 1) % PEBBLES
}
/** Heal: the water blends to the pristine run; pebbles keep their place and shrink away (their size blends to 0). */
function poolBlend(a: Float32Array, b: Float32Array, k: number): void {
  for (let i = 0; i < PB; i++) a[i] += (b[i] - a[i]) * k
  for (let p = 0; p < PEBBLES; p++) { const o = PB + 4 * p + 3; a[o] += (b[o] - a[o]) * k; if (a[o] < .05) a[o] = 0 }
}
export const poolWorld: World = createWorld({
  size: SIZE, dt: DT, init: () => {}, step: poolStep, blend: poolBlend,
  lead: LEAD, period: PERIOD, seam: 2, maxSteps: 1080, every: 150, maxCheckpoints: 8, idle: 3,
})

/** This frame's input in ripple cells; Enter / Space drop a pebble in the middle. Reduced motion: none. */
function poolInput(ctx: WidgetContext): FrameInput | undefined {
  if (ctx.reducedMotion) return undefined
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, (x, y) => [cardToRx(x), cardToRy(y)]), kick: (ctx.data.k ?? 0) >= .5 && !busy }
}

interface PoolScratch { gx: Float32Array; gy: Float32Array; caustic: ReturnType<typeof createRaster>; values: ReturnType<typeof createRaster>; tones: Uint8Array; water: Uint8Array; g: Float32Array }
const poolScratch = once((): PoolScratch => {
  const n = LG2.cols * LG2.rows, water = new Uint8Array(n)
  for (let j = BASIN.j0; j <= BASIN.j1; j++) for (let i = BASIN.i0; i <= BASIN.i1; i++) water[j * LG2.cols + i] = 1
  const caustic = createRaster(LG2)
  caustic.bounds = [BASIN.i0, BASIN.j0, BASIN.i1, BASIN.j1]
  return { gx: new Float32Array(n), gy: new Float32Array(n), caustic, values: createRaster(LG2), tones: new Uint8Array(n), water, g: new Float32Array(3) }
})
/** Lattice cells i0 … i1 of row j: the water's slope (per lattice cell) from the ripple, bilinear. */
function gradRow(s: Float32Array, S: PoolScratch, j: number): void {
  const ry = cardToRy(latX(j)), g = S.g
  for (let i = BASIN.i0; i <= BASIN.i1; i++) {
    rippleGrad(ripple, s, cardToRx(latX(i)), ry, g)
    const k = j * LG2.cols + i
    S.gx[k] = g[1] * (K2 / RIPPLE.pitch); S.gy[k] = g[2] * (K2 / RIPPLE.pitch)
  }
}
/** The floor under the water at a lattice point: grout .2 (faint) on every 7th row and column, tile .55 (mid) between. */
const floorAt = (i: number, j: number) => {
  const a = Math.round(i) - BASIN.i0, b = Math.round(j) - BASIN.j0
  return ((a % TILE_P) + TILE_P) % TILE_P === TILE_P - 1 || ((b % TILE_P) + TILE_P) % TILE_P === TILE_P - 1 ? .2 : .55
}
const NET = 1.6, DIM = .7
/** Lattice cells of row j: tiles × light (the net a band up, shade a band down), the glints on the surface over them. */
function poolRow(S: PoolScratch, j: number, kr: number, hx: number, hy: number, hz: number, lz: number): void {
  const V = S.values.data, Tn = S.tones, C = S.caustic.data
  for (let i = BASIN.i0; i <= BASIN.i1; i++) {
    const k = j * LG2.cols + i, gx = S.gx[k], gy = S.gy[k], base = floorAt(i - kr * gx, j - kr * gy), c = C[k]
    // the surface: a glint where the sun's mirror image is (Blinn: the normal near the half vector)
    const nx = -gx * 3, ny = -gy * 3, nl = 1 / Math.sqrt(nx * nx + ny * ny + 1), ndh = (nx * hx + ny * hy + hz) * nl
    if (lz > 0 && ndh > .9985) { V[k] = 1; Tn[k] = 3; continue }
    const v = base * (.45 + .55 * c)
    if (base < .3) { V[k] = Math.max(.08, Math.min(.29, v)); Tn[k] = 0; continue } // grout stays faint
    if (c >= NET) { V[k] = Math.min(1, v + .25); Tn[k] = 3 } else if (c < DIM) { V[k] = Math.max(.08, Math.min(.29, v)); Tn[k] = 0 } else { V[k] = Math.max(.3, Math.min(.6, v)); Tn[k] = 1 }
  }
}
/** The coping: a 2-dot idle frame round the basin (static). */
function copingRow(S: PoolScratch, j: number): void {
  const V = S.values.data, Tn = S.tones, c = BASIN.coping
  for (let i = BASIN.i0 - c; i <= BASIN.i1 + c; i++) {
    if (j >= BASIN.j0 && j <= BASIN.j1 && i >= BASIN.i0 && i <= BASIN.i1) continue
    const k = j * LG2.cols + i
    V[k] = .7; Tn[k] = 2
  }
}
export interface PoolView { state: Float32Array; pebbles: { x: number; y: number; sinking: boolean; size: number }[] }
/** The light's horizontal lean (sun or tilt): the net slides off the light, (L.x, L.y) / L.z · 2 cells (lattice ÷ 2). */
function leanOf(L: Light): [number, number] {
  if (!Array.isArray(L)) return [0, 0]
  const v = L as Vec3, z = Math.max(.2, v[2])
  return [v[0] / z, v[1] / z]
}
export const matPool: WidgetPreset = {
  ...tile, id: 'mat-pool', name: 'Pool', fps: 30,
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: [latX(BASIN.i0) - 1, latX(BASIN.j0) - 1, latX(BASIN.i1) - latX(BASIN.i0) + 2, latX(BASIN.j1) - latX(BASIN.j0) + 2], label: 'Drop a pebble' }],
  layers: ctx => {
    if (IN_WORKER) throw new Error('mat-pool keeps its live state on the main thread')
    const s = worldAt(poolWorld, ctx.t, poolInput(ctx)), S = poolScratch(), L = matLight(ctx, { lattice: K2, torch: { height: 50, falloff: 200 } })
    for (let j = BASIN.j0; j <= BASIN.j1; j++) gradRow(s, S, j)
    const [lx, ly] = leanOf(L)
    causticSplat((x, y, out) => { const k = Math.round(y) * LG2.cols + Math.round(x); out[0] = 0; out[1] = S.gx[k]; out[2] = S.gy[k] }, S.caustic, { depth: WATER.depth, gain: WATER.gain, ior: WATER.ior, mask: S.water, shift: [lx, ly] })
    S.caustic.bounds = [BASIN.i0, BASIN.j0, BASIN.i1, BASIN.j1]
    // the half vector for the glints: the light (a torch: from the basin's middle) and the eye straight above
    const Ld: Vec3 = Array.isArray(L) ? L as Vec3 : [(L as { at: Vec3 }).at[0] - 36, (L as { at: Vec3 }).at[1] - 39, (L as { at: Vec3 }).at[2]]
    const ll = Math.hypot(...Ld) || 1, hx0 = Ld[0] / ll, hy0 = Ld[1] / ll, hz0 = Ld[2] / ll + 1, hl = Math.hypot(hx0, hy0, hz0) || 1
    const kr = WATER.depth * (1 - 1 / WATER.ior)
    S.values.data.fill(0); S.tones.fill(0)
    for (let j = BASIN.j0; j <= BASIN.j1; j++) poolRow(S, j, kr, hx0 / hl, hy0 / hl, hz0 / hl, Ld[2])
    for (let j = BASIN.j0 - BASIN.coping; j <= BASIN.j1 + BASIN.coping; j++) copingRow(S, j)
    S.values.bounds = [BASIN.i0 - BASIN.coping, BASIN.j0 - BASIN.coping, BASIN.i1 + BASIN.coping, BASIN.j1 + BASIN.coping]
    // pebbles: red while they sink (drawn where the water bends them), then grey stones on the floor
    const sinking: [number, number, number][] = [], landed: [number, number, number][] = [], g = S.g
    for (let p = 0; p < PEBBLES; p++) {
      const o = PB + 4 * p, size = s[o + 3]
      if (!(size > 0)) continue
      const age = s[o + 2], x = RIPPLE.pitch * s[o] + 1.5, y = RIPPLE.oy + RIPPLE.pitch * s[o + 1] + 1.5
      rippleGrad(ripple, s, s[o], s[o + 1], g)
      const depth = Math.min(1, age / SINK), bend = kr * K2 * depth * (K2 / RIPPLE.pitch)
      const at: [number, number, number] = [x - bend * g[1], y - bend * g[2], Math.min(1, size) * (age < SINK ? 1 - .3 * depth : .8)]
      ;(age < SINK ? sinking : landed).push(at)
    }
    return [
      cite('CAUSTICS · RIPPLE'),
      tonedLayer(S.values, S.tones, K2),
      ...(landed.length ? [layer(valuedSites(landed, 2.4), 'mid')] : []),
      ...(sinking.length ? [layer(valuedSites(sinking, 2.4), 'active')] : []),
      layer(T.text('TAP TO DROP', 143, 134, { align: 'right' }), 'faint'),
    ]
  },
}

/** Total bytes the world holds: its checkpoints and its working copies (sim head, scratch, 3 views, the live state). */
export function poolMemory(): { bytes: number; checkpoints: number } {
  const sim = poolWorld.sim, per = SIZE * 4
  return { bytes: (sim.checkpoints.size + 6) * per, checkpoints: sim.checkpoints.size }
}

// ── 10 RUST ─ a steel sign counting days, slowly rusting over ─────────────────────────────────────────────
// Brushed plate on card pitch (Kajiya–Kay p 48 along x), four domed rivets, the lettering engraved (−1.2) with AO in
// the grooves. Rust grows by a field r = fbm + crevices (1 − AO) + edges, over the cells where r is above the
// threshold that covers 1 − e^(−days/180) of the plate (a 256-bin histogram, exact to a bin). The live front is red.
const PLATE = { x0: 6, y0: 18, x1: 137, y1: 127, r: 3 }
const P_CX = (PLATE.x0 + PLATE.x1) / 2, P_CY = (PLATE.y0 + PLATE.y1) / 2, P_HW = (PLATE.x1 - PLATE.x0) / 2, P_HH = (PLATE.y1 - PLATE.y0) / 2
const PLATE_BOX: [number, number, number, number] = [PLATE.x0, PLATE.y0, PLATE.x1, PLATE.y1]
/** Signed distance to the plate's rounded outline (cells, < 0 inside). */
const plateSdf = (x: number, y: number) => {
  const qx = Math.abs(x - P_CX) - (P_HW - PLATE.r), qy = Math.abs(y - P_CY) - (P_HH - PLATE.r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PLATE.r
}
const RIVETS: [number, number][] = [[13, 25], [130, 25], [13, 120], [130, 120]]
/** The sign's epoch: the plan's own day (M §10.4, an owner call). */
export const RUST_EPOCH = { y: 2025, m: 9, d: 27 }
/** Whole days since the epoch for a local date (calendar days: DST-proof). At the golden clock (2026-01-01) this is 66. */
export const daysSince = (d: Date) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(RUST_EPOCH.y, RUST_EPOCH.m, RUST_EPOCH.d)) / 864e5)
/** Rust cover after `days`: 1 − e^(−days/180) (66 → .31, 365 → .87). */
export const rustCover = (days: number) => 1 - Math.exp(-Math.max(0, days) / 180)
const RESET_BOX: [number, number, number, number] = [50, 100, 44, 16]
const COUNT_ROW = 40, SAND = 1.2

/** Row r of the plate: the bevelled slab and the rivets' domes (height), coverage, and the rust's edge term. */
function plateRow(H: Float32Array, M: Float32Array, E: Float32Array, r: number): void {
  for (let c = PLATE.x0, i = r * COLS + c; c <= PLATE.x1; c++, i++) {
    const sd = plateSdf(c, r)
    if (sd >= .5) continue
    const inset = Math.max(0, -sd)
    let h = 1.2 * Math.min(1, inset / 1.5)
    for (const [x, y] of RIVETS) { const d = Math.hypot(c - x, r - y); if (d < 3.5) h += 1.2 * Math.sqrt(1 - (d / 3.5) ** 2) }
    H[i] = h; M[i] = Math.min(1, .5 - sd)
    E[i] = .2 * (1 - Math.min(1, inset / 10))
  }
}
/** The plate's static half (baked once): relief, coverage and r's noise + edge terms. The noise is fBm on a 3-cell grid, read bilinearly (2 octaves, the finer one 13 cells: the rust grows in patches, not grain). */
const rustBase = once(() => {
  const n = COLS * TILE.rows, H = new Float32Array(n), M = new Float32Array(n), E = new Float32Array(n)
  for (let r = PLATE.y0; r <= PLATE.y1; r++) plateRow(H, M, E, r)
  const gw = Math.ceil((PLATE.x1 - PLATE.x0) / 3) + 2, gh = Math.ceil((PLATE.y1 - PLATE.y0) / 3) + 2, G = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) noiseRow(G, gw, j)
  for (let r = PLATE.y0; r <= PLATE.y1; r++) noiseUp(G, gw, E, M, r)
  return { H, M, E }
})
function noiseRow(G: Float32Array, gw: number, j: number): void {
  for (let i = 0; i < gw; i++) G[j * gw + i] = fbm2((PLATE.x0 + 3 * i) / 26, (PLATE.y0 + 3 * j) / 26, 2, 31)
}
function noiseUp(G: Float32Array, gw: number, E: Float32Array, M: Float32Array, r: number): void {
  const fy = (r - PLATE.y0) / 3, j = Math.floor(fy), ty = fy - j
  for (let c = PLATE.x0, i = r * COLS + c; c <= PLATE.x1; c++, i++) {
    if (!(M[i] > 0)) continue
    const fx = (c - PLATE.x0) / 3, k = Math.floor(fx), tx = fx - k, a = j * gw + k
    const top = G[a] + (G[a + 1] - G[a]) * tx, bot = G[a + gw] + (G[a + gw + 1] - G[a + gw]) * tx
    E[i] += top + (bot - top) * ty
  }
}
export interface RustPlate { key: string; n: NormalRaster; ao: Raster; rust: Float32Array; lo: number; hi: number; cum: Float64Array; total: number; t: TangentRaster }
const HIST = 256
const rustPlates = new Map<string, RustPlate>()
/** Row r: engrave the lettering (−1.2) into the slab. */
function engraveRow(H: Float32Array, base: Float32Array, M: Float32Array, cut: Float32Array[], r: number): void {
  for (let c = PLATE.x0, i = r * COLS + c; c <= PLATE.x1; c++, i++) {
    if (!(M[i] > 0)) continue
    let h = base[i]
    for (const m of cut) if (m[i]) { h -= 1.2; break }
    H[i] = h
  }
}
/** Row r of the rust field: the static terms plus the crevices (1 − AO). */
function rustRow(R: Float32Array, E: Float32Array, M: Float32Array, A: Float32Array, r: number): void {
  for (let c = PLATE.x0, i = r * COLS + c; c <= PLATE.x1; c++, i++) if (M[i] > 0) R[i] = E[i] + .3 * (1 - A[i])
}
/** The engraved plate for one count (LRU of 2: the count changes once a day): normals, AO, the rust field and its histogram. */
export function rustPlate(count: string): RustPlate {
  const hit = rustPlates.get(count)
  if (hit) { rustPlates.delete(count); rustPlates.set(count, hit); return hit }
  const b = rustBase(), cut = [
    cardMask(T.big('DAYS SINCE', 72, 25, { lattice: 1.3, align: 'center' }), TILE),
    ...(count ? [cardMask(T.big(count, 72, COUNT_ROW, { lattice: 2.5, smooth: true, align: 'center' }), TILE)] : []),
    cardMask({ field: T.text('RESET', 72, RESET_BOX[1] + 5, { align: 'center' }) }, TILE),
    cardMask({ field: T.box(RESET_BOX[0], RESET_BOX[1], RESET_BOX[2], RESET_BOX[3]) }, TILE),
  ].map(m => m.data)
  const h: HeightRaster = { ...createRaster(TILE, 'card', PLATE_BOX), mask: b.M }
  for (let r = PLATE.y0; r <= PLATE.y1; r++) engraveRow(h.data, b.H, b.M, cut, r)
  const n = normalRaster(h), ao = ambientOcclusion(h, { radius: 2, strength: .7 }), rust = new Float32Array(COLS * TILE.rows)
  for (let r = PLATE.y0; r <= PLATE.y1; r++) rustRow(rust, b.E, b.M, ao.data, r)
  let lo = Infinity, hi = -Infinity, total = 0
  for (let i = 0; i < rust.length; i++) if (b.M[i] > .5) { const v = rust[i]; if (v < lo) lo = v; if (v > hi) hi = v; total++ }
  const bins = new Float64Array(HIST), span = (hi - lo) || 1
  for (let i = 0; i < rust.length; i++) if (b.M[i] > .5) bins[Math.min(HIST - 1, Math.floor((rust[i] - lo) / span * HIST))]++
  // cum[k] = the cells in bins ≥ k (above bin k's lower edge)
  const cum = new Float64Array(HIST + 1)
  for (let k = HIST - 1; k >= 0; k--) cum[k] = cum[k + 1] + bins[k]
  const plate: RustPlate = { key: count, n, ao, rust, lo, hi, cum, total, t: tangentLinear(TILE, 0, PLATE_BOX) }
  rustPlates.set(count, plate)
  if (rustPlates.size > 2) rustPlates.delete(rustPlates.keys().next().value!)
  return plate
}
/** The threshold θ with a share `cover` of the plate's cells above it (linear inside the bin: within 1/256 of exact). */
export function rustThreshold(p: RustPlate, cover: number): number {
  const want = Math.max(0, Math.min(1, cover)) * p.total, w = (p.hi - p.lo) / HIST
  if (want <= 0) return p.hi + 1e-6
  for (let k = HIST - 1; k >= 0; k--) {
    if (p.cum[k] >= want) { const inBin = p.cum[k] - p.cum[k + 1], f = inBin > 0 ? (want - p.cum[k + 1]) / inBin : 0; return p.lo + (k + 1 - f) * w }
  }
  return p.lo - 1e-6
}
interface Shaded { values: Float32Array; tones: Uint8Array }
const shadedPlates = new Map<string, Shaded>()
const rustLightKey = (L: Light) => (Array.isArray(L) ? (L as readonly number[]).map(x => x.toFixed(5)).join(',') : (L as { at: readonly number[] }).at.map(x => x.toFixed(3)).join(','))
/** Row r of the bare plate: the body by Lambert × AO² (bright steel idle, grooves faint / void), the brushed streak in value, a void brushing groove every third row. */
function shadeRow(M: Float32Array, A: Float32Array, D: Float32Array, S: Float32Array, V: Float32Array, Tn: Uint8Array, r: number): void {
  for (let c = PLATE.x0, i = r * COLS + c; c <= PLATE.x1; c++, i++) {
    if (!(M[i] > .5)) continue
    // bare steel is bright (idle where it faces the light); the grooves fall to faint / void in their own shadow
    const b = (.3 + .5 * D[i]) * A[i] * A[i], s = S[i]
    if (b < .06) continue
    // the brushing: every third row of open plate is a void groove along the grain (period 3, a cross-profile)
    if ((r - PLATE.y0) % 3 === 2 && A[i] > .97) continue
    if (s >= .6) { V[i] = Math.min(1, b + .25); Tn[i] = 3 } else { V[i] = b; Tn[i] = b < .3 ? 0 : b < .62 ? 1 : 2 }
  }
}
const rustScratch = once(() => ({ dif: createRaster(TILE), spec: createRaster(TILE), values: createRaster(TILE, 'card', PLATE_BOX), tones: new Uint8Array(COLS * TILE.rows) }))
/** The bare brushed plate for one light (cached per engraving × light, LRU of 6: the sun and tilt buckets repeat). */
function shadedPlate(p: RustPlate, L: Light): Shaded {
  const key = `${p.key}|${rustLightKey(L)}`, hit = shadedPlates.get(key)
  if (hit) { shadedPlates.delete(key); shadedPlates.set(key, hit); return hit }
  const S = rustScratch(), out: Shaded = { values: new Float32Array(COLS * TILE.rows), tones: new Uint8Array(COLS * TILE.rows) }
  lambert(p.n, L, { ambient: .15, into: S.dif })
  anisoSpec(p.n, p.t, L, { exponent: 48, into: S.spec })
  for (let r = PLATE.y0; r <= PLATE.y1; r++) shadeRow(p.n.mask, p.ao.data, S.dif.data, S.spec.data, out.values, out.tones, r)
  shadedPlates.set(key, out)
  if (shadedPlates.size > 6) shadedPlates.delete(shadedPlates.keys().next().value!)
  return out
}
/** How far past θ the front reaches (r units): the front is the rust's edge cells, only where it is still this fresh. */
export const FRONT = .008
/**
 * Row r of the frame: bare plate below θ; rust above it, which kills the sheen (fresh rust mid; deep rust faint,
 * pitted to mid on 2×2 blocks); the front in red: rust cells with bare steel next to them (4-neighbours), still fresh.
 */
function rustFrameRow(p: RustPlate, sh: Shaded, theta: number, V: Float32Array, Tn: Uint8Array, F: [number, number, number][], r: number): void {
  const M = p.n.mask, R = p.rust
  for (let c = PLATE.x0, i = r * COLS + c; c <= PLATE.x1; c++, i++) {
    if (!(M[i] > .5)) continue
    const d = R[i] - theta
    if (d <= 0) { V[i] = sh.values[i]; Tn[i] = sh.tones[i]; continue }
    if (d < FRONT && (R[i - 1] <= theta || R[i + 1] <= theta || R[i - COLS] <= theta || R[i + COLS] <= theta)) { F.push([c, r, .75]); continue }
    if (d <= .12) { V[i] = .4; Tn[i] = 1; continue }
    // deep rust: pitted on 2×2 blocks (a third raised to mid, a fifth eaten through to void)
    const n = stbn(c >> 1, r >> 1)
    if (n < .3) { V[i] = .4; Tn[i] = 1 } else if (n > .8) continue; else { V[i] = .22; Tn[i] = 0 }
  }
}
/** World state: [0] seconds since RESET (−1: none), [1] extra days of rust from hovering (a day per second). */
const RUST_DT = 1 / 30
function rustStep(s: Float32Array, _n: number, inp: StepInput): void {
  if (inp.kick) s[0] = 0
  else if (s[0] >= 0) s[0] += RUST_DT
  for (const p of inp.pointers) if (!p.down && plateSdf(p.x, p.y) < 0) { s[1] += RUST_DT; break }
}
/** Heal: the hover's extra days recede; a finished time-lapse snaps back to none (it already shows the real count). */
function rustBlend(a: Float32Array, b: Float32Array, k: number): void { a[0] = b[0]; a[1] += (b[1] - a[1]) * k }
export const rustWorld: World = createWorld({ size: 2, dt: RUST_DT, init: s => { s[0] = -1 }, step: rustStep, blend: rustBlend, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 8, heal: 1 })
/** What the sign shows for a world state: the creep (days of rust) and the engraved count. Sanding takes 1.2 s, the time-lapse ≤ 6 s (10+ days/s). */
export function rustShown(s: Float32Array, now: Date): { creep: number; count: number; days: number } {
  const days = daysSince(now), real = days + (now.getHours() * 60 + now.getMinutes()) / 1440 + s[1]
  if (!(s[0] >= 0)) return { creep: real, count: days, days }
  const e = s[0]
  if (e < SAND) return { creep: real * (1 - e / SAND), count: 0, days }
  const lapse = (e - SAND) * Math.max(10, days / 6)
  return { creep: Math.min(real, lapse), count: Math.min(days, Math.floor(lapse)), days }
}
export const matRust: WidgetPreset = {
  ...tile, id: 'mat-rust', name: 'Rust', clock: true,
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: RESET_BOX, label: 'Reset the count' }],
  layers: ctx => {
    if (IN_WORKER) throw new Error('mat-rust keeps its live state on the main thread')
    const s = worldAt(rustWorld, ctx.t, ctx.reducedMotion ? undefined : { pointers: framePointers(ctx.pointers, (x, y) => [x, y]), kick: (ctx.data.k ?? 0) >= .5 })
    const show = rustShown(s, new Date()), engraved = show.count === show.days, p = rustPlate(engraved ? String(show.days) : '')
    const sh = shadedPlate(p, matLight(ctx, { torch: { height: 40, falloff: 170 } })), S = rustScratch(), theta = rustThreshold(p, rustCover(show.creep))
    S.values.data.fill(0); S.tones.fill(0)
    // the front as sites on whole cells (a few hundred at most): no scan of the plate for a thin line
    const front: [number, number, number][] = []
    for (let r = PLATE.y0; r <= PLATE.y1; r++) rustFrameRow(p, sh, theta, S.values.data, S.tones, front, r)
    S.values.bounds = PLATE_BOX
    return [
      cite('DAYS · RUST'),
      tonedLayer(S.values, S.tones),
      ...(engraved ? [] : [layer(T.big(String(show.count), 72, COUNT_ROW, { lattice: 2.5, smooth: true, align: 'center' }), 'idle')]),
      ...(front.length ? [layer(valuedSites(front, 1), 'active')] : []),
    ]
  },
}

export const poolHooks = { RIPPLE, BASIN, WATER, PEBBLES, SINK, DRIPS, poolWorld, poolMemory, ripple, mask, rustWorld, rustPlate, rustThreshold, rustCover, rustShown, daysSince, FRONT, plateSdf }
