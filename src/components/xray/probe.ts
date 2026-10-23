/**
 * X-ray probes: answer "why is this dot this size?" for one point on a card, by asking the same
 * fields the sampler asked, in the same order it asks them (lattice groups → explicit sites → the
 * card lattice; max value wins, later layers win ties). Read-only: nothing here feeds the renderer.
 */
import { cellU, latticeGrid } from '../../engine/sampler/gridSampler'
import { quantize } from '../../engine/sampler/quantize'
import type { DotStyle, GridConfig, Layer, Tone } from '../../engine'

const safe = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const factor = (k: number | undefined) => (k !== undefined && Number.isFinite(k) && k > 0 ? k : 1)
const shown = (v: number, style: DotStyle) => (style.quantizeSteps ? quantize(v, style.quantizeSteps) : v)

/** A short human name for a layer: its text, its layout generator, `ir`, or its tone. */
export function layerName(l: Layer): string {
  const f = l.field
  if (f.text) return `"${f.text.length > 18 ? f.text.slice(0, 17) + '…' : f.text}"`
  const from = f.from
  if (from && 'ir' in from) return 'ir program'
  if (from && 'gen' in from) {
    const inner = from.inner?.from
    return inner && 'ir' in inner ? `${from.gen}(ir)` : inner && 'gen' in inner ? `${from.gen}(${inner.gen})` : from.gen
  }
  return l.toneOf ? 'multi-tone' : l.tone && l.tone !== 'auto' ? `${l.tone} field` : 'field'
}
/** Where the layer samples: the card lattice, a coarser lattice, or explicit sites. */
export function layerKind(l: Layer): string {
  if (l.sites) return `sites ×${l.sites.length}${l.size ? ` · size ${l.size}` : ''}`
  const k = factor(l.lattice)
  return k !== 1 || l.origin ? `lattice ${k}×${l.origin ? ` @${l.origin.join(',')}` : ''}` : 'card lattice'
}
/** IR source behind a layer (directly or wrapped by a layout generator), if any. */
export function layerIR(l: Layer): string | undefined {
  const from = l.field.from
  if (from && 'ir' in from) return from.ir
  const inner = from && 'gen' in from ? from.inner?.from : undefined
  return inner && 'ir' in inner ? inner.ir : undefined
}

export const bandOf = (v: number) => (v <= .34 ? 'faint' : v <= .67 ? 'mid' : 'idle')

export interface DotProbe {
  /** Card cell under the pointer. */
  col: number; row: number
  /** Raw field value of the winning layer, and the value after quantizing. */
  value: number; shown: number
  /** Size step (0-based) and step count, when the style quantizes. */
  step?: number; steps?: number
  /** Drawn radius in grid px. */
  r: number
  tone: string
  /** Index of the winning layer in the card's full layer list (-1: nothing lit). */
  layer: number
  name: string
  kind: 'card' | 'lattice' | 'site' | 'empty'
  /** The winning dot's box in card cells: [x, y, w, h] (a site is a circle of diameter w). */
  box: [number, number, number, number]
  u: number; v: number
}

/**
 * Probe card-cell point (fx, fy) (fractional cells, 0..cols). `skip(i)` hides layers (mute/solo),
 * keeping indexes of the full list.
 */
