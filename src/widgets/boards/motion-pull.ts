/**
 * Motion pull-to-refresh: a finger drags a chat list down against a rubber band, the rows stretch apart and
 * a ring above them fills with the pull. Past the threshold it lets go: the list springs back to a hold, the
 * ring spins (its head is the card's red) and a new chat slides in at the top.
 */
import { underdampedSpring } from '../../engine/motion/spring'
import { textSize } from '../../engine/layout'
import type { Layer } from '../../engine/types'
import { layer } from '../types'
import { BODY, T, arcRing, fade, loopCard, outCubic, span } from './motion-kit'

const PULL = { start: .3, drag: 1.2, max: 40, hold: 26, spin: 1.6, insert: 3.2, close: .4, row: 24, top: 16, clip: 124, period: 6.4 }
const release = PULL.start + PULL.drag
const ROWS: [string, string, string][] = [
  ['NADIA', 'SEE YOU AT 8', '21:04'], ['ORBIT CREW', 'LAUNCH MOVED', '20:51'],
  ['JONAS', 'PHOTOS ARE UP', '19:30'], ['MOM', 'CALL ME LATER', '18:02'],
]
const NEW: [string, string, string] = ['LENA', 'JUST LANDED', 'NOW']
const rubber = (q: number) => PULL.max * (1 - Math.exp(-2.2 * q)) / (1 - Math.exp(-2.2))
/** How far the list is pulled down (cells) at loop time `lt`. */
export function offsetAt(lt: number): number {
  if (lt < release) return rubber(span(lt, PULL.start, PULL.drag))
  if (lt < PULL.insert) return underdampedSpring(PULL.max, 0, PULL.hold, 3, .5, lt - release).x
  return PULL.hold * (1 - outCubic(span(lt, PULL.insert, PULL.close)))
}
type Phase = 'IDLE' | 'PULLING' | 'RELEASE' | 'REFRESHING' | 'UPDATED'
const phaseAt = (lt: number, off: number): Phase =>
  lt < PULL.start ? 'IDLE' : lt < release ? (off >= PULL.max - 8 ? 'RELEASE' : 'PULLING') : lt < PULL.insert ? 'REFRESHING' : 'UPDATED'

function chatRow([name, line, time]: [string, string, string], y: number, fresh: boolean): Layer[] {
  if (y + 19 > PULL.clip) return []
  return [
    layer(T.dots([[13, y + 8]], 9), fresh ? 'value' : 'mid'),
    layer(T.big(name, 26, y, BODY), 'value'),
    layer(T.text(time, 138, y + 1, { align: 'right' }), fresh ? 'value' : 'mid'),
    layer(T.text(line, 26, y + 12), fresh ? 'idle' : 'mid'),
  ]
}

/** Rows of clear air between the hint's last row and the first chat row, at every pull offset (#238). */
export const HINT_CLEAR = 4
const HINT_H = textSize('PULL')[1]
/** The ring's highest centre: its top sites stay inside the card. */
export const RING_TOP = 10
/**
 * The ring and its hint ride on the list's top edge as one stack: the hint sits `HINT_CLEAR` rows above the first
 * row and the ring 12 rows above the hint, so the gap the pull opens shows them and the rows never run into them.
 * Early in the pull the ring waits at the card's top (`RING_TOP`), and the hint fades in once the stack has room.
 */
export const pullStack = (off: number) => {
  const y0 = Math.round(PULL.top + off), hint = y0 - HINT_CLEAR - HINT_H, ride = hint - 12
  return { y0, hint, cy: Math.max(RING_TOP, ride), room: (ride - RING_TOP) / 4 }
}

/** The card's picture in parts at loop time `lt`, pulled down `off` cells (the loop's own offset unless given). */
export function pullParts(lt: number, off = offsetAt(lt)) {
  const phase = phaseAt(lt, off), rows: Layer[] = [], ring: Layer[] = [], hint: Layer[] = [], finger: Layer[] = []
  const ins = outCubic(span(lt, PULL.insert, PULL.close)), stretch = .3 * Math.max(0, off - 20)
  const { y0, hint: hy, cy, room } = pullStack(off), pitch = PULL.row + stretch
  // the new chat fades into the first slot as the others move down one row
  if (ins > 0) for (const l of chatRow(NEW, y0, true)) rows.push(...fade(l, ins))
  ROWS.forEach((r, i) => rows.push(...chatRow(r, Math.round(y0 + (i + ins) * pitch), false)))
  // the ring above the list: fills with the pull, spins while refreshing, fades as the gap closes
  const n = 12, show = off > 6 ? 1 - ins : 0
  if (show > 0) {
    const arc = phase === 'REFRESHING' || phase === 'UPDATED'
      ? (() => { const h = (lt - release) * 14; return arcRing(72, cy, 8, n, h - 4, h, { track: 1.4, arc: 2.4, head: 3.6 }) })()
      : arcRing(72, cy, 8, n, 0, Math.min(1, off / (PULL.max - 8)) * n - 1, { track: 1.4, arc: 2.4, head: 2.4, headTone: 'value' })
    for (const l of arc) ring.push(...fade(l, show))
    const word = phase === 'RELEASE' ? 'RELEASE' : phase === 'PULLING' ? 'PULL TO REFRESH' : phase === 'REFRESHING' ? 'REFRESHING' : ''
    if (word && room >= 0) hint.push(...fade(layer(T.text(word, 72, hy, { align: 'center' }), phase === 'RELEASE' ? 'value' : 'mid'), Math.min(show, room)))
  }
  // the finger: a ring of fine sites holding the first row's avatar while it drags
  if (lt >= PULL.start && lt < release + .1) finger.push(layer(T.dotRing(13, y0 + 8, 9, { spacing: 2.2, size: 1.2 }), 'idle'))
  return { phase, rows, ring, hint, finger }
}

export const pullCard = loopCard({
  id: 'mo-pull', name: 'Pull', period: PULL.period, settled: 5, fps: 24,
  draw: lt => { const p = pullParts(lt); return [...p.rows, ...p.ring, ...p.hint, ...p.finger] },
  foot: lt => { const p = phaseAt(lt, offsetAt(lt)); return [p, p === 'UPDATED' ? 'JUST NOW' : '2 MIN AGO'] },
})
