/**
 * WORKSHOP, the paper fold (docs/living-matter/X-advanced.md #17): a sheet folds step by step into a paper glider,
 * holds, and unfolds back to a flat sheet, on a loop. Five straight creases (`engine/matter/fold.ts`): a mountain
 * fold that tucks the tail behind, then the two top corners and the two new edges to the centre line, all valleys
 * (the edge folds cut through the tucked tail too, so the glider's outline is one clean triangle).
 * The crease being folded now is the card's one red. Every facet is lit by the board light through its fold
 * history's normal: a face turned to the light is brighter, the back of the sheet one band darker, a thin line where
 * two facets meet at a crease or an edge, and a slight shadow where an upper layer lies over a lower one.
 */
import { creaseLine, foldAt, rasterFold, type Crease, type CreaseLine, type Posed } from '../../engine/matter/fold'
import { tonedLayer } from '../../engine/matter'
import type { Light } from '../../engine/light/shade'
import { createRaster, type Raster } from '../../engine/raster/raster'
import { layer, TILE, type WidgetPreset } from '../types'
import { cite, DEG, LIGHT_DEFAULTS, matLight, mod, once, snapTorch, T, tile, type Pt } from './materials-shared'

const COLS = TILE.cols, ROWS = TILE.rows, N = COLS * ROWS
const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3
/** Each band's value range (faint, mid, idle, value). */
const BAND_LOW = [.12, .3, .62, .95], BAND_TOP = [.28, .6, .9, 1]
/**
 * The sheet (card cells: x0, y0, x1, y1), the loop's beats (seconds: a fold, the rest after it, the folded hold, an
 * unfold, the gap after it, the flat sheet) and the offset (t = 0 is 60% through the third fold, the flap at about 117°).
 */
export const FOLD = { sheet: [32, 15, 112, 128] as const, fold: 1.1, rest: .45, hold: 1.8, unfold: .7, gap: .12, flat: 1.2, offset: 3.76 }
const [SX0, SY0, SX1, SY1] = FOLD.sheet
export const SHEET: readonly number[] = [SX0, SY0, SX1, SY0, SX1, SY1, SX0, SY1]
/** The glider: the tail tucked behind, then the top corners to the centre line and the new edges to it again. */
export const CREASES: readonly Crease[] = [
  { x: 72, y: 104, angle: 0, kind: 'mountain' },
  { x: 72, y: SY0, angle: 135 * DEG, kind: 'valley' },
  { x: 72, y: SY0, angle: 225 * DEG, kind: 'valley' },
  { x: 72, y: SY0, angle: 112.5 * DEG, kind: 'valley' },
  { x: 72, y: SY0, angle: 247.5 * DEG, kind: 'valley' },
]
const STEPS = CREASES.length, FSTEP = FOLD.fold + FOLD.rest, USTEP = FOLD.unfold + FOLD.gap
const FOLDING = STEPS * FSTEP, UNFOLDING = STEPS * USTEP
export const CYCLE = FOLDING + FOLD.hold + UNFOLDING + FOLD.flat

/** One frame of the loop: creases folded flat (k), the next one turned by θ, which crease is moving (−1: none). */
export interface FoldFrame { k: number; theta: number; active: number; phase: 'fold' | 'hold' | 'unfold' | 'flat' }
const ease = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x) }
export function foldFrame(t: number): FoldFrame {
  const p = mod(t + FOLD.offset, CYCLE)
  if (p < FOLDING) {
    const s = Math.min(STEPS - 1, Math.floor(p / FSTEP)), u = (p - s * FSTEP) / FOLD.fold
    return u < 1 ? { k: s, theta: Math.PI * ease(u), active: s, phase: 'fold' } : { k: s + 1, theta: 0, active: -1, phase: s + 1 === STEPS ? 'hold' : 'fold' }
  }
  const q = p - FOLDING - FOLD.hold
  if (q < 0) return { k: STEPS, theta: 0, active: -1, phase: 'hold' }
  if (q >= UNFOLDING) return { k: 0, theta: 0, active: -1, phase: 'flat' }
  const j = Math.min(STEPS - 1, Math.floor(q / USTEP)), c = STEPS - 1 - j, u = (q - j * USTEP) / FOLD.unfold
  return u < 1 ? { k: c, theta: Math.PI * (1 - ease(u)), active: c, phase: 'unfold' } : { k: c, theta: 0, active: -1, phase: c === 0 ? 'flat' : 'unfold' }
}
/** The facets posed for a frame. */
export const posedAt = (f: FoldFrame): Posed[] => foldAt(SHEET, CREASES, f.k, f.theta)

