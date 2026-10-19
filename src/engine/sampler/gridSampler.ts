import type { DotInstance, DotStyle, Field, GridConfig, Layer, ThemeTokens, Tone } from '../types'
import { applyJitter } from './jitter'
import { quantize } from './quantize'
/**
 * Canonical tone mapping — single source of truth for dot color by value.
 * Thresholds mirror DESIGN.md Dot Grey Scale:
 *   value ≤ 0.34  → dotFaint  (≈ bottom third)
 *   value ≤ 0.67  → dotMid    (≈ middle third)
 *   value ≤ 1     → dotIdle   (≈ top third, brightest static)
 * dotActive is never returned here — widgets opt into it via a layer tone.
 */
export function colorFor(value: number, theme: ThemeTokens): string {
  if (value <= 0.34) return theme.dotFaint ?? theme.dotIdle
  if (value <= 0.67) return theme.dotMid ?? theme.dotIdle
  return theme.dotIdle
}
export function toneColor(tone: Tone | undefined, value: number, theme: ThemeTokens): string {
  switch (tone) {
    case 'active': return theme.dotActive
    case 'activeDim': return theme.dotActiveDim ?? theme.dotActive
    case 'value': return theme.value ?? theme.dotIdle
    case 'idle': return theme.dotIdle
    case 'mid': return theme.dotMid ?? theme.dotIdle
    case 'faint': return theme.dotFaint ?? theme.dotIdle
    default: return colorFor(value, theme)
  }
}
export type ColorFor = (value: number, theme: ThemeTokens) => string

const safe = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
/** u/v for a cell centre — the same mapping every generator and layout helper relies on. */
export const cellU = (col: number, cols: number) => (cols === 1 ? 0.5 : col / (cols - 1))

/** The value a dot is drawn with — quantized for UI styles. Visibility and cover decisions use this, not the raw value. */
const shown = (value: number, style: DotStyle) => (style.quantizeSteps ? quantize(value, style.quantizeSteps) : value)
/** A positive, finite lattice/size factor (bad input falls back to 1 instead of throwing or flipping radii). */
const factor = (k: number | undefined) => (k !== undefined && Number.isFinite(k) && k > 0 ? k : 1)

function emit(dots: DotInstance[], value: number, color: string, x: number, y: number, seed: number, style: DotStyle, scale = 1): void {
  value = shown(value, style)
  const eased = style.sizeCurve ? style.sizeCurve(value) : value
  let jx = x, jy = y
  if (style.jitter) [jx, jy] = applyJitter([x, y], style.jitter * scale, seed)
  dots.push({ x: jx, y: jy, r: (style.sizeMin + (style.sizeMax - style.sizeMin) * eased) * scale, opacity: style.opacityMode === 'constant' ? 1 : value, color, shape: style.shape, roundness: style.cornerRoundness })
}

/** The cell grid a lattice layer is sampled on (see `Layer.lattice`). */
export function latticeGrid(grid: GridConfig, lattice: number, origin: [number, number] = [0, 0]): GridConfig {
  return { cols: Math.max(1, Math.floor((grid.cols - origin[0]) / lattice)), rows: Math.max(1, Math.floor((grid.rows - origin[1]) / lattice)) }
}

export function sampleField(field: Field, grid: GridConfig, style: DotStyle, theme: ThemeTokens, colorForFn: ColorFor = colorFor): DotInstance[] {
  const pitch = grid.pitch ?? theme.gridPx; const dots: DotInstance[] = []
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const value = safe(field(cellU(col, grid.cols), cellU(row, grid.rows)))
    emit(dots, value, colorForFn(value, theme), (col + .5) * pitch, (row + .5) * pitch, row * grid.cols + col, style)
  }
  return dots
}

/**
 * Max-value composite of `layers` over a grid, in layer order (later layers win ties).
 * Layers whose field carries `bounds` only visit those cells.
 */
function composite(layers: Layer[], grid: GridConfig): { best: Float32Array; tone: (Tone | undefined)[] } {
  const { cols, rows } = grid, best = new Float32Array(cols * rows), tone: (Tone | undefined)[] = new Array(cols * rows)
  const us = Array.from({ length: cols }, (_, c) => cellU(c, cols)), vs = Array.from({ length: rows }, (_, r) => cellU(r, rows))
  for (const layer of layers) {
    const f = layer.field, b = f.bounds
    const c0 = b ? Math.max(0, Math.floor(b[0])) : 0, r0 = b ? Math.max(0, Math.floor(b[1])) : 0
    const c1 = b ? Math.min(cols - 1, Math.ceil(b[2])) : cols - 1, r1 = b ? Math.min(rows - 1, Math.ceil(b[3])) : rows - 1
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const value = safe(f(us[c], vs[r])), i = r * cols + c
      if (value > 0 && value >= best[i]) { best[i] = value; tone[i] = layer.tone }
    }
  }
  return { best, tone }
}

