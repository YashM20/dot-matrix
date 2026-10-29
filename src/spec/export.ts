/**
 * `presetToSpec(preset)` — a TS card as a spec, for the generator subset: layers whose fields came
 * from Field IR, `textAt` / `T.text` / `T.big`, dot sites or a named layout generator (`Field.from`)
 * become `ir` / `text` / `sites` / `generator` layers; anything else (bespoke TS fields, combined or
 * dimmed fields, multi-tone ramps, photos) is baked to a `raster` asset at the authored grid, at the
 * export frame (`t`, `data`). Every converted layer is rebuilt and compared cell by cell with the
 * original; a mismatch falls back to the bake, so the spec always draws what the preset drew.
 */
import { cellU } from '../engine/sampler/gridSampler'
import type { Field, GridConfig, Layer, Tone } from '../engine/types'
import { type WidgetContext, type WidgetPreset } from '../widgets/types'
import { buildLayer, layerGrid, specLayerOf, type BuildOptions, type SpecPreset } from './build'
import { encodeSamples, toBase64 } from './codec'
import { GENERATOR_PARAMS } from './generators'
import { SpecError, type CardSpec, type JoinLayerSpec, type LayerKind, type LayerSpec, type RasterLayerSpec, type Window } from './types'
import { validateSpec } from './validate'

export interface ExportOptions extends BuildOptions {
  /** Export frame time (default 0) — what baked layers capture. */
  t?: number
  /** Data over the preset's defaults for the export frame. */
  data?: Record<string, number>
  /** Raster samples: `lossless` (Float32 when every sample is exactly representable, else Float64), `f32`, `u8`. */
  precision?: 'lossless' | 'f32' | 'u8'
}
export interface ExportReport {
  spec: CardSpec
  kinds: Record<LayerKind, number>
  /** Layers baked to rasters, and why. */
  baked: { index: number; reason: string }[]
}

const safe = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
/** The sampler's scan window for a field on a grid (`gridSampler` windowOf). */
function windowOf(f: Field, cols: number, rows: number): Window {
  const b = f.bounds
  return b ? [Math.max(0, Math.floor(b[0])), Math.max(0, Math.floor(b[1])), Math.min(cols - 1, Math.ceil(b[2])), Math.min(rows - 1, Math.ceil(b[3]))] : [0, 0, cols - 1, rows - 1]
}
const inWin = (w: Window, c: number, r: number) => c >= w[0] && c <= w[2] && r >= w[1] && r <= w[3]
const sameDims = (a: GridConfig, b: GridConfig) => a.cols === b.cols && a.rows === b.rows
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
/** JSON round-trips without loss (no functions, undefined holes, non-finite numbers). */
const jsonSafe = (x: unknown): boolean => {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return true
  if (typeof x === 'number') return Number.isFinite(x)
  if (Array.isArray(x)) return x.every(v => v !== undefined && jsonSafe(v))
  if (typeof x === 'object') return Object.values(x as object).every(v => v !== undefined && jsonSafe(v))
  return false
}

/** Same dots from both layers on `grid`: values on the sampler's windows (sites: per site), tones, placement. */
function sameLayer(a: Layer, b: Layer, grid: GridConfig): boolean {
  if (a.tone !== b.tone || String(a.lattice ?? 1) !== String(b.lattice ?? 1) || String(a.origin ?? '') !== String(b.origin ?? '') || (a.sizeAxis ?? 'both') !== (b.sizeAxis ?? 'both')) return false
  if (!a.sites && JSON.stringify(a.join ?? null) !== JSON.stringify(b.join ?? null)) return false
  if (a.sites || b.sites) {
    if (!a.sites || !b.sites || a.sites.length !== b.sites.length || (a.size ?? a.lattice ?? 1) !== (b.size ?? b.lattice ?? 1)) return false
    return a.sites.every(([x, y], i) => {
      const [bx, by] = b.sites![i], u = x / Math.max(1, grid.cols - 1), v = y / Math.max(1, grid.rows - 1)
      if (bx !== x || by !== y) return false
      const va = safe(a.field(u, v)), vb = safe(b.field(u, v))
      return va === vb && (a.toneOf ? a.toneOf(va, u, v) : a.tone) === (b.toneOf ? b.toneOf(vb, u, v) : b.tone)
    })
  }
  if (!!a.toneOf !== !!b.toneOf) return false
  const sub = layerGrid(grid, a), wa = windowOf(a.field, sub.cols, sub.rows), wb = windowOf(b.field, sub.cols, sub.rows)
  for (let r = Math.min(wa[1], wb[1]); r <= Math.max(wa[3], wb[3]); r++) for (let c = Math.min(wa[0], wb[0]); c <= Math.max(wa[2], wb[2]); c++) {
    const u = cellU(c, sub.cols), v = cellU(r, sub.rows)
    const va = inWin(wa, c, r) ? safe(a.field(u, v)) : 0, vb = inWin(wb, c, r) ? safe(b.field(u, v)) : 0
    if (va !== vb) return false
    if (va > 0 && a.toneOf && a.toneOf(Math.fround(va), u, v) !== b.toneOf!(Math.fround(vb), u, v)) return false
  }
  return true
}

