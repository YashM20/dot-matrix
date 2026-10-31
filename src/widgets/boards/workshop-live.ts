/**
 * WORKSHOP, the cards whose tap needs time (docs/living-matter/M-materials.md §5): each is a pure function of t until
 * touched, with a small `World` (`engine/physics/world.ts`) that holds what the tap started.
 * - `mat-knit`: a stockinette swatch with a rope cable, knitted a stitch per 0.4 s by the working loop (the red);
 *   a tap knits one more row.
 * - `mat-paper`: cotton paper with a deckle edge, DOT/480 letterpressed into it; a tap is one more impression, the
 *   ink laid again over 0.4 s. No red.
 * - `mat-ice`: a frost fern grown by diffusion-limited aggregation (`algo/dla.ts`) on a window; the grains sticking
 *   right now are red; a breath (hover, or a tap for 2 s) melts the frost round it and it freezes back.
 *
 * Main thread only (the worlds live here): the sampling worker's build resolves this module to
 * `workshop-live-worker-stub.ts` (vite.config.ts `mainThreadOnly`).
 */
import { ambientOcclusion, cardMask, insetDistance, knitRelief, tonedLayer, type KnitOptions } from '../../engine/matter'
import { anisoSpec } from '../../engine/matter/aniso'
import { heightRaster, normalRaster, stackHeights, type HeightRaster, type NormalRaster } from '../../engine/light/height'
import { lambert, type Light, type Vec3 } from '../../engine/light/shade'
import { createWorld, framePointers, worldAt, type StepInput, type World } from '../../engine/physics/world'
import { dla, type Dla } from '../../engine/algo/dla'
import { fbm2 } from '../../engine/noise/gradient'
import { hash01 } from '../../engine/math'
import { createRaster, type Raster } from '../../engine/raster/raster'
import type { CellBounds, GridConfig, Layer } from '../../engine/types'
import { TILE, layer, type WidgetContext, type WidgetPreset } from '../types'
import { cite, LIGHT_DEFAULTS, lightKey, lru, matLight, once, pad2, scratch, snapTorch, T, tile, type Box, type Pt } from './materials-shared'

const COLS = TILE.cols
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
const mainThread = (id: string) => { if (IN_WORKER) throw new Error(`${id} keeps its live state on the main thread`) }
const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3
const bandOf = (b: number) => (b < .06 ? -1 : b < .3 ? FAINT : b < .62 ? MID : IDLE)
const BAND_MID = [.2, .46, .76, 1]
const DT = 1 / 30
/** This frame's input for a tap world: pointers in card cells, Enter / Space as a kick. Reduced motion: none. */
function tapInput(ctx: WidgetContext) {
  if (ctx.reducedMotion) return undefined
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, (x, y) => [x, y]), kick: (ctx.data.k ?? 0) >= .5 && !busy }
}
/** A pointer that went down on this step inside `box` (a tap or a click), or a kick (keyboard). */
const tapped = (inp: StepInput, box: Box) => inp.kick || inp.pointers.some(p => p.pressed && p.x >= box[0] && p.y >= box[1] && p.x < box[0] + box[2] && p.y < box[1] + box[3])

