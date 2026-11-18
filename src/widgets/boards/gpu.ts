/**
 * Board · GPU — Field IR cards drawn by the WebGL2 renderer at a pitch only the GPU can hold: the IR is
 * evaluated per dot on the GPU (`gpuIR`), `density`× finer than the card's own lattice. Without WebGL2
 * (and in goldens, SVG export, describe) the same program is sampled on the CPU at the card pitch, so
 * the card still reads as itself, just coarser. Still frames (reduced motion) and OG images draw the passes too.
 */
import { irProgram } from '../../engine/ir'
import { irMath } from '../../engine/ir/runtime'
import { smoothstep } from '../../engine/math'
import { gpuIR, layerPass, type GPUField } from '../../engine/renderer/webgl'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Field, Layer, Tone } from '../../engine/types'
import { TINY_PROGRAMS } from '../creditSources'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true, credit: TINY_PROGRAMS } as const
/** The IR window: full width, rows 10–129 (label above, footer below). */
const ORIGIN: [number, number] = [0, 10], ROWS = 120, FOOT = 134, SUB_ROWS = latticeGrid(TILE, 1, ORIGIN).rows

export const kilo = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))
/** The dots a GPU layer draws: its pass's instances, from the same `layerPass` the WebGL2 renderer runs (#241). */
export const fineDots = (l: Layer) => { const p = layerPass(l, TILE, tileStyle, TILE.pitch ?? 2.25); return p ? p.cols * p.rows : 0 }
const counted = new Map<string, number>()
/** One GPU field over the IR window, plus a footer naming the dots it draws and the program's size. */
function gpuCard(src: string, density: number, tone: Tone, ctx: WidgetContext, extra: Layer[] = []): Layer[] {
  const program = irProgram(src, { mode: 'function' })
  const ir = gpuIR(src, { t: ctx.t, data: ctx.data }, { density, program, bounds: [0, 0, TILE.cols - 1, ROWS - 1] })
  // zero below the window, so `bounds` stays a pure hint (the GPU pass only covers the bounds anyway)
  const field: GPUField = Object.assign((u: number, v: number) => (v * (SUB_ROWS - 1) <= ROWS - .5 ? ir(u, v) : 0), { bounds: ir.bounds, gpu: ir.gpu })
  const gpu: Layer = { field, lattice: 1, origin: ORIGIN, tone }
  let dots = counted.get(src)
  if (dots === undefined) counted.set(src, (dots = fineDots(gpu)))
  return [gpu, ...extra, layer(T.text(`${kilo(dots)} DOTS  ${program.info.nodes} NODES`, 0, FOOT), 'idle')]
}

// ── PLASMA ── half a million dots: four interfering sines folded into contour bands.
export const PLASMA_SRC = `// four interfering sines, folded into contour bands
let x = u * 9; let y = v * 7.5;
let s = sin(x + t * .6) + sin(y * 1.3 - t * .45)
      + sin((x + y) * .7 + t * .3) + sin(length(x - 4.5, y - 3.7) * 1.8 - t * .8);
.5 + .5 * sin(s * 1.9)`
export const gpuPlasma: WidgetPreset = {
  id: 'gpu-plasma', name: 'Plasma', label: 'PLASMA', ...tile,
  layers: ctx => gpuCard(PLASMA_SRC, 5.42, 'auto', ctx),
}

