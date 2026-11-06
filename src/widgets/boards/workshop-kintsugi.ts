/**
 * WORKSHOP, the kintsugi plate (docs/living-matter/X-advanced.md #3): a glazed plate that breaks where it is struck
 * and is mended along its cracks. A break (`engine/matter/kintsugi.ts`) runs out from the impact along an
 * impact-aligned shard pattern and stops at the rim or at an older seam. The shards part by a cell and tip, spring
 * back, and the cracks fill in from the impact outward as raised seams. The seam being filled now is the card's one
 * red; a finished seam is the brightest neutral. Everything is lit through M1's relief: the plate's lip and well, the
 * cracks as grooves, the seams as beads.
 *
 * Pristine loop: three breaks on one plate (each stops at the seams before it), then the glaze closes over the seams
 * and a new cycle starts with new seeds. A tap breaks the piece under the finger; more taps keep breaking the mended
 * plate (in memory, this session only). Six seconds after the last tap the plate heals back to the loop.
 *
 * Main thread only (the tap world lives here): the sampling worker's build resolves this module to
 * `workshop-kintsugi-worker-stub.ts` (vite.config.ts `mainThreadOnly`).
 */
import { ambientOcclusion, tonedLayer } from '../../engine/matter'
import { fracture, type Fracture } from '../../engine/matter/kintsugi'
import { normalRaster, type HeightRaster, type NormalRaster } from '../../engine/light/height'
import { illuminate, type Light } from '../../engine/light/shade'
import { createWorld, framePointers, worldAt, type World } from '../../engine/physics/world'
import { hash32 } from '../../engine/math'
import { createRaster, type Raster } from '../../engine/raster/raster'
import type { CellBounds } from '../../engine/types'
import { TILE, layer, type WidgetContext, type WidgetPreset } from '../types'
import { fnvBytes, LIGHT_DEFAULTS, lightKey, lru, matLight, mod, once, snapTorch, T, tile, cite, type Pt } from './materials-shared'
import { BAND, plateHeight, seamTone, shadePlate, type Shaded } from './workshop-kintsugi-shade'

const COLS = TILE.cols, N = COLS * TILE.rows
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
const DT = 1 / 30
/**
 * The plate (centre, radius, cells), the break's beats (seconds from the impact: the crack runs, the shards part,
 * hold, spring back, the seams fill), a pristine slot per break, breaks a cycle, the glaze closing at the end, the
 * red front's length (cells of reach), the shards' drift (cells) and the loop's offset (t = 0 is mid-repair).
 */
export const KIN = {
  cx: 72, cy: 73, R: 60, strike: .5, reveal: .55, part: .35, hold: .55, back: .6, fill: 2.4, slot: 7.5, breaks: 3, close: 1.5,
  front: 7, drift: 1.4, offset: 3.75, seed: 36, taps: 6,
}
export const CYCLE = KIN.slot * KIN.breaks + KIN.close
const BOX: CellBounds = [KIN.cx - KIN.R - 1, KIN.cy - KIN.R - 1, KIN.cx + KIN.R + 1, KIN.cy + KIN.R + 1]
/** Where the plate is (1), and the glaze's plain height. */
export const plateMask = once(() => {
  const m = new Uint8Array(N)
  for (let y = BOX[1]; y <= BOX[3]; y++) for (let x = BOX[0]; x <= BOX[2]; x++) if (Math.hypot(x - KIN.cx, y - KIN.cy) <= KIN.R - .5) m[y * COLS + x] = 1
  return m
})

