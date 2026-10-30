/**
 * Board · POND — living scenes in glyph tiles (docs/living-matter/L-pond.md, docs/LIFE.md). L1: 01 KOI. L2: 02 JELLY,
 * 03 SLIME, 04 FIREFLIES, 05 MURMUR, 06 TERRARIUM. Every card is a `src/engine/life` scene on a physics world: a
 * pure function of t until touched, then live, healing back. L3: the koi read the light hub (tilt sloshes the water,
 * `lightSrc` 1 lights them by tilt), so the board lists `pondSources` in the manifest and the eager registry. Cards are main-thread only; the sampling worker's
 * build resolves this module to `./worker-stub.ts` (vite.config.ts `mainThreadOnly`), so `engine/life` never ships
 * in `sampleWorker-*.js`.
 */
import type { World } from '../../../engine/physics/world'
import { lightSource } from '../../../site/light'
import { sampleLayers } from '../../../engine/sampler/gridSampler'
import { dot480 } from '../../../engine/theme/tokens'
import type { WidgetPreset } from '../../types'
import { fireflies, pondFireflies } from './fireflies'
import { jelly, pondJelly } from './jelly'
import { koiPond, koiProbe, pondKoi } from './koi'
import { murmur, pondMurmur } from './murmur'
import { pondSlime, slime } from './slime'
import { pondTerrarium, terrarium } from './terrarium'

export const pondBoard: WidgetPreset[] = [pondKoi, pondJelly, pondSlime, pondFireflies, pondMurmur, pondTerrarium]
/** The board's live data: the light hub (L3.6; `pond-koi` declares its keys). */
export const pondSources = [lightSource]
/** The board's worlds (tests reset them), in card order. */
export const pondWorlds: World[] = [koiPond.world, jelly.world, slime.world, fireflies.world, murmur.world, terrarium.world]
/** Read-outs for tests and the browser probe. */
export const pondProbe = { koi: koiProbe, jelly, slime, fireflies, murmur, terrarium }

// the browser probe (scripts/life-browser.ts) sets __POND_PROBE__ before the page loads (see koi.ts)
const probing = (globalThis as { __POND_PROBE__?: boolean }).__POND_PROBE__ || (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search))
if (probing) {
  const byId = new Map(pondBoard.map((p, i) => [p.id, { preset: p, world: pondWorlds[i] }]))
  ;(globalThis as { __pondBoard?: unknown }).__pondBoard = {
    ids: () => pondBoard.map(p => p.id),
    mode: (id: string) => byId.get(id)?.world.mode,
    /** Median ms of `layers` + sample for `frames` pristine frames of card `id` (a fresh t range: each frame steps the world). */
    bench: (id: string, frames = 24) => {
      const c = byId.get(id)
      if (!c) return Infinity
      const ms: number[] = [], t0 = 200 + Math.random() * 10
      for (let i = 0; i < frames; i++) { const a = performance.now(); sampleLayers(c.preset.layers({ t: t0 + i / 30, data: {} }), c.preset.grid, c.preset.style, dot480); ms.push(performance.now() - a) }
      return ms.sort((a, b) => a - b)[frames >> 1]
    },
  }
}
