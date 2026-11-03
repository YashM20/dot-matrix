/**
 * Squares board, X-advanced #8 (docs/living-matter/X-advanced.md): the Abelian sandpile.
 *
 *   SANDPILE  the identity of the 72 × 58 sandpile group (Bak, Tang & Wiesenfeld 1987; the group: Dhar 1990),
 *             e = (6 − (6)°)°, on the four shades. As on a four-shade LCD the fullest cell is the darkest: 3 grains
 *             is an unlit faint cell, 2 mid, 1 idle, 0 value. Equal neighbours join.
 *
 * The loop is Dhar's burning test: one grain drops on every border edge, and since e is recurrent every cell topples
 * exactly once. The front runs in from the edges, one parallel sweep per beat, and the grid ends on e again, so the
 * loop is seamless. The red is the cells toppling in the current sweep.
 */
import { sandpileBurn, type Burn } from '../../engine/squares/sandpile'
import type { Tone } from '../../engine/types'
import type { WidgetPreset } from '../types'
import { cells, cite, footer, mod, pad, thousands, tile, type Pt } from './squaresKit'

const K = 2, W = 72, H = 58, ORIGIN: Pt = [0, 12]
/** Seconds per sweep, the hold on e, and t = 0 a third of the way in. */
const BEAT = .1, HOLD = 2.5
/** Sweeps the red trails behind the front (the front alone is a sparse checkerboard). */
const TRAIL = 3
/** Tone and level per height 0–3 (≥ 4 is toppling: the red). Over half the cells hold 3, so 3 stays small and dark. */
const SHADE: Tone[] = ['value', 'idle', 'mid', 'faint', 'active']
const LEVEL = [.75, .75, .75, .25, 1]

let burn: Burn | undefined
export const sandBurn = () => (burn ??= sandpileBurn(W, H))
const loopOf = (b: Burn) => b.sweeps * BEAT + HOLD

/** The sweep shown at time t (0…sweeps; sweeps = settled on e). */
export function sandSweep(t: number): number {
  const b = sandBurn(), p = mod(t + b.sweeps * BEAT / 3, loopOf(b))
  return Math.min(b.sweeps, Math.floor(p / BEAT))
}

export const sqSandpile: WidgetPreset = {
  id: 'sq-sandpile', name: 'Squares Sandpile', label: 'SANDPILE', ...tile,
  credit: { by: ['Per Bak', 'Chao Tang', 'Kurt Wiesenfeld'], title: 'Self-organized criticality: an explanation of the 1/f noise', source: 'https://doi.org/10.1103/PhysRevLett.59.381', note: 'technique' },
  layers: ctx => {
    const b = sandBurn(), s = sandSweep(ctx.t), z = b.z[s]
    const shade = (c: number, r: number) => { const i = r * W + c, a = b.at[i]; return s < b.sweeps && a <= s && a > s - TRAIL ? 4 : Math.min(3, z[i]) }
    return [
      cite('BTW 1987'),
      cells(K, ORIGIN, W, H, (c, r) => LEVEL[shade(c, r)], { toneOf: (c, r) => SHADE[shade(c, r)], join: { accent: true } }),
      ...footer(s / b.sweeps, `SWEEP ${pad(s, 2)}`, `TOPPLED ${thousands(b.done[s])}`),
    ]
  },
}
/** Sizes for the checks (`scripts/arctic.ts`). */
export const SAND_CARD = { k: K, w: W, h: H, origin: ORIGIN, beat: BEAT, hold: HOLD, shade: SHADE, level: LEVEL }
export const sandLoop = () => loopOf(sandBurn())
