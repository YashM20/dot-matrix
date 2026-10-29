/**
 * `specToPreset(spec)` — a validated card spec as a `WidgetPreset`: every layer becomes an ordinary
 * `Layer` (field + tone on the card grid, a lattice or dot sites), so a spec card renders through the
 * same Field → Grid Sampler → Renderer pipeline as a TS card. IR compiles to the CSP-safe closure tree
 * unless `irMode: 'function'`; nothing is `eval`ed.
 */
import { textAt } from '../engine/layout'
import { contextEnv, irProgram } from '../engine/ir'
import '../engine/noise/ir' // IR noise pack: noise() fbm() turb() voronoi() in spec IR
import { hash01 } from '../engine/math'
import { latticeGrid } from '../engine/sampler/gridSampler'
import type { Field, GridConfig, Layer, Tone } from '../engine/types'
import { layoutFor, type WidgetContext, type WidgetPreset } from '../widgets/types'
import { decodeSamples, fromBase64 } from './codec'
import { SpecError, type CardSpec, type JoinLayerSpec, type LayerSpec, type TextLayerSpec, type ToneStopSpec } from './types'
import { validateSpec } from './validate'

export interface BuildOptions {
  /** IR backend: `closure` (default, CSP-safe) or `function` (`new Function`, falls back to closures under a strict CSP). */
  irMode?: 'closure' | 'function'
}
/** A preset built from a spec; `spec` keeps what a `WidgetPreset` has no slot for (theme, states, transitions). */
export type SpecPreset = WidgetPreset & { spec: CardSpec }
type Build = (ctx: WidgetContext) => Layer

/** Fields made by `specToPreset` → the spec layer that made them, so `presetToSpec` gives the spec back verbatim. */
const madeBy = new WeakMap<Field, LayerSpec>()
export const specLayerOf = (field: Field): LayerSpec | undefined => madeBy.get(field)

/** The grid a layer's field is laid out on: the card grid, or the layer's lattice. */
export const layerGrid = (grid: GridConfig, l: { lattice?: number | [number, number]; origin?: [number, number] }): GridConfig =>
  l.lattice !== undefined || l.origin ? latticeGrid(grid, l.lattice ?? 1, l.origin ?? [0, 0]) : grid
const cellOf = (u: number, n: number) => Math.round(u * (n - 1))

function placement(l: { tone?: Tone; lattice?: number | [number, number]; origin?: [number, number]; join?: JoinLayerSpec; sizeAxis?: Layer['sizeAxis'] }): Omit<Layer, 'field'> {
  const o: Omit<Layer, 'field'> = {}
  if (l.tone !== undefined) o.tone = l.tone
  if (l.lattice !== undefined) o.lattice = typeof l.lattice === 'number' ? l.lattice : [l.lattice[0], l.lattice[1]]
  if (l.sizeAxis !== undefined) o.sizeAxis = l.sizeAxis
  if (l.origin) o.origin = [l.origin[0], l.origin[1]]
  if (l.join !== undefined) o.join = l.join === true ? true : { ...l.join }
  return o
}
/** Tone by value band (highest `at` ≤ value wins; `blend` dithers the band's lower edge by a per-cell hash), else the layer tone. */
function toneStops(stops: ToneStopSpec[], sub: GridConfig, fallback: Tone | undefined): NonNullable<Layer['toneOf']> {
  return (value, u, v) => {
    const c = cellOf(u, sub.cols), r = cellOf(v, sub.rows)
    for (let i = stops.length - 1; i >= 0; i--) {
      const s = stops[i]
      if (!(value >= s.at) || (s.blend && hash01(c * 151 + r, 7) >= (value - s.at) / s.blend)) continue
      return s.tone
    }
    return fallback
  }
}
export function formatNumber(x: number, f: TextLayerSpec['format'] = {}): string {
  let s = !Number.isFinite(x) ? '-' : f.decimals ? x.toFixed(f.decimals) : String(Math.round(x))
  if (f.pad && Number.isFinite(x)) s = x < 0 ? `-${s.slice(1).padStart(f.pad, '0')}` : s.padStart(f.pad, '0')
  return `${f.prefix ?? ''}${s}${f.suffix ?? ''}`
}
/** A layer that never changes: built on first use, then the same `Layer` every frame. */
const once = (make: () => Layer): Build => { let l: Layer | undefined; return () => (l ??= make()) }

