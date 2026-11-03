/**
 * Board · POND — living scenes in glyph tiles (docs/living-matter/L-pond.md, docs/LIFE.md). L1: 01 KOI. L2: 02 JELLY,
 * 03 SLIME, 04 FIREFLIES, 05 MURMUR, 06 TERRARIUM. Every card is a `src/engine/life` scene on a physics world: a
 * pure function of t until touched, then live, healing back. L3: the koi read the light hub (tilt sloshes the water,
 * `lightSrc` 1 lights them by tilt), so the board lists `pondSources` in the manifest and the eager registry. Cards are main-thread only; the sampling worker's
 * build resolves this module to `./worker-stub.ts` (vite.config.ts `mainThreadOnly`), so `engine/life` never ships
 * in `sampleWorker-*.js`. X1: 07 MARBLE (suminagashi) and the day source (`day.ts`: `?day=`, the opt-in ageing pond).
 * X-advanced #4: 08 PLANKTON (Particle Lenia creatures as dot sites).
 */
import type { World } from '../../../engine/physics/world'
import { lightSource } from '../../../site/light'
import { sampleLayers } from '../../../engine/sampler/gridSampler'
import { simAtStep } from '../../../engine/sim'
import { dot480 } from '../../../engine/theme/tokens'
import type { WidgetPreset } from '../../types'
import { fireflies, pondFireflies } from './fireflies'
import { jelly, pondJelly } from './jelly'
import { koiPond, koiProbe, pondKoi, stateHash } from './koi'
import { marbleNow, marbleProbe, pondMarble } from './marble'
import { pondDaySource } from './day'
import { plankton, pondPlankton } from './plankton'
import { murmur, pondMurmur } from './murmur'
import { pondSlime, slime } from './slime'
import { pondTerrarium, terrarium } from './terrarium'

export const pondBoard: WidgetPreset[] = [pondKoi, pondJelly, pondSlime, pondFireflies, pondMurmur, pondTerrarium, pondMarble, pondPlankton]
/** The board's live data: the light hub (L3.6; `pond-koi` declares its keys) and the day (X1 #5: `day`, `age`). */
export const pondSources = [lightSource, pondDaySource]
/** The board's worlds (tests reset them), in card order. The koi and the marble follow the day: their slots read the current ones. */
export const pondWorlds: World[] = [koiPond.world, jelly.world, slime.world, fireflies.world, murmur.world, terrarium.world, marbleNow.world, plankton.world]
Object.defineProperty(pondWorlds, 0, { get: () => koiPond.world, enumerable: true })
Object.defineProperty(pondWorlds, 6, { get: () => marbleNow.world, enumerable: true })
/** Read-outs for tests and the browser probe. */
export const pondProbe = { koi: koiProbe, jelly, slime, fireflies, murmur, terrarium, marble: marbleProbe, plankton }

// the browser probe (scripts/life-browser.ts) sets __POND_PROBE__ before the page loads (see koi.ts)
const probing = (globalThis as { __POND_PROBE__?: boolean }).__POND_PROBE__ || (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search))
if (probing) {
  const byId = new Map(pondBoard.map((p, i) => [p.id, { preset: p, get world() { return pondWorlds[i] } }]))
  // count each card's draws (the probe reads its frame rate: the phone tier, reduced motion)
  const draws = new Map<string, number>()
  for (const p of pondBoard) { const f = p.layers; p.layers = ctx => { draws.set(p.id, (draws.get(p.id) ?? 0) + 1); return f(ctx) } }
  ;(globalThis as { __pondBoard?: unknown }).__pondBoard = {
    ids: () => pondBoard.map(p => p.id),
    mode: (id: string) => byId.get(id)?.world.mode,
    draws: (id: string) => draws.get(id) ?? 0,
    fps: (id: string) => byId.get(id)?.preset.fps,
    /** The day source's data (X1: `day`, `age`). */
    day: () => pondDaySource.snapshot().data,
    /** The plankton's pristine state hash at step `n` (Node's: scripts/life-plankton.ts `planktonSnapshot`). */
    planktonHash: (n: number) => stateHash(simAtStep(plankton.world.sim, n)),
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