function placed(l: Layer): Pick<RasterLayerSpec, 'tone' | 'lattice' | 'origin' | 'join' | 'sizeAxis'> {
  const o: Pick<RasterLayerSpec, 'tone' | 'lattice' | 'origin' | 'join' | 'sizeAxis'> = {}
  if (l.tone !== undefined) o.tone = l.tone
  if (l.lattice !== undefined) o.lattice = typeof l.lattice === 'number' ? l.lattice : [l.lattice[0], l.lattice[1]]
  if (l.sizeAxis !== undefined) o.sizeAxis = l.sizeAxis
  if (l.origin) o.origin = [l.origin[0], l.origin[1]]
  // a function group never gets here (exportPreset refuses it); sites ignore join
  if (l.join !== undefined && !l.sites) o.join = l.join === true ? true : clone(l.join) as JoinLayerSpec
  return o
}
/** Why a layer cannot travel in a spec at all (not even baked), or undefined: per-cell functions the sampler calls. */
function unportable(l: Layer): string | undefined {
  if (l.shapeOf) return 'shapeOf is a per-cell function and cannot be carried by a spec'
  if (l.join && l.join !== true && typeof l.join.group === 'function' && !l.sites) return 'a join group function cannot be carried by a spec (a spec join group is a number)'
}

/** A layer's field (and multi-tone `toneOf`) sampled over its scan window on its own grid. */
export function bakeLayer(l: Layer, grid: GridConfig, precision: ExportOptions['precision'] = 'lossless'): RasterLayerSpec {
  const sub = layerGrid(grid, l), w0 = windowOf(l.field, sub.cols, sub.rows)
  const empty = w0[0] > w0[2] || w0[1] > w0[3], win: Window = empty ? [0, 0, 0, 0] : w0
  const W = win[2] - win[0] + 1, H = win[3] - win[1] + 1, values = new Float64Array(W * H)
  const palette: Tone[] = [], tones = l.toneOf ? new Uint8Array(W * H).fill(255) : undefined
  if (!empty) for (let r = win[1]; r <= win[3]; r++) for (let c = win[0]; c <= win[2]; c++) {
    const u = cellU(c, sub.cols), v = cellU(r, sub.rows), i = (r - win[1]) * W + (c - win[0]), x = safe(l.field(u, v))
    values[i] = x
    if (tones && x > 0) {
      const t = l.toneOf!(Math.fround(x), u, v)
      if (t === undefined) continue
      let k = palette.indexOf(t)
      if (k < 0) { k = palette.length; palette.push(t) }
      tones[i] = k
    }
  }
  const format = precision === 'lossless' ? (values.every(x => Math.fround(x) === x) ? 'f32' : 'f64') : precision
  const spec: RasterLayerSpec = { kind: 'raster', ...placed(l), grid: { cols: sub.cols, rows: sub.rows }, window: win, format, asset: encodeSamples(values, format) }
  if (tones && palette.length) spec.tones = { palette, asset: toBase64(tones) }
  return spec
}

/** The spec layer for one preset layer without baking, or the reason it must be baked. */
function convert(l: Layer, grid: GridConfig): LayerSpec | string {
  const known = specLayerOf(l.field)
  if (known) return clone(known)
  const from = l.field.from
  if (l.sites) {
    const sites = l.sites.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), size = l.size ?? (typeof l.lattice === 'number' ? l.lattice : undefined)
    const base = { kind: 'sites' as const, points: sites.map(([x, y]) => [x, y] as [number, number]), ...(size !== undefined && { size }), ...(l.tone !== undefined && { tone: l.tone }) }
    if (from && 'ir' in from && !from.raw && !l.toneOf) return { ...base, bind: from.ir }
    const su = (x: number) => x / Math.max(1, grid.cols - 1), sv = (y: number) => y / Math.max(1, grid.rows - 1)
    const vals = sites.map(([x, y]) => safe(l.field(su(x), sv(y))))
    const spec: LayerSpec = { ...base, points: sites.map(([x, y], i) => (vals[i] === 1 ? [x, y] : [x, y, vals[i]])) }
    if (l.toneOf) spec.tones = sites.map(([x, y], i) => l.toneOf!(vals[i], su(x), sv(y)) ?? null)
    return spec
  }
  if (l.toneOf) return 'multi-tone field'
  if (!from) return 'bespoke field'
  // rect cells (squares Q2) travel as baked raster layers only
  if (typeof l.lattice === 'object' || l.sizeAxis !== undefined) return 'rect cells'
  const p = placed(l) as Omit<ReturnType<typeof placed>, 'lattice' | 'sizeAxis'> & { lattice?: number }, sub = layerGrid(grid, l)
  if ('ir' in from) return from.raw ? 'raw IR' : { kind: 'ir', src: from.ir, ...p }
  if (!sameDims(from.grid, sub)) return `${from.gen} laid out on another grid`
  const args = from.args.slice()
  while (args.length && args[args.length - 1] === undefined) args.pop()
  if (from.gen === 'place') {
    const inner = from.inner?.from
    return inner && 'ir' in inner && !inner.raw ? { kind: 'ir', src: inner.ir, ...p, bounds: args as [number, number, number, number] } : 'placed bespoke field'
  }
  if (from.gen === 'text') {
    const [text, col, row, o = {}] = args as [string, number, number, Record<string, unknown>?]
    // an option set to undefined is the same as absent (T.big passes `scale: undefined`)
    const opts = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
    if (Object.keys(opts).some(k => !['align', 'scale', 'smooth'].includes(k)) || !jsonSafe(opts)) return 'text options'
    return { kind: 'text', ...p, text, at: [col, row], ...clone(opts) }
  }
  if (!jsonSafe(args)) return `${from.gen} args are not JSON`
  if (from.gen in GENERATOR_PARAMS) return { kind: 'generator', ...p, name: from.gen as keyof typeof GENERATOR_PARAMS, params: clone(args) as never }
  return `unknown generator ${from.gen}`
}

