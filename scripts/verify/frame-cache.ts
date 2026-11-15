/**
 * Frame cache checks for `pnpm verify` (frame budget, #269): the per-frame work a card keeps between frames gives the
 * values a cold frame gives. Goldens draw each card cold at fixed times, so a cache keyed too loosely would only show
 * in motion; these checks draw the motion.
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { forgetRays, renderScene, type Frame, type Scene } from '../../src/engine/sdf3d/render'
import { lookAt, normalize, type V3 } from '../../src/engine/sdf3d/march'
import { sdSphere } from '../../src/engine/sdf3d/prims'
import type { DotInstance } from '../../src/engine/types'
import { widgetById, withChrome, type WidgetPreset } from '../../src/widgets'
import { lift, surfaceSky } from '../../src/widgets/boards/levels'
import { theme } from '../lib/stats'
import type { Assert } from '../lib/check'

const dotsAt = (p: WidgetPreset, t: number): DotInstance[] => sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, theme)
const same = (a: DotInstance[], b: DotInstance[]) =>
  a.length === b.length && a.every((d, i) => Object.is(d.x, b[i].x) && Object.is(d.y, b[i].y) && Object.is(d.r, b[i].r) && Object.is(d.opacity, b[i].opacity) && d.color === b[i].color)

/**
 * A ball on a floor. The eye slides along z (its rays and floor hits stay), rises on odd frames (the floor's offset
 * changes, so they must not), and the sun turns near the view axis (the fog colour changes).
 */
const ballScene = (k: number): Scene => {
  const z = k * .37, y = 1 + (k % 2) * .3, a = k * .25
  return {
    sd: (x, yy, w) => sdSphere(x, yy - .5, w - z - 4, .5), box: [-.6, 0, z + 3.4, .6, 1.1, z + 4.6], planes: [[0, 1, 0, 0]],
    cam: lookAt([0, y, z], [0, y, z + 5], 1.8, 24), sun: normalize([Math.sin(a) * .5, .25, Math.cos(a)]) as V3, sunDisc: .995, tmax: 30,
    shadow: { w: .05, maxt: 8 }, occ: .2, fog: { b: .06, base: [.01, .012, .015], sun: [.2, .15, .1], height: [.02, 1] },
  }
}
const sameFrame = (a: Frame, b: Frame) => ['lum', 'mat', 't'].every(k => (a[k as 'lum'] as ArrayLike<number>).length === (b[k as 'lum'] as ArrayLike<number>).length && Array.from(a[k as 'lum']).every((v, i) => Object.is(v, b[k as 'lum'][i])))

export function frameCacheChecks(assert: Assert) {
  // the ray and glow tables themselves, on the raw frame (luma before any dot quantizing)
  {
    const ks = [0, 1, 2, 1, 5, 0, 3]
    const warm = ks.map(k => renderScene(ballScene(k), 32, 24))
    const cold = ks.map(k => { forgetRays(); return renderScene(ballScene(k), 32, 24) })
    const bad = ks.filter((_, i) => !sameFrame(warm[i], cold[i]))
    assert('frame cache: marched frames drawn in a row match cold frames (eye sliding and rising, sun turning)', !bad.length, `frames ${bad.join(', ')}`)
  }
  // scenes: the ray and glow tables (src/engine/sdf3d/render.ts) are kept across frames. POSTS walks (the camera slides
  // along the floor, its rays and plane hits stay), LATHE's sun circles (its glow changes, its rays stay)
  for (const id of ['sc-posts', 'sc-lathe', 'sc-chain']) {
    const p = widgetById(id)
    if (!p) { assert(`frame cache: ${id} exists`, false); continue }
    const ts = [0, .5, 1, 1 / 12, 2.75, .5]
    const warm = ts.map(t => dotsAt(p, t))
    const cold = ts.map(t => { forgetRays(); return dotsAt(p, t) })
    const bad = ts.filter((_, i) => !same(warm[i], cold[i]))
    assert(`frame cache: ${id} frames drawn in a row match cold frames`, !bad.length, `t = ${bad.join(', ')}`)
  }
  // lv-surface: the sky kept per (far, mid) shift is surfaceSky cell for cell
  {
    const p = widgetById('lv-surface')!, N = p.grid.cols - 1
    const bad: string[] = []
    for (const t of [0, .4, 3.3, 61.7]) {
      // layer 1 is the backdrop (stars, backdrop, ground, runner, label, score)
      const field = p.layers({ t, data: {} })[1].field, far = Math.floor(t * 2), mid = Math.floor(t * 6)
      for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) if (!Object.is(field(x / N, y / N), lift(surfaceSky(x, y, far, mid)))) bad.push(`t ${t} (${x}, ${y})`)
    }
    assert('frame cache: lv-surface sky table matches surfaceSky', !bad.length, bad.slice(0, 5).join(', '))
  }
}