/** A facet's brightness under one light, as if its front faced up: Lambert on its normal, gained so a flat face reads ~.85. */
function facetLight(p: Posed, L: Light): number {
  let cx = 0, cy = 0
  for (let i = 0; i < p.pts.length; i += 2) { cx += p.pts[i]; cy += p.pts[i + 1] }
  cx /= p.pts.length / 2; cy /= p.pts.length / 2
  const at = Array.isArray(L) ? null : (L as { at: readonly number[] }).at
  const v = at ? [at[0] - cx, at[1] - cy, at[2]] : L as readonly number[], k = 1 / (Math.hypot(v[0], v[1], v[2]) || 1)
  const lx = v[0] * k, ly = v[1] * k, lz = v[2] * k, ndl = p.n[0] * lx + p.n[1] * ly + p.n[2] * lz
  // (a flat face reads the same under a low morning sun as at noon; a face turned to a low sun goes to value)
  const b = .85 * Math.max(0, ndl) / Math.max(.05, lz)
  return Math.min(1, Math.max(.12, b))
}
/** Where a shadow is looked for: two cells toward the light (none with the light straight overhead). */
function shadowStep(L: Light): [number, number] {
  const v = Array.isArray(L) ? L as readonly number[] : [(L as { at: readonly number[] }).at[0] - 72, (L as { at: readonly number[] }).at[1] - 72, 1]
  const h = Math.hypot(v[0], v[1])
  return h < .05 * Math.abs(v[2]) || h === 0 ? [0, 0] : [Math.round(2 * v[0] / h), Math.round(2 * v[1] / h)]
}

const tops = once(() => new Int16Array(N))
export interface Shaded { values: Raster; tones: Uint8Array; red: Pt[]; top: Int16Array }
/** A posed sheet under one light: values and tones, and the moving crease's cells (red). */
export function shadeFold(posed: readonly Posed[], L: Light, active: CreaseLine | null): Shaded {
  const top = tops(), box = rasterFold(posed, COLS, ROWS, top), tones = new Uint8Array(N), red: Pt[] = []
  const values = createRaster(TILE, 'card', box ?? [0, 0, -1, -1]), V = values.data
  if (!box) return { values, tones, red, top }
  const bright = posed.map(p => facetLight(p, L)), [ox, oy] = shadowStep(L)
  // two facets meet at a visible crease or edge when they differ in layer, face or normal
  const differs = (a: number, b: number) => {
    const p = posed[a], q = posed[b]
    return p.key !== q.key || p.front !== q.front || Math.abs(p.n[0] - q.n[0]) + Math.abs(p.n[1] - q.n[1]) + Math.abs(p.n[2] - q.n[2]) > 1e-6
  }
  const [x0, y0, x1, y1] = box
  for (let y = y0; y <= y1; y++) for (let x = x0, i = y * COLS + x; x <= x1; x++, i++) {
    const f = top[i]
    if (f < 0) continue
    if (active && Math.abs((x - active.x) * active.nx + (y - active.y) * active.ny) < .5) { red.push([x, y]); continue }
    const r = x < COLS - 1 ? top[i + 1] : -1, d = y < ROWS - 1 ? top[i + COLS] : -1
    if ((r >= 0 && r !== f && differs(f, r)) || (d >= 0 && d !== f && differs(f, d))) { V[i] = .2; tones[i] = FAINT; continue }
    // the back of the sheet: one band below its lit front, at the top of that band (full dots, so a folded flap reads)
    const b = bright[f], t0 = b >= .95 ? VALUE : b >= .62 ? IDLE : b >= .3 ? MID : FAINT, t = posed[f].front ? t0 : Math.max(FAINT, t0 - 1)
    let v = posed[f].front ? b : BAND_TOP[t]
    // a slight shadow under an upper layer's edge: smaller dots, the same band
    const sx = x + ox, sy = y + oy, s = sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS ? top[sy * COLS + sx] : -1
    if (s >= 0 && posed[s].key >= posed[f].key + 1) v = Math.max(BAND_LOW[t], .7 * v)
    V[i] = v; tones[i] = t
  }
  return { values, tones, red, top }
}

const WORDS = { fold: 'FOLD', hold: 'GLIDER', unfold: 'UNFOLD', flat: 'FLAT' } as const
export const matFold: WidgetPreset = {
  ...tile, id: 'mat-fold', name: 'Paper fold',
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const f = foldFrame(ctx.reducedMotion ? 0 : ctx.t), L = snapTorch(matLight(ctx, { torch: { height: 40, falloff: 160 } }), 6)
    const out = shadeFold(posedAt(f), L, f.active >= 0 ? creaseLine(CREASES[f.active]) : null)
    const n = f.active >= 0 ? f.active + 1 : f.k, kind = f.active >= 0 && f.phase === 'fold' ? CREASES[f.active].kind.toUpperCase() : WORDS[f.phase]
    return [
      cite('STRAIGHT CREASES'),
      tonedLayer(out.values, out.tones),
      ...(out.red.length ? [layer(T.dots(out.red, 1), 'active')] : []),
      layer(T.text(n ? `CREASE ${n} OF ${STEPS}` : 'A SHEET', 6, 135), 'faint'),
      layer(T.text(kind, 138, 135, { align: 'right' }), 'faint'),
    ]
  },
}

export const foldHooks = { FOLD, SHEET, CREASES, CYCLE, foldFrame, posedAt, shadeFold }
