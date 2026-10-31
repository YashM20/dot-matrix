/**
 * WORKSHOP, the three physics cards (docs/living-matter/M-materials.md §5): each a `World` that is a still, pristine
 * scene until touched (the pristine run never steps the sim: its state is the initial one at every t), then live,
 * healing back. Their step code is in `engine/matter/{sand,mercury,thread}.ts` (in the determinism lint); gravity
 * (`gx`, `gy`) reaches the steps only, never a light or a matcap (M3.10).
 * - `mat-sand`: a Zen tray; a 5-tine rake carves where a press drags (the rake head is red while it carves), a tap
 *   drops a stone with a ring groove round it; the sand slides back to its angle of repose; heals after 12 s.
 * - `mat-mercury`: a pool of mercury in a tray (a stable fluid's ink, sinking hard along gravity): a drag stirs it,
 *   tipping the phone pours it, a tap splits a red bead off that rejoins in 1.5 s; a matcap tipped by the tilt offset.
 * - `mat-thread`: a thread off a spool (track L's Verlet rope, `ropeStep`): a drag pulls it (the spool pays out and
 *   winds back on release; the needle's eye is red while pulled), a tap flicks it, tilt swings it.
 * Touch: one surface control each (`gesture: 'surface'`): a horizontal drag or a 300 ms hold engages it, a vertical
 * swipe scrolls the page and leaves the world pristine, a tap acts.
 *
 * Main thread only: the sampling worker's build resolves this module to `workshop-physics-worker-stub.ts`.
 */
import { createSand, sandCarve, sandGarden, sandRake, sandRelax, sandSize, sandVolume, type Sand } from '../../engine/matter/sand'
import { createMercury, mercuryInit, mercuryMass, mercuryStep, BEAD, type Mercury } from '../../engine/matter/mercury'
import { createThread, threadInit, threadStep, threadStrain, type Thread } from '../../engine/matter/thread'
import { bakeMatcap, LIQUID, matcapMatrix, tonedLayer } from '../../engine/matter'
import { fluidDensityAt } from '../../engine/physics/fluid'
import { createWorld, framePointers, worldAt, type FrameInput, type StepInput, type World } from '../../engine/physics/world'
import { stbn } from '../../engine/halftone/mask'
import { dsin } from '../../engine/noise/dmath'
import { createRaster } from '../../engine/raster/raster'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Light, Vec3 } from '../../engine/light/shade'
import type { Control } from '../../engine/context'
import { TILE, layer, type WidgetContext, type WidgetPreset } from '../types'
import { cite, DEG, LIGHT_DEFAULTS, lightKey, lru, matLight, once, snapTorch, T, tile, type Pt } from './materials-shared'

const COLS = TILE.cols
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
const mainThread = (id: string) => { if (IN_WORKER) throw new Error(`${id} keeps its live state on the main thread`) }
const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3
const bandOf = (b: number) => (b < .06 ? -1 : b < .3 ? FAINT : b < .62 ? MID : IDLE)
const DT = 1 / 30
/** The hub's gravity and tilt defaults (physics cards also take gx / gy: §2.3). */
const PHYS_DEFAULTS = { ...LIGHT_DEFAULTS, gx: 0, gy: 1, k: 0 }
/** The whole card below the label is a drag surface (horizontal drag or hold on touch; a still tap acts). */
const surface = (label: string): Control[] => [{ key: 'k', kind: 'button', gesture: 'surface', box: [0, 10, 144, 134], label }]
/** This frame's input in world units: pointers, the hub's gravity, Enter / Space as a kick. Reduced motion: none. */
function physInput(ctx: WidgetContext, map: (x: number, y: number) => [number, number]): FrameInput | undefined {
  if (ctx.reducedMotion) return undefined
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, map), gx: ctx.data.gx, gy: ctx.data.gy, kick: (ctx.data.k ?? 0) >= .5 && !busy }
}
/**
 * A press on the card: [x, y, travel, down] in the state at `o`. Returns 'drag' once the press has travelled `slop`
 * (world units), 'tap' on the step a short press lifts, else null; the press point stays in s[o], s[o + 1].
 */
function pressOf(s: Float32Array, o: number, inp: StepInput, slop: number): 'drag' | 'tap' | null {
  const p = inp.pointers[0]
  // a lifted touch leaves the frame (no release step): a press that vanishes after a short travel is a tap too
  if (!p) { const tap = s[o + 3] && s[o + 2] <= slop; s[o + 3] = 0; return tap ? 'tap' : null }
  if (p.pressed) { s[o] = p.x; s[o + 1] = p.y; s[o + 2] = 0; s[o + 3] = 1 }
  if (p.down && s[o + 3]) { s[o + 2] = Math.max(s[o + 2], Math.hypot(p.x - s[o], p.y - s[o + 1])); return s[o + 2] > slop ? 'drag' : null }
  if (p.released && s[o + 3]) { s[o + 3] = 0; return s[o + 2] <= slop ? 'tap' : null }
  return null
}

