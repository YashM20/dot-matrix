/**
 * Checks for the filtered fields (`src/engine/filter/`, #65, docs/IQ-PLAN.md IQ4). Node only, no browser.
 *  - The sampler's footprint: a `footprint` field gets one cell (du, dv) on base, lattice and site layers and in
 *    `sampleField`; every other field is still called with (u, v) alone, and a flagged field that ignores the
 *    footprint draws the same dots.
 *  - The shimmer gate: patterns just past the lattice's Nyquist limit, panned by sub-cell steps through the sampler
 *    on a coarse lattice; the frame-to-frame change in dot size (the shimmer) of each filtered version must be a
 *    fraction of the plain one's, with the same mean value.
 *  - The per-function checks in scripts/filter-units.ts, and the determinism lint on the module.
 * Exported as `filterChecks(assert)` (verify.ts, next to `sdfChecks`); also runnable alone: `npx tsx scripts/filter.ts`.
 */
import type { Assert } from './lib/check'
import { detLint } from './lib/detLint'
import { filterUnitChecks } from './filter-units'
import { sampleField, sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { dcos } from '../src/engine/noise/trig'
import { fbm2 } from '../src/engine/noise/gradient'
import { checkers, checkersTriangle, fcos, ffbm2, filteredCheckers, patternField, supersampled, withFootprint } from '../src/engine/filter'
import type { DotStyle, Field, GridConfig, Layer } from '../src/engine/types'

const STYLE: DotStyle = { shape: 'circle', sizeMin: 0, sizeMax: 1, quantizeSteps: 5, opacityMode: 'fromValue' }
const key = (d: { x: number; y: number; r: number; opacity: number; color: string }) => `${d.x},${d.y},${d.r},${d.opacity},${d.color}`

function samplerChecks(assert: Assert): void {
  const grid: GridConfig = { cols: 33, rows: 17 }
  // plain fields are still called with exactly (u, v), on every path
  let most = 0
  const plain: Field = function (this: unknown, u: number, v: number) { most = Math.max(most, arguments.length); return (u + v) / 2 }
  const lattice: Layer = { field: plain, lattice: 2 }, sites: Layer = { field: plain, sites: [[3, 4], [10.5, 6]], size: 2 }
  sampleLayers([{ field: plain }, lattice, sites], grid, STYLE, dot480); sampleField(plain, grid, STYLE, dot480)
  assert('filter sampler calls fields without `footprint` as f(u, v), on every path', most === 2, `max ${most} args`)
  // a footprint field gets one cell of the grid it is sampled on
  const seen = new Map<string, string>()
  const probe = (tag: string) => withFootprint((u, v, du, dv) => { seen.set(tag, `${+du.toFixed(9)},${+dv.toFixed(9)}`); return (u + v) / 2 })
  sampleLayers([{ field: probe('base') }, { field: probe('lattice'), lattice: [2, 4], origin: [1, 1] }, { field: probe('sites'), sites: [[3, 4]], size: 2 }], grid, STYLE, dot480)
  sampleField(probe('field'), grid, STYLE, dot480)
  const want = { base: `${+(1 / 32).toFixed(9)},${+(1 / 16).toFixed(9)}`, lattice: `${+(1 / 15).toFixed(9)},${+(1 / 3).toFixed(9)}`, sites: `${+(2 / 32).toFixed(9)},${+(2 / 16).toFixed(9)}`, field: `${+(1 / 32).toFixed(9)},${+(1 / 16).toFixed(9)}` }
  const bad = Object.entries(want).filter(([k, v]) => seen.get(k) !== v).map(([k, v]) => `${k} ${seen.get(k)} (want ${v})`)
  assert('filter sampler passes one cell (du, dv) to footprint fields: base, lattice, sites, sampleField', !bad.length, bad.join('; '))
  // a flagged field that ignores its footprint draws the same dots
  const f = (u: number, v: number) => .5 + .5 * dcos(u * 40 + v * 23)
  const layers = (g: (u: number, v: number) => number): Layer[] => [{ field: g }, { field: g, lattice: 3, tone: 'mid' }, { field: g, sites: [[5, 5], [20, 8]], size: 2, tone: 'active' }]
  const a = sampleLayers(layers(f), grid, STYLE, dot480).map(key).join('|')
  const c =sampleLayers(layers(withFootprint((u, v) => f(u, v))), grid, STYLE, dot480).map(key).join('|')
  assert('filter sampler: a footprint field that ignores the footprint draws the same dots', a === c)
}

/** One pan: a field per frame, sampled on a `k`-pitch lattice of a card; returns the dot sizes per lattice cell (0 = no dot). */
function pan(make: (t: number) => Field, frames: number, card: GridConfig, k: number): Float64Array[] {
  const out: Float64Array[] = [], cols = Math.floor(card.cols / k), rows = Math.floor(card.rows / k), pitch = dot480.gridPx
  for (let t = 0; t < frames; t++) {
    const r = new Float64Array(cols * rows)
    for (const d of sampleLayers([{ field: make(t), lattice: k }], card, STYLE, dot480)) {
      const c = Math.round(d.x / (pitch * k) - .5), w = Math.round(d.y / (pitch * k) - .5)
      r[w * cols + c] = d.r / k
    }
    out.push(r)
  }
  return out
}
/** Shimmer: mean |Δ dot size| between consecutive frames, as a fraction of a full dot. */
function shimmer(f: Float64Array[]): number {
  let s = 0, n = 0
  for (let t = 1; t < f.length; t++) for (let i = 0; i < f[t].length; i++) { s += Math.abs(f[t][i] - f[t - 1][i]); n++ }
  return s / n
}
/** Mean raw field value over the lattice cells and frames (unquantized: the tone the pattern averages to). */
function meanValue(make: (t: number) => Field, frames: number, cols: number, rows: number): number {
  let s = 0
  for (let t = 0; t < frames; t++) { const f = make(t); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) s += Math.max(0, Math.min(1, f(i / (cols - 1), j / (rows - 1), 1 / (cols - 1), 1 / (rows - 1)))) }
  return s / (frames * cols * rows)
}