// ── breaks: a chain, each on the seams of the ones before ──────────────────────────────────────────────
export interface Break {
  key: string
  f: Fracture
  prev: Break | null
  /** Every seam once this break is mended (the old ones and its cracks), and each seam cell's place in its own fill (0 … 1). */
  seams: Uint8Array
  seamU: Float32Array
  /** Each seam cell's tangent (from the break that cut it). */
  tx: Float32Array
  ty: Float32Array
  /** Per cell: the reach of the nearest new crack cell within one cell (−1: none), so a crack's lips change with it. */
  near: Float32Array
  /** Pieces on the plate once it is mended. */
  pieces: number
}
const breaks = lru<Break>(10)
export function breakOf(prev: Break | null, impact: Pt, seed: number): Break {
  const key = `${prev?.key ?? ''}>${impact[0]},${impact[1]},${seed}`
  return breaks(key, () => {
    const f = fracture({ cols: COLS, rows: TILE.rows, plate: plateMask(), seams: prev?.seams, impact, seed })
    const seams = prev ? Uint8Array.from(prev.seams) : new Uint8Array(N), seamU = prev ? Float32Array.from(prev.seamU) : new Float32Array(N), near = new Float32Array(N).fill(-1)
    const tx = prev ? Float32Array.from(prev.tx) : new Float32Array(N), ty = prev ? Float32Array.from(prev.ty) : new Float32Array(N)
    for (const i of f.order) {
      seams[i] = 1; seamU[i] = f.maxReach > 0 ? f.reach[i] / f.maxReach : 0; tx[i] = f.tx[i]; ty[i] = f.ty[i]
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = i + dy * COLS + dx; if (near[q] < 0 || f.reach[i] < near[q]) near[q] = f.reach[i] }
    }
    return { key, f, prev, seams, seamU, tx, ty, near, pieces: (prev?.pieces ?? 1) + Math.max(0, f.count - 1) }
  })
}
/** Pristine cycle c's break b: a seeded impact in the well, away from the earlier ones. */
export function pristineBreak(c: number, b: number): Break {
  const prev = b > 0 ? pristineBreak(c, b - 1) : null, taken: Pt[] = []
  for (let p: Break | null = prev; p; p = p.prev) taken.push(p.f.impact as Pt)
  let at: Pt = [KIN.cx, KIN.cy]
  for (let k = 0; k < 24; k++) {
    const h = hash32(KIN.seed, c * 8 + b, k), x = ((h & 0xffff) / 65535 * 2 - 1) * .58 * KIN.R, y = ((h >>> 16) / 65535 * 2 - 1) * .58 * KIN.R
    if (x * x + y * y > (.58 * KIN.R) ** 2) continue
    at = [Math.round(KIN.cx + x), Math.round(KIN.cy + y)]
    if (taken.every(([px, py]) => Math.hypot(px - at[0], py - at[1]) > .45 * KIN.R)) break
  }
  return breakOf(prev, at, hash32(KIN.seed, c, b + 101))
}

// ── relief: the plate, its grooves and beads ───────────────────────────────────────────────────────────
interface Relief { n: NormalRaster; ao: Raster }
/** The plate with `seams` as beads and `grooves` cut in (cached by the caller). */
function relief(seams: Uint8Array | null, grooves: Uint8Array | null): Relief {
  const h: HeightRaster = { ...createRaster(TILE, 'card', BOX), mask: new Float32Array(N) }, m = plateMask()
  for (let y = BOX[1]; y <= BOX[3]; y++) for (let x = BOX[0], i = y * COLS + x; x <= BOX[2]; x++, i++) {
    if (!m[i]) continue
    h.mask[i] = 1
    h.data[i] = plateHeight(Math.hypot(x - KIN.cx, y - KIN.cy)) + (seams && seams[i] ? .45 : 0) - (grooves && grooves[i] ? 1.4 : 0)
  }
  return { n: normalRaster(h), ao: ambientOcclusion(h, { radius: 2, strength: .6 }) }
}
const reliefs = lru<Relief>(9)
const plainRelief = () => reliefs('plain', () => relief(null, null))
const beforeRelief = (b: Break) => (b.prev ? mendedRelief(b.prev) : plainRelief())
const mendedRelief = (b: Break) => reliefs(`m${b.key}`, () => relief(b.seams, null))
const crackedRelief = (b: Break) => reliefs(`c${b.key}`, () => relief(b.prev?.seams ?? null, b.f.crack))
/** A relief lit by one light: diffuse and specular per cell (LRU of 12). */
export interface Lit { D: Float32Array; P: Float32Array }
const lits = lru<Lit>(12)
const reliefIds = new WeakMap<Relief, number>()
let nextRelief = 1
function litOf(r: Relief, L: Light): Lit {
  let id = reliefIds.get(r)
  if (!id) reliefIds.set(r, (id = nextRelief++))
  return lits(`${id}|${lightKey(L)}`, () => {
    const d = createRaster(TILE), p = createRaster(TILE)
    illuminate(r.n, L, { ambient: .1, shininess: 36, into: d, intoSpecular: p })
    const A = r.ao.data
    for (let i = 0; i < N; i++) d.data[i] *= A[i]
    return { D: d.data, P: p.data }
  })
}