// ── 06 SAND ─ a Zen tray: rake it, drop a stone ─────────────────────────────────────────────────────────────
// The sand is a height raster on the 2× lattice (66 × 61 cells inside a wooden frame), in the world's state. Pristine:
// concentric rake lines round two stones and straight lines elsewhere (period 3 cells: 6 card cells). The light is
// raked to ≤ 22° so every groove has a lit wall and a shadowed one; sand grains are a blue-noise band lower.
const K2 = 2, LG2 = latticeGrid(TILE, K2)
export const SAND = { i0: 4, j0: 9, w: 64, h: 58, frame: 2, stones: [[17, 18, 4.5], [44, 38, 3.5]] as [number, number, number][], slots: 3, tines: 5, spacing: 3 }
const sand: Sand = createSand(SAND.w, SAND.h, { talus: .8, passes: 2 })
/** State: heights, then 3 dropped stones (x, y, size), the rake head (x, y, dx, dy, carving), the press (x, y, travel, down), the next slot. */
const S_ST = sandSize(sand), S_RK = S_ST + 3 * SAND.slots, S_PR = S_RK + 5, S_NEXT = S_PR + 4, S_SIZE = S_NEXT + 1
const sandX = (x: number) => (x + .5) / K2 - .5 - SAND.i0, sandY = (y: number) => (y + .5) / K2 - .5 - SAND.j0
const cardX = (i: number) => (i + SAND.i0 + .5) * K2 - .5, cardY = (j: number) => (j + SAND.j0 + .5) * K2 - .5
/** A stone dropped at (x, y): two ring grooves round it, carved tine by tine (the sand is pushed out, not lost). */
function dropStone(s: Float32Array, x: number, y: number): void {
  const k = Math.round(s[S_NEXT]) % SAND.slots, o = S_ST + 3 * k
  s[o] = x; s[o + 1] = y; s[o + 2] = 3; s[S_NEXT] = (k + 1) % SAND.slots
  for (const rr of [5, 8]) { const n = Math.round(2 * Math.PI * rr / .8); for (let q = 0; q < n; q++) { const a = 2 * Math.PI * q / n; sandCarve(sand, s, x + rr * Math.cos(a), y + rr * Math.sin(a), 1, .3) } }
}
function sandStep(s: Float32Array, _n: number, inp: StepInput): void {
  if (inp.live < 0) return // the pristine garden never changes: no sim to run
  const press = pressOf(s, S_PR, inp, 1.5), p = inp.pointers[0]
  s[S_RK + 4] = 0
  if (press === 'drag' && p) {
    // carve along this step's stretch of the stroke, a comb every .75 cells, the comb across the stroke
    const dx = p.vx, dy = p.vy, sp = Math.hypot(dx, dy), ux = sp > 1e-6 ? dx / sp : s[S_RK + 2], uy = sp > 1e-6 ? dy / sp : s[S_RK + 3]
    const len = sp * DT, n = Math.max(1, Math.ceil(len / .75))
    for (let q = 1; q <= n; q++) sandRake(sand, s, p.x - ux * len * (1 - q / n), p.y - uy * len * (1 - q / n), ux, uy, { tines: SAND.tines, spacing: SAND.spacing, r: 1, depth: .35 })
    s[S_RK] = p.x; s[S_RK + 1] = p.y; s[S_RK + 2] = ux || 1; s[S_RK + 3] = uy; s[S_RK + 4] = 1
  } else if (press === 'tap') dropStone(s, s[S_PR], s[S_PR + 1])
  if (inp.kick) dropStone(s, SAND.w / 2, SAND.h / 2)
  sandRelax(sand, s)
}
function sandBlend(a: Float32Array, b: Float32Array, k: number): void {
  for (let i = 0; i < S_ST; i++) a[i] += (b[i] - a[i]) * k
  for (let q = 0; q < SAND.slots; q++) { const o = S_ST + 3 * q + 2; a[o] += (b[o] - a[o]) * k; if (a[o] < .1) a[o] = 0 }
  a[S_RK + 4] = 0
}
export const sandWorld = once((): World => createWorld({
  size: S_SIZE, dt: DT, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 12, heal: 1.5, maxLiveSteps: 4,
  init: s => { sandGarden(sand, s, SAND.stones, { base: 2, depth: .62, period: 3, rings: 9 }); s[S_RK + 2] = 1 },
  step: sandStep, blend: sandBlend,
}))
/** Every stone at this state: the garden's two and the dropped ones (x, y, r in sand cells). */
function stonesOf(s: Float32Array): [number, number, number][] {
  const out = SAND.stones.map(q => [...q] as [number, number, number])
  for (let q = 0; q < SAND.slots; q++) { const o = S_ST + 3 * q; if (s[o + 2] > 0) out.push([s[o], s[o + 1], s[o + 2]]) }
  return out
}
const sandFrame = once(() => {
  const values = createRaster(LG2, 'card', [SAND.i0 - SAND.frame, SAND.j0 - SAND.frame, SAND.i0 + SAND.w - 1 + SAND.frame, SAND.j0 + SAND.h - 1 + SAND.frame]), tones = new Uint8Array(LG2.cols * LG2.rows)
  return { values, tones, layer: tonedLayer(values, tones, K2), h: new Float32Array(SAND.w * SAND.h), stone: new Int8Array(SAND.w * SAND.h) }
})
/** Row j of the sand: heights plus the stones' domes, then lit by the raked light (Lambert; grains a band lower; stones polished). */
function sandHeightRow(s: Float32Array, stones: [number, number, number][], Hs: Float32Array, St: Int8Array, j: number): void {
  for (let i = 0, k = j * SAND.w; i < SAND.w; i++, k++) {
    let h = s[k], who = -1
    for (let q = 0; q < stones.length; q++) {
      const [x, y, r] = stones[q], dx = i - x, dy = j - y, d2 = (dx * dx + dy * dy) / (r * r)
      if (d2 < 1) { const top = 2 + 1.8 * Math.sqrt(1 - d2); if (top > h) { h = top; who = q } }
    }
    Hs[k] = h; St[k] = who
  }
}
function sandShadeRow(Hs: Float32Array, St: Int8Array, V: Float32Array, Tn: Uint8Array, L: Light, gain: number, j: number): void {
  const w = SAND.w, hgt = SAND.h, point = !Array.isArray(L), at = point ? (L as { at: Vec3 }).at : null, d = point ? null : L as Vec3
  const dl = d ? 1 / (Math.hypot(d[0], d[1], d[2]) || 1) : 1
  for (let i = 0, k = j * w; i < w; i++, k++) {
    const hl = Hs[i > 0 ? k - 1 : k], hr = Hs[i < w - 1 ? k + 1 : k], hu = Hs[j > 0 ? k - w : k], hd = Hs[j < hgt - 1 ? k + w : k]
    const gx = (hr - hl) / (i > 0 && i < w - 1 ? 2 : 1), gy = (hd - hu) / (j > 0 && j < hgt - 1 ? 2 : 1), nl = 1 / Math.sqrt(gx * gx + gy * gy + 1)
    const nx = -gx * nl, ny = -gy * nl, nz = nl
    let lx: number, ly: number, lz: number
    if (at) { lx = at[0] - (i + SAND.i0); ly = at[1] - (j + SAND.j0); lz = at[2] - Hs[k]; const l = 1 / (Math.hypot(lx, ly, lz) || 1); lx *= l; ly *= l; lz *= l }
    else { lx = d![0] * dl; ly = d![1] * dl; lz = d![2] * dl }
    const ndl = Math.max(0, nx * lx + ny * ly + nz * lz), lat = (j + SAND.j0) * LG2.cols + i + SAND.i0
    if (St[k] >= 0) {
      // a stone: smooth, a band brighter, its polish in value (the eye straight above)
      const hx = lx, hy = ly, hz = lz + 1, h2 = Math.hypot(hx, hy, hz) || 1, spec = (nx * hx + ny * hy + nz * hz) / h2, b = Math.min(1, .62 + .3 * ndl * gain)
      if (spec > .96) { V[lat] = 1; Tn[lat] = VALUE } else { const t = bandOf(b); if (t >= 0) { V[lat] = b; Tn[lat] = t } }
      continue
    }
    const b = Math.min(1, (.08 + .92 * ndl) * gain)
    let t = bandOf(b)
    if (t < 0) continue
    if (stbn(i + SAND.i0, j + SAND.j0) < .14) t = Math.max(FAINT, t - 1) // a grain a band down: sand, not plaster
    V[lat] = t === bandOf(b) ? b : [.22, .46, .7][t]; Tn[lat] = t
  }
}
/** The wooden frame round the tray (2 lattice cells, mid, its inner edge faint). */
function sandFrameRows(V: Float32Array, Tn: Uint8Array): void {
  const f = SAND.frame, i0 = SAND.i0 - f, j0 = SAND.j0 - f, i1 = SAND.i0 + SAND.w - 1 + f, j1 = SAND.j0 + SAND.h - 1 + f
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const inside = i >= SAND.i0 && i < SAND.i0 + SAND.w && j >= SAND.j0 && j < SAND.j0 + SAND.h
    if (inside) continue
    const inner = i === SAND.i0 - 1 || i === SAND.i0 + SAND.w || j === SAND.j0 - 1 || j === SAND.j0 + SAND.h
    V[j * LG2.cols + i] = inner ? .25 : .5; Tn[j * LG2.cols + i] = inner ? FAINT : MID
  }
}
const sandPristine = lru<{ values: Float32Array; tones: Uint8Array }>(8)
function sandShade(s: Float32Array, L: Light): void {
  const F = sandFrame(), stones = stonesOf(s), V = F.values.data, Tn = F.tones
  V.fill(0); Tn.fill(0)
  for (let j = 0; j < SAND.h; j++) sandHeightRow(s, stones, F.h, F.stone, j)
  const Ld = Array.isArray(L) ? L as readonly number[] : [0, 0, 1], Lz = Ld[2] / (Math.hypot(Ld[0], Ld[1], Ld[2]) || 1), gain = .55 / (.92 * Math.max(.05, Lz))
  for (let j = 0; j < SAND.h; j++) sandShadeRow(F.h, F.stone, V, Tn, L, gain, j)
  sandFrameRows(V, Tn)
}
export const matSand: WidgetPreset = {
  ...tile, id: 'mat-sand', name: 'Sand',
  defaults: { ...PHYS_DEFAULTS },
  controls: surface('Rake the sand'),
  layers: ctx => {
    mainThread('mat-sand')
    const w = sandWorld(), s = worldAt(w, ctx.t, physInput(ctx, (x, y) => [sandX(x), sandY(y)]))
    const L = snapTorch(matLight(ctx, { lattice: K2, origin: [SAND.i0 * K2, SAND.j0 * K2], torch: { height: 24, falloff: 140 }, rake: true, rakeHi: 22 * DEG }), 2)
    const F = sandFrame()
    if (w.mode === 'pristine') {
      const hit = sandPristine(lightKey(L), () => { sandShade(s, L); return { values: F.values.data.slice(), tones: F.tones.slice() } })
      F.values.data.set(hit.values); F.tones.set(hit.tones)
    } else sandShade(s, L)
    const out = [cite('ANGLE OF REPOSE'), F.layer]
    if (s[S_RK + 4]) {
      // the rake head: its five tines where they carve now (the live red)
      const ux = s[S_RK + 2], uy = s[S_RK + 3], tines: Pt[] = []
      for (let q = 0; q < SAND.tines; q++) { const off = (q - (SAND.tines - 1) / 2) * SAND.spacing; tines.push([cardX(s[S_RK] - uy * off), cardY(s[S_RK + 1] + ux * off)]) }
      out.push(layer(T.dots(tines, 1.6), 'active'))
    }
    return out
  },
}