/** One spec layer → a per-frame layer builder on `grid`. Shared by `specToPreset` and the export check in `presetToSpec`. */
export function buildLayer(l: LayerSpec, grid: GridConfig, opts: BuildOptions = {}): Build {
  const mode = opts.irMode ?? 'closure'
  const tag = (field: Field) => { madeBy.set(field, l); return field }
  switch (l.kind) {
    case 'ir': {
      const sub = layerGrid(grid, l), k = l.lattice ?? 1, [ox, oy] = l.origin ?? [0, 0], b = l.bounds, prog = irProgram(l.src, { mode })
      const rect: [number, number, number, number] = b ? [ox + b[0] * k, oy + b[1] * k, b[2] * k, b[3] * k] : [ox, oy, sub.cols * k, sub.rows * k]
      const M = layoutFor(sub), base = placement(l), toneOf = l.toneStops && toneStops(l.toneStops, sub, l.tone)
      return ctx => {
        const f = prog(contextEnv(ctx, grid, rect))
        return { ...base, field: tag(b ? M.place(f, b[0], b[1], b[2], b[3]) : f), ...(toneOf && { toneOf }) }
      }
    }
    case 'text': {
      const sub = layerGrid(grid, l), base = placement(l), o: Parameters<typeof textAt>[4] = {}
      if (l.align !== undefined) o.align = l.align
      if (l.scale !== undefined) o.scale = Array.isArray(l.scale) ? [l.scale[0], l.scale[1]] : l.scale
      if (l.smooth !== undefined) o.smooth = l.smooth
      const draw = (s: string) => ({ ...base, field: tag(textAt(sub, s, l.at[0], l.at[1], o)) })
      if (l.bind === undefined) return once(() => draw(l.text ?? ''))
      const prog = irProgram(l.bind, { mode, raw: true }), k = l.lattice ?? 1, [ox, oy] = l.origin ?? [0, 0]
      return ctx => draw(formatNumber(prog(contextEnv(ctx, grid, [ox, oy, sub.cols * k, sub.rows * k]))(0, 0), l.format))
    }
    case 'sites': {
      const sites = l.points.map(p => [p[0], p[1]] as [number, number]), base: Omit<Layer, 'field'> = { sites }
      if (l.size !== undefined) base.size = l.size
      if (l.tone !== undefined) base.tone = l.tone
      // per-site values / tones, read back at the card u/v the sampler asks for (nearest site off-grid: thumbnails)
      const su = (x: number) => x / Math.max(1, grid.cols - 1), sv = (y: number) => y / Math.max(1, grid.rows - 1)
      const index = new Map<string, number>()
      sites.forEach(([x, y], i) => { const key = `${su(x)}|${sv(y)}`; if (!index.has(key)) index.set(key, i) })
      const siteAt = (u: number, v: number) => {
        const hit = index.get(`${u}|${v}`)
        if (hit !== undefined) return hit
        let best = -1, d = Infinity
        sites.forEach(([x, y], i) => { const e = Math.hypot(su(x) - u, sv(y) - v); if (e < d) { d = e; best = i } })
        return best
      }
      const tones = l.tones, toneOf = tones && ((_: number, u: number, v: number) => tones[siteAt(u, v)] ?? undefined)
      if (l.bind !== undefined) {
        const prog = irProgram(l.bind, { mode })
        return ctx => ({ ...base, field: tag(prog(contextEnv(ctx, grid))), ...(toneOf && { toneOf }) })
      }
      const valued = l.points.some(p => p.length === 3)
      // a fresh field per layer (never the shared `one`): it is the key `specLayerOf` finds this layer by
      return once(() => ({ ...base, field: tag(valued ? (u, v) => l.points[siteAt(u, v)]?.[2] ?? 1 : () => 1), ...(toneOf && { toneOf }) }))
    }
    case 'raster': return once(() => {
      const sub = layerGrid(grid, l), { cols, rows } = l.grid, [c0, r0, c1, r1] = l.window ?? [0, 0, cols - 1, rows - 1], w = c1 - c0 + 1
      const values = decodeSamples(l.asset, l.format), same = cols === sub.cols && rows === sub.rows
      const at = (u: number, v: number) => { const c = cellOf(u, cols), r = cellOf(v, rows); return c < c0 || c > c1 || r < r0 || r > r1 ? -1 : (r - r0) * w + (c - c0) }
      const field: Field = (u, v) => { const i = at(u, v); return i < 0 ? 0 : values[i] }
      if (same) field.bounds = [c0, r0, c1, r1]
      const layer: Layer = { ...placement(l), field: tag(field) }
      if (l.tones) {
        const palette = l.tones.palette, idx = fromBase64(l.tones.asset)
        layer.toneOf = (_, u, v) => { const i = at(u, v); return i < 0 || idx[i] === 255 ? undefined : palette[idx[i]] }
      }
      return layer
    })
    case 'generator': return once(() => {
      const M = layoutFor(layerGrid(grid, l)) as unknown as Record<string, (...args: unknown[]) => Field>
      return { ...placement(l), field: tag(M[l.name](...(JSON.parse(JSON.stringify(l.params)) as unknown[]))) }
    })
  }
}

/** Does any IR in the spec read `t`? (Then the card animates.) */
function readsTime(spec: CardSpec): boolean {
  const src = (l: LayerSpec) => (l.kind === 'ir' ? l.src : l.kind === 'text' || l.kind === 'sites' ? l.bind : undefined)
  return spec.layers.some(l => { const s = src(l); return s !== undefined && irProgram(s).info.t })
}

/** Validate `spec` (throws `SpecError` with paths) and build the preset. */
export function specToPreset(input: unknown, opts: BuildOptions = {}): SpecPreset {
  const result = validateSpec(input)
  if (!result.ok) throw new SpecError(result.errors)
  const spec = (typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input))) as CardSpec
  const grid: GridConfig = { ...spec.grid }, builds = spec.layers.map(l => buildLayer(l, grid, opts)), states = spec.states ?? {}
  const p: SpecPreset = {
    id: spec.id, name: spec.name, group: spec.group ?? 'composite', grid, style: { ...spec.style }, spec,
    layers: ctx => {
      const st = ctx.state !== undefined && Object.prototype.hasOwnProperty.call(states, ctx.state) ? states[ctx.state] : undefined
      const c = st ? { ...ctx, data: { ...ctx.data, ...st.data } } : ctx
      return builds.map(b => b(c))
    },
  }
  if (spec.data || spec.initial) p.defaults = { ...spec.data, ...(spec.initial ? states[spec.initial].data : {}) }
  if (readsTime(spec)) p.animated = true
  if (spec.controls) p.controls = JSON.parse(JSON.stringify(spec.controls))
  if (spec.springKeys) p.springKeys = [...spec.springKeys]
  for (const k of ['live', 'clock', 'burst', 'chrome', 'label', 'bleed', 'media'] as const) if (spec[k] !== undefined) (p as unknown as Record<string, unknown>)[k] = spec[k]
  return p
}
