/**
 * The caption and footer every TILE kit shares (#225): the 5×7 font on the card grid (lattice 1), so their dots land
 * on card cells like the label's. There is no smaller text tier: a caption that does not fit gets shorter words.
 */
import type { Layer, Tone } from '../engine/types'
import { TILE, layer, layoutFor } from './types'

const T = layoutFor(TILE), RIGHT = TILE.cols - 1
type Align = 'left' | 'center' | 'right'

/** Top-right by default, on the label's row: what the card is built on, in `mid` (`faint` is too dim for text). */
export const caption = (s: string, col = RIGHT, row = 0, align: Align = 'right', tone: Tone = 'mid'): Layer =>
  layer(T.text(s, col, row, { align }), tone)

/** A counter left in `idle` and one stat right in `mid`, on card row `row`. An empty right leaves the stat out. */
export const footer = (left: string, right: string, row: number): Layer[] => [
  layer(T.text(left, 0, row), 'idle'),
  ...(right ? [layer(T.text(right, RIGHT, row, { align: 'right' }), 'mid')] : []),
]