// ── 08 MERCURY ─ a pool of mercury in a tray ───────────────────────────────────────────────────────────────
// The metal is a stable fluid's ink (29 × 26 cells, 4 card cells each) that sinks hard along gravity; the surface is
// its density turned into a height (smoothstep, 4 cells) on the 2× lattice, read through the LIQUID matcap (a 64²
// LUT; tipped by the tilt offset tx, ty, which is 0, 0 at rest: an upright phone and the goldens see it untipped), plus
// the lamp's own reflection. Gravity tips the pool; the light never reads gx / gy.
export const MERC = { i0: 7, j0: 15, fw: 29, fh: 25, rx: 12, ry: 11, blur: 5 }
const mercury: Mercury = createMercury(MERC.fw, MERC.fh)
const M_PR = mercury.size, M_SIZE = M_PR + 4
const mercX = (x: number) => ((x + .5) / K2 - .5 - MERC.i0 - .5) / 2, mercY = (y: number) => ((y + .5) / K2 - .5 - MERC.j0 - .5) / 2
const mercCard = (fx: number, fy: number): Pt => [(MERC.i0 + .5 + 2 * fx + .5) * K2 - .5, (MERC.j0 + .5 + 2 * fy + .5) * K2 - .5]
function mercStep(s: Float32Array, _n: number, inp: StepInput): void {
  if (inp.live < 0) return // the pristine pool lies still
  const press = pressOf(s, M_PR, inp, .6), p = inp.pointers[0]
  const stir = press === 'drag' && p ? [[p.x, p.y, p.vx, p.vy] as const] : undefined
  const split = press === 'tap' ? [s[M_PR], s[M_PR + 1]] as const : inp.kick ? [MERC.fw / 2, MERC.fh - 3] as const : null
  mercuryStep(mercury, s, DT, { gx: inp.gx, gy: inp.gy, stir, split })
}
export const mercuryWorld = once((): World => createWorld({
  size: M_SIZE, dt: DT, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 4, heal: 1.5, maxLiveSteps: 3,
  init: s => mercuryInit(mercury, s, MERC.rx, MERC.ry), step: mercStep,
  // heal: the ink blends home; beads are let go (their mass rejoins the pool's blend)
  blend: (a, b, k) => { for (let i = 0; i < mercury.B; i++) a[i] += (b[i] - a[i]) * k; for (let q = 0; q < mercury.beads; q++) a[mercury.B + BEAD * q + 5] *= 1 - k },
}))
const LIQ = once(() => bakeMatcap(LIQUID))
const MW = 2 * MERC.fw, MH = 2 * MERC.fh
const mercFrame = once(() => {
  const values = createRaster(LG2, 'card', [MERC.i0 - 1, MERC.j0 - 1, MERC.i0 + MW, MERC.j0 + MH]), tones = new Uint8Array(LG2.cols * LG2.rows)
  return { values, tones, layer: tonedLayer(values, tones, K2), h: new Float32Array(MW * MH), a: new Float32Array(MW * MH) }
})
const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/** Row j: the metal's coverage (density through a smoothstep), on the lattice. */
function mercCoverRow(s: Float32Array, A: Float32Array, j: number): void {
  for (let i = 0; i < MW; i++) A[j * MW + i] = smooth01((fluidDensityAt(mercury.fluid, s, (i - .5) / 2, (j - .5) / 2) - .3) / .4)
}
/** A box blur of radius r along rows (dx 1) or columns (dx MW) from `src` into `dst`, one line. */
function boxLine(src: Float32Array, dst: Float32Array, start: number, step: number, n: number, r: number): void {
  let acc = 0
  for (let k = -r; k <= r; k++) acc += src[start + Math.max(0, Math.min(n - 1, k)) * step]
  for (let k = 0; k < n; k++) {
    dst[start + k * step] = acc / (2 * r + 1)
    acc += src[start + Math.min(n - 1, k + r + 1) * step] - src[start + Math.max(0, k - r) * step]
  }
}
/**
 * The pool's surface: coverage blurred twice (a smooth dome with surface tension's rounded rim), × 5 cells, and kept
 * only where there is metal; the matcap then reads a curved surface, not a flat sheet.
 */