// ── 01 KNIT ─ stockinette and a rope cable, knitted a stitch at a time ─────────────────────────────────────
// Card pitch: 22 stitches of 6 × 4 cells (two 3-cell legs a V), the rope cable over 4 columns framed by purl, the
// strands crossing every 8 rows. The fabric repeats every 16 rows (64 cells), so it is baked and lit once as a tile
// and scrolled: each finished row pushes the swatch down one row over 0.4 s. The working loop (red) knits across the
// top row one stitch per 0.4 s, alternating direction like flat knitting; it rests at the row's end, where the next
// row starts.
export const KNIT = { x0: 6, top: 22, bottom: 139, W: 6, H: 4, N: 22, needle: 18.5, stitch: .4 }
export const KNIT_OPTS: KnitOptions = { stitch: [KNIT.W, KNIT.H], lean: .35, lift: 1.2, purl: [8, 13], cable: { col: 9, every: 8, cross: 3 } }
const PERIOD_ROWS = 16, TILE_H = PERIOD_ROWS * KNIT.H, PAD = 4, KG: GridConfig = { cols: KNIT.N * KNIT.W, rows: TILE_H + 2 * PAD }
const KNIT_DUR = KNIT.N * KNIT.stitch, CYCLE = KNIT_DUR + KNIT.stitch
const knitTile = once(() => {
  const r = knitRelief(KG, [0, 0, KG.cols - 1, KG.rows - 1], { ...KNIT_OPTS, y0: -PAD, floor: .5 })
  return { n: normalRaster(r.height), t: r.tangent, ao: ambientOcclusion(r.height, { radius: 1.5, strength: .5 }) }
})
export interface KnitState { rows: number; k: number; f: number; shift: number; dir: 1 | -1; x: number }
/**
 * The swatch after `p` rows of progress (t = 0: a row just finished, the loop at its end): rows done, stitches of
 * the current row knitted (k, and f into the next), the shift (0..1) after a finished row, the loop's x (cells).
 */
