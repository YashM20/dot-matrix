/**
 * The caption and footer every TILE kit shares (#225): the 5×7 font on the card grid (lattice 1), so their dots land
 * on card cells like the label's. There is no smaller text tier: a caption that does not fit gets shorter words.
 */
import type { Layer, Tone } from '../engine/types'
import { TILE, layer, layoutFor } from './types'

const T = layoutFor(TILE), RIGHT = TILE.cols - 1
type Align = 'left' | 'center' | 'right'
type Pt = [number, number]

/** Top-right by default, on the label's row: what the card is built on, in `mid` (`faint` is too dim for text). */
export const caption = (s: string, col = RIGHT, row = 0, align: Align = 'right', tone: Tone = 'mid'): Layer =>
  layer(T.text(s, col, row, { align }), tone)

/** A counter left in `idle` and one stat right in `mid`, on card row `row`. An empty right leaves the stat out. */
export const footer = (left: string, right: string, row: number): Layer[] => [
  layer(T.text(left, 0, row), 'idle'),
  ...(right ? [layer(T.text(right, RIGHT, row, { align: 'right' }), 'mid')] : []),
]

/** Where a rail footer sits: the rail's row, the text row, a red knob at the fill point, the stat's tone. */
export interface RailRows { rail: number; foot: number; live?: boolean; rightTone?: Tone }
/**
 * `footer()` under a dotted progress rail across the card: a site every 3 cells, `faint` ahead of `k` (0..1) and `mid`
 * up to it. `live` turns the last filled site into the red knob.
 */
export function railFooter(k: number, left: string, right: string, o: RailRows): Layer[] {
  const done: Pt[] = [], rest: Pt[] = [], end = RIGHT * Math.max(0, Math.min(1, k))
  for (let c = 0; c <= RIGHT; c += 3) (c <= end ? done : rest).push([c, o.rail])
  const knob = o.live ? done.pop() : undefined
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    ...(knob ? [layer(T.dots([knob], 2.2), 'active')] : []),
    layer(T.text(left, 0, o.foot), 'idle'),
    layer(T.text(right, RIGHT, o.foot, { align: 'right' }), o.rightTone ?? 'mid'),
  ]
}

/** A faint dotted divider rule across row `y`, from column `x0` to `x1`. */
export const divider = (x0: number, x1: number, y: number): Layer => layer(T.dotLine(x0, y, x1, y, { spacing: 3.3, size: 1 }), 'faint')