function mercHeights(s: Float32Array, Hs: Float32Array, A: Float32Array): void {
  for (let j = 0; j < MH; j++) mercCoverRow(s, A, j)
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < MH; j++) boxLine(pass ? Hs : A, pass ? A : Hs, j * MW, 1, MW, MERC.blur)
    for (let i = 0; i < MW; i++) boxLine(pass ? A : Hs, pass ? Hs : A, i, MW, MH, MERC.blur)
    if (!pass) Hs.set(A)
  }
  for (let j = 0; j < MH; j++) mercCoverRow(s, A, j)
  for (let k = 0; k < Hs.length; k++) Hs[k] = A[k] > .5 ? 1 + 9 * Hs[k] * Hs[k] : 0
}
function mercShadeRow(Hs: Float32Array, V: Float32Array, Tn: Uint8Array, R: number[] | null, lut: Float32Array, size: number, L: Light, j: number): void {
  const point = !Array.isArray(L), at = point ? (L as { at: Vec3 }).at : null, d = point ? null : L as Vec3, half = (size - 1) / 2
  for (let i = 0, k = j * MW; i < MW; i++, k++) {
    const lat = (j + MERC.j0) * LG2.cols + i + MERC.i0, h = Hs[k]
    if (h < .25) {
      // the tray's floor: a faint dot every other cell, so the empty tray reads as a surface
      if (((i + j) & 1) === 0) { V[lat] = .14; Tn[lat] = FAINT }
      continue
    }
    const hl = Hs[i > 0 ? k - 1 : k], hr = Hs[i < MW - 1 ? k + 1 : k], hu = Hs[j > 0 ? k - MW : k], hd = Hs[j < MH - 1 ? k + MW : k]
    const gx = (hr - hl) / 2, gy = (hd - hu) / 2, nl = 1 / Math.sqrt(gx * gx + gy * gy + 1)
    let nx = -gx * nl, ny = -gy * nl, nz = nl
    // the lamp mirrored in the metal (the untipped normal: the light is the scene's, not the tilt's)
    let lx: number, ly: number, lz: number
    if (at) { lx = at[0] - (i + MERC.i0); ly = at[1] - (j + MERC.j0); lz = at[2] - h } else [lx, ly, lz] = d!
    const ll = Math.hypot(lx, ly, lz) || 1, hx = lx / ll, hy = ly / ll, hz = lz / ll + 1, hh = Math.hypot(hx, hy, hz) || 1
    if ((nx * hx + ny * hy + nz * hz) / hh > .992) { V[lat] = 1; Tn[lat] = VALUE; continue }
    if (R) { const x = R[0] * nx + R[1] * ny + R[2] * nz, y = R[3] * nx + R[4] * ny + R[5] * nz, z = R[6] * nx + R[7] * ny + R[8] * nz; nx = x; ny = y; nz = z }
    const ix = Math.round((nx + 1) * half), iy = Math.round((ny + 1) * half)
    const env = lut[(iy < 0 ? 0 : iy >= size ? size - 1 : iy) * size + (ix < 0 ? 0 : ix >= size ? size - 1 : ix)]
    // the black of the studio stays a faint rim of the metal, so the pool keeps one outline
    const t = env >= .9 ? VALUE : env >= .62 ? IDLE : env >= .3 ? MID : FAINT
    V[lat] = t === FAINT ? .26 : env; Tn[lat] = t
  }
}
/** The tray's rim: one mid cell round the pool's box. */
function mercRim(V: Float32Array, Tn: Uint8Array): void {
  for (let j = MERC.j0 - 1; j <= MERC.j0 + MH; j++) for (let i = MERC.i0 - 1; i <= MERC.i0 + MW; i++) {
    if (i >= MERC.i0 && i < MERC.i0 + MW && j >= MERC.j0 && j < MERC.j0 + MH) continue
    V[j * LG2.cols + i] = .5; Tn[j * LG2.cols + i] = MID
  }
}
const mercPristine = lru<{ values: Float32Array; tones: Uint8Array }>(8)
function mercShade(s: Float32Array, L: Light, tilt: [number, number]): void {
  const F = mercFrame(), V = F.values.data, Tn = F.tones, lut = LIQ(), R = matcapMatrix(0, tilt)
  V.fill(0); Tn.fill(0)
  mercHeights(s, F.h, F.a)
  for (let j = 0; j < MH; j++) mercShadeRow(F.h, V, Tn, R, lut.data, lut.size, L, j)
  mercRim(V, Tn)
}
export const matMercury: WidgetPreset = {
  ...tile, id: 'mat-mercury', name: 'Mercury',
  defaults: { ...PHYS_DEFAULTS },
  controls: surface('Stir the mercury'),
  layers: ctx => {
    mainThread('mat-mercury')
    const w = mercuryWorld(), s = worldAt(w, ctx.t, physInput(ctx, (x, y) => [mercX(x), mercY(y)]))
    const L = snapTorch(matLight(ctx, { lattice: K2, torch: { height: 40, falloff: 200 } }), 2), tilt: [number, number] = [ctx.data.tx ?? 0, ctx.data.ty ?? 0]
    const F = mercFrame()
    if (w.mode === 'pristine') {
      const hit = mercPristine(`${lightKey(L)}|${tilt.join(',')}`, () => { mercShade(s, L, tilt); return { values: F.values.data.slice(), tones: F.tones.slice() } })
      F.values.data.set(hit.values); F.tones.set(hit.tones)
    } else mercShade(s, L, tilt)
    const beads: Pt[] = []
    for (let q = 0; q < mercury.beads; q++) { const o = mercury.B + BEAD * q; if (s[o + 5] > 0) beads.push(mercCard(s[o], s[o + 1])) }
    return [cite('MATCAP · STAM 1999'), F.layer, ...(beads.length ? [layer(T.dots(beads, 2.2), 'active')] : [])]
  },
}