export function knitState(p: number): KnitState {
  const rows = Math.floor(p + 1e-9), tau = (p - rows) * CYCLE, dir: 1 | -1 = rows % 2 === 0 ? -1 : 1
  const knitting = tau < KNIT_DUR - 1e-9, pos = knitting ? tau / KNIT.stitch : KNIT.N
  const k = Math.floor(pos + 1e-9), f = pos - k, shift = knitting ? 0 : (tau - KNIT_DUR) / KNIT.stitch
  const x = KNIT.x0 + (dir === 1 ? pos : KNIT.N - pos) * KNIT.W - .5
  return { rows, k, f, shift, dir, x }
}
/** Rows of progress at time t (pristine: t = 0 is the end of a knitted row, before its shift). */
export const knitProgress = (t: number, extra = 0) => (t + KNIT_DUR) / CYCLE + extra
/** The knit world: [0] extra rows shown, [1] extra rows asked for (a tap adds one; shown catches up at 2.5 rows/s). */
const knitWorld = once((): World => createWorld({
  size: 2, dt: DT, init: () => {}, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: Infinity,
  step: (s, _n, inp) => {
    if (tapped(inp, KNIT_BOX)) s[1] += 1
    const d = s[1] - s[0], v = 2.5 * DT
    s[0] = Math.abs(d) <= v ? s[1] : s[0] + Math.sign(d) * v
  },
}))
const KNIT_BOX: Box = [0, 12, 144, 132]
const knitLit = lru<{ values: Float32Array; tones: Uint8Array }>(8)
const knitScratch = scratch(2, KG)
/** Tile row j (KG cells): the lit loops in bands, the sheen along the arms a step up (rim .3) or to value (core .6). */
function knitTileRow(n: NormalRaster, A: Float32Array, D: Float32Array, S: Float32Array, V: Float32Array, Tn: Uint8Array, j: number): void {
  const M = n.mask
  for (let i = j * KG.cols, end = i + KG.cols; i < end; i++) {
    if (M[i] <= 0) continue
    const b = D[i] * A[i] * .82, s = S[i]
    let t = bandOf(b)
    if (t < 0) continue
    if (s >= .6 && b >= .2) t = VALUE
    else if (s >= .3 && t < IDLE && b >= .2) t++
    V[i] = t === bandOf(b) ? b : BAND_MID[t]; Tn[i] = t
  }
}
const knitFrame = once(() => ({ values: createRaster(TILE, 'card', [KNIT.x0, 14, KNIT.x0 + KG.cols - 1, KNIT.bottom]), tones: new Uint8Array(COLS * TILE.rows) }))
/** The steel needle across the top: a 3-cell cylinder (Lambert across it) with its brushed streak, baked per light. */
function needleRow(V: Float32Array, Tn: Uint8Array, L: Light, r: number): void {
  const off = (r - KNIT.needle) / 1.6
  if (Math.abs(off) >= 1) return
  const ny = off, nz = Math.sqrt(1 - off * off)
  for (let c = 3, i = r * COLS + c; c <= 140; c++, i++) {
    let lx: number, ly: number, lz: number
    if (Array.isArray(L)) [lx, ly, lz] = L as Vec3
    else { const at = (L as { at: Vec3 }).at; lx = at[0] - c; ly = at[1] - r; lz = at[2] - 1 }
    const ll = Math.hypot(lx, ly, lz) || 1, d = Math.max(0, (ny * ly + nz * lz) / ll), b = .18 + .62 * d
    // the streak: where the cylinder's normal halves the light and the eye (across the needle only: it is brushed along x)
    const hy = ly / ll, hz = lz / ll + 1, hl = Math.hypot(hy, hz) || 1, spec = (ny * hy + nz * hz) / hl
    if (spec > .985) { V[i] = 1; Tn[i] = VALUE } else { const t = bandOf(b); if (t >= 0) { V[i] = b; Tn[i] = t } }
  }
}
/** The swatch frame: the lit tile scrolled into place, the current row knitted only up to the loop, the needle over it. */
function knitCompose(st: KnitState, lit: { values: Float32Array; tones: Uint8Array }, needle: { values: Float32Array; tones: Uint8Array }): void {
  const F = knitFrame(), V = F.values.data, Tn = F.tones, scroll = Math.round(KNIT.H * (st.rows + st.shift))
  V.fill(0)
  for (let r = KNIT.top; r <= KNIT.bottom; r++) {
    const y = r - KNIT.top - scroll, row = Math.floor(y / KNIT.H), tj = (((y % TILE_H) + TILE_H) % TILE_H) + PAD
    // rows newer than the current one are not knitted yet; the current one only behind the loop
    if (row < -st.rows) continue
    const partial = row === -st.rows && st.shift === 0 && st.k < KNIT.N
    for (let s = 0; s < KNIT.N; s++) {
      if (partial && (st.dir === 1 ? s >= st.k : s < KNIT.N - st.k)) continue
      for (let q = 0; q < KNIT.W; q++) {
        const c = KNIT.x0 + s * KNIT.W + q, a = tj * KG.cols + s * KNIT.W + q, i = r * COLS + c
        V[i] = lit.values[a]; Tn[i] = lit.tones[a]
      }
    }
  }
  for (let r = 14; r < KNIT.top; r++) for (let c = 3, i = r * COLS + 3; c <= 140; c++, i++) if (needle.values[i] > 0) { V[i] = needle.values[i]; Tn[i] = needle.tones[i] }
}
const needleLit = lru<{ values: Float32Array; tones: Uint8Array }>(8)
export const matKnit: WidgetPreset = {
  ...tile, id: 'mat-knit', name: 'Knit',
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: KNIT_BOX, label: 'Knit a row' }],
  layers: ctx => {
    mainThread('mat-knit')
    const s = worldAt(knitWorld(), ctx.t, tapInput(ctx)), st = knitState(knitProgress(ctx.t, s[0]))
    const L = snapTorch(matLight(ctx, { torch: { height: 36, falloff: 150 } }), 3), key = lightKey(L)
    const lit = knitLit(key, () => {
      // the tile is in its own cells (KG): a torch over the card moves to tile cells (its columns start at x0)
      const g = knitTile(), [dif, spec] = knitScratch(), TL: Light = Array.isArray(L) ? L : { ...(L as { at: Vec3 }), at: [(L as { at: Vec3 }).at[0] - KNIT.x0, (L as { at: Vec3 }).at[1] - KNIT.top, (L as { at: Vec3 }).at[2]] }
      lambert(g.n, TL, { ambient: .14, into: dif })
      anisoSpec(g.n, g.t, TL, { exponent: 20, into: spec })
      const out = { values: new Float32Array(KG.cols * KG.rows), tones: new Uint8Array(KG.cols * KG.rows) }
      for (let j = 0; j < KG.rows; j++) knitTileRow(g.n, g.ao.data, dif.data, spec.data, out.values, out.tones, j)
      return out
    })
    const needle = needleLit(key, () => {
      const out = { values: new Float32Array(COLS * TILE.rows), tones: new Uint8Array(COLS * TILE.rows) }
      for (let r = 14; r < KNIT.top; r++) needleRow(out.values, out.tones, L, r)
      return out
    })
    knitCompose(st, lit, needle)
    const F = knitFrame(), x = st.x, y = KNIT.needle
    // the working loop: a small loop of thread round the needle, from the stitch just knitted
    const loop: Pt[] = [[x - 2, y - 2], [x - 2.4, y + .6], [x - 1, y + 2.8], [x + 1, y + 2.8], [x + 2.4, y + .6], [x + 2, y - 2], [x, y - 3]]
    return [
      cite('STOCKINETTE · CABLE'),
      tonedLayer(F.values, F.tones),
      layer(T.dots(loop, 1.1), 'active'),
      layer(T.text(`ROW ${pad2((st.rows % 99) + 1)}`, 143, 134, { align: 'right' }), 'faint'),
    ]
  },
}

