/**
 * Minimal JSON card spec (v0) for hosts that cannot ship code: IR layers on a grid. Turned into an ordinary
 * card preset, so it runs through the same `Field → Sampler → Renderer` pipeline as the library cards.
 * Superseded by the P6 card spec v1 once it lands; this shape stays accepted.
 */
import { irProgram } from '../../../src/engine/ir'
import type { DotStyle, GridConfig, Tone } from '../../../src/engine/types'
import type { Control } from '../../../src/engine/context'
import { baseStyle, type WidgetPreset } from '../../../src/widgets/types'

export interface DotSpecLayer {
  /** Field IR source (`u`, `v`, `t`, `data.*`), e.g. `"smoothstep(.5, .1, length(u - .5, v - .5))"`. */
  ir: string
  tone?: Tone
  /** Sample on a coarser lattice (bigger, sparser dots). */
  lattice?: number
}
export interface DotSpec {
  id?: string
  name?: string
  grid: GridConfig
  style?: Partial<DotStyle>
  layers: DotSpecLayer[]
  defaults?: Record<string, number>
  controls?: Control[]
  animated?: boolean
}

const MAX_LAYERS = 16

/** Validate a parsed JSON spec and build a preset from it. Throws (with a message) on a malformed spec or bad IR. */
export function presetFromSpec(spec: DotSpec): WidgetPreset {
  if (!spec || typeof spec !== 'object') throw new Error('dot spec: expected an object')
  const { grid } = spec
  if (!grid || !(grid.cols > 0 && grid.cols <= 512) || !(grid.rows > 0 && grid.rows <= 512)) throw new Error('dot spec: grid.cols / grid.rows must be 1..512')
  if (!Array.isArray(spec.layers) || !spec.layers.length || spec.layers.length > MAX_LAYERS) throw new Error(`dot spec: 1..${MAX_LAYERS} layers`)
  const programs = spec.layers.map(l => {
    if (typeof l?.ir !== 'string') throw new Error('dot spec: every layer needs an `ir` string')
    return { p: irProgram(l.ir), tone: l.tone ?? 'auto', lattice: l.lattice && l.lattice > 1 ? Math.floor(l.lattice) : undefined }
  })
  return {
    id: spec.id ?? 'spec', name: spec.name ?? 'Dot card', group: 'composite', chrome: 'dots',
    grid: { cols: Math.floor(grid.cols), rows: Math.floor(grid.rows), pitch: grid.pitch },
    style: { ...baseStyle, ...spec.style },
    defaults: spec.defaults, controls: spec.controls,
    animated: spec.animated ?? spec.layers.some(l => /\bt\b/.test(l.ir)),
    layers: ctx => programs.map(({ p, tone, lattice }) => ({ field: p({ t: ctx.t, data: ctx.data }), tone, lattice })),
  }
}
