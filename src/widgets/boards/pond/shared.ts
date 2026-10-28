/**
 * The pond board's card shell (docs/living-matter/L-pond.md §2 "Card shell"): every pond card is a TILE card with
 * dot chrome, refuses the sampling worker (its live state lives on the main thread, as on the physics board), has
 * one touch surface below the label, and maps pointers into its scene's units. A faint caption sits top-right.
 */
import { framePointers, type FrameInput } from '../../../engine/physics/world'
import type { Control } from '../../../engine/context'
import type { Layer } from '../../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext } from '../../types'

export const T = layoutFor(TILE)
export const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const

// The sampling worker would run its own (pristine) copy of a world and snap back when the pointer leaves.
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
/** First line of every pond card's `layers`: pond cards keep their live state on the main thread. */
export const mainThread = () => { if (IN_WORKER) throw new Error('pond cards keep their live state on the main thread') }

/**
 * The whole card below the label is one press target: pointers reach the card, Enter / Space kick it. On touch it
 * is a drag surface (UX-PLAN §10): a horizontal drag or a 300 ms hold engages it, a vertical swipe scrolls the page.
 */
export const touch = (key: string, label: string): Control[] => [{ key, kind: 'button', gesture: 'surface', box: [0, 10, 144, 134], label }]

type Map2 = (x: number, y: number) => [number, number]
const ident: Map2 = (x, y) => [x, y]
/** This frame's input: pointers mapped into scene units, a keyboard press as a kick. Reduced motion: no input at all. */
export function frameOf(ctx: WidgetContext, key: string, map: Map2 = ident): FrameInput | undefined {
  if (ctx.reducedMotion) return undefined
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, map), kick: (ctx.data[key] ?? 0) >= .5 && !busy }
}

/** Caption tier (0.72 lattice), faint, top-right: as on the algorithms and mosaic boards. */
export const caption = (s: string): Layer => layer(T.big(s, 143, 1, { lattice: .72, align: 'right' }), 'faint')

/** Local hour (fractional) of the wall clock (frozen at 09:41 in goldens). */
export const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 }
/** The pond's time-of-day caption. */
export const timeOfDay = (h: number) => (h >= 5 && h < 12 ? 'MORNING' : h >= 12 && h < 17 ? 'AFTERNOON' : h >= 17 && h < 20.5 ? 'EVENING' : 'NIGHT')
