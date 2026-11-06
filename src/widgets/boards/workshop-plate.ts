/**
 * WORKSHOP, the Lichtenberg plate (docs/living-matter/X-advanced.md #10, phase XM): a maple plate with two brass
 * electrodes. A figure burns across it by the dielectric breakdown model (`engine/matter/lichtenberg.ts`): both
 * electrodes grow toward each other, and when they touch the discharge path flashes. Burned cells are char: grooves cut
 * into the plate's height, lit through M1's normals, AO and raked light. The live front (the cells burning now, and the
 * discharge) is the card's one red. A tap grounds the plate under the finger: a new figure burns from the nearer
 * electrode to it. Every 12 s the pristine plate is sanded and burned again, with a new seed.
 *
 * Main thread only (the tap world lives here): the sampling worker's build resolves this module to
 * `workshop-plate-worker-stub.ts` (vite.config.ts `mainThreadOnly`).
 */
import { ambientOcclusion, heightFromField, tonedLayer } from '../../engine/matter'
import { dbm, dbmPath, dbmWeights, type Dbm } from '../../engine/matter/lichtenberg'
import { normalRaster, type NormalRaster } from '../../engine/light/height'
import { lambert, type Light, type Vec3 } from '../../engine/light/shade'
import { createWorld, framePointers, worldAt, type World } from '../../engine/physics/world'
import { stbn } from '../../engine/halftone/mask'
import { hash32 } from '../../engine/math'
import { createRaster, type Raster } from '../../engine/raster/raster'
import type { CellBounds } from '../../engine/types'
import { TILE, layer, type WidgetContext, type WidgetPreset } from '../types'
import { cite, fnvBytes, LIGHT_DEFAULTS, lightKey, lru, matLight, mod, once, snapTorch, T, tile, type Box, type Pt } from './materials-shared'

const COLS = TILE.cols
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3
const DT = 1 / 30

/**
 * The plate (card cells), the growth grid inside it (`grid`: its origin and size), the electrodes' x, how fast a
 * figure burns (cells a second), the burn cycle and its parts (seconds), the front's length (cells) and η.
 */
export const PLATE = {
  box: [5, 15, 138, 131] as Box, r: 5, grid: { x: 9, y: 19, cols: 126, rows: 109 }, electrodes: [17, 126] as const,
  rate: 560, cycle: 12, arc: .7, sand: 1.2, front: 46, eta: 3, field: .25, max: 2400, offset: 1.5, seed: 480,
}
const G = PLATE.grid, PBOX: CellBounds = [PLATE.box[0], PLATE.box[1], PLATE.box[2], PLATE.box[3]]
/** Where the growth may go: the plate less a 2-cell rim (the figure never burns off the edge). */
const growMask = once(() => {
  const m = new Uint8Array(G.cols * G.rows)
  for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) if (plateSdf(G.x + x, G.y + y) < -3) m[y * G.cols + x] = 1
  return m
})
/** Signed distance to the plate's rounded rectangle (cells, < 0 inside). */
function plateSdf(x: number, y: number): number {
  const [x0, y0, x1, y1] = PLATE.box, r = PLATE.r, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const qx = Math.abs(x - cx) - ((x1 - x0) / 2 - r), qy = Math.abs(y - cy) - ((y1 - y0) / 2 - r)
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - r
}
/** The electrodes of pristine cycle c: left and right, their heights jittered per cycle (grid cells). */
export function electrodes(c: number): [Pt, Pt] {
  const j = (k: number) => ((hash32(PLATE.seed, c, k) % 41) - 20)
  return [[PLATE.electrodes[0] - G.x, Math.round(G.rows / 2 + j(1))], [PLATE.electrodes[1] - G.x, Math.round(G.rows / 2 + j(2))]]
}
/** Pristine cycle c's figure (grown lazily, as far as a frame needs: LRU of 2). */
const cycles = lru<Dbm>(2)
export const cycleFigure = (c: number) => cycles(`c${c}`, () => {
  const [a, b] = electrodes(c)
  return dbm({ cols: G.cols, rows: G.rows, mask: growMask(), a: [a], b: [b], eta: PLATE.eta, field: PLATE.field, seed: hash32(PLATE.seed, c), max: PLATE.max })
})
/** A tapped figure: from the electrode nearer the finger, to the finger (grid cells). */
const taps = lru<Dbm>(2)
export const tapFigure = (n: number, x: number, y: number) => taps(`${n}|${x}|${y}`, () => {
  const [l, r] = electrodes(0), from = Math.abs(x - l[0]) <= Math.abs(x - r[0]) ? l : r
  return dbm({ cols: G.cols, rows: G.rows, mask: growMask(), a: [from], b: [[x, y]], bGrows: false, attract: 2.5, field: PLATE.field, eta: PLATE.eta, seed: hash32(PLATE.seed, 977, n), max: PLATE.max })
})