/** Top-level keys in schema order, so exported JSON is byte-stable. */
const ORDER = ['version', 'id', 'name', 'group', 'grid', 'style', 'theme', 'data', 'controls', 'layers', 'states', 'initial', 'transitions', 'springKeys', 'live', 'clock', 'burst', 'chrome', 'label', 'bleed', 'media'] as const
const canonical = (s: CardSpec): CardSpec => Object.fromEntries(ORDER.filter(k => s[k] !== undefined).map(k => [k, s[k]])) as unknown as CardSpec

/** Export a preset (see the module comment); `kinds` / `baked` say how each layer travelled. */
export function exportPreset(p: WidgetPreset, opts: ExportOptions = {}): ExportReport {
  if (p.style.sizeCurve) throw new SpecError([{ path: '$.style.sizeCurve', message: 'a size curve is a function and cannot be carried by a spec' }])
  const sp = (p as Partial<SpecPreset>).spec
  const ctx: WidgetContext = { t: opts.t ?? 0, data: { ...p.defaults, ...opts.data } }
  const spec: CardSpec = { version: 1, id: p.id, name: p.name, grid: { cols: p.grid.cols, rows: p.grid.rows }, style: { shape: p.style.shape, sizeMin: p.style.sizeMin, sizeMax: p.style.sizeMax }, layers: [] }
  if (!sp || sp.group !== undefined) spec.group = p.group
  if (p.grid.pitch !== undefined) spec.grid.pitch = p.grid.pitch
  if (p.grid.aspect !== undefined) spec.grid.aspect = p.grid.aspect
  for (const k of ['cornerRoundness', 'opacityMode', 'jitter', 'quantizeSteps', 'gap'] as const) if (p.style[k] !== undefined) (spec.style as unknown as Record<string, unknown>)[k] = p.style[k]
  if (sp?.theme) spec.theme = clone(sp.theme)
  const data = sp ? sp.data : p.defaults
  if (data) spec.data = { ...data }
  if (p.controls) spec.controls = clone(p.controls)
  if (sp?.states) spec.states = clone(sp.states)
  if (sp?.initial) spec.initial = sp.initial
  if (sp?.transitions) spec.transitions = clone(sp.transitions)
  if (p.springKeys) spec.springKeys = [...p.springKeys]
  for (const k of ['live', 'clock', 'burst', 'chrome', 'label', 'bleed', 'media'] as const) if (p[k] !== undefined) (spec as unknown as Record<string, unknown>)[k] = p[k]

  const kinds: Record<LayerKind, number> = { ir: 0, text: 0, sites: 0, raster: 0, generator: 0 }, baked: ExportReport['baked'] = []
  const probe = { ...spec, layers: [] as LayerSpec[] }
  const layers = p.layers(ctx)
  const refused = layers.flatMap((l, index) => { const why = unportable(l); return why ? [{ path: `$.layers[${index}]`, message: why }] : [] })
  if (refused.length) throw new SpecError(refused)
  layers.forEach((l, index) => {
    let out = convert(l, p.grid)
    if (typeof out !== 'string') {
      probe.layers = [out]
      const v = validateSpec(probe)
      if (!v.ok) out = `invalid as spec: ${v.errors[0].path.replace('$.layers[0]', '')} ${v.errors[0].message}`
      else if (!sameLayer(l, buildLayer(out, p.grid, opts)(ctx), p.grid)) out = `${out.kind} rebuild differs`
    }
    if (typeof out === 'string') { baked.push({ index, reason: out }); out = bakeLayer(l, p.grid, opts.precision) }
    kinds[out.kind]++
    spec.layers.push(out)
  })
  const v = validateSpec(spec)
  if (!v.ok) throw new SpecError(v.errors)
  return { spec: canonical(spec), kinds, baked }
}
export const presetToSpec = (p: WidgetPreset, opts: ExportOptions = {}): CardSpec => exportPreset(p, opts).spec