// ── 03 PAPER ─ cotton paper, DOT/480 letterpressed into it ─────────────────────────────────────────────────
// Card pitch. A deckle-edged sheet (a rounded box whose edge is torn by fBm), cotton fibres as a fine relief
// (heightFromField-style: fBm, .4 cells), DOT over 480 debossed (smooth walls, −1.5; the plan had one line, which overruns the sheet) under a raking light: the wall facing
// the light climbs to idle, the far wall falls to void, and the ink sits on the floor of the impression in value. The
// paper stays faint / mid. A tap is one more impression: the ink lifts and is laid again from the strokes' middle
// out over 0.4 s, and the count goes up. No red: nothing on paper is live.
export const PAPER = { box: [10, 18, 133, 136] as Box, r: 3, lines: [['DOT', 34], ['480', 62]] as [string, number][], k: 2.5, inkAt: 1.9 }
const PCX = (PAPER.box[0] + PAPER.box[2]) / 2, PCY = (PAPER.box[1] + PAPER.box[3]) / 2, PHW = (PAPER.box[2] - PAPER.box[0]) / 2, PHH = (PAPER.box[3] - PAPER.box[1]) / 2
/** Signed distance to the deckle edge (cells, < 0 on the sheet): a rounded box, the edge torn by fBm along it. */
export function deckle(x: number, y: number): number {
  const qx = Math.abs(x - PCX) - (PHW - PAPER.r), qy = Math.abs(y - PCY) - (PHH - PAPER.r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PAPER.r + 1.3 * fbm2(x / 3.2, y / 3.2, 3, 41) + .8 * fbm2(x / 11, y / 11, 2, 43)
}
const PBOX: CellBounds = [PAPER.box[0] - 3, PAPER.box[1] - 3, PAPER.box[2] + 3, PAPER.box[3] + 3]
/** `floor`: per cell, how deep into a stroke it lies (cells to the nearest unprinted cell; 0 off the letters). */
interface PaperGeo { n: NormalRaster; ao: Raster; floor: Float32Array; inset: Raster }
const paperGeo = once((): PaperGeo => {
  const N = COLS * TILE.rows, h: HeightRaster = { ...createRaster(TILE, 'card', PBOX), mask: new Float32Array(N) }
  for (let r = PBOX[1]; r <= PBOX[3]; r++) paperRow(h.data, h.mask, r)
  const [a, b] = PAPER.lines.map(([w, row]) => cardMask(T.big(w, 72, row, { lattice: PAPER.k, smooth: true, align: 'center' }), TILE))
  for (let i = 0; i < a.data.length; i++) a.data[i] = Math.max(a.data[i], b.data[i])
  a.bounds = undefined
  const inset = insetDistance(a)
  const cut = stackHeights(h, heightRaster(inset, { shape: 'smooth', width: 1.8, height: -1.5 }))
  return { n: normalRaster(cut), ao: ambientOcclusion(cut, { radius: 2, strength: .6 }), floor: inset.data.map(v => (v < 1 ? .5 - v : 0)), inset }
})
function paperRow(H: Float32Array, M: Float32Array, r: number): void {
  for (let c = PBOX[0], i = r * COLS + c; c <= PBOX[2]; c++, i++) {
    const d = deckle(c, r)
    if (d > 0) continue
    // cotton: a fine fBm and longer fibres (stretched noise), .4 cells; the deckle thins toward the torn edge
    const fib = .6 * (.5 + .5 * fbm2(c / 2.6, r / 2.6, 2, 47)) + .4 * Math.abs(fbm2(c / 8, r / 1.8, 2, 53))
    H[i] = 1.2 * Math.min(1, -d / 2) + .4 * fib; M[i] = 1
  }
}
const paperScratch = scratch(1)
const paperLit = lru<{ values: Float32Array; tones: Uint8Array; ink: Uint8Array }>(8)
function paperShadeRow(g: PaperGeo, D: Float32Array, V: Float32Array, Tn: Uint8Array, ink: Uint8Array, gain: number, r: number): void {
  const M = g.n.mask, A = g.ao.data, F = g.floor
  for (let c = PBOX[0], i = r * COLS + c; c <= PBOX[2]; c++, i++) {
    if (M[i] <= 0) continue
    if (F[i] >= PAPER.inkAt) { ink[i] = 1; continue } // the impression's floor: the ink's (drawn per frame)
    const b = Math.min(1, Math.max(0, D[i] - .1) * gain) * A[i]
    // paper is quiet (faint / mid); only a deboss wall turned to the light climbs to idle
    // the fibres' shadowed valleys are void (the paper's tooth)
    const t = b < .17 ? -1 : b < .36 ? FAINT : F[i] > 0 && b >= .66 ? IDLE : MID
    if (t < 0) continue
    V[i] = t === IDLE ? b : Math.min(t === FAINT ? .29 : .6, b); Tn[i] = t
  }
}
/** The paper world: [0] seconds since the last impression (−1: none), [1] impressions made by hand. */
const paperWorld = once((): World => createWorld({
  size: 2, dt: DT, init: s => { s[0] = -1 }, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 8, heal: .5,
  step: (s, _n, inp) => { if (tapped(inp, PAPER_HIT)) { s[0] = 0; s[1] += 1 } else if (s[0] >= 0) s[0] += DT },
  blend: (a, b) => { a.set(b) },
}))
const PAPER_HIT: Box = [PAPER.box[0], PAPER.box[1], PAPER.box[2] - PAPER.box[0], PAPER.box[3] - PAPER.box[1]]
/** How much of the impression carries ink, e seconds after a tap: none for .12 s (the ink lifts), then from the strokes' middle out by .4 s. */
export const inkReach = (e: number) => (e < 0 || e >= .4 ? 0 : e < .12 ? Infinity : PAPER.inkAt + 1.2 * (1 - (e - .12) / .28))
const paperFrame = once(() => ({ values: createRaster(TILE, 'card', PBOX), tones: new Uint8Array(COLS * TILE.rows) }))
export const matPaper: WidgetPreset = {
  ...tile, id: 'mat-paper', name: 'Paper',
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: PAPER_HIT, label: 'Press again' }],
  layers: ctx => {
    mainThread('mat-paper')
    const s = worldAt(paperWorld(), ctx.t, tapInput(ctx)), reach = inkReach(s[0])
    const L = snapTorch(matLight(ctx, { torch: { height: 14, falloff: 120 }, rake: true }), 2)
    const lit = paperLit(lightKey(L), () => {
      const g = paperGeo(), [dif] = paperScratch(), out = { values: new Float32Array(COLS * TILE.rows), tones: new Uint8Array(COLS * TILE.rows), ink: new Uint8Array(COLS * TILE.rows) }
      lambert(g.n, L, { ambient: .1, into: dif })
      const Ld = Array.isArray(L) ? L as readonly number[] : [0, 0, 1], Lz = Ld[2] / (Math.hypot(Ld[0], Ld[1], Ld[2]) || 1), gain = .5 / (.9 * Math.max(.05, Lz))
      for (let r = PBOX[1]; r <= PBOX[3]; r++) paperShadeRow(g, dif.data, out.values, out.tones, out.ink, gain, r)
      return out
    })
    const F = paperFrame(), V = F.values.data, Tn = F.tones, floor = paperGeo().floor
    V.set(lit.values); Tn.set(lit.tones)
    // the ink: value on the impression's floor (none while it lifts, then spreading out from the strokes' middle)
    for (let r = PBOX[1]; r <= PBOX[3]; r++) for (let c = PBOX[0], i = r * COLS + c; c <= PBOX[2]; c++, i++) if (lit.ink[i] && floor[i] >= reach) { V[i] = .95; Tn[i] = VALUE }
    const count = 1 + Math.round(s[1])
    return [
      cite('LETTERPRESS'),
      tonedLayer(F.values, F.tones),
      layer(T.text(`NO. ${String(count).padStart(4, '0')}`, 72, 102, { align: 'center' }), 'mid'),
      layer(T.text('COTTON 300 GSM', 72, 114, { align: 'center' }), 'faint'),
    ]
  },
}

