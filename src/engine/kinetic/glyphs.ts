/**
 * Kinetic type, part 3: effects that swap whole glyphs (#129). Same contract as `./drift`: a pure function of
 * the word (or the twelve module characters) and t, one loop per `period` that starts and ends on the settled
 * word, every pixel on a whole lattice cell.
 *
 *   scramble    the letters run through random glyphs and lock in from left to right; the next to lock is red
 *   flap        twelve split-flap modules flip forward to blank and on round the drum to the word; the leaf in
 *               motion is red. Rows of a folding leaf squeeze toward the hinge, rounded to whole rows
 *   typewriter  the line is backspaced away and typed again at an uneven pace behind a red caret
 *
 * Deterministic: integer hashes and `dsin` only.
 */
import { hash01, hash32 } from '../math'
import { dsin } from '../noise/trig'
import { ADV, DRUM, GH, GW, SCRAMBLE_POOL, bitsOf, loopT, type Cell, type Frame } from './word'
import type { Tone } from '../types'

/** Push the lit pixels of `ch` at column `x0` (row offset `dy`) in `tone`. */
function glyphCells(out: Cell[], ch: string, x0: number, tone: Tone, dy = 0) {
  const g = bitsOf(ch)
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (g[y][x]) out.push({ x: x0 + x, y: y + dy, tone, v: 1 })
}

// ── scramble ───────────────────────────────────────────────────────────────
export const SCRAMBLE = { period: 5, start: .6, spread: .04, lock: 1.6, step: .2, jitter: .12, rate: 16 }
/** When letter `i` locks (loop seconds); it scrambles from `start + i · spread` until then. */
export const scrambleLock = (i: number) => SCRAMBLE.lock + i * SCRAMBLE.step + hash01(i, 5) * SCRAMBLE.jitter
export function scrambleFrame(word: string, t: number): Frame {
  t = loopT(t, SCRAMBLE.period)
  const cells: Cell[] = []
  let next = -1
  for (let i = 0; i < word.length; i++) {
    const ch = word[i]
    if (ch === ' ') continue
    const busy = t >= SCRAMBLE.start + i * SCRAMBLE.spread && t < scrambleLock(i)
    if (!busy) { glyphCells(cells, ch, i * ADV, 'value'); continue }
    if (next < 0) next = i
    const pool = SCRAMBLE_POOL, k = hash32(i, Math.floor(t * SCRAMBLE.rate), 9) % pool.length
    glyphCells(cells, pool[k] === ch ? pool[(k + 1) % pool.length] : pool[k], i * ADV, i === next ? 'active' : 'mid')
  }
  return { cells, marks: [] }
}

// ── split-flap ─────────────────────────────────────────────────────────────
export const FLAP = { period: 8, clear: 1.2, set: 4.4, stagger: .05, flip: .045 }
/** A module at rest on drum index `at`, or mid-flip from `a` to the next index `b`, `phase` in [0, 1). */
export type FlapState = { at: number } | { a: number; b: number; phase: number }
/** A module that started at drum index `from` `tau` seconds ago and moves `steps` flaps forward, `flip` s each. */
export function flapAt(from: number, steps: number, tau: number, flip = FLAP.flip): FlapState {
  const n = DRUM.length
  if (tau <= 0 || steps <= 0) return { at: from % n }
  const e = tau / flip, done = Math.floor(e)
  if (done >= steps) return { at: (from + steps) % n }
  return { a: (from + done) % n, b: (from + done + 1) % n, phase: e - done }
}
/** Flaps forward from drum index `from` to `to`. */
export const flapSteps = (from: number, to: number) => (((to - from) % DRUM.length) + DRUM.length) % DRUM.length
/** Module `m` of the loop, showing drum index `c` when at rest: clear to blank, rest, flip round to `c`. */
export function flapLoop(c: number, m: number, t: number): FlapState {
  t = loopT(t, FLAP.period)
  const clear = FLAP.clear + m * FLAP.stagger, set = FLAP.set + m * FLAP.stagger
  if (t < set) return flapAt(c, flapSteps(c, 0), t - clear)
  return flapAt(0, c, t - set)
}
/**
 * One module at column `x0`. Mid-flip it shows the new top half and the old bottom half behind the leaf; the leaf
 * (the old top half falling, then the new bottom half landing) folds about the middle row, its rows squeezed
 * toward the hinge by |cos πφ| and rounded to whole rows, and hides what it covers.
 */
