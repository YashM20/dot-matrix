import type { Field, Layer, Tone } from '../types'
import { createRaster, sample, type Raster } from '../raster/raster'
import { cellU } from '../sampler/gridSampler'
import { bloom, illuminate, lambert, lightDir, type Light, type Vec3 } from './shade'
import type { NormalRaster } from './height'

/**
 * Materials as dot vocabularies (MASTER-PLAN P3): one height + normal raster and one light in,
 * `Layer[]` out. A material is not a shader that blends greys; it is a rule for which dots exist,
 * how many size steps they take and which tone carries them:
 *
 * - `matte`: Lambert, split into tone bands (faint → mid → idle);
 * - `gloss`: a dark lacquer body that leaves two quantize steps of headroom, and the Phong highlight
 *   exactly two size steps above it (one step on its rim), in `value`;
 * - `glass`: the layer behind, offset by the normal (whole cells, so it stays dot-aligned), a fresnel
 *   rim and a small highlight;
 * - `emissive`: the shape itself plus a `bloom` halo (`activeDim` by default) behind a one-dot moat;
 * - `metal`: hard environment stripes read off the reflection vector (no diffuse at all);
 * - `fabric`: Lambert ordered-dithered between adjacent size steps (a 4×4 Bayer weave).
 *
 * Every function is pure in its inputs (no clock, no randomness), so a given light gives the same dots.
 */

/** A tone band of one field: values in [lo, hi) are drawn in `tone`, others are 0 in that layer. */
export type ToneBand = readonly [lo: number, hi: number, tone: Tone]
/** Where the normals' grid sits on the card: a lattice layer's `lattice` / `origin` (default: card pitch). */
export interface Placement { lattice?: number; origin?: [number, number] }
export interface MaterialOptions extends Placement {
  /** Light added everywhere on the shape, 0..1. */
  ambient?: number
  /** The card style's `quantizeSteps` (default 5): one size step is 1 / (steps − 1). */
  steps?: number
}

/** Diffuse bands shared by the lit materials (void below .06, form in mid, the lit side in idle). */
export const MATTE_BANDS: readonly ToneBand[] = [[.06, .3, 'faint'], [.3, .62, 'mid'], [.62, 2, 'idle']]
/** Gloss body bands: the lacquer never climbs past mid, the highlight owns the top two steps. */
export const GLOSS_BANDS: readonly ToneBand[] = [[.06, .2, 'faint'], [.2, .38, 'mid'], [.38, 2, 'idle']]

/** A layer on `at`'s lattice (or the card pitch). */
export function placed(field: Field, tone: Tone, at: Placement = {}): Layer {
  const l: Layer = { field, tone }
  if (at.lattice !== undefined) l.lattice = at.lattice
  if (at.origin) l.origin = at.origin
  return l
}

/** One field split into tone layers by value (the bands never overlap, so no dot is drawn twice). */
export function toneBands(f: Field, bands: readonly ToneBand[], at: Placement = {}): Layer[] {
  return bands.map(([lo, hi, tone]) => {
    const g: Field = (u, v) => { const x = f(u, v); return x >= lo && x < hi ? x : 0 }
    g.bounds = f.bounds
    return placed(g, tone, at)
  })
}

const stepOf = (o: MaterialOptions) => 1 / Math.max(1, (o.steps ?? 5) - 1)
/** Grid cell under u/v (the sampler's centre mapping inverted), or −1 off the grid. */
function cellIndex(n: NormalRaster, u: number, v: number): number {
  const { cols, rows } = n.grid, c = Math.round(u * (cols - 1)), r = Math.round(v * (rows - 1))
  return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c
}
/** A per-cell function over the normals' bounds, as a field (one pass per call, no per-sample math). */
function perCell(n: NormalRaster, fn: (i: number, c: number, r: number) => number): Field {
  const out = createRaster(n.grid, n.space, n.bounds), cols = n.grid.cols, b = n.bounds ?? [0, 0, cols - 1, n.grid.rows - 1]
  for (let r = b[1]; r <= b[3]; r++) for (let c = b[0]; c <= b[2]; c++) { const i = r * cols + c; if (n.mask[i] > 0) out.data[i] = fn(i, c, r) }
  return sample(out)
}

