/**
 * Board · IR — cards whose fields are Field IR (`dot`) source strings, compiled once by
 * `irProgram` and sampled through the normal Layer pipeline (lattice / sites like any other card).
 * The same sources emit GLSL via `emitGLSL` (the GPU path, P5).
 */
import { TINY_PROGRAMS } from '../creditSources'
import type { Control } from '../../engine/context'
import { irProgram, type IRProgram } from '../../engine/ir'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import { circle, states, ui } from './components-kit'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle } as const
/** Footer baseline: program size, so the card says what it is made of. */
const FOOT = 134
/** `mode: 'function'` is faster in Node (scripts, parity tests); browsers always get the CSP-safe closure tree. */
const program = (src: string): IRProgram => irProgram(src, { mode: 'function' })
const footer = (src: string, p: IRProgram) => layer(T.text(`${new TextEncoder().encode(src).length} B  ${p.info.nodes} NODES`, 0, FOOT), 'idle')
const env = (ctx: WidgetContext) => ({ t: ctx.t, data: ctx.data })

// ── RIPPLE ── rings leave the centre on a 3× lattice and fade at the rim.
// x is scaled by the window's aspect (48 × 40 sites = 1.2) so the rings are round; the envelope keeps a floor of .45
// out to d ≈ .48 so the outer ring's crests stay `mid` (a `faint` ring vanishes on paper), then fades past the rim
const RIPPLE_SRC = `// rings leave the centre and fade at the rim
let x = (u - .5) * 1.2; let y = v - .5;
let d = length(x, y);
let w = .5 + .5 * sin(d * 30 - t * 5);
d < .026 ? 0 : w * max(smoothstep(.6, .04, d), .45 * smoothstep(.58, .48, d))`
const ripple = program(RIPPLE_SRC)
const RIPPLE_GRID = T.lattice(3, 0, 12)
export const irRipple: WidgetPreset = {
  id: 'ir-ripple', name: 'Ripple', label: 'RIPPLE', ...tile, animated: true,
  credit: TINY_PROGRAMS,
  // the red centre sits between four lattice sites (the ripple's own centre); the program leaves those four dark
  // (d < .026), so the red never lands half over a grey dot
  layers: ctx => [
    layer(RIPPLE_GRID.at(RIPPLE_GRID.place(ripple(env(ctx)), 0, 0, 48, 40)), 'auto'),
    layer(T.dots([[71.5, 71.5]], 3.6), 'active'),
    footer(RIPPLE_SRC, ripple),
  ],
}

// ── DIAL ── `data.value` drives an arc: the IR decides which ring sites are lit.
const DIAL_SRC = `// arc from 12 o'clock, clockwise to data.value
let a = fract(atan(u - .5, .5 - v) / TAU);
a < clamp(data.value, 0, 1) ? 1 : 0`
const dial = program(DIAL_SRC)
const C = 71.5, R = 50
const dialControls: Control[] = [{ key: 'value', kind: 'knob', box: [C - R, C - R, 2 * R, 2 * R], min: 0, max: 1, step: .01, label: 'Value' }]
export const irDial: WidgetPreset = {
  id: 'ir-dial', name: 'Dial', label: 'DIAL', ...tile,
  credit: TINY_PROGRAMS,
  defaults: { value: .62 }, controls: dialControls,
  layers: ctx => {
    const ring = T.dotRing(C, C, R, { spacing: 4.6, size: 2 })
    return [
      layer(ring, 'mid'),
      layer({ ...ring, field: dial(env(ctx)) }, 'active'),
      layer(T.big(String(Math.round((ctx.data.value ?? 0) * 100)), C, 46, { lattice: 3, smooth: true, align: 'center' })),
      layer(T.text('% FULL', C, 96, { align: 'center' }), 'idle'),
      footer(DIAL_SRC, dial),
      // the knob draws its own hover glow and focus ring (the CSS outline is off on card controls)
      ...states(ui(ctx, 'value'), ctx.t, circle(C, C, R + 2)),
    ]
  },
}

export const irBoard = [irRipple, irDial]