// ── STARFIELD ── six depth shells of hashed stars flying at the eye; the board's one red is the live dot.
// One star unit is 120 cells on both axes (round stars), centred on the window. A shell at depth w scales the hash grid by
// 26·w, so a star's radius is S(w)·120 / (26·w) cells. Far shells (w > NEAR) stay in the IR, clamped to one dot; near
// shells are single dot sites, as big as the star (AGENTS.md: bigger elements are sites, never clusters of small dots).
const CX = (TILE.cols - 1) / 2, CY = (ROWS - 1) / 2, UNIT = 120, NEAR = .5, LIT = .66
export const STARS_SRC = `// six depth shells of hashed stars flying at the eye: far stars here, near ones are sites
let x = (u * ${TILE.cols - 1} - ${CX}) / ${UNIT}; let y = (v * ${SUB_ROWS - 1} - ${CY}) / ${UNIT};
for i in 0..6 with s = 0 {
  let w = fract(i / 6 - t * .06);
  let px = x * 26 * w + i * 7.3; let py = y * 26 * w - i * 3.1;
  let cx = floor(px); let cy = floor(py);
  let h = hash(cx + i * 61, cy) * step(${NEAR}, w);
  let size = min(.05 + .22 * (1 - w), w * .13);
  max(s, h > ${LIT} ? (1 - smoothstep(size * .3, size, length(px - cx - .2 - .6 * hash(cx, cy + i * 13), py - cy - .2 - .6 * hash(cy, cx - i * 7))))
    * (1 - smoothstep(.75, 1, w)) * (1 - .35 * smoothstep(.2, 1, w)) * (.4 + .6 * h) : 0)
}`
/** Near-star dot sizes (card dots); a star takes the nearest. */
const STAR_SIZES = [1.5, 2, 2.5, 3, 4, 5]
/** The near shells' stars as dot sites, one layer per size: the same hash grid as the IR, so a star goes on from IR to site. */
export function nearStars(t: number): Layer[] {
  const hash = irMath.hash, bins = STAR_SIZES.map(() => ({ sites: [] as [number, number][], values: [] as number[] }))
  for (let i = 0; i < 6; i++) {
    const w = ((i / 6 - t * .06) % 1 + 1) % 1, s = 26 * w
    if (w >= NEAR || w <= .005) continue
    const r = (.05 + .22 * (1 - w)) * UNIT / s, k = STAR_SIZES.reduce((a, b) => (Math.abs(b - r * 1.15) < Math.abs(a - r * 1.15) ? b : a))
    // nearer is brighter (the IR's far shells dim the same way), and the nearest fade in their last 8% of depth
    const bin = bins[STAR_SIZES.indexOf(k)], fade = Math.min(1, w / .08) * (1 - .35 * smoothstep(.2, 1, w))
    for (let cy = Math.floor(-CY / UNIT * s - i * 3.1); cy <= Math.floor(CY / UNIT * s - i * 3.1); cy++)
      for (let cx = Math.floor(-CX / UNIT * s + i * 7.3); cx <= Math.floor(CX / UNIT * s + i * 7.3); cx++) {
        const h = hash(cx + i * 61, cy)
        if (h <= LIT) continue
        const x = CX + (cx + .2 + .6 * hash(cx, cy + i * 13) - i * 7.3) / s * UNIT, y = CY + (cy + .2 + .6 * hash(cy, cx - i * 7) + i * 3.1) / s * UNIT
        // the whole dot stays inside the window: it shrinks and dims over its last two cells before an edge
        const room = Math.min(x, TILE.cols - 1 - x, y, ROWS - 1 - y) - k / 2
        const value = fade * (.4 + .6 * h) * Math.min(1, room / 2)
        // sites sit on a 1/100-cell grid, so the field finds each one again from its u/v
        if (value > 0) { bin.sites.push([Math.round(x * 100) / 100, Math.round((y + ORIGIN[1]) * 100) / 100]); bin.values.push(value) }
      }
  }
  const key = (x: number, y: number) => Math.round(x * 100) * 1e6 + Math.round(y * 100)
  return bins.flatMap((b, j) => {
    if (!b.sites.length) return []
    const at = new Map(b.sites.map(([x, y], n) => [key(x, y), b.values[n]]))
    const field: Field = (u, v) => at.get(key(u * (TILE.cols - 1), v * (TILE.rows - 1))) ?? 0
    return [{ field, sites: b.sites, size: STAR_SIZES[j], tone: 'value' as const }]
  })
}
export const gpuStarfield: WidgetPreset = {
  id: 'gpu-starfield', name: 'Starfield', label: 'STARFIELD', live: true, ...tile,
  layers: ctx => gpuCard(STARS_SRC, 4, 'value', ctx, nearStars(ctx.t)),
}

// ── MOIRE ── a turning grating over rings: the beat pattern needs ~20 dots per line pair to exist.
export const MOIRE_SRC = `// a turning grating over drifting rings: the beat only exists at fine pitch
let x = u - .5; let y = (v - .5) * .83;
let a = t * .05;
let g1 = .5 + .5 * sin((x * cos(a) + y * sin(a)) * 220);
let g2 = .5 + .5 * sin(length(x - .1 * sin(t * .3), y) * 230);
g1 * g2`
export const gpuMoire: WidgetPreset = {
  id: 'gpu-moire', name: 'Moire', label: 'MOIRE', ...tile,
  layers: ctx => gpuCard(MOIRE_SRC, 5, 'auto', ctx),
}

export const gpuBoard = [gpuPlasma, gpuStarfield, gpuMoire]