// ── the beats ──────────────────────────────────────────────────────────────────────────────────────────
/** What a break shows `tau` seconds after its impact (tau < 0: not struck yet). */
export interface Beat { reveal: number; fill: number; part: number; phase: 'whole' | 'struck' | 'mending' | 'mended' }
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }
export function beatAt(b: Break, tau: number): Beat {
  const K = KIN, mr = b.f.maxReach + 1e-6, t1 = K.reveal, t2 = t1 + K.part, t3 = t2 + K.hold, t4 = t3 + K.back, t5 = t4 + K.fill
  if (tau < 0) return { reveal: -1, fill: -1, part: 0, phase: 'whole' }
  const reveal = tau >= t1 ? mr : mr * tau / t1
  const part = tau < t1 ? 0 : tau < t2 ? ease((tau - t1) / K.part) : tau < t3 ? 1 : tau < t4 ? 1 - ease((tau - t3) / K.back) : 0
  const fill = tau < t4 ? -1 : tau >= t5 ? mr + K.front : (mr + K.front) * (tau - t4) / K.fill
  return { reveal, fill, part, phase: tau >= t5 ? 'mended' : tau >= t4 ? 'mending' : 'struck' }
}
/** The pristine frame at t: the break on show, its beat, and how far the glaze has closed (0 … 1) at the cycle's end. */
export function pristineAt(t: number): { b: Break; beat: Beat; close: number } {
  const u = t + KIN.offset, c = Math.floor(u / CYCLE), p = mod(u, CYCLE), k = Math.min(KIN.breaks - 1, Math.floor(p / KIN.slot))
  const b = pristineBreak(c, k), beat = beatAt(b, p - k * KIN.slot - KIN.strike)
  return { b, beat, close: p >= KIN.breaks * KIN.slot ? ease((p - KIN.breaks * KIN.slot) / KIN.close) : 0 }
}

// ── the tap world ──────────────────────────────────────────────────────────────────────────────────────
/**
 * [0] seconds since the last tap (−1: none), [1] taps, [2] the pristine cycle and [3] its breaks the plate had when it
 * was first tapped (set by the card on the frame that forks: the step has no clock), [4 …] the taps' impacts.
 */
const SIZE = 4 + 2 * KIN.taps
export const kintsugiWorld = once((): World => createWorld({
  size: SIZE, dt: DT, init: s => { s[0] = -1; s[2] = -1 }, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 6, heal: .3,
  step: (s, _n, inp) => {
    const p = inp.pointers.find(q => q.pressed && Math.hypot(q.x - KIN.cx, q.y - KIN.cy) < KIN.R - 3)
    const at: Pt | null = p ? [Math.round(p.x), Math.round(p.y)] : inp.kick ? [KIN.cx + 14, KIN.cy - 18] : null
    if (at && s[1] < KIN.taps) { s[4 + 2 * s[1]] = at[0]; s[5 + 2 * s[1]] = at[1]; s[1] += 1; s[0] = 0 } else if (s[0] >= 0) s[0] += DT
  },
  blend: (a, b) => { a.set(b) },
}))
function tapInput(ctx: WidgetContext) {
  if (ctx.reducedMotion) return undefined
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, (x, y) => [x, y]), kick: (ctx.data.k ?? 0) >= .5 && !busy }
}
/** The live plate: the pristine breaks it had when first tapped, then one break per tap. */
export function liveAt(s: Float32Array): { b: Break; beat: Beat } {
  let b: Break | null = null
  for (let k = 0; k < s[3]; k++) b = pristineBreak(s[2], k)
  for (let j = 0; j < s[1]; j++) b = breakOf(b, [s[4 + 2 * j], s[5 + 2 * j]], hash32(KIN.seed, 977, j))
  return { b: b!, beat: beatAt(b!, s[0]) }
}
/** On the frame a tap forks the world: note which pristine plate it broke (the breaks struck by then). */
function noteFork(w: World, t: number): void {
  const s = w.live
  if (s[2] >= 0) return
  const u = t + KIN.offset, p = mod(u, CYCLE), k = Math.floor(p / KIN.slot)
  s[2] = Math.floor(u / CYCLE)
  s[3] = p >= KIN.breaks * KIN.slot ? 0 : k + (p - k * KIN.slot >= KIN.strike ? 1 : 0)
}