export function probeDot(layers: Layer[], grid: GridConfig, style: DotStyle, fx: number, fy: number, skip: (i: number) => boolean = () => false): DotProbe {
  const { cols, rows } = grid
  const col = Math.max(0, Math.min(cols - 1, Math.floor(fx))), row = Math.max(0, Math.min(rows - 1, Math.floor(fy)))
  const radius = (v: number, k: number) => { const s = shown(v, style), e = style.sizeCurve ? style.sizeCurve(s) : s; return (style.sizeMin + (style.sizeMax - style.sizeMin) * e) * k }
  const toneName = (l: Layer, v: number, u: number, w: number): string => {
    const t: Tone | undefined = l.toneOf ? l.toneOf(v, u, w) : l.tone
    return !t || t === 'auto' ? `auto → ${bandOf(v)}` : t
  }
  const result = (i: number, value: number, kind: DotProbe['kind'], box: DotProbe['box'], k: number, u: number, v: number): DotProbe => {
    const s = shown(value, style), steps = style.quantizeSteps && style.quantizeSteps >= 2 ? style.quantizeSteps : undefined
    return {
      col, row, value, shown: s, step: steps ? Math.round(s * (steps - 1)) : undefined, steps, r: radius(value, k),
      tone: i < 0 ? '—' : toneName(layers[i], value, u, v), layer: i, name: i < 0 ? '—' : layerName(layers[i]), kind, box, u, v,
    }
  }
  // 1. explicit sites: the nearest lit site whose dot covers the point (drawn after lattices, before the card lattice)
  let site: DotProbe | null = null, siteD = Infinity, siteValue = 0
  // 2. lattice groups: one dot per lattice cell (bigger lattices first; a later, finer one draws on top)
  let lattice: DotProbe | null = null
  const groups = new Map<string, number[]>()
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]
    if (skip(i)) continue
    if (l.sites) {
      const k = factor(l.size ?? l.lattice), reach = k / 2 + .25
      for (const [x, y] of l.sites) {
        const d = Math.hypot(fx - .5 - x, fy - .5 - y)
        if (d > reach || d > siteD + 1e-9) continue
        const u = x / Math.max(1, cols - 1), v = y / Math.max(1, rows - 1), value = safe(l.field(u, v))
        if (shown(value, style) <= 0) continue
        // coincident sites merge like the sampler's: the higher value wins, a later layer wins ties
        if (Math.abs(d - siteD) <= 1e-9 && value < siteValue) continue
        siteD = d; siteValue = value; site = result(i, value, 'site', [x + .5 - k / 2, y + .5 - k / 2, k, k], k, u, v)
      }
      continue
    }
    if (factor(l.lattice) === 1 && !l.origin) continue
    const key = `${factor(l.lattice)}|${l.origin ?? '0,0'}`
    groups.set(key, [...(groups.get(key) ?? []), i])
  }
  const sorted = [...groups.values()].sort((a, b) => factor(layers[b[0]].lattice) - factor(layers[a[0]].lattice))
  for (const group of sorted) {
    const first = layers[group[0]], k = factor(first.lattice), [ox, oy] = first.origin ?? [0, 0], sub = latticeGrid(grid, k, [ox, oy])
    const lc = Math.floor((fx - ox) / k), lr = Math.floor((fy - oy) / k)
    if (lc < 0 || lr < 0 || lc >= sub.cols || lr >= sub.rows) continue
    const u = cellU(lc, sub.cols), v = cellU(lr, sub.rows)
    let best = 0, win = -1
    for (const i of group) {
      // the sampler only visits a field inside its `bounds` (in this lattice's cells)
      const b = layers[i].field.bounds
      if (b && (lc < Math.floor(b[0]) || lc > Math.ceil(b[2]) || lr < Math.floor(b[1]) || lr > Math.ceil(b[3]))) continue
      const value = safe(layers[i].field(u, v)); if (value > 0 && value >= best) { best = value; win = i }
    }
    if (win >= 0 && shown(best, style) > 0) lattice = result(win, best, 'lattice', [ox + lc * k, oy + lr * k, k, k], k, u, v)
  }
  // 3. the card lattice, unless a lattice / site dot covers this cell
  if (site) return site
  if (lattice) return lattice
  const u = cellU(col, cols), v = cellU(row, rows)
  let best = 0, win = -1
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]
    if (skip(i) || l.sites || factor(l.lattice) !== 1 || l.origin) continue
    const b = l.field.bounds
    if (b && (col < Math.floor(b[0]) || col > Math.ceil(b[2]) || row < Math.floor(b[1]) || row > Math.ceil(b[3]))) continue
    const value = safe(l.field(u, v))
    if (value > 0 && value >= best) { best = value; win = i }
  }
  return result(win, best, win < 0 ? 'empty' : 'card', [col, row, 1, 1], 1, u, v)
}

/** Format a 0..1 value the way the tooltip reads it: `.62`, `1`, `0`. */
export const fmt = (x: number, dp = 2) => (x === 0 || x === 1 ? String(x) : x.toFixed(dp).replace(/^0\./, '.').replace(/^-0\./, '-.'))