export function flapCells(out: Cell[], s: FlapState, x0: number, leaf: Tone = 'active') {
  if ('at' in s) { glyphCells(out, DRUM[s.at], x0, 'value'); return }
  const a = bitsOf(DRUM[s.a]), b = bitsOf(DRUM[s.b]), hinge = (GH - 1) / 2, phase = s.phase
  const fold = Math.abs(dsin(Math.PI * phase + Math.PI / 2)), reach = (GH / 2) * fold
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    const top = r < GH / 2
    const face = top ? b[r][c] : a[r][c]
    const covered = top ? phase < .5 && r > hinge - reach : phase >= .5 && r < hinge + reach
    if (face && !covered) out.push({ x: x0 + c, y: r, tone: 'value', v: 1 })
    const bit = phase < .5 ? top && a[r][c] : !top && b[r][c]
    if (bit) out.push({ x: x0 + c, y: Math.round(hinge + (r - hinge) * fold), tone: fold > .8 ? 'value' : leaf, v: 1 })
  }
}
/** The twelve modules spelling `text` (one character per module, blanks kept); `state` overrides a module (an edit). */
export function flapFrame(text: string, t: number, state?: (m: number) => FlapState | undefined): Frame {
  const cells: Cell[] = []
  for (let m = 0; m < text.length; m++) {
    const c = Math.max(0, DRUM.indexOf(text[m]))
    flapCells(cells, state?.(m) ?? flapLoop(c, m, t), m * ADV)
  }
  return { cells, marks: [] }
}

// ── typewriter ─────────────────────────────────────────────────────────────
export const TYPE = { period: 6.5, hold: 1.2, del: .07, empty: 2.5, blink: .9, strike: .07 }
/** Seconds from the previous keystroke to key `j` (a space takes a beat longer). */
const gapOf = (word: string, j: number) => .1 + hash01(j, 3) * .1 + (word[j] === ' ' ? .1 : 0)
/** Characters on the line at loop time `t`, whether the caret is busy (solid), and when the newest key struck. */
export function typed(word: string, t: number): { len: number; busy: boolean; struck: number } {
  t = loopT(t, TYPE.period)
  const n = word.length
  if (t < TYPE.hold) return { len: n, busy: false, struck: -Infinity }
  if (t < TYPE.empty) {
    const gone = Math.floor((t - TYPE.hold) / TYPE.del) + 1
    return { len: Math.max(0, n - gone), busy: gone <= n, struck: -Infinity }
  }
  let at = TYPE.empty
  for (let j = 0; j < n; j++) {
    at += gapOf(word, j)
    if (t < at) return { len: j, busy: true, struck: j ? at - gapOf(word, j) : -Infinity }
  }
  return { len: n, busy: false, struck: at }
}
/** The line so far (the newest key prints a row high for one strike), and the caret after it: a bar a row taller than the caps. */
export function typewriterFrame(word: string, t: number): Frame {
  const { len, busy, struck } = typed(word, t), lt = loopT(t, TYPE.period), cells: Cell[] = []
  for (let i = 0; i < len; i++) if (word[i] !== ' ') glyphCells(cells, word[i], i * ADV, 'value', i === len - 1 && lt - struck < TYPE.strike ? -1 : 0)
  const marks: Cell[] = []
  if (busy || loopT(lt, TYPE.blink) < TYPE.blink / 2) for (let y = -1; y <= GH; y++) marks.push({ x: len * ADV - 1, y, tone: 'active', v: 1 })
  return { cells, marks }
}
