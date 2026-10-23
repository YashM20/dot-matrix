/**
 * Board · GPU — Field IR cards drawn by the WebGL2 renderer at a pitch only the GPU can hold: the IR is
 * evaluated per dot on the GPU (`gpuIR`), `density`× finer than the card's own lattice. Without WebGL2
 * (and in goldens, SVG export, describe) the same program is sampled on the CPU at the card pitch, so
 * the card still reads as itself, just coarser.
 */
import { irProgram } from '../../engine/ir'
import { gpuIR, type GPUField } from '../../engine/renderer/webgl'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
/** The IR window: full width, rows 10–129 (label above, footer below). */
const ORIGIN: [number, number] = [0, 10], ROWS = 120, FOOT = 134, SUB_ROWS = latticeGrid(TILE, 1, ORIGIN).rows

const kilo = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
/** One GPU field over the IR window, plus a footer naming the fine dot count. */
function gpuCard(src: string, density: number, tone: Tone, ctx: WidgetContext): Layer[] {
  const program = irProgram(src, { mode: 'function' })
  const ir = gpuIR(src, { t: ctx.t, data: ctx.data }, { density, program, bounds: [0, 0, TILE.cols - 1, ROWS - 1] })
  // zero below the window, so `bounds` stays a pure hint (the GPU pass only covers the bounds anyway)
  const field: GPUField = Object.assign((u: number, v: number) => (v * (SUB_ROWS - 1) <= ROWS - .5 ? ir(u, v) : 0), { bounds: ir.bounds, gpu: ir.gpu })
  const dots = Math.round(TILE.cols * density) * Math.round(ROWS * density)
  return [
    { field, lattice: 1, origin: ORIGIN, tone },
    layer(T.text(`${kilo(dots)} DOTS  ${program.info.nodes} NODES`, 0, FOOT), 'idle'),
  ]
}

// ── PLASMA ── half a million dots: four interfering sines folded into contour bands.
export const PLASMA_SRC = `// four interfering sines, folded into contour bands
let x = u * 9; let y = v * 7.5;
let s = sin(x + t * .6) + sin(y * 1.3 - t * .45)
      + sin((x + y) * .7 + t * .3) + sin(length(x - 4.5, y - 3.7) * 1.8 - t * .8);
.5 + .5 * sin(s * 1.9)`
export const gpuPlasma: WidgetPreset = {
  id: 'gpu-plasma', name: 'GPU Plasma', label: 'GPU  PLASMA', ...tile,
  layers: ctx => gpuCard(PLASMA_SRC, 5.42, 'auto', ctx),
}

// ── STARFIELD ── six depth shells of hashed stars flying at the eye; the board's one red is the live dot.
export const STARS_SRC = `// six depth shells of hashed stars flying at the eye
let x = (u - .5) * 1.2; let y = v - .5;
for i in 0..6 with s = 0 {
  let w = fract(i / 6 - t * .06);
  let px = x * 26 * w + i * 7.3; let py = y * 26 * w - i * 3.1;
  let cx = floor(px); let cy = floor(py);
  let h = hash(cx + i * 61, cy);
  let dx = px - cx - .2 - .6 * hash(cx, cy + i * 13);
  let dy = py - cy - .2 - .6 * hash(cy, cx - i * 7);
  let size = .05 + .22 * (1 - w);
  let lit = (h > .72) * (1 - smoothstep(size * .3, size, length(dx, dy)));
  max(s, lit * (1 - smoothstep(.75, 1, w)) * smoothstep(0, .08, w) * (.4 + .6 * h))
}`
export const gpuStarfield: WidgetPreset = {
  id: 'gpu-starfield', name: 'GPU Starfield', label: 'GPU  STARFIELD', live: true, ...tile,
  layers: ctx => gpuCard(STARS_SRC, 4, 'value', ctx),
}

// ── MOIRE ── a turning grating over rings: the beat pattern needs ~20 dots per line pair to exist.
export const MOIRE_SRC = `// a turning grating over drifting rings: the beat only exists at fine pitch
let x = u - .5; let y = (v - .5) * .83;
let a = t * .05;
let g1 = .5 + .5 * sin((x * cos(a) + y * sin(a)) * 220);
let g2 = .5 + .5 * sin(length(x - .1 * sin(t * .3), y) * 230);
g1 * g2`
export const gpuMoire: WidgetPreset = {
  id: 'gpu-moire', name: 'GPU Moire', label: 'GPU  MOIRE', ...tile,
  layers: ctx => gpuCard(MOIRE_SRC, 5, 'auto', ctx),
}

export const gpuBoard = [gpuPlasma, gpuStarfield, gpuMoire]
