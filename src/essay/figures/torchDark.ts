/**
 * Signature moment 5, "Torch in the Dark": the level-03 corridor with the lights off. The pointer is a
 * point light held in the hall (inverse-square falloff over the corridor's own baked tones); dust motes
 * only exist where the torch reaches them. Without a pointer the torch drifts down the hall on its own.
 * Built on the real `level-03` preset: its layers are reused, only the corridor's field is relit.
 */
import type { Field, Layer } from '../../engine/types'
import { hash01 } from '../../engine/math'
import { level03 } from '../../widgets/boards/audio'
import { TILE, layer, layoutFor, type WidgetContext, type WidgetPreset } from '../../widgets/types'

const T = layoutFor(TILE), K = TILE.cols - 1
const REACH = 30
/** Torch position in card cells: the pointer, the keyboard-parked XY value, or a slow drift. */
function torchAt(ctx: WidgetContext): [number, number] {
  const p = ctx.pointers?.find(q => q.inside && !q.up)
  if (p) return [p.x, p.y]
  if (ctx.focus === 'tx') return [ctx.data.tx * K, (1 - ctx.data.ty) * K]
  const a = ctx.t * .35
  return [72 + 38 * Math.sin(a), 70 + 22 * Math.sin(a * 1.7)]
}
const lit = (d2: number) => 1 / (1 + d2 / (REACH * REACH))
/** Motes: 22 specks drifting on slow Lissajous paths, visible only inside the torch's pool. */
function motes(t: number, [x, y]: [number, number]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < 22; i++) {
    const mx = 10 + 124 * hash01(i, 3) + 6 * Math.sin(t * (.2 + .2 * hash01(i, 5)) + i)
    const my = 18 + 110 * hash01(i, 7) + 5 * Math.cos(t * (.15 + .2 * hash01(i, 9)) + i * 2)
    if ((mx - x) ** 2 + (my - y) ** 2 < (REACH * .9) ** 2) out.push([Math.round(mx), Math.round(my)])
  }
  return out
}

export const torchDark: WidgetPreset = {
  ...level03,
  id: 'essay-torch-dark', name: 'Torch in the Dark', animated: true,
  defaults: { tx: .5, ty: .5 },
  controls: [{ key: 'tx', keyY: 'ty', kind: 'xy', box: [0, 0, 144, 144], label: 'Torch position' }],
  layers: ctx => {
    const base = level03.layers(ctx), [x, y] = torchAt(ctx)
    const corridor = base[0].field
    const relit: Field = (u, v) => { const cx = u * K - x, cy = v * K - y; return Math.min(1, corridor(u, v) * (.05 + 1.25 * lit(cx * cx + cy * cy))) }
    relit.bounds = corridor.bounds
    const out: Layer[] = [{ ...base[0], field: relit }, ...base.slice(1)]
    const specks = motes(ctx.t, [x, y])
    if (specks.length) out.push(layer(T.dots(specks, .7), 'idle'))
    return out
  },
}