// ── matte ───────────────────────────────────────────────────────────────────
/** Lambert in tone bands: the shadow side drops to faint, the lit side climbs to idle. */
export function matte(n: NormalRaster, light: Light, o: MaterialOptions & { bands?: readonly ToneBand[] } = {}): Layer[] {
  return toneBands(lambert(n, light, { ambient: o.ambient ?? .06 }), o.bands ?? MATTE_BANDS, o)
}

// ── gloss ───────────────────────────────────────────────────────────────────
export interface GlossOptions extends MaterialOptions {
  shininess?: number
  /** Specular level where the highlight starts (one step up) and where it reaches two steps. */
  rim?: number; core?: number
}
/**
 * Gloss: a lacquer body (Lambert scaled to 1 − 2 steps, so it never clips) and the highlight as whole
 * size steps on top of it, +1 step on its rim, +2 at its core. `{ body, highlight, layers }`.
 */
export function gloss(n: NormalRaster, light: Light, o: GlossOptions = {}): { body: Field; highlight: Field; layers: Layer[] } {
  const s = stepOf(o), head = 1 - 2 * s, rim = o.rim ?? .15, core = o.core ?? .5
  const { diffuse, specular } = illuminate(n, light, { ambient: o.ambient ?? .06, shininess: o.shininess ?? 32 })
  const body: Field = (u, v) => diffuse(u, v) * head
  body.bounds = diffuse.bounds
  const highlight: Field = (u, v) => {
    const p = specular(u, v)
    return p < rim ? 0 : Math.min(1, body(u, v) + (p >= core ? 2 : 1) * s)
  }
  highlight.bounds = specular.bounds
  // the body under the highlight is replaced by it, not doubled
  const under: Field = (u, v) => (specular(u, v) >= rim ? 0 : body(u, v))
  under.bounds = body.bounds
  return { body, highlight, layers: [...toneBands(under, GLOSS_BANDS, o), placed(highlight, 'value', o)] }
}

// ── glass ───────────────────────────────────────────────────────────────────
export interface GlassOptions extends MaterialOptions {
  /** Refraction offset at a grazing normal, in cells (default 6). */
  strength?: number
  /** Tones: the scene outside the glass, the scene seen through it, the fresnel rim. */
  behindTone?: Tone; throughTone?: Tone; rimTone?: Tone
  /** n.z below which a dot belongs to the rim (default .5). */
  rimAt?: number
  shininess?: number
}
const offsets = new WeakMap<NormalRaster, Map<number, Int16Array>>()
/** Whole-cell refraction offsets per cell (x, y interleaved), cached per normals and strength. */
function refractOffsets(n: NormalRaster, k: number): Int16Array {
  let per = offsets.get(n); if (!per) offsets.set(n, (per = new Map()))
  let d = per.get(k)
  if (!d) {
    d = new Int16Array(n.x.length * 2)
    for (let i = 0; i < n.x.length; i++) if (n.mask[i] > 0) { d[2 * i] = Math.round(k * n.x[i]); d[2 * i + 1] = Math.round(k * n.y[i]) }
    per.set(k, d)
  }
  return d
}
/**
 * Glass over `behind` (a field on the normals' grid): outside the shape `behind` as is; inside it,
 * `behind` read one whole-cell offset toward the centre (a convex lens magnifies), a fresnel rim
 * where the surface turns away and the Phong highlight in `value`.
 */