/**
 * Sample several layers onto one grid. Per cell the layer with the highest value wins
 * and decides the colour; later layers win ties so an accent layer can sit on top of a track.
 * Layers with a `lattice` are sampled first on their own coarser lattice (bigger dots); card
 * cells under a lit lattice dot are left empty so the two pitches never overlap.
 */
export function sampleLayers(layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[] {
  const pitch = grid.pitch ?? theme.gridPx; const dots: DotInstance[] = []
  const base: Layer[] = [], lattices = new Map<string, Layer[]>(), sited: Layer[] = []
  for (const layer of layers) {
    if (layer.sites) { sited.push(layer); continue }
    if (factor(layer.lattice) === 1 && !layer.origin) { base.push(layer); continue }
    const key = `${factor(layer.lattice)}|${layer.origin ?? '0,0'}`
    lattices.set(key, [...(lattices.get(key) ?? []), layer])
  }
  const covered = lattices.size || sited.length ? new Uint8Array(grid.cols * grid.rows) : null
  const groups = [...lattices.values()].sort((a, b) => factor(b[0].lattice) - factor(a[0].lattice))
  for (const group of groups) {
    const k = factor(group[0].lattice), [ox, oy] = group[0].origin ?? [0, 0], sub = latticeGrid(grid, k, [ox, oy])
    const { best, tone } = composite(group, sub)
    for (let row = 0; row < sub.rows; row++) for (let col = 0; col < sub.cols; col++) {
      const value = best[row * sub.cols + col]
      // a dot that quantizes to nothing is not drawn, so it must not punch a hole in the card either
      if (shown(value, style) <= 0) continue
      emit(dots, value, toneColor(tone[row * sub.cols + col], value, theme), (ox + (col + .5) * k) * pitch, (oy + (row + .5) * k) * pitch, 1e6 + row * sub.cols + col, style, k)
      // card cells whose centre falls inside this lattice cell
      const c0 = Math.ceil(ox + col * k - .5), c1 = Math.ceil(ox + (col + 1) * k - .5), r0 = Math.ceil(oy + row * k - .5), r1 = Math.ceil(oy + (row + 1) * k - .5)
      for (let r = Math.max(0, r0); r < Math.min(grid.rows, r1); r++) for (let c = Math.max(0, c0); c < Math.min(grid.cols, c1); c++) covered![r * grid.cols + c] = 1
    }
  }
  // explicit sites: merge coincident sites, then emit and clear the card cells under each dot
  const sites = new Map<string, { x: number; y: number; k: number; value: number; tone?: Tone }>()
  for (const layer of sited) for (const [x, y] of layer.sites!) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const value = safe(layer.field(x / Math.max(1, grid.cols - 1), y / Math.max(1, grid.rows - 1)))
    if (shown(value, style) <= 0) continue
    const key = `${x.toFixed(2)},${y.toFixed(2)}`, prev = sites.get(key)
    if (!prev || value >= prev.value) sites.set(key, { x, y, k: factor(layer.size ?? layer.lattice), value, tone: layer.tone })
  }
  let seed = 2e6
  for (const { x, y, k, value, tone } of sites.values()) {
    emit(dots, value, toneColor(tone, value, theme), (x + .5) * pitch, (y + .5) * pitch, seed++, style, k)
    const reach = k / 2 + .25
    for (let r = Math.max(0, Math.ceil(y - reach)); r <= Math.min(grid.rows - 1, Math.floor(y + reach)); r++)
      for (let c = Math.max(0, Math.ceil(x - reach)); c <= Math.min(grid.cols - 1, Math.floor(x + reach)); c++)
        if (Math.hypot(c - x, r - y) <= reach) covered![r * grid.cols + c] = 1
  }
  const { best, tone } = composite(base, grid), background = style.opacityMode === 'constant'
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const i = row * grid.cols + col
    // empty cells are invisible unless the style draws every dot (constant opacity)
    if (covered?.[i] || (shown(best[i], style) <= 0 && !background)) continue
    emit(dots, best[i], toneColor(tone[i], best[i], theme), (col + .5) * pitch, (row + .5) * pitch, i, style)
  }
  return dots
}