export interface ShimmerRow { name: string; plain: number; filtered: { name: string; s: number; mean: number }[]; plainMean: number }

/** The shimmer gate's measurements: per pattern, the plain shimmer and mean, and each filtered version's. */
export function shimmerRows(): ShimmerRow[] {
  // a 96 × 96 card on a 4× lattice: 24 × 24 big dots; one frame pans 1/8 of a lattice cell across and 1/16 down
  const card: GridConfig = { cols: 96, rows: 96 }, k = 4, n = 24, frames = 48, sx = 1 / 8, sy = 1 / 16
  const rows: ShimmerRow[] = []
  // checkers with squares 0.85 lattice cells wide: period 1.7 cells, just past the 2-cell Nyquist period
  {
    const s = .85, span = (n - 1) / s, at = (t: number): [number, number] => [t * sx / s, t * sy / s]
    const plain = (t: number): Field => { const [ox, oy] = at(t); return (u, v) => checkers(ox + u * span, oy + v * span) }
    const box = (t: number) => patternField(filteredCheckers, span, span, ...at(t))
    const tri = (t: number) => patternField(checkersTriangle, span, span, ...at(t))
    const ss = (t: number) => supersampled(plain(t), 4 * (n - 1), 4)
    rows.push(row('checkers, squares 0.85 cells', plain, [['box', box], ['triangle', tri], ['supersampled 4×4', ss]], frames, card, k, n))
  }
  // stripes: a cosine with period 1.3 lattice cells, across a slant; its footprint in phase is the article's
  // fwidth, |∂phase/∂x| + |∂phase/∂y| over one cell
  {
    const p = 1.3, kx = Math.PI * 2 / p * (n - 1), ky = kx * .35
    const phase = (t: number, u: number, v: number) => kx * (u + t * sx / (n - 1)) + ky * (v + t * sy / (n - 1))
    const plain = (t: number): Field => (u, v) => .5 + .5 * dcos(phase(t, u, v))
    const filt = (t: number) => withFootprint((u, v, du, dv) => .5 + .5 * fcos(phase(t, u, v), kx * du + ky * dv))
    rows.push(row('stripes, period 1.3 cells', plain, [['fcos', filt]], frames, card, k, n))
  }
  // rough fbm (6 octaves, gain .7) at 0.55 noise cells per lattice cell: octave 1 and up alias
  {
    const z = .55 * (n - 1), o = { gain: .7 }, at = (t: number, u: number, v: number): [number, number] => [(u + t * sx / (n - 1)) * z, (v + t * sy / (n - 1)) * z]
    const plain = (t: number): Field => (u, v) => .5 + .5 * fbm2(...at(t, u, v), 6, 0, o)
    const filt = (t: number) => withFootprint((u, v, du, dv) => .5 + .5 * ffbm2(...at(t, u, v), Math.max(du, dv) * z, 6, 0, o))
    rows.push(row('fbm, 6 octaves, gain .7', plain, [['ffbm2', filt]], frames, card, k, n))
  }
  return rows
}
function row(name: string, plain: (t: number) => Field, filtered: [string, (t: number) => Field][], frames: number, card: GridConfig, k: number, n: number): ShimmerRow {
  return {
    name, plain: shimmer(pan(plain, frames, card, k)), plainMean: meanValue(plain, frames, n, n),
    filtered: filtered.map(([fn, make]) => ({ name: fn, s: shimmer(pan(make, frames, card, k)), mean: meanValue(make, frames, n, n) })),
  }
}

/** Filtered shimmer must be at most this fraction of the plain one, and the mean value within this of it. */
export const SHIMMER_RATIO = .4, MEAN_TOL = .02

export function filterChecks(assert: Assert): void {
  samplerChecks(assert)
  for (const r of shimmerRows()) for (const f of r.filtered) {
    assert(`filter shimmer: ${r.name}, ${f.name} ≤ ${SHIMMER_RATIO} × plain`, f.s <= SHIMMER_RATIO * r.plain, `${f.s.toFixed(4)} vs plain ${r.plain.toFixed(4)} (${(f.s / r.plain).toFixed(2)}×)`)
    assert(`filter shimmer: ${r.name}, ${f.name} keeps the mean value`, Math.abs(f.mean - r.plainMean) <= MEAN_TOL, `${f.mean.toFixed(4)} vs plain ${r.plainMean.toFixed(4)}`)
  }
  filterUnitChecks(assert)
  const lint = detLint(['src/engine/filter/'])
  assert('filter determinism lint: no engine-specific Math.* in src/engine/filter/', !lint.violations.length && lint.scanned.length > 0,
    lint.violations.length ? lint.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') : `${lint.scanned.length} files`)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('filter')
  filterChecks(assert)
  done('filter checks passed')
}
