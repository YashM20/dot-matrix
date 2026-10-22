/**
 * Board · IR — cards whose fields are Field IR (`dot`) source strings, compiled once by
 * `irProgram` and sampled through the normal Layer pipeline (lattice / sites like any other card).
 * The same sources emit GLSL via `emitGLSL` (the GPU path, P5).
 */
import type { Control } from '../../engine/context'
import { irProgram, type IRProgram } from '../../engine/ir'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle } as const
/** Footer baseline: program size, so the card says what it is made of. */
const FOOT = 134
/** `mode: 'function'` is faster and falls back to the CSP-safe closure tree on its own. */
const program = (src: string): IRProgram => irProgram(src, { mode: 'function' })
const footer = (src: string, p: IRProgram) => layer(T.text(`${new TextEncoder().encode(src).length} B  ${p.info.nodes} NODES`, 0, FOOT), 'idle')
const env = (ctx: WidgetContext) => ({ t: ctx.t, data: ctx.data })

// ── RIPPLE ── rings leave the centre on a 3× lattice and fade at the rim.
const RIPPLE_SRC = `// rings leave the centre and fade at the rim
let x = (u - .5) * 1.08; let y = v - .5;
let d = length(x, y);
let w = .5 + .5 * sin(d * 30 - t * 5);
w * smoothstep(.6, .04, d)`
const ripple = program(RIPPLE_SRC)
const RIPPLE_GRID = T.lattice(3, 0, 12)
export const irRipple: WidgetPreset = {
  id: 'ir-ripple', name: 'IR Ripple', label: 'IR  RIPPLE', ...tile, animated: true,
  layers: ctx => [
    layer(RIPPLE_GRID.at(RIPPLE_GRID.place(ripple(env(ctx)), 0, 0, 48, 40)), 'auto'),
    layer(T.dots([[71.5, 71.5]], 3), 'active'),
    footer(RIPPLE_SRC, ripple),
  ],
}

// ── PLASMA ── four interfering sines, banded by the quantize ladder.
const PLASMA_SRC = `// four interfering sines, folded into contour bands
let x = u * 7; let y = v * 6;
let s = sin(x + t) + sin(y * 1.3 - t * .7)
      + sin((x + y) * .7 + t * .5) + sin(length(x - 3.5, y - 3) * 1.8 - t);
.5 + .5 * sin(s * 1.6)`
const plasma = program(PLASMA_SRC)
const PLASMA_GRID = T.lattice(2, 0, 12)
export const irPlasma: WidgetPreset = {
  id: 'ir-plasma', name: 'IR Plasma', label: 'IR  PLASMA', ...tile, animated: true,
  layers: ctx => [
    layer(PLASMA_GRID.at(PLASMA_GRID.place(plasma(env(ctx)), 0, 0, 72, 59)), 'auto'),
    footer(PLASMA_SRC, plasma),
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
  id: 'ir-dial', name: 'IR Dial', label: 'IR  DIAL', ...tile,
  defaults: { value: .62 }, controls: dialControls,
  layers: ctx => {
    const ring = T.dotRing(C, C, R, { spacing: 4.6, size: 2 })
    return [
      layer(ring, 'faint'),
      layer({ ...ring, field: dial(env(ctx)) }, 'active'),
      layer(T.big(String(Math.round((ctx.data.value ?? 0) * 100)), C, 46, { lattice: 3, smooth: true, align: 'center' })),
      layer(T.text('DATA.VALUE', C, 96, { align: 'center' }), 'idle'),
      footer(DIAL_SRC, dial),
    ]
  },
}

export const irBoard = [irRipple, irPlasma, irDial]
