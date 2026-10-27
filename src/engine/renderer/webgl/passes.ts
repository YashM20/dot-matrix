/**
 * GPU passes: layers the WebGL2 renderer draws as one instanced lattice (positions derived from the
 * instance index, value read from a texture) instead of a `DotInstance[]`.
 *
 * A pass comes from a layer whose field was tagged by `gpuIR` (value computed on the GPU from the
 * Field IR's `emitGLSL`) or `gpuValues` (value sampled on the CPU into a Float32 texture, no dot
 * objects). The tagged field is still an ordinary `Field` at the layer's own lattice, so the CPU
 * sampler, goldens, SVG export and the canvas fallback never see a difference; the GPU path samples
 * the same u/v mapping `density`× finer.
 */
import type { IREnv } from '../../ir'
import { latticeGrid, toneColor } from '../../sampler/gridSampler'
import type { DotInstance, DotStyle, Field, GridConfig, Layer, ThemeTokens, Tone } from '../../types'

export interface GPUTag {
  /** Fine dots per lattice cell along each axis (1 = the CPU sampler's own lattice). */
  density: number
  /** IR: GLSL ES 3.0 source of `float field(vec2 uv, float t, vec3 pointer, float data_…)` and its data keys. */
  ir?: { glsl: string; data: string[]; env: IREnv }
}
export type GPUField = Field & { gpu?: GPUTag }
export const gpuTag = (f: Field): GPUTag | undefined => (f as GPUField).gpu

// `gpuIR` (an IR program as a pass) lives in ./gpuIR.ts so the renderer has no static import of the IR core
/** A JS field sampled on the CPU straight into the value texture at `density`× (100k+ dots without dot objects). */
export function gpuValues(field: Field, opts: { density?: number } = {}): GPUField {
  const f: GPUField = (u, v) => field(u, v)
  if (field.bounds) f.bounds = field.bounds
  f.gpu = { density: opts.density ?? 1 }
  return f
}

/** One instanced lattice in card px. Fine dot (j, i): lattice coords c = ax + j·bx, r = ay + i·by. */
export interface GPUPass {
  cols: number; rows: number
  /** lattice coordinate mapping: c = map[0] + j·map[1], r = map[2] + i·map[3] */
  map: [number, number, number, number]
  /** u = c / den[0], v = r / den[1] (den 0 → 0.5, the sampler's one-cell rule) */
  den: [number, number]
  /** card px of lattice coord c: (origin + (c + .5)·k)·pitch */
  origin: [number, number]; k: number; pitch: number
  /** dot radius multiplier relative to a card dot (k / density) */
  sizeScale: number
  tone?: Tone
  toneOf?: Layer['toneOf']
  /** constant-opacity base layers also draw their empty cells */
  background: boolean
  style: DotStyle
  tag: GPUTag
  field: Field
}

const factor = (k: number | undefined) => (k !== undefined && Number.isFinite(k) && k > 0 ? k : 1)

/** The pass a tagged layer becomes, or null when the GPU path cannot reproduce it (sites, sizeCurve, jitter). */
export function layerPass(layer: Layer, grid: GridConfig, style: DotStyle, pitch: number): GPUPass | null {
  const tag = gpuTag(layer.field)
  if (!tag || layer.sites || style.sizeCurve || style.jitter || !(tag.density > 0)) return null
  if (tag.ir && layer.toneOf) return null
  const k = factor(layer.lattice), origin = layer.origin ?? [0, 0]
  const base = k === 1 && !layer.origin
  const sub = base ? { cols: grid.cols, rows: grid.rows } : latticeGrid(grid, k, origin)
  const b = layer.field.bounds
  const c0 = b ? Math.max(0, Math.floor(b[0])) : 0, r0 = b ? Math.max(0, Math.floor(b[1])) : 0
  const c1 = b ? Math.min(sub.cols - 1, Math.ceil(b[2])) : sub.cols - 1, r1 = b ? Math.min(sub.rows - 1, Math.ceil(b[3])) : sub.rows - 1
  if (c1 < c0 || r1 < r0) return null
  const nc = c1 - c0 + 1, nr = r1 - r0 + 1
  const cols = Math.max(1, Math.round(nc * tag.density)), rows = Math.max(1, Math.round(nr * tag.density))
  const bx = nc / cols, by = nr / rows
  return {
    cols, rows,
    map: [c0 - .5 + .5 * bx, bx, r0 - .5 + .5 * by, by],
    den: [sub.cols === 1 ? 0 : sub.cols - 1, sub.rows === 1 ? 0 : sub.rows - 1],
    origin: [origin[0], origin[1]], k, pitch,
    sizeScale: k * Math.min(bx, by),
    tone: layer.tone, toneOf: layer.toneOf,
    background: base && style.opacityMode === 'constant',
    style, tag, field: layer.field,
  }
}

/** Split a layer stack: tagged layers become GPU passes (drawn under the rest), the others stay CPU layers. */
export function splitGPULayers(layers: Layer[], grid: GridConfig, style: DotStyle, pitch: number): { cpu: Layer[]; passes: GPUPass[] } {
  const cpu: Layer[] = [], passes: GPUPass[] = []
  for (const l of layers) {
    const p = gpuTag(l.field) ? layerPass(l, grid, style, pitch) : null
    if (p) passes.push(p); else cpu.push(l)
  }
  return { cpu, passes }
}
/** True when any layer is tagged for the GPU (the renderer picks WebGL2 for such cards when it can). */
export const hasGPULayers = (layers: Layer[]) => layers.some(l => !!gpuTag(l.field))
/** Total dots the passes draw (instances, incl. empty cells). */
export const passDots = (passes: GPUPass[]) => passes.reduce((n, p) => n + p.cols * p.rows, 0)

/**
 * The dots a pass draws, computed on the CPU with the lattice vertex shader's formulas (u/v table,
 * clamp, quantize, size ramp, opacity, tone). The reference the shader is checked against (at density 1
 * it equals `sampleLayers` of the layer), and a way to export a GPU card at its full density.
 */
export function passToDots(p: GPUPass, theme: ThemeTokens): DotInstance[] {
  const out: DotInstance[] = [], s = p.style, steps = s.quantizeSteps ?? 0, [ax, bx, ay, by] = p.map, [dx, dy] = p.den
  for (let i = 0; i < p.rows; i++) {
    const r = ay + i * by, v = dy > 0 ? r / dy : .5
    for (let j = 0; j < p.cols; j++) {
      const c = ax + j * bx, u = dx > 0 ? c / dx : .5, raw = p.field(u, v)
      const value = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0
      const q = steps >= 2 ? Math.round(value * (steps - 1)) / (steps - 1) : value
      if ((value <= 0 || q <= 0) && !p.background) continue
      const tone = p.toneOf ? p.toneOf(value, u, v) : p.tone
      out.push({
        x: (p.origin[0] + (c + .5) * p.k) * p.pitch, y: (p.origin[1] + (r + .5) * p.k) * p.pitch,
        r: (s.sizeMin + (s.sizeMax - s.sizeMin) * q) * p.sizeScale, opacity: s.opacityMode === 'constant' ? 1 : q,
        color: toneColor(tone, value, theme), shape: s.shape, roundness: s.cornerRoundness,
      })
    }
  }
  return out
}