/** What a figure shows `tau` seconds into its burn: cells burned, whether it is still burning, the discharge's glow. */
export interface Burn { k: number; burning: boolean; arc: boolean; sanding: number }
/** The burn at `tau` (grows the figure as far as it needs). `end` ≥ 0: the sanding starts then (pristine cycles). */
export function burnAt(f: Dbm, tau: number, end = -1): Burn {
  const want = Math.max(1, Math.floor(tau * PLATE.rate))
  f.grow(want)
  const total = f.count, burnt = total / PLATE.rate
  if (!f.done || want < total) return { k: Math.min(want, total), burning: true, arc: false, sanding: 0 }
  const sanding = end >= 0 && tau >= end ? Math.min(1, (tau - end) / PLATE.sand) : 0
  return { k: sanding > 0 ? Math.max(0, Math.round(total * (1 - sanding))) : total, burning: false, arc: f.joined >= 0 && tau - burnt < PLATE.arc && sanding === 0, sanding }
}

// ── relief: the plate, its char ──────────────────────────────────────────────────────────────────────────
/** The plate's own height: a 2-cell bevel and a fine maple grain (blue noise, .15 cells). */
const plateBase = once(() => {
  const r = createRaster(TILE, 'card', PBOX), m = createRaster(TILE, 'card', PBOX)
  for (let y = PBOX[1]; y <= PBOX[3]; y++) for (let x = PBOX[0]; x <= PBOX[2]; x++) {
    const d = plateSdf(x, y)
    if (d > 0) continue
    const i = y * COLS + x, e = Math.min(1, -d / 2.5)
    r.data[i] = 1.2 * Math.sqrt(e * (2 - e)) + .15 * stbn(x, y, 9); m.data[i] = 1
  }
  return { r, m }
})
/** A channel's half-width (cells) from its branch weight: tips one cell, trunks up to 2.6. */
const halfWidth = (w: number) => Math.min(2.6, .55 + .3 * Math.log2(w))
interface Char { n: NormalRaster; ao: Raster; depth: Float32Array }
/** The plate with the first k cells of a figure burned in (cached per figure and k: a burn re-cuts as it grows). */
const chars = lru<Char>(3)
const weightsBuf = once(() => new Int32Array(PLATE.max))
const figureIds = new WeakMap<Dbm, number>()
let nextFigure = 1
const figureId = (f: Dbm) => { let id = figureIds.get(f); if (!id) figureIds.set(f, (id = nextFigure++)); return id }
function charOf(f: Dbm, k: number): Char {
  return chars(`${figureId(f)}|${k}`, () => {
    const base = plateBase(), h = createRaster(TILE, 'card', PBOX), depth = new Float32Array(COLS * TILE.rows)
    h.data.set(base.r.data)
    const w = dbmWeights(f, k, weightsBuf())
    for (let q = 0; q < k; q++) {
      const c = f.order[q], cx = G.x + (c % G.cols), cy = G.y + Math.floor(c / G.cols), hw = halfWidth(w[q]), R = Math.ceil(hw), dmax = .55 + .35 * hw
      for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
        const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (hw * hw)
        if (d2 >= 1) continue
        const i = y * COLS + x, dd = dmax * Math.sqrt(1 - d2)
        if (dd > depth[i]) depth[i] = dd
      }
    }
    for (let i = 0; i < depth.length; i++) if (depth[i] > 0) h.data[i] -= depth[i]
    const hr = heightFromField(h, TILE, { scale: 1, mask: base.m })
    return { n: normalRaster(hr), ao: ambientOcclusion(hr, { radius: 2, strength: .7 }), depth }
  })
}
/** The lit plate for one char and light (LRU of 4). */
const lits = lru<{ values: Raster; tones: Uint8Array }>(4)
const dif = once(() => createRaster(TILE))
function litPlate(c: Char, ck: string, L: Light) {
  return lits(`${ck}|${lightKey(L)}`, () => {
    const D = dif()
    lambert(c.n, L, { ambient: .08, into: D })
    const values = createRaster(TILE, 'card', PBOX), tones = new Uint8Array(COLS * TILE.rows), V = values.data, M = c.n.mask, A = c.ao.data
    const Ld = Array.isArray(L) ? L as Vec3 : [0, 0, 1], Lz = Ld[2] / (Math.hypot(Ld[0], Ld[1], Ld[2]) || 1), gain = .58 / Math.max(.08, Lz)
    for (let y = PBOX[1]; y <= PBOX[3]; y++) for (let x = PBOX[0], i = y * COLS + x; x <= PBOX[2]; x++, i++) {
      if (M[i] <= 0) continue
      const b = Math.min(1, Math.max(0, D.data[i] - .04) * gain) * A[i], dp = c.depth[i]
      // char: black at the floor of a groove; its wall turned to the light catches it (idle, value at the lip)
      if (dp > 0) {
        if (b >= .72) { V[i] = 1; tones[i] = VALUE } else if (b >= .5) { V[i] = .78; tones[i] = IDLE } else if (dp < .5 && b >= .3) { V[i] = .2; tones[i] = FAINT }
        continue
      }
      // maple: quiet mid, 40% of its grain void (blue noise: the plate stays near 9k dots), the bevel's lit side a step up
      if (stbn(x, y, 4) < .4 || b < .08) continue
      if (b < .3) { V[i] = .28; tones[i] = FAINT } else if (b < .8) { V[i] = .6; tones[i] = MID } else { V[i] = .76; tones[i] = IDLE }
    }
    return { values, tones }
  })
}