export function glass(n: NormalRaster, light: Light, behind: Field, o: GlassOptions = {}): { through: Field; layers: Layer[] } {
  const { cols, rows } = n.grid, d = refractOffsets(n, o.strength ?? 6), M = n.mask, rimAt = o.rimAt ?? .5
  const inside = (i: number) => i >= 0 && M[i] >= .5
  const outside: Field = (u, v) => (inside(cellIndex(n, u, v)) ? 0 : behind(u, v))
  outside.bounds = behind.bounds
  const through: Field = (u, v) => {
    const i = cellIndex(n, u, v)
    if (!inside(i) || n.z[i] < rimAt) return 0
    const c = (i % cols) - d[2 * i], r = Math.floor(i / cols) - d[2 * i + 1]
    return behind(cellU(Math.min(cols - 1, Math.max(0, c)), cols), cellU(Math.min(rows - 1, Math.max(0, r)), rows))
  }
  through.bounds = n.bounds
  const { specular } = illuminate(n, light, { shininess: o.shininess ?? 60 })
  // the rim: one band of dots where the surface turns away, a step brighter toward the light
  const rimF = perCell(n, i => (M[i] >= .5 && n.z[i] < rimAt ? .5 : 0))
  const spec: Field = (u, v) => { const p = specular(u, v); return p < .3 ? 0 : 1 }
  spec.bounds = specular.bounds
  const rimOnly: Field = (u, v) => (spec(u, v) ? 0 : rimF(u, v))
  rimOnly.bounds = rimF.bounds
  return {
    through,
    layers: [placed(outside, o.behindTone ?? 'faint', o), placed(through, o.throughTone ?? 'idle', o), placed(rimOnly, o.rimTone ?? 'mid', o), placed(spec, 'value', o)],
  }
}

// ── emissive ────────────────────────────────────────────────────────────────
export interface EmissiveOptions extends Placement {
  /** Bloom radius (cells of the source raster's grid), moat width, and the halo's tail lift (exponent < 1 lifts). */
  radius?: number; gap?: number; lift?: number
  /** Tones of the shape and its halo (default `active` / `activeDim`); `haloBands` splits the halo instead. */
  coreTone?: Tone; haloTone?: Tone; haloBands?: readonly ToneBand[]
}
const halos = new WeakMap<Raster, Map<string, Field>>()
/**
 * Emissive: the shape is the light. `source` (a raster of the shape, ≥ .5 = lit) is drawn as is,
 * its bloom halo (cached per source and options) around it with a `gap`-dot moat between the two.
 * Ignores the scene light. `{ core, halo, layers }`.
 */
export function emissive(source: Raster, o: EmissiveOptions = {}): { core: Field; halo: Field; layers: Layer[] } {
  const radius = o.radius ?? 4.5, gap = o.gap ?? 1, lift = o.lift ?? 1, key = `${radius}|${gap}|${lift}`
  let per = halos.get(source); if (!per) halos.set(source, (per = new Map()))
  let halo = per.get(key)
  if (!halo) {
    const g = bloom(source, radius, { strength: 1, gap })
    if (lift !== 1) for (let i = 0; i < g.data.length; i++) g.data[i] = g.data[i] ** lift
    per.set(key, (halo = sample(g)))
  }
  const core = sample(source)
  const haloLayers = o.haloBands ? toneBands(halo, o.haloBands, o) : [placed(halo, o.haloTone ?? 'activeDim', o)]
  return { core, halo, layers: [...haloLayers, placed(core, o.coreTone ?? 'active', o)] }
}

// ── metal ───────────────────────────────────────────────────────────────────
/**
 * The chrome-ball environment, read off the normal: d = n·up − horizon, where `up` is screen up leaning
 * a third toward the light and the horizon (`horizon` at the centre) bends down by `bend` toward the
 * rim, like a horizon wrapped around a ball. `stops` are (lo, value) over d: sky, a bright glow strip, a
 * black horizon line, ground, a lit floor at the bottom rim. Hard steps only: chrome is stripes, never a ramp.
 */