// ── 09 THREAD ─ a thread off a spool ───────────────────────────────────────────────────────────────────────
// A wooden spool wound with thread at the top (the wraps 3 cells apart, a Kajiya–Kay streak across them); a 40-node
// thread hanging from it to a needle (track L's rope, `ropeStep`, through `matter/thread.ts`). The thread is drawn as
// 3-cell capsules along the rope, its tangent twisted ±20° every 2 cells (a plied thread: the sheen breaks into a
// twist). Drag pulls the needle (the spool pays out, the needle's eye is red while pulled), release winds it back;
// a tap flicks it.
export const SPOOL = { x0: 50, x1: 94, y0: 16, y1: 36, flange: 4, exitY: 37, cx: 72, breeze: 8 }
const thread: Thread = createThread(40, 2.2)
const T_PR = thread.size, T_SIZE = T_PR + 4
function threadWorldStep(s: Float32Array, _n: number, inp: StepInput): void {
  // pristine: a slow breeze sways it (8 s, seamed: a pure function of t); t = 0 is the thread hanging at rest
  if (inp.live < 0) { threadStep(thread, s, DT, { x: SPOOL.cx, y: SPOOL.exitY, gx: .07 * dsin(2 * Math.PI * _n * DT / SPOOL.breeze), gy: 1 }); return }
  const press = pressOf(s, T_PR, inp, 1.5), p = inp.pointers[0]
  const flick = press === 'tap' ? (s[T_PR] < s[thread.rope.X + thread.rope.n - 1] ? 70 : -70) : inp.kick ? 70 : 0
  threadStep(thread, s, DT, { x: SPOOL.cx, y: SPOOL.exitY, gx: inp.gx, gy: inp.gy, pull: press === 'drag' && p ? [p.x, p.y] : null, flick })
}
export const threadWorld = once((): World => createWorld({
  size: T_SIZE, dt: DT, lead: 0, period: SPOOL.breeze, seam: 1, every: 30, maxSteps: 300, maxCheckpoints: 12, idle: 4, heal: 1.5,
  init: s => threadInit(thread, s, SPOOL.cx, SPOOL.exitY), step: threadWorldStep,
  blend: (a, b, k) => { for (let i = 0; i < thread.S + 1; i++) a[i] += (b[i] - a[i]) * k; a[thread.S + 1] = 0 },
}))
const threadFrame = once(() => {
  const values = createRaster(TILE, 'card', [0, 12, 143, 143]), tones = new Uint8Array(COLS * TILE.rows)
  return { values, tones, layer: tonedLayer(values, tones), hp: new Float32Array(COLS * TILE.rows) }
})
/** The light as (direction | point) at a cell: unit L into out. */
function lightAt(L: Light, x: number, y: number, z: number, out: Float64Array): void {
  if (Array.isArray(L)) { const d = L as Vec3, l = Math.hypot(d[0], d[1], d[2]) || 1; out[0] = d[0] / l; out[1] = d[1] / l; out[2] = d[2] / l; return }
  const at = (L as { at: Vec3 }).at, lx = at[0] - x, ly = at[1] - y, lz = at[2] - z, l = Math.hypot(lx, ly, lz) || 1
  out[0] = lx / l; out[1] = ly / l; out[2] = lz / l
}
const LV = new Float64Array(3)
/** The thread's half width (cells): a 5-cell cord, so its twist has room to catch the light. */
const THREAD_R = 2.5
/** One capsule of thread from (ax, ay) to (bx, by), 3 cells wide, its arc length starting at s0: lit, twisted, into the frame. */
function threadSeg(V: Float32Array, Tn: Uint8Array, HP: Float32Array, L: Light, ax: number, ay: number, bx: number, by: number, s0: number): void {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, l = Math.sqrt(l2) || 1, ux = dx / l, uy = dy / l, R = THREAD_R
  for (let y = Math.max(12, Math.floor(Math.min(ay, by) - R)); y <= Math.min(143, Math.ceil(Math.max(ay, by) + R)); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - R)); x <= Math.min(143, Math.ceil(Math.max(ax, bx) + R)); x++) {
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, ex = x - (ax + dx * t), ey = y - (ay + dy * t), d = Math.hypot(ex, ey)
      if (d >= R) continue
      const i = y * COLS + x, hp = Math.sqrt(1 - (d / R) ** 2)
      if (hp <= HP[i]) continue
      HP[i] = hp
      // the cross-profile's normal (across the thread), and the twisted tangent along it
      const side = (ex * -uy + ey * ux) / R, nx = -uy * side, ny = ux * side, nz = hp
      const tw = (Math.floor((s0 + t * l) / 2) & 1 ? 1 : -1) * 20 * DEG, c = Math.cos(tw), sn = Math.sin(tw), tx = ux * c - uy * sn, ty = ux * sn + uy * c
      lightAt(L, x, y, 2 * hp, LV)
      const ndl = Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]), hx = LV[0], hy = LV[1], hz = LV[2] + 1, hl = Math.hypot(hx, hy, hz) || 1
      const th = (tx * hx + ty * hy) / hl, kk = (1 - th * th) ** 12, b = .34 + .62 * ndl
      const tt = kk > .8 && b > .45 ? VALUE : b >= .62 || kk > .55 ? IDLE : b >= .3 ? MID : FAINT
      V[i] = tt === VALUE ? 1 : tt === IDLE ? Math.max(.62, b) : b; Tn[i] = tt
    }
  }
}
/** The spool for one light and one turn of its wraps (cached): wooden flanges and the wound thread. */
const spoolLit = lru<{ values: Float32Array; tones: Uint8Array }>(8)
function spoolBake(L: Light, phase: number): { values: Float32Array; tones: Uint8Array } {
  const V = new Float32Array(COLS * TILE.rows), Tn = new Uint8Array(COLS * TILE.rows), cy = (SPOOL.y0 + SPOOL.y1) / 2, Rb = (SPOOL.y1 - SPOOL.y0) / 2 + .5
  for (let y = SPOOL.y0 - 3; y <= SPOOL.y1 + 3; y++) for (let x = SPOOL.x0 - SPOOL.flange; x <= SPOOL.x1 + SPOOL.flange; x++) {
    const i = y * COLS + x, flange = x < SPOOL.x0 || x > SPOOL.x1
    if (flange) {
      // the flanges: wooden discs seen edge-on, rounded top to bottom (a cylinder across y)
      const v = (y - cy) / (Rb + 3)
      if (Math.abs(v) >= 1 || x === SPOOL.x0 - 1 || x === SPOOL.x1 + 1) continue
      lightAt(L, x, y, 3, LV)
      const b = .15 + .6 * Math.max(0, v * LV[1] + Math.sqrt(1 - v * v) * LV[2]), t = bandOf(b)
      if (t >= 0) { V[i] = Math.min(.6, b); Tn[i] = Math.min(MID, t) }
      continue
    }
    const v = (y - cy) / Rb
    if (Math.abs(v) >= 1) continue
    // the wraps: a helix 3 cells apart (a 2-cell thread, a 1-cell void), turning with the thread paid out
    const w = (((y + .18 * (x - SPOOL.cx) + phase) % 3) + 3) % 3
    if (w >= 2) continue
    const across = (w - .5) / 1, nyLocal = across * .7, ny = v + nyLocal, nz = Math.sqrt(Math.max(.05, 1 - Math.min(1, ny * ny)))
    lightAt(L, x, y, 3, LV)
    const ndl = Math.max(0, ny * LV[1] + nz * LV[2]), hy = LV[1], hz = LV[2] + 1, hx = LV[0], hl = Math.hypot(hx, hy, hz) || 1
    const th = (.98 * hx + .18 * hy) / hl, kk = (1 - th * th) ** 12, b = .3 + .6 * ndl
    const t = kk > .8 && b > .4 ? VALUE : b >= .62 || kk > .55 ? IDLE : b >= .3 ? MID : FAINT
    V[i] = t === VALUE ? 1 : t === IDLE ? Math.max(.62, b) : b; Tn[i] = t
  }
  return { values: V, tones: Tn }
}
/** The needle under the free end: 14 cells of steel along the last segment, its eye 3 cells from the top (red while pulled). */
function needle(V: Float32Array, Tn: Uint8Array, HP: Float32Array, L: Light, x: number, y: number, ux: number, uy: number, pulled: boolean, eye: Pt[]): void {
  const len = 14
  for (let yy = Math.floor(Math.min(y, y + uy * len) - 2); yy <= Math.ceil(Math.max(y, y + uy * len) + 2); yy++) {
    for (let xx = Math.floor(Math.min(x, x + ux * len) - 2); xx <= Math.ceil(Math.max(x, x + ux * len) + 2); xx++) {
      if (yy < 12 || yy > 143 || xx < 0 || xx > 143) continue
      const px = xx - x, py = yy - y, a = px * ux + py * uy, side = px * -uy + py * ux
      if (a < -1 || a > len) continue
      const half = a > len - 4 ? .9 * (len - a) / 4 + .1 : 1.1 // the point tapers over its last 4 cells
      if (Math.abs(side) > half) continue
      const i = yy * COLS + xx
      const slot = a >= 1 && a <= 4 && Math.abs(side) < .55
      if (slot) { V[i] = 0; Tn[i] = 0; HP[i] = 2; continue } // the eye: a slot of void
      HP[i] = 2
      // pulled: the eye's steel is the live red, as sites over its cells (one active layer, cut out of the surface)
      if (pulled && a <= 5.5) { V[i] = 0; Tn[i] = 0; eye.push([xx, yy]); continue }
      lightAt(L, xx, yy, 2, LV)
      const n = side / 1.1, ndl = Math.max(0, -uy * n * LV[0] + ux * n * LV[1] + Math.sqrt(Math.max(0, 1 - n * n)) * LV[2])
      V[i] = ndl > .8 ? 1 : .5 + .3 * ndl; Tn[i] = ndl > .8 ? VALUE : IDLE
    }
  }
}
export const matThread: WidgetPreset = {
  ...tile, id: 'mat-thread', name: 'Thread',
  defaults: { ...PHYS_DEFAULTS },
  controls: surface('Pull the thread'),
  layers: ctx => {
    mainThread('mat-thread')
    const s = worldAt(threadWorld(), ctx.t, physInput(ctx, (x, y) => [x, y]))
    const L = snapTorch(matLight(ctx, { torch: { height: 30, falloff: 150 } }), 3), F = threadFrame(), V = F.values.data, Tn = F.tones, HP = F.hp
    const paid = s[thread.S] - thread.length, phase = Math.round(paid * 4) / 4, pulled = s[thread.S + 1] > .5
    const sp = spoolLit(`${lightKey(L)}|${phase}`, () => spoolBake(L, phase))
    V.set(sp.values); Tn.set(sp.tones); HP.fill(0)
    const { n, X, Y } = thread.rope
    let arc = 0
    for (let i = 0; i < n - 1; i++) {
      const ax = s[X + i], ay = s[Y + i], bx = s[X + i + 1], by = s[Y + i + 1]
      threadSeg(V, Tn, HP, L, ax, ay, bx, by, arc)
      arc += Math.hypot(bx - ax, by - ay)
    }
    const ex = s[X + n - 1], ey = s[Y + n - 1], qx = ex - s[X + n - 2], qy = ey - s[Y + n - 2], ql = Math.hypot(qx, qy) || 1
    const eye: Pt[] = []
    needle(V, Tn, HP, L, ex - qx / ql * 3, ey - qy / ql * 3, qx / ql, qy / ql, pulled, eye)
    return [cite('VERLET ROPE'), F.layer, ...(eye.length ? [layer(T.dots(eye, 1), 'active')] : [])]
  },
}