// ── 07 ICE ─ a frost fern on a window ──────────────────────────────────────────────────────────────────────
// The fern is a DLA cluster (`dla({ w: 96, h: 96, n: 2600 })`, Witten–Sander), a grain per site, 1.375 cells a
// diameter. It grows over 14 s (N ∝ R^1.7), holds, and sublimates newest first; the grains sticking right now are
// red (as `algo-aggregate`). Each grain's branch direction (parent → child) is its tangent: a Kajiya–Kay glint
// flashes on the branches turned across the light. Hoar (fBm speckle on 2-cell blocks) creeps in from the corners.
// A breath, the hovering pointer or a tap for 2 s, melts the frost round it; it freezes back from the edge in.
export const ICE = { n: 2600, w: 96, seed: 17, unit: 1.6, cx: 72, cy: 78, grow: 14, hold: 4, thaw: 2, offset: 13.6, front: 16, breath: 16 }
const ICE_P = ICE.grow + ICE.hold + ICE.thaw
let fern: Dla | undefined
/** The cluster (baked once, on the first frame): the same as `dla({ w: 96, h: 96, n: 2600, seed: 17 })`. */
export const iceFern = () => (fern ??= dla({ w: ICE.w, h: ICE.w, n: ICE.n, seed: ICE.seed }))
/** Grains shown at t (growth N ∝ g^1.7, the hold, then the thaw newest first) and whether the front is live. */
export function iceCount(t: number, count: number): { k: number; live: boolean } {
  const p = (((t + ICE.offset) % ICE_P) + ICE_P) % ICE_P
  if (p < ICE.grow) return { k: Math.max(1, Math.round(count * (p / ICE.grow) ** 1.7)), live: true }
  if (p < ICE.grow + ICE.hold) return { k: count, live: false }
  const q = (p - ICE.grow - ICE.hold) / ICE.thaw
  return { k: Math.max(1, Math.round(count * (1 - q * q))), live: false }
}
/** Grain i in card cells, and its branch tangent (unit, parent → child). */
const iceGeo = once(() => {
  const d = iceFern(), n = d.count, x = new Float32Array(n), y = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n), c = ICE.w / 2
  for (let i = 0; i < n; i++) {
    x[i] = ICE.cx + (d.x[i] - c) * ICE.unit; y[i] = ICE.cy + (d.y[i] - c) * ICE.unit
    const p = d.parent[i], dx = p >= 0 ? d.x[i] - d.x[p] : 1, dy = p >= 0 ? d.y[i] - d.y[p] : 0, l = Math.hypot(dx, dy) || 1
    tx[i] = dx / l; ty[i] = dy / l
  }
  // hoar: 2-cell blocks (a 2× lattice) in the corners, outside the fern's reach
  let reach = 0
  for (let i = 0; i < n; i++) reach = Math.max(reach, Math.hypot(x[i] - ICE.cx, y[i] - ICE.cy))
  const hoar: Pt[] = []
  for (let j = 7; j < 72; j++) for (let i = 1; i < 71; i++) {
    const px = 2 * i + .5, py = 2 * j + .5, rr = Math.hypot(px - ICE.cx, py - ICE.cy)
    if (rr < reach + 4) continue
    const corner = Math.min(1, (rr - reach - 4) / 30)
    if (fbm2(i / 4, j / 4, 3, 61) + .55 * corner > .5 && hash01(i, j, 67) < .55) hoar.push([px, py])
  }
  return { n, x, y, tx, ty, hoar }
})
/**
 * The ice world: [0, 1] the breath's centre (cells), [2] its strength: up to 1 while a pointer hovers; a tap sets it
 * to 2 (the full melt for 2 s); it falls by ½ a second, so the frost freezes back from the edge in over the last 2 s.
 */
