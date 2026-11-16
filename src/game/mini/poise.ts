/**
 * POISE, a turn-based balance puzzle. A beam holds two pans. You get one weight at a time (1 or 2, then up to 3, later 4)
 * and see the one after it; put it on the left pan or the right. Three alike on top of one pan vanish, which lifts
 * that side at once, so a clear can swing the beam the other way. The beam tips when one side outweighs the other
 * by more than `POISE_LIMIT`, and a pan spills past `POISE_CAP` weights. Each weight placed scores its size, each
 * clear ten. There is no timer: a move is one press, so the game plays the same with motion off.
 * `input` is -1 (left pan) or 1 (right pan). Animation is derived from frames for drawing only; the rules act at once.
 */
import { nextRandom } from '../rng'
import type { MiniGame, MiniInput, MiniState } from './types'

export const POISE_LIMIT = 7, POISE_CAP = 8, POISE_CLEAR = 10
/** Weights are 1–2 for the first turns, 1–3 until `HEAVY_AFTER`, then 1–4. */
const LIGHT_UNTIL = 8, HEAVY_AFTER = 25

export interface Poise extends MiniState {
  left: number[]
  right: number[]
  /** The weight to place and the one after it. */
  hand: number
  next: number
  turns: number
  clears: number
  /** The last move: side (-1 left, 1 right, 0 none yet), its weight, the frame it happened, the imbalance before. */
  moveSide: number
  moveW: number
  moveAt: number
  fromD: number
  /** The last clear: side (0 none), the weight cleared, and its frame. */
  clearSide: number
  clearW: number
  clearAt: number
  /** How the game ended: 0 still on, 1 tipped, 2 spilled. */
  end: number
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
/** Right minus left: positive leans right. */
export const imbalance = (s: Pick<Poise, 'left' | 'right'>) => sum(s.right) - sum(s.left)
const draw = (s: Poise) => 1 + Math.floor(nextRandom(s) * (s.turns < LIGHT_UNTIL ? 2 : s.turns < HEAVY_AFTER ? 3 : 4))

/** The pan after adding `w`: three alike on top vanish. Returns the new pan and the cleared weight (0 = none). */
export function settlePan(pan: readonly number[], w: number): { pan: number[]; cleared: number } {
  const out = [...pan, w], n = out.length
  if (n >= 3 && out[n - 2] === w && out[n - 3] === w) return { pan: out.slice(0, n - 3), cleared: w }
  return { pan: out, cleared: 0 }
}

/** What a move would do, without making it: the imbalance after and how it ends (0 fine, 1 tip, 2 spill). */
export function preview(s: Poise, side: -1 | 1): { d: number; end: number; cleared: number } {
  const { pan, cleared } = settlePan(side < 0 ? s.left : s.right, s.hand)
  const left = side < 0 ? pan : s.left, right = side < 0 ? s.right : pan, d = imbalance({ left, right })
  return { d, cleared, end: Math.abs(d) > POISE_LIMIT ? 1 : pan.length > POISE_CAP ? 2 : 0 }
}

export const poise: MiniGame<Poise> = {
  id: 'poise',
  create(seed) {
    const s: Poise = {
      frame: 0, score: 0, over: false, rng: seed >>> 0, left: [], right: [], hand: 0, next: 0, turns: 0, clears: 0,
      moveSide: 0, moveW: 0, moveAt: -99, fromD: 0, clearSide: 0, clearW: 0, clearAt: -99, end: 0,
    }
    s.hand = draw(s); s.next = draw(s)
    return s
  },
  step(s, input) {
    if (!s.over && input !== 0) {
      const side = input < 0 ? -1 : 1, before = imbalance(s), w = s.hand, { pan, cleared } = settlePan(side < 0 ? s.left : s.right, w)
      if (side < 0) s.left = pan; else s.right = pan
      s.moveSide = side; s.moveW = w; s.moveAt = s.frame; s.fromD = before
      s.turns++; s.score += w
      if (cleared) { s.clears++; s.score += POISE_CLEAR; s.clearSide = side; s.clearW = cleared; s.clearAt = s.frame }
      const d = imbalance(s)
      s.end = Math.abs(d) > POISE_LIMIT ? 1 : pan.length > POISE_CAP ? 2 : 0
      if (s.end) s.over = true
      else { s.hand = s.next; s.next = draw(s) }
    }
    s.frame++
  },
  /** One move every 0.8 s: the side that leaves the beam most level, a clear when it is safe. */
  bot(s): MiniInput {
    if (s.over || (s.frame - s.moveAt) < 48) return 0
    const score = (side: -1 | 1) => { const p = preview(s, side); return p.end ? 1e3 : Math.abs(p.d) - (p.cleared ? 2.5 : 0) }
    return score(-1) <= score(1) ? -1 : 1
  },
}
