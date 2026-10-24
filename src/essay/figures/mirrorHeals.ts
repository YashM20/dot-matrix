/**
 * Signature moment 2, "The Mirror that Heals": the mirror board's test portrait as a step-2 halftone.
 * Drag across it to scratch it; the scratch regrows from its edges inward (a cell heals faster the more
 * of its neighbours are whole), through a sparkling front of faint dots, back to the exact halftone.
 * The damage map is the one piece of state; it lives here because a figure owns it, not the engine.
 * (MASTER-PLAN §9 names an NCA spike or an RD fallback for the regrowth; this is the simplest RD-like
 * front: diffusion of "health" from intact cells.)
 */
import type { Field, Tone } from '../../engine/types'
import { hash01 } from '../../engine/math'
import { createRaster } from '../../engine/raster'
import { halftone } from '../../engine/halftone'
import { portrait } from '../../widgets/boards/mirror'
import { TILE, tileStyle, type WidgetContext, type WidgetPreset } from '../../widgets/types'

const W = TILE.cols, H = TILE.rows, TOP = 11
const photoStyle = { ...tileStyle, sizeMin: 0, sizeMax: 1.2, quantizeSteps: 0, opacityMode: 'fromValue' as const, sizeCurve: (v: number) => (v - .7) / .3 * .7 + .3 }
let still: Float32Array | undefined
const portraitDots = () => {
  if (still) return still
  const r = createRaster(TILE, 'card', [0, TOP, W - 1, H - 1])
  for (let y = TOP; y < H; y++) for (let x = 0; x < W; x++) r.data[y * W + x] = portrait(x, y)
  return (still = halftone(r, { step: 2, levels: 6 }).data)
}
const damage = new Float32Array(W * H)
let damaged = 0, lastT = -1, lastP: [number, number] | null = null

function stamp(x: number, y: number, radius = 3.2) {
  const r = Math.ceil(radius)
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const cx = Math.round(x + i), cy = Math.round(y + j)
    if (cx < 0 || cy < TOP || cx >= W || cy >= H || i * i + j * j > radius * radius) continue
    const k = cy * W + cx
    if (damage[k] === 0) damaged++
    damage[k] = 1
  }
}
function line(x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5))
  for (let s = 0; s <= n; s++) stamp(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n)
}
/** A keyboard / button scratch: three claw marks across the face. */
export function scratchMirror(seed = Date.now()) {
  const a = hash01(seed, 1) * 40 - 20
  for (let k = 0; k < 3; k++) line(30 + a + k * 12, 30, 100 + a + k * 12, 125)
}
export const mirrorDamage = () => damaged

function heal(dt: number) {
  if (!damaged) return
  let left = 0
  for (let y = TOP; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, d = damage[k]
    if (!d) continue
    const m = ((x > 0 ? damage[k - 1] : 0) + (x < W - 1 ? damage[k + 1] : 0) + (y > TOP ? damage[k - W] : 0) + (y < H - 1 ? damage[k + W] : 0)) / 4
    const nd = d - dt * (.06 + 1.9 * (1 - m) ** 2)
    damage[k] = nd > 0 ? nd : 0
    if (nd > 0) left++
  }
  damaged = left
}

export const mirrorHeals: WidgetPreset = {
  id: 'essay-mirror-heals', name: 'Mirror that Heals', label: 'MIRROR  SCRATCH ME', group: 'photo', chrome: 'dots', bleed: true, animated: true,
  grid: TILE, style: photoStyle,
  defaults: { sx: .5, sy: .5 },
  controls: [{ key: 'sx', keyY: 'sy', kind: 'xy', box: [0, TOP, W, H - TOP], label: 'Scratch the mirror' }],
  layers: (ctx: WidgetContext) => {
    const dt = lastT < 0 ? 0 : Math.max(0, Math.min(.25, ctx.t - lastT)); lastT = ctx.t
    const p = ctx.pointers?.find(q => q.down && q.inside)
    if (p) { if (lastP) line(lastP[0], lastP[1], p.x, p.y); else stamp(p.x, p.y); lastP = [p.x, p.y] } else lastP = null
    heal(dt)
    const dots = portraitDots(), sparkle = Math.floor(ctx.t * 8)
    const field: Field = (u, v) => {
      const c = Math.round(u * (W - 1)), r = Math.round(v * (H - 1)), k = r * W + c, q = dots[k]
      if (!q) return 0
      const d = damage[k]
      if (d >= .5) return 0
      // the regrowth front: a dot comes back as a faint speck first, flickering in as its cell heals
      if (d > .12) return hash01(k, sparkle) > d * 1.6 ? .7 : 0
      return .7 + .3 * q
    }
    field.bounds = [0, TOP, W - 1, H - 1]
    return [{ field, toneOf: (v: number, u: number, w: number): Tone => {
      const d = damage[Math.round(w * (H - 1)) * W + Math.round(u * (W - 1))]
      return d > .12 ? 'faint' : v < .79 ? 'faint' : v < .85 ? 'mid' : v < .91 ? 'idle' : 'value'
    } }]
  },
}