const iceWorld = once((): World => createWorld({
  size: 3, dt: DT, init: () => {}, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 5, heal: .5,
  step: (s, _n, inp) => {
    let hover = false
    for (const p of inp.pointers) {
      if (p.x < 0 || p.y < 12 || p.x >= 144 || p.y >= 144) continue
      if (p.pressed) { s[0] = p.x; s[1] = p.y; s[2] = 2 } else if (!p.down) { s[0] = p.x; s[1] = p.y; hover = true }
    }
    if (inp.kick) { s[0] = ICE.cx; s[1] = ICE.cy; s[2] = 2 }
    s[2] = hover ? Math.max(s[2], Math.min(1, s[2] + 6 * DT)) : Math.max(0, s[2] - DT / 2)
  },
}))
export const matIce: WidgetPreset = {
  ...tile, id: 'mat-ice', name: 'Ice',
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: [0, 12, 144, 132], label: 'Breathe on the glass' }],
  layers: ctx => {
    mainThread('mat-ice')
    const g = iceGeo(), s = worldAt(iceWorld(), ctx.t, tapInput(ctx)), { k, live } = iceCount(ctx.t, g.n)
    const L = matLight(ctx, { torch: { height: 30, falloff: 160 } }), melt = ICE.breath * Math.min(1, s[2]), m2 = melt * melt
    const point = !Array.isArray(L), at = point ? (L as { at: Vec3 }).at : null, dir = point ? null : L as Vec3
    const groups: Record<'faint' | 'mid' | 'idle' | 'value' | 'active', Pt[]> = { faint: [], mid: [], idle: [], value: [], active: [] }
    for (let i = 0; i < k; i++) {
      const x = g.x[i], y = g.y[i]
      if (m2 > 0) { const dx = x - s[0], dy = y - s[1]; if (dx * dx + dy * dy < m2) continue }
      if (live && k - i <= ICE.front) { groups.active.push([x, y]); continue }
      // the glint: Kajiya–Kay on the branch, the eye straight above (sin of the tangent to the half vector)
      let lx: number, ly: number, lz: number
      if (at) { lx = at[0] - x; ly = at[1] - y; lz = at[2] } else [lx, ly, lz] = dir!
      const ll = Math.hypot(lx, ly, lz) || 1, hx = lx / ll, hy = ly / ll, hz = lz / ll + 1, hl = Math.hypot(hx, hy, hz) || 1
      const th = (g.tx[i] * hx + g.ty[i] * hy) / hl, spark = (1 - th * th) ** 12, age = (k - i) / k
      groups[spark > .9 && age < .7 ? 'value' : age > .85 ? 'mid' : 'idle'].push([x, y])
    }
    const out: Layer[] = [cite('WITTEN-SANDER 1981'), layer(T.dots(g.hoar.filter(([x, y]) => m2 === 0 || (x - s[0]) ** 2 + (y - s[1]) ** 2 >= m2), .8), 'faint')]
    for (const tone of ['mid', 'idle', 'value'] as const) if (groups[tone].length) out.push(layer(T.dots(groups[tone], 1.3), tone))
    if (groups.active.length) out.push(layer(T.dots(groups.active, 1.45), 'active'))
    return out
  },
}

export const liveHooks = { KNIT, KNIT_OPTS, knitTile, knitState, knitProgress, knitWorld, PAPER, paperGeo, paperWorld, deckle, inkReach, ICE, iceFern, iceCount, iceGeo, iceWorld }
