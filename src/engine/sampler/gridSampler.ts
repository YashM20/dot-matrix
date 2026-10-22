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

/** Inclusive cell window [c0, r0, c1, r1] a field is visited in: its `bounds` clipped to the grid, else the whole grid. */
type Window = [number, number, number, number]
const windowOf = (f: Field, cols: number, rows: number): Window => {
  const b = f.bounds
  return b ? [Math.max(0, Math.floor(b[0])), Math.max(0, Math.floor(b[1])), Math.min(cols - 1, Math.ceil(b[2])), Math.min(rows - 1, Math.ceil(b[3]))] : [0, 0, cols - 1, rows - 1]
}
/** The smallest window holding every layer's window (cells outside it stay 0 in the composite). */
const unionWindow = (layers: Layer[], cols: number, rows: number): Window => {
  const w: Window = [cols, rows, -1, -1]
  for (const layer of layers) {
    const [c0, r0, c1, r1] = windowOf(layer.field, cols, rows)
    if (c0 > c1 || r0 > r1) continue
    w[0] = Math.min(w[0], c0); w[1] = Math.min(w[1], r0); w[2] = Math.max(w[2], c1); w[3] = Math.max(w[3], r1)
  }
  return w
}

/** Cell-centre u (or v) for every column of an `n`-wide grid, built once per width. */
const centreTables = new Map<number, Float64Array>()
const centres = (n: number): Float64Array => {
  let t = centreTables.get(n)
  if (!t) { t = new Float64Array(n); for (let c = 0; c < n; c++) t[c] = cellU(c, n); centreTables.set(n, t) }
  return t
}

/**
 * Zeroed per-call buffers. The outermost `sampleLayers` call reuses one set (each composite is
 * consumed before the next starts), so a board mount doesn't allocate ~200 KB of typed arrays per
 * card; a nested call (a field that samples) gets fresh arrays.
 */
const scratch = (() => {
  let depth = 0, best = new Float32Array(0), owner = new Uint32Array(0), covered = new Uint8Array(0)
  return {
    enter() { depth++ }, leave() { depth-- },
    best(n: number) { if (depth !== 1) return new Float32Array(n); if (best.length < n) best = new Float32Array(n); const a = best.subarray(0, n); a.fill(0); return a },
    owner(n: number) { if (depth !== 1) return new Uint32Array(n); if (owner.length < n) owner = new Uint32Array(n); const a = owner.subarray(0, n); a.fill(0); return a },
    covered(n: number) { if (depth !== 1) return new Uint8Array(n); if (covered.length < n) covered = new Uint8Array(n); const a = covered.subarray(0, n); a.fill(0); return a },
  }
})()

/**
 * Max-value composite of `layers` over a grid, in layer order (later layers win ties).
 * Layers whose field carries `bounds` only visit those cells. The result covers `win` only
 * (index `(r - win[1]) * width + (c - win[0])`); every cell outside it is 0. `owner` holds the
 * winning layer's index + 1 (0 = no layer lit the cell); `toneOf` reads its tone.
 */
function composite(layers: Layer[], grid: GridConfig, win: Window = [0, 0, grid.cols - 1, grid.rows - 1]): { best: Float32Array; owner: Uint32Array } {
  const { cols, rows } = grid, [wc0, wr0] = win, width = Math.max(0, win[2] - wc0 + 1), n = width * Math.max(0, win[3] - wr0 + 1)
  const best = scratch.best(n), owner = scratch.owner(n), us = centres(cols), vs = centres(rows)
  for (let l = 0; l < layers.length; l++) {
    const f = layers[l].field, [c0, r0, c1, r1] = windowOf(f, cols, rows)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const value = safe(f(us[c], vs[r])), i = (r - wr0) * width + (c - wc0)
      if (value > 0 && value >= best[i]) { best[i] = value; owner[i] = l + 1 }
    }
  }
  return { best, owner }
}
const toneOf = (layers: Layer[], owner: number): Tone | undefined => (owner ? layers[owner - 1].tone : undefined)

/**
 * Sample several layers onto one grid. Per cell the layer with the highest value wins
 * and decides the colour; later layers win ties so an accent layer can sit on top of a track.
 * Layers with a `lattice` are sampled first on their own coarser lattice (bigger dots); card
 * cells under a lit lattice dot are left empty so the two pitches never overlap.
 */
