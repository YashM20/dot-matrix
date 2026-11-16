/**
 * KNOCK, a rhythm memory game. A bar has eight steps round a ring. The machine knocks a pattern on some of them
 * (always on the first), counts you in, then you knock the same pattern back on the next bar. Every step of the
 * pattern must be knocked and no other. A clean bar scores its beats and the next pattern has one more beat
 * (up to six) at a slightly faster tempo. A wrong bar costs one of three lives and brings a fresh pattern of the
 * same length. A press counts for the nearest step, so timing has half a step of slack either way.
 *
 * A round, in steps: LISTEN 0–8, READY 8–10, KNOCK 10–18 (presses from 9.5 to 17.5), RESULT until 20.
 */
import { nextRandom } from '../rng'
import type { MiniGame, MiniInput, MiniState } from './types'

export const KNOCK_STEPS = 8
const LISTEN = 0, READY = 8, KNOCK = 10, JUDGE = 17.5, NEXT = 20
export const KNOCK_LIVES = 3, KNOCK_MAX_BEATS = 6
/** Frames per step: 20 (0.33 s) at first, one less per cleared bar, down to 12 (0.2 s). */
const stepFrames = (cleared: number) => Math.max(12, 20 - cleared)

export interface Knock extends MiniState {
  lives: number
  /** Bars knocked back cleanly. */
  cleared: number
  /** Frames per step this round, and the frame the round began. */
  len: number
  t0: number
  /** 1 where the pattern knocks, per step. */
  pattern: number[]
  /** Per step: 0 untouched, 1 knocked on a beat, 2 knocked where there is none. */
  marks: number[]
  /** 0 while the bar runs, 1 clean, 2 missed. */
  result: number
  /** Frame of the visitor's last knock (the press pulse). */
  knockAt: number
}

export type KnockPhase = 'listen' | 'ready' | 'knock' | 'result'
/** Where the round is: its phase, the position in steps since the round began and the step under the cursor (or -1). */
export function knockPhase(s: Knock): { phase: KnockPhase; p: number; cursor: number } {
  const p = (s.frame - s.t0) / s.len
  if (p < READY) return { phase: 'listen', p, cursor: Math.floor(p - LISTEN) }
  if (p < KNOCK) return { phase: 'ready', p, cursor: -1 }
  if (p < JUDGE + .5 && s.result === 0) return { phase: 'knock', p, cursor: Math.min(KNOCK_STEPS - 1, Math.floor(p - KNOCK)) }
  return { phase: 'result', p, cursor: -1 }
}
export const knockBeats = (s: Knock) => s.pattern.reduce((a, b) => a + b, 0)

function newRound(s: Knock): void {
  const beats = Math.min(2 + s.cleared, KNOCK_MAX_BEATS), rest = [1, 2, 3, 4, 5, 6, 7]
  // a partial Fisher–Yates over steps 1..7: the first beats-1 picks join step 0
  for (let i = 0; i < beats - 1; i++) { const j = i + Math.floor(nextRandom(s) * (rest.length - i)); [rest[i], rest[j]] = [rest[j], rest[i]] }
  s.pattern = Array.from({ length: KNOCK_STEPS }, (_, i) => (i === 0 || rest.slice(0, beats - 1).includes(i) ? 1 : 0))
  s.marks = new Array(KNOCK_STEPS).fill(0)
  s.len = stepFrames(s.cleared); s.t0 = s.frame; s.result = 0
}

export const knock: MiniGame<Knock> = {
  id: 'knock',
  create(seed) {
    const s: Knock = { frame: 0, score: 0, over: false, rng: seed >>> 0, lives: KNOCK_LIVES, cleared: 0, len: 20, t0: 0, pattern: [], marks: [], result: 0, knockAt: -99 }
    newRound(s)
    return s
  },
  step(s, input) {
    if (s.over) { s.frame++; return }
    const p = (s.frame - s.t0) / s.len
    if (input === 1 && s.result === 0 && p >= KNOCK - .5 && p < JUDGE) {
      const i = Math.max(0, Math.min(KNOCK_STEPS - 1, Math.round(p - KNOCK)))
      if (!s.pattern[i]) s.marks[i] = 2
      else if (s.marks[i] === 0) s.marks[i] = 1
      s.knockAt = s.frame
    }
    if (s.result === 0 && p >= JUDGE) {
      const clean = s.pattern.every((b, i) => (b ? s.marks[i] === 1 : s.marks[i] !== 2))
      s.result = clean ? 1 : 2
      if (clean) { s.score += knockBeats(s) * (1 + Math.floor(s.cleared / 3)); s.cleared++ }
      else s.lives--
    }
    if (p >= NEXT) { if (s.lives <= 0) s.over = true; else newRound(s) }
    s.frame++
  },
  bot(s): MiniInput {
    if (s.result !== 0) return 0
    const d = s.frame - s.t0
    for (let i = 0; i < KNOCK_STEPS; i++) if (s.pattern[i] && d === (KNOCK + i) * s.len) return 1
    return 0
  },
}
