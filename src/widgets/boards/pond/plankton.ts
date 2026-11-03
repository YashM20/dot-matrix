/**
 * 08 PLANKTON (docs/living-matter/X-advanced.md #4): Particle Lenia (Mordvintsev, Niklasson and Randazzo, 2022) in
 * a dish. Every dot is one particle sliding down an energy built from its neighbours; loose clumps pull themselves
 * into creatures that drift and glide, a stir near the loop's end shears them into arcs, and they gather again.
 * The faint dots under them are the Lenia density U, the body the particles make together. Each creature's nucleus
 * (the particle nearest its centre) is the accent. Tap to burst a creature and watch it re-form; drag to push the water.
 */
import { createPlankton, planktonUnits, type Plankton } from '../../../engine/life/plankton'
import { createDensityRaster, densityAt, planktonCreatures, planktonDensity } from '../../../engine/life/planktonView'
import { worldAt } from '../../../engine/physics/world'
import type { Field, Layer } from '../../../engine/types'
import { layer, type WidgetPreset } from '../../types'
import { caption, frameOf, mainThread, T, tile, touch } from './shared'

export const PLANKTON_DISH = { x: 72, y: 78, r: 62 }
export const plankton: Plankton = createPlankton({
  seed: 480, dish: PLANKTON_DISH,
  clumps: [{ n: 130, x: 50, y: 56, r: 12 }, { n: 100, x: 102, y: 72, r: 11 }, { n: 80, x: 62, y: 110, r: 10 }],
  period: 48, seam: 3, stir: 7,
})
const raster = createDensityRaster(73, 73, 2)
const D2 = (PLANKTON_DISH.r - 1) ** 2
const bodyField: Field = (u, v) => {
  const x = u * 143, y = v * 143, dx = x - PLANKTON_DISH.x, dy = y - PLANKTON_DISH.y
  if (dx * dx + dy * dy > D2) return 0
  const d = densityAt(raster, x, y) / .45
  return d < .18 ? 0 : Math.min(1, .25 + .55 * d)
}
const box: [number, number, number, number] = [8, 14, 136, 142]
bodyField.bounds = box

export const pondPlankton: WidgetPreset = {
  id: 'pond-plankton', name: 'Pond Plankton', label: '08  PLANKTON', ...tile, fps: 18, controls: touch('plankton', 'Burst a creature'),
  credit: { by: ['Alexander Mordvintsev', 'Eyvind Niklasson', 'Ettore Randazzo'], title: 'Particle Lenia and the energy-based formulation', source: 'https://google-research.github.io/self-organising-systems/particle-lenia/', note: 'technique' },
  layers: ctx => {
    mainThread()
    const s = worldAt(plankton.world, ctx.t, frameOf(ctx, 'plankton', planktonUnits)), { n, X, Y } = plankton.layout
    planktonDensity(plankton, s, raster)
    const creatures = planktonCreatures(plankton, s), nuclei = new Set(creatures.map(c => c.nucleus))
    const dots: [number, number][] = [], loose: [number, number][] = [], red: [number, number][] = []
    box[0] = box[1] = 144; box[2] = box[3] = 0
    for (let i = 0; i < n; i++) {
      const x = s[X + i] * 2, y = s[Y + i] * 2
      if (x < box[0]) box[0] = x; if (x > box[2]) box[2] = x; if (y < box[1]) box[1] = y; if (y > box[3]) box[3] = y
      if (nuclei.has(i)) red.push([x, y])
      else (densityAt(raster, x, y) > .3 ? dots : loose).push([x, y])
    }
    // the body reaches the kernel's ring past the outermost particles
    box[0] = Math.max(8, Math.floor(box[0] - 12)); box[1] = Math.max(14, Math.floor(box[1] - 12)); box[2] = Math.min(136, Math.ceil(box[2] + 12)); box[3] = Math.min(142, Math.ceil(box[3] + 12))
    const out: Layer[] = [
      caption(creatures.length === 1 ? '1 CREATURE' : `${creatures.length} CREATURES`),
      layer(T.dotRing(PLANKTON_DISH.x, PLANKTON_DISH.y, PLANKTON_DISH.r + 2, { spacing: 3.2, size: .8 }), 'faint'),
      layer(bodyField, 'faint'),
      layer(T.dots(loose, 1.2), 'idle'),
      layer(T.dots(dots, 1.3), 'value'),
    ]
    if (red.length) out.push(layer(T.dots(red, 1.8), 'active'))
    return out
  },
}