/** Probe hooks for scripts/materials-browser.ts (`?probe=1`): world modes and what a gesture did. */
const probing = typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search)
const sandCarved = (s: Float32Array, base: Float32Array) => { let n = 0; for (let i = 0; i < S_ST; i++) if (Math.abs(s[i] - base[i]) > .05) n++; return n }
if (probing) {
  const worlds: Record<string, () => World> = { 'mat-sand': sandWorld, 'mat-mercury': mercuryWorld, 'mat-thread': threadWorld }
  ;(globalThis as { __workshop?: unknown }).__workshop = {
    mode: (id: string) => worlds[id]?.().mode,
    /** Dropped stones on the sand now. */
    stones: () => { const w = sandWorld(); if (w.mode === 'pristine') return 0; let k = 0; for (let q = 0; q < SAND.slots; q++) if (w.live[S_ST + 3 * q + 2] > 0) k++; return k },
    /** Sand cells moved by more than .05 from the garden. */
    carved: () => { const w = sandWorld(); return w.mode === 'pristine' ? 0 : sandCarved(w.live, w.sim.checkpoints.get(0) ?? w.live) },
    /** Beads split off the pool now, and its kinetic stir (Σ|u|). */
    beads: () => { const w = mercuryWorld(); if (w.mode === 'pristine') return 0; let k = 0; for (let q = 0; q < mercury.beads; q++) if (w.live[mercury.B + BEAD * q + 5] > 0) k++; return k },
    stir: () => { const w = mercuryWorld(); if (w.mode === 'pristine') return 0; let e = 0; for (let i = 0; i < mercury.fluid.n; i++) e += Math.abs(w.live[mercury.fluid.U + i]) + Math.abs(w.live[mercury.fluid.V + i]); return e },
    /** The needle's distance from where it hangs at rest, and the thread paid out. */
    swing: () => { const w = threadWorld(); if (w.mode === 'pristine') return 0; const { n, X, Y } = thread.rope; return Math.hypot(w.live[X + n - 1] - SPOOL.cx, w.live[Y + n - 1] - (SPOOL.exitY + thread.length)) },
    paid: () => { const w = threadWorld(); return w.mode === 'pristine' ? 0 : w.live[thread.S] - thread.length },
  }
}

export const physicsHooks = { SAND, sand, sandWorld, S_ST, stonesOf, sandVolume, MERC, mercury, mercuryWorld, mercuryMass, THREAD: thread, threadWorld, threadStrain, SPOOL }