export interface Studio { horizon: number; bend: number; stops: readonly (readonly [number, number])[] }
export const STUDIO: Studio = { horizon: -.08, bend: .35, stops: [[.6, .5], [.2, .75], [.07, 1], [-.12, 0], [-.5, .5], [-.6, 0], [-2, .25]] }
export interface MetalOptions extends MaterialOptions {
  studio?: Studio; bands?: readonly ToneBand[]
  /** R·L above which the light itself is reflected (a full `value` dot; default .96). */
  sun?: number
}
export const METAL_BANDS: readonly ToneBand[] = [[.06, .3, 'faint'], [.3, .62, 'mid'], [.62, .9, 'idle'], [.9, 2, 'value']]
/** Metal: no diffuse, only the studio stripes (`STUDIO`) and the light's own reflection (R·L ≥ `sun`). */
export function metal(n: NormalRaster, light: Light, o: MetalOptions = {}): { env: Field; layers: Layer[] } {
  const L = towardLight(n, light), { horizon, bend, stops } = o.studio ?? STUDIO, sun = o.sun ?? .96
  const lx = L[0] / 3, ly = L[1] / 3 - 1, h = Math.hypot(lx, ly), ax = lx / h, ay = ly / h
  const env = perCell(n, i => {
    const nx = n.x[i], ny = n.y[i], nz = n.z[i], k = 2 * nz, edge = Math.min(1, n.mask[i] * 2)
    if (k * nx * L[0] + k * ny * L[1] + (k * nz - 1) * L[2] >= sun) return edge
    const d = nx * ax + ny * ay - (horizon - bend * (1 - nz))
    for (const [lo, val] of stops) if (d >= lo) return val * edge
    return 0
  })
  return { env, layers: toneBands(env, o.bands ?? METAL_BANDS, o) }
}
/** A unit vector toward the light (a point light: from the centre of the normals' bounds). */
function towardLight(n: NormalRaster, light: Light): Vec3 {
  let v: Vec3
  if (Array.isArray(light)) v = light as Vec3
  else {
    const b = n.bounds ?? [0, 0, n.grid.cols - 1, n.grid.rows - 1], at = (light as { at: Vec3 }).at
    v = [at[0] - (b[0] + b[2]) / 2, at[1] - (b[1] + b[3]) / 2, at[2]]
  }
  const k = 1 / (Math.hypot(v[0], v[1], v[2]) || 1)
  return [v[0] * k, v[1] * k, v[2] * k]
}

// ── fabric ──────────────────────────────────────────────────────────────────
/** 4×4 Bayer thresholds, (i + .5) / 16. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(x => (x + .5) / 16)
export const bayer4 = (c: number, r: number) => BAYER4[((r & 3) << 2) | (c & 3)]
export interface FabricOptions extends MaterialOptions {
  /** Highest size step the cloth reaches (default 3 of 4: cloth never shines). */
  top?: number
  /** Tone per size step (default: step 1 faint, 2 mid, 3+ idle), so the weave alternates tone as well as size. */
  bands?: readonly ToneBand[]
}
export const FABRIC_BANDS: readonly ToneBand[] = [[.1, .3, 'faint'], [.3, .6, 'mid'], [.6, 2, 'idle']]
/**
 * Fabric: Lambert ordered-dithered between adjacent size steps on a 4×4 Bayer matrix, so every dot
 * sits exactly on a quantize step and the weave shows on lit and shadow sides alike. Deterministic:
 * the threshold depends only on the integer cell.
 */
export function fabric(n: NormalRaster, light: Light, o: FabricOptions = {}): { cloth: Field; layers: Layer[] } {
  const s = stepOf(o), top = o.top ?? 3, dif = createRaster(n.grid, n.space, n.bounds)
  lambert(n, light, { ambient: o.ambient ?? .1, into: dif })
  const cloth = perCell(n, (i, c, r) => {
    const x = dif.data[i] * top, lo = Math.floor(x)
    return Math.min(top, lo + (x - lo > bayer4(c, r) ? 1 : 0)) * s
  })
  return { cloth, layers: toneBands(cloth, o.bands ?? FABRIC_BANDS, o) }
}

// ── board-wide light ────────────────────────────────────────────────────────
/**
 * The light of the hour (24 h clock, fractional): the sun rises on the left at 6, stands high
 * at noon and sets on the right at 18; at night the moon walks the same arc, lower. Every card on a
 * board reads the same hour, so a whole board is lit from one side. Pure: same hour, same light.
 */
export function sunAt(hour: number): Vec3 {
  const h = ((hour % 24) + 24) % 24, day = h >= 6 && h < 18, p = ((day ? h - 6 : (h + 6) % 24) / 12)
  const azimuth = -Math.PI / 2 + Math.PI * p, elevation = (day ? 12 + 40 * Math.sin(Math.PI * p) : 10 + 22 * Math.sin(Math.PI * p)) * Math.PI / 180
  return lightDir(azimuth, elevation)
}
/** The fractional hour of a date (local time), for `sunAt`. */
export const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