// ── the tap world ───────────────────────────────────────────────────────────────────────────────────────
/** [0] seconds since the tap (−1: none), [1, 2] the finger (grid cells), [3] taps so far. */
const plateWorld = once((): World => createWorld({
  size: 4, dt: DT, init: s => { s[0] = -1 }, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 6, heal: .3,
  step: (s, _n, inp) => {
    const p = inp.pointers.find(q => q.pressed && plateSdf(q.x, q.y) < -6)
    if (p) { s[0] = 0; s[1] = Math.round(p.x) - G.x; s[2] = Math.round(p.y) - G.y; s[3] += 1 } else if (inp.kick) { s[0] = 0; s[1] = 63; s[2] = 20; s[3] += 1 } else if (s[0] >= 0) s[0] += DT
  },
  blend: (a, b) => { a.set(b) },
}))
function tapInput(ctx: WidgetContext) {
  if (ctx.reducedMotion) return undefined
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, (x, y) => [x, y]), kick: (ctx.data.k ?? 0) >= .5 && !busy }
}
/** The figure and its burn this frame: a tapped one while the world is live, else the pristine cycle's. */
export function plateFrame(t: number, s: Float32Array | null): { f: Dbm; b: Burn } {
  if (s && s[0] >= 0) { const f = tapFigure(s[3], s[1], s[2]); return { f, b: burnAt(f, s[0]) } }
  const p = mod(t + PLATE.offset, PLATE.cycle), c = Math.floor((t + PLATE.offset) / PLATE.cycle), f = cycleFigure(c)
  return { f, b: burnAt(f, p, PLATE.cycle - PLATE.sand) }
}
const gridPt = (f: Dbm, q: number): Pt => [G.x + (f.order[q] % G.cols), G.y + Math.floor(f.order[q] / G.cols)]
/** The red: the cells burning now (the last `front` grown), or the discharge path while it glows. */
function frontOf(f: Dbm, b: Burn): Pt[] {
  if (b.arc) return dbmPath(f).map(q => gridPt(f, q))
  if (!b.burning) return []
  const out: Pt[] = []
  for (let q = Math.max(0, b.k - PLATE.front); q < b.k; q++) out.push(gridPt(f, q))
  return out
}
/** A brass electrode: a stud of radius 3.5 at card cell p, lit as a dome (value at its highlight). */
function studs(L: Light, ps: Pt[]): { lit: Pt[]; body: Pt[] } {
  const lit: Pt[] = [], body: Pt[] = [], Ld = Array.isArray(L) ? L as Vec3 : null
  for (const [cx, cy] of ps) {
    for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const dx = x - cx, dy = y - cy, q = (dx * dx + dy * dy) / 12.25
      if (q >= 1) continue
      const nz = Math.sqrt(1 - q), nx = dx / 3.5, ny = dy / 3.5
      let lx: number, ly: number, lz: number
      if (Ld) [lx, ly, lz] = Ld; else { const at = (L as { at: Vec3 }).at; lx = at[0] - x; ly = at[1] - y; lz = at[2] }
      const ll = Math.hypot(lx, ly, lz) || 1, hz = lz / ll + 1, hl = Math.hypot(lx / ll, ly / ll, hz) || 1
      ;((nx * lx / ll + ny * ly / ll + nz * hz) / hl > .93 ? lit : body).push([x, y])
    }
  }
  return { lit, body }
}
export const matLichtenberg: WidgetPreset = {
  ...tile, id: 'mat-lichtenberg', name: 'Lichtenberg',
  credit: { by: ['Lutz Niemeyer', 'Luciano Pietronero', 'Hans J. Wiesmann'], title: 'Fractal Dimension of Dielectric Breakdown', source: 'https://doi.org/10.1103/PhysRevLett.52.1033', note: 'the model (grown the fast way of Kim, Sewall, Sud and Lin, 2007)' },
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: [PLATE.box[0], PLATE.box[1], PLATE.box[2] - PLATE.box[0], PLATE.box[3] - PLATE.box[1]], label: 'Ground the plate here' }],
  layers: ctx => {
    if (IN_WORKER) throw new Error('mat-lichtenberg keeps its live state on the main thread')
    const s = worldAt(plateWorld(), ctx.t, tapInput(ctx)), live = plateWorld().mode !== 'pristine' ? s : null
    const { f, b } = plateFrame(ctx.reducedMotion ? 0 : ctx.t, live)
    // the char is re-cut every 112 cells of growth, about every second frame (the red front covers the cells in between)
    const kc = b.burning ? b.k - (b.k % 112) : b.k, ch = charOf(f, kc)
    const L = snapTorch(matLight(ctx, { torch: { height: 26, falloff: 140 }, rake: true }), 4)
    const lit = litPlate(ch, `${figureId(f)}|${kc}`, L), front = frontOf(f, b)
    if (b.burning) for (let q = kc; q < Math.max(kc, b.k - PLATE.front); q++) front.push(gridPt(f, q))
    const seeds: Pt[] = []
    for (let q = 0; q < Math.min(2, f.count); q++) if (f.parent[q] < 0) seeds.push(gridPt(f, q))
    const st = studs(L, seeds)
    return [
      cite('NIEMEYER 1984'),
      tonedLayer(lit.values, lit.tones),
      layer(T.dots(st.body, 1), 'idle'), layer(T.dots(st.lit, 1), 'value'),
      ...(front.length ? [layer(T.dots(front, b.arc ? 1.2 : 1), 'active')] : []),
      layer(T.text(`${f.count} CELLS`, 6, 135), 'mid'),
      layer(T.text(`ETA ${PLATE.eta}`, 138, 135, { align: 'right' }), 'mid'),
    ]
  },
}

/** Probe hooks for scripts/materials-browser.ts (`?probe=1`). */
const probing = typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search)
/** A pristine figure's growth as one hash: cycle c grown out, its order and parents (Node and Chrome must agree). */
export function figureHash(c: number): number {
  const f = cycleFigure(c)
  f.grow(PLATE.max)
  return fnvBytes(f.order.subarray(0, f.count), fnvBytes(f.parent.subarray(0, f.count)))
}
if (probing) (globalThis as { __plate?: unknown }).__plate = { mode: () => plateWorld().mode, taps: () => plateWorld().mode === 'pristine' ? 0 : plateWorld().live[3], hash: figureHash }

export const plateHooks = { PLATE, plateSdf, electrodes, cycleFigure, tapFigure, burnAt, plateFrame, plateWorld, charOf, figureHash }
