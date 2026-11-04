/**
 * The checks a Studio / MAKE card needs beyond its field types (issue #143): grid size, controls and bindings
 * by the card spec's rules, sites layers that cannot place a flood of dots, spec layers through the spec layer
 * validator. Each returns a readable reason (without the `studio card:` prefix) or `undefined`. React-free;
 * `validateCard` (`./doc.ts`) calls them and `scripts/editor-imports.ts` checks them.
 */
import type { GridConfig } from '../../engine/types'
import { SPEC_LIMITS, type SpecIssue } from '../../spec/types'
import { validateSpecControl, validateSpecLayer } from '../../spec/validate'
import type { Binding, SitesLayer, SourceId, TextLayer } from './doc'

export const CARD_LIMITS = {
  /**
   * Pixels one frame covers at 100 %: cols × rows × pitch². The editor's own largest frame is 512 × 512 dots at
   * pitch 8 (4096 × 4096 px, 16.8 M); this is twice that, about 5800 px square.
   */
  framePx: 2 ** 25,
  controls: SPEC_LIMITS.controls,
  bindings: 64,
  /** Dots one sites layer may place (the spec's cap on a sites list). */
  sites: SPEC_LIMITS.points,
} as const
export const SOURCE_IDS = ['lfo', 'clock.sec', 'clock.min', 'pointer.x', 'pointer.y', 'weather.temp', 'github.today'] as const satisfies readonly SourceId[]

const big = (n: number) => Math.round(n).toLocaleString('en-US')
const finite = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi
const first = (errors: SpecIssue[]) => errors[0] && `${errors[0].path}: ${errors[0].message}`

/** A grid this card may have: whole cols and rows (1…512) at a pitch whose frame stays under `CARD_LIMITS.framePx`. */
export function gridIssue(g: GridConfig | undefined): string | undefined {
  if (!g || typeof g !== 'object') return 'grid missing'
  for (const k of ['cols', 'rows'] as const) if (!Number.isInteger(g[k]) || g[k] < 1 || g[k] > SPEC_LIMITS.grid) return `grid.${k} must be a whole number in 1..${SPEC_LIMITS.grid}`
  if (g.pitch !== undefined && !finite(g.pitch, .25, 32)) return 'grid.pitch must be a number in 0.25..32'
  const pitch = g.pitch ?? 4, px = g.cols * g.rows * pitch * pitch
  if (px > CARD_LIMITS.framePx) return `a ${g.cols} × ${g.rows} grid at pitch ${pitch} is ${big(g.cols * pitch)} × ${big(g.rows * pitch)} px, more than a frame may cover (${big(CARD_LIMITS.framePx)} px, cols × rows × pitch²)`
  return undefined
}

/** Controls by the spec rules (kinds, finite ranges, at most 64 options, capped strings), each box on the card. */
export function controlsIssue(controls: unknown, grid: GridConfig): string | undefined {
  if (!Array.isArray(controls) || controls.length > CARD_LIMITS.controls) return `controls must be an array of ≤ ${CARD_LIMITS.controls}`
  for (let i = 0; i < controls.length; i++) {
    const r = validateSpecControl(controls[i], grid, `controls[${i}]`)
    if (!r.ok) return first(r.errors)
  }
  return undefined
}

/** Bindings: a data key, a known kind (and source), finite min < max and a step above 0. */
export function bindingsIssue(bindings: unknown): string | undefined {
  if (!Array.isArray(bindings) || bindings.length > CARD_LIMITS.bindings) return `bindings must be an array of ≤ ${CARD_LIMITS.bindings}`
  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i] as Binding, w = `bindings[${i}]`
    if (!b || typeof b !== 'object') return `${w} must be an object`
    if (typeof b.key !== 'string' || !b.key.length || b.key.length > 64) return `${w}.key must be a string of 1..64 chars`
    if (b.kind !== 'slider' && b.kind !== 'source') return `${w}.kind must be slider or source`
    if (b.source !== undefined && !(SOURCE_IDS as readonly string[]).includes(b.source)) return `${w}.source must be one of ${SOURCE_IDS.join(', ')}`
    if (!finite(b.min, -1e12, 1e12) || !finite(b.max, -1e12, 1e12)) return `${w}.min and .max must be numbers in -1e12..1e12`
    if (!(b.min < b.max)) return `${w}.max must be more than min (${b.min})`
    if (!finite(b.step, 0, 1e12) || !(b.step > 0)) return `${w}.step must be a number above 0`
  }
  return undefined
}

/** A text layer's placement options (the rest is checked with the other layer fields). */
export function textIssue(l: TextLayer, w: string): string | undefined {
  const p = l.params
  if (!['left', 'center', 'right'].includes(p.align)) return `${w}.params.align must be left, center or right`
  if (!finite(p.scale, 1, 16)) return `${w}.params.scale must be a number in 1..16`
  if (typeof p.smooth !== 'boolean') return `${w}.params.smooth must be a boolean`
  return undefined
}

/** Dots a sites layer places (a disc: an upper bound), without placing them (the `layoutFor` ring / disc / line counts). */
export function siteCount(p: SitesLayer['params']): number {
  if (p.shape === 'ring') return Math.max(3, Math.round((2 * Math.PI * p.r) / p.spacing))
  if (p.shape === 'disc') return p.r < 0 ? 0 : Math.ceil(Math.PI * (p.r / p.spacing + 1) ** 2) // at most this many (lattice points in the disc)
  return Math.floor(Math.hypot(p.x1 - p.cx, p.y1 - p.cy) / p.spacing) + 1
}
/** A sites layer's geometry: finite numbers, a spacing that is not near 0, and at most `CARD_LIMITS.sites` dots. */
export function sitesIssue(l: SitesLayer, w: string): string | undefined {
  const p = l.params
  for (const k of ['cx', 'cy', 'r', 'x1', 'y1'] as const) if (!finite(p[k], -4096, 4096)) return `${w}.params.${k} must be a number in -4096..4096`
  if (!finite(p.spacing, .25, 512)) return `${w}.params.spacing must be a number in 0.25..512`
  for (const k of ['start', 'sweep'] as const) if (!finite(p[k], -64, 64)) return `${w}.params.${k} must be a number of radians in -64..64`
  const n = siteCount(p)
  if (n > CARD_LIMITS.sites) return `${w} would place ${big(n)} dots, more than ${big(CARD_LIMITS.sites)}`
  return undefined
}

/** A spec layer through the spec layer validator (structure, IR within its limits, asset sizes). */
export function specLayerIssue(spec: unknown, path: string): string | undefined {
  const r = validateSpecLayer(spec, path)
  return r.ok ? undefined : first(r.errors)
}