/** A break at a beat under one light: the plate's values and tones, and the red front's cells. */
export function shadeBreak(b: Break, beat: Beat, close: number, L: Light): Shaded {
  const before = litOf(beforeRelief(b), L), cracked = beat.reveal >= 0 ? litOf(crackedRelief(b), L) : before, mended = beat.fill >= 0 ? litOf(mendedRelief(b), L) : before
  const plain = close > 0 ? litOf(plainRelief(), L) : null
  return shadePlate({ b, beat, close, L, before, cracked, mended, plain, box: BOX, seed: KIN.seed, drift: KIN.drift, front: KIN.front })
}

export const matKintsugi: WidgetPreset = {
  ...tile, id: 'mat-kintsugi', name: 'Kintsugi',
  credit: { by: ['Matthias Müller', 'Nuttapong Chentanez', 'Tae-Yong Kim'], title: 'Real Time Dynamic Fracture with Volumetric Approximate Convex Decompositions', source: 'https://doi.org/10.1145/2461912.2461934', note: 'the impact-aligned shard pattern' },
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: [KIN.cx - KIN.R, KIN.cy - KIN.R, 2 * KIN.R, 2 * KIN.R], label: 'Strike the plate here' }],
  layers: ctx => {
    if (IN_WORKER) throw new Error('mat-kintsugi keeps its live state on the main thread')
    const w = kintsugiWorld(), s = worldAt(w, ctx.t, tapInput(ctx)), live = w.mode !== 'pristine'
    if (live) noteFork(w, ctx.t)
    const t = ctx.reducedMotion ? 0 : ctx.t
    const { b, beat, close } = live && s[1] > 0 ? { ...liveAt(s), close: 0 } : pristineAt(t)
    const L = snapTorch(matLight(ctx, { torch: { height: 44, falloff: 180 } }), 6)
    const out = shadeBreak(b, beat, close, L), word = beat.phase === 'whole' ? 'WHOLE' : beat.phase === 'struck' ? 'STRUCK' : beat.phase === 'mending' ? 'MENDING' : 'MENDED'
    const pieces = beat.phase === 'whole' ? (b.prev?.pieces ?? 1) : b.pieces
    return [
      cite('MULLER 2013'),
      tonedLayer(out.values, out.tones),
      ...(out.red.length ? [layer(T.dots(out.red, 1), 'active')] : []),
      layer(T.text(`${close > .5 ? 1 : pieces} ${pieces === 1 || close > .5 ? 'PIECE' : 'PIECES'}`, 6, 135), 'mid'),
      layer(T.text(close > 0 ? 'NEW GLAZE' : word, 138, 135, { align: 'right' }), 'mid'),
    ]
  },
}

/** A pristine break as one hash of its shard raster and crack order (Node and Chrome must agree, bit for bit). */
export function breakHash(c: number, b: number): number {
  const f = pristineBreak(c, b).f
  return fnvBytes(f.shard, fnvBytes(f.order))
}
if (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search)) {
  (globalThis as { __kintsugi?: unknown }).__kintsugi = { mode: () => kintsugiWorld().mode, taps: () => kintsugiWorld().mode === 'pristine' ? 0 : kintsugiWorld().live[1], hash: breakHash }
}

export const kintsugiHooks = { KIN, CYCLE, plateMask, breakOf, pristineBreak, beatAt, pristineAt, liveAt, kintsugiWorld, breakHash, shadeBreak, BAND, seamTone }