export function sampleLayers(layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[] {
  scratch.enter()
  try { return sampleLayersOnce(layers, grid, style, theme) } finally { scratch.leave() }
}

/** One coordinate of a site's merge key: the integer behind `x.toFixed(2)`, negatives (incl. "-0.00") mapped below 0. */
function hundredths(x: number): number {
  const m = Math.abs(x) * 100
  let n = Math.round(m)
  // only a near-tie can round differently from toFixed's exact decimal rounding: ask toFixed then
  if (Math.abs(m - n) > .499) n = Math.round(+Math.abs(x).toFixed(2) * 100)
  return x < 0 ? -n - 1 : n
}
const KEY_SPAN = 2 ** 26
/**
 * Sites merge when their positions agree to 2 dp, i.e. when `${x.toFixed(2)},${y.toFixed(2)}` matches.
 * This returns a number with exactly that equality (no string per site); far-off sites fall back to the string.
 */
function siteKey(x: number, y: number): number | string {
  const kx = hundredths(x), ky = hundredths(y)
  return Math.abs(kx) < KEY_SPAN && Math.abs(ky) < KEY_SPAN ? kx * (2 * KEY_SPAN) + ky : `${x.toFixed(2)},${y.toFixed(2)}`
}

function sampleLayersOnce(layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[] {
  const pitch = grid.pitch ?? theme.gridPx; const dots: DotInstance[] = []
  const base: Layer[] = [], lattices = new Map<string, Layer[]>(), sited: Layer[] = []
  for (const layer of layers) {
    if (layer.sites) { sited.push(layer); continue }
    if (factor(layer.lattice) === 1 && !layer.origin) { base.push(layer); continue }
    const key = `${factor(layer.lattice)}|${layer.origin ?? '0,0'}`
    const group = lattices.get(key)
    if (group) group.push(layer); else lattices.set(key, [layer])
  }
  const covered = lattices.size || sited.length ? scratch.covered(grid.cols * grid.rows) : null
  const groups = [...lattices.values()].sort((a, b) => factor(b[0].lattice) - factor(a[0].lattice))
  for (const group of groups) {
    const k = factor(group[0].lattice), [ox, oy] = group[0].origin ?? [0, 0], sub = latticeGrid(grid, k, [ox, oy])
    // only the cells the group's fields can light are composited and scanned (a caption's lattice spans the card)
    const win = unionWindow(group, sub.cols, sub.rows), [wc0, wr0, wc1, wr1] = win, width = wc1 - wc0 + 1
    const { best, owner } = composite(group, sub, win)
    for (let row = wr0; row <= wr1; row++) for (let col = wc0; col <= wc1; col++) {
      const j = (row - wr0) * width + (col - wc0), value = best[j]
      // a dot that quantizes to nothing is not drawn, so it must not punch a hole in the card either
      if (value <= 0 || shown(value, style) <= 0) continue
      emit(dots, value, toneColor(toneOf(group, owner[j]), value, theme), (ox + (col + .5) * k) * pitch, (oy + (row + .5) * k) * pitch, 1e6 + row * sub.cols + col, style, k)
      // card cells whose centre falls inside this lattice cell
      const c0 = Math.ceil(ox + col * k - .5), c1 = Math.ceil(ox + (col + 1) * k - .5), r0 = Math.ceil(oy + row * k - .5), r1 = Math.ceil(oy + (row + 1) * k - .5)
      for (let r = Math.max(0, r0); r < Math.min(grid.rows, r1); r++) for (let c = Math.max(0, c0); c < Math.min(grid.cols, c1); c++) covered![r * grid.cols + c] = 1
    }
  }
  // explicit sites: merge coincident sites, then emit and clear the card cells under each dot
  const sites = new Map<number | string, { x: number; y: number; k: number; value: number; tone?: Tone }>()
  for (const layer of sited) for (const [x, y] of layer.sites!) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const value = safe(layer.field(x / Math.max(1, grid.cols - 1), y / Math.max(1, grid.rows - 1)))
    if (shown(value, style) <= 0) continue
    const key = siteKey(x, y), prev = sites.get(key)
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
  const { best, owner } = composite(base, grid), background = style.opacityMode === 'constant'
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const i = row * grid.cols + col, value = best[i]
    // empty cells are invisible unless the style draws every dot (constant opacity); 0 always shows as 0
    if (covered?.[i] || ((value <= 0 || shown(value, style) <= 0) && !background)) continue
    emit(dots, value, toneColor(toneOf(base, owner[i]), value, theme), (col + .5) * pitch, (row + .5) * pitch, i, style)
  }
  return dots
}
