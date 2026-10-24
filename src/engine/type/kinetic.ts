/**
 * Dot type, part 3: kinetic type. Every helper is a pure function of `t` (or a progress `k`):
 * per-letter wave / bounce / weight waves (`GlyphFn`s for `TypeOptions.glyph`), a breathing weight,
 * a scrolling LED marquee whose offset advances in 1/`sub` cell steps (sub-cell smooth, identical
 * frames for identical t), an SDF morph between two strings (`morph` / `signedDistance` from
 * `migrate/morph`), and a word-to-word dot migration (`migrate`).
 */
import type { CellBounds, Field } from '../types'
import { migrate, type Migration, type MigrateOptions } from '../migrate/migrate'
import { morph, signedDistance } from '../migrate/morph'
import type { Raster } from '../raster/raster'
import { frameDots, layoutField, typeAt, typeLayout, type GlyphFn, type TypeFrame, type TypeLayout, type TypeOptions } from './typeset'
import type { Tone } from '../types'

const TAU = Math.PI * 2
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

// ── per-letter motion ──────────────────────────────────────────────────────
export interface WaveOptions {
  /** Peak offset, cells (default 2). */
  amp?: number
  /** Seconds per cycle (default 1.6). */
  period?: number
  /** Phase step between letters, cycles (default .12). */
  phase?: number
  /** Round offsets to whole cells so glyph pixels stay on the lattice (default true). */
  snap?: boolean
}
/** Letters ride a sine wave travelling left → right. */
export function waveGlyphs(t: number, o: WaveOptions = {}): GlyphFn {
  const { amp = 2, period = 1.6, phase = .12, snap = true } = o
  return i => { const dy = -amp * Math.sin(TAU * (t / period - i * phase)); return { dy: snap ? Math.round(dy) : dy } }
}
export interface BounceOptions {
  /** Hop height, cells (default 4). */
  height?: number
  /** Seconds per hop (default 1.1). */
  period?: number
  /** Delay between letters, seconds (default .09). */
  stagger?: number
  /** Share of the period spent in the air (default .55); the rest rests on the baseline. */
  air?: number
  /** The text's weight: given, a letter lands one weight step heavier (squash) for a moment. */
  weight?: number
}
/** Letters hop in turn under gravity (parabolic arcs, whole-cell steps) and squash a weight step on landing. */
export function bounceGlyphs(t: number, o: BounceOptions = {}): GlyphFn {
  const { height = 4, period = 1.1, stagger = .09, air = .55, weight } = o
  return i => {
    const ph = ((((t - i * stagger) / period) % 1) + 1) % 1
    if (ph >= air) return weight !== undefined && (ph - air) / (1 - air) < .2 ? { dy: 0, weight: Math.min(1, weight + .25) } : { dy: 0 }
    const s = ph / air
    return { dy: -Math.round(4 * height * s * (1 - s)) }
  }
}
export interface BreatheOptions { min?: number; max?: number; period?: number; phase?: number }
/** A weight that breathes between `min` and `max` (cosine, `period` s). */
export function breathe(t: number, o: BreatheOptions = {}): number {
  const { min = .2, max = .85, period = 3.2, phase = 0 } = o
  return min + (max - min) * (.5 - .5 * Math.cos(TAU * (t / period + phase)))
}
/** Weight wave: each letter breathes, `spread` cycles behind its left neighbour. */
export function weightWave(t: number, o: BreatheOptions & { spread?: number } = {}): GlyphFn {
  const spread = o.spread ?? .1
  return i => ({ weight: breathe(t, { ...o, phase: (o.phase ?? 0) - i * spread }) })
}
/** Two glyph functions applied in order (later fields win). */
export const glyphs = (...fns: (GlyphFn | undefined)[]): GlyphFn => (i, ch, n) => {
  let out: ReturnType<GlyphFn>
  for (const f of fns) { const tw = f?.(i, ch, n); if (tw) out = { ...out, ...Object.fromEntries(Object.entries(tw).filter(([, v]) => v !== undefined)) } }
  return out
}

// ── cached static layouts / fields (stable identity for the SDF cache) ─────
const LRU = 48
const layouts = new Map<string, TypeLayout>(), fields = new Map<string, Field>()
const keyOf = (text: string, opts: TypeOptions) => `${text}\u0000${JSON.stringify({ ...opts, glyph: undefined })}`
function remember<V>(m: Map<string, V>, key: string, make: () => V): V {
  let v = m.get(key)
  if (v !== undefined) { m.delete(key); m.set(key, v); return v }
  m.set(key, (v = make()))
  if (m.size > LRU) m.delete(m.keys().next().value!)
  return v
}
/** A memoised static layout (no `glyph` motion). */
export const cachedLayout = (text: string, opts: TypeOptions): TypeLayout => remember(layouts, keyOf(text, opts), () => typeLayout(text, { ...opts, glyph: undefined }))
/** A memoised static field: the same object for the same text and options, so SDF / migration caches hit. */
export const cachedTypeField = (text: string, opts: TypeOptions): Field => remember(fields, keyOf(text, opts), () => layoutField(cachedLayout(text, opts), opts.grid))

// ── LED marquee ───────────────────────────────────────────────────────────
export interface MarqueeOptions extends Omit<TypeOptions, 'col' | 'align' | 'glyph'> {
  /** Scroll speed, cells per second (default 8). */
  speed?: number
  /** Offset steps per cell (default 4): the scroll is quantized to 1/sub cell, so frames are exact and repeatable. */
  sub?: number
  /** Cells between the end of the text and its next repeat (default 2 × size). */
  gap?: number
  /** Window columns (inclusive; default the whole grid). */
  from?: number
  to?: number
}
/** Scroll offset in cells at `t`: whole 1/sub-cell steps. */
export const marqueeOffset = (t: number, speed = 8, sub = 4) => Math.floor(t * speed * sub + 1e-9) / sub
/**
 * Text scrolling right → left through a window, repeating every (width + gap) cells. The layout is
 * hinted (crisp at whole-cell offsets); part-cell offsets light the straddled LEDs at part values,
 * which is the sub-cell smoothness, quantized per frame by `sub` and by the sampler's steps.
 */
export function marqueeField(text: string, t: number, opts: MarqueeOptions): Field {
  const { grid, speed = 8, sub = 4 } = opts, size = opts.size ?? 7
  const l = cachedLayout(text, { ...opts, col: 0, align: 'left' }), w = l.ink[2] - l.ink[0] + 1, gap = opts.gap ?? 2 * size, period = w + gap
  const from = opts.from ?? 0, to = opts.to ?? grid.cols - 1, off = marqueeOffset(t, speed, sub)
  const cx = Math.max(1, grid.cols - 1), cy = Math.max(1, grid.rows - 1)
  const f: Field = (u, v) => {
    const x = u * cx
    if (x < from - 1e-9 || x > to + 1e-9) return 0
    const y = v * cy, p = ((((x - from + off) % period) + period) % period) + l.ink[0]
    const a = typeAt(l, p, y)
    return a >= 1 ? a : Math.max(a, typeAt(l, p - period, y), typeAt(l, p + period, y))
  }
  f.bounds = [from, l.bounds[1], to, l.bounds[3]]
  f.text = text
  return f
}

// ── SDF morph ─────────────────────────────────────────────────────────────
export interface TypeMorphOptions extends TypeOptions {
  /**
   * Letter-by-letter: share of the timeline (0 … .9) over which columns start, left → right, so
   * the left letter is done before the right one begins (default 0 = one global blend via `morph`).
   */
  sweep?: number
}
const unionBounds = (a?: CellBounds, b?: CellBounds): CellBounds | undefined => (a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : undefined)
const rasterField = (r: Raster, bounds?: CellBounds): Field => {
  const { cols, rows } = r.grid
  const f: Field = (u, v) => { const c = Math.round(u * (cols - 1)), w = Math.round(v * (rows - 1)); return c < 0 || w < 0 || c >= cols || w >= rows ? 0 : r.data[w * cols + c] }
  f.bounds = bounds
  return f
}
/**
 * Text `a` becoming text `b` at k ∈ [0, 1] by blending their signed distance rasters on `opts.grid`
 * (exact EDT, cached per string + options). k = 0 / 1 reproduce a / b; in between the strokes flow.
 */
export function typeMorph(a: string, b: string, k: number, opts: TypeMorphOptions): Field {
  const { grid } = opts, sweep = Math.max(0, Math.min(.9, opts.sweep ?? 0))
  const fa = cachedTypeField(a, opts), fb = cachedTypeField(b, opts), bounds = unionBounds(fa.bounds, fb.bounds)
  if (!sweep || k <= 0 || k >= 1) return k <= 0 ? fa : k >= 1 ? fb : rasterField(morph(fa, fb, k, { grid }), bounds)
  const da = signedDistance(fa, { grid }), db = signedDistance(fb, { grid }), { cols, rows } = grid
  const c0 = bounds ? bounds[0] : 0, span = Math.max(1, (bounds ? bounds[2] : cols - 1) - c0)
  const cx = Math.max(1, cols - 1), cy = Math.max(1, rows - 1)
  const f: Field = (u, v) => {
    const c = Math.round(u * cx), r = Math.round(v * cy)
    if (c < 0 || r < 0 || c >= cols || r >= rows) return 0
    const kc = clamp01((k - sweep * clamp01((c - c0) / span)) / (1 - sweep)), e = kc * kc * (3 - 2 * kc), i = r * cols + c
    const s = da.data[i] + (db.data[i] - da.data[i]) * e
    return s <= -.5 ? 1 : s >= .5 ? 0 : .5 - s
  }
  f.bounds = bounds
  return f
}

// ── word-to-word migration ────────────────────────────────────────────────
const migrations = new Map<string, Migration>()
/**
 * Every lit dot of text `a` flies to a lit dot of text `b` (`migrate`: Hilbert-rank pairs), both set
 * on frame `fr`. Draw a frame with `migrationLayers(m, p)`. Cached per strings, options and frame.
 */
export function typeMigration(a: string, b: string, fr: TypeFrame, opts: Omit<TypeOptions, 'grid'>, mo: MigrateOptions & { toneA?: Tone; toneB?: Tone } = {}): Migration {
  const o: TypeOptions = { ...opts, grid: fr.grid }
  const key = `${a}\u0001${b}\u0001${fr.lattice}|${fr.origin}\u0001${keyOf('', o)}\u0001${JSON.stringify({ ...mo, ease: undefined })}`
  return remember(migrations, key, () => migrate(frameDots(cachedTypeField(a, o), fr, mo.toneA), frameDots(cachedTypeField(b, o), fr, mo.toneB ?? mo.toneA), mo))
}
