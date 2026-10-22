import { hash32 } from '../math'

const DIGITS = '0123456789', LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const charsetFor = (ch: string) => (DIGITS.includes(ch) ? DIGITS : LETTERS.includes(ch.toUpperCase()) ? LETTERS : '')

export interface DecodeOptions {
  /** Seconds between successive characters resolving (left → right). */
  stagger?: number
  /** Extra random delay per character, seconds. */
  jitter?: number
  /** Scramble changes per second while unresolved. */
  rate?: number
  /** Time before the first character resolves. */
  lead?: number
  seed?: number
}

/**
 * Text "decode": characters that changed scramble through their character class (digits stay
 * digits, so monospaced numerals never change width), then lock in left → right. Unchanged
 * characters hold still. Pure function of `tau` (seconds since the change).
 */
export function decodeText(prev: string, next: string, tau: number, o: DecodeOptions = {}): string {
  const { stagger = .07, jitter = .12, rate = 18, lead = .12, seed = 1 } = o
  const from = prev.padStart(next.length).slice(-next.length)
  let out = ''
  for (let i = 0; i < next.length; i++) {
    const ch = next[i], set = charsetFor(ch)
    const resolveAt = lead + i * stagger + (hash32(i, seed) / 4294967296) * jitter
    if (from[i] === ch || !set || tau >= resolveAt) { out += ch; continue }
    out += set[hash32(i, Math.floor(tau * rate), seed) % set.length]
  }
  return out
}

/** One split-flap column: flipping from `from` to `to`; `phase` in [0,1) mid-flip, 1 = settled on `to`. */
export interface FlapCell { from: string; to: string; phase: number }

/**
 * Split-flap columns, for renderers that draw the flap itself (fold the halves). Each changed column
 * steps through its drum one flap per `flip` seconds; the k-th *changed* column starts `k·stagger`
 * late (unchanged columns don't delay the wave) and holds its old character until then. Each step
 * reports the pair it is flipping between and how far through the flip it is.
 */
export function splitFlapCells(prev: string, next: string, tau: number, o: SplitFlapOptions = {}): FlapCell[] {
  const { flip = .06, stagger = .04 } = o
  const from = prev.padStart(next.length).slice(-next.length)
  let k = 0
  return [...next].map((ch, i) => {
    const set = charsetFor(ch), a = set.indexOf(from[i])
    if (from[i] === ch || !set) return { from: ch, to: ch, phase: 1 }
    const start = a < 0 ? 0 : a, steps = (set.indexOf(ch) - start + set.length) % set.length
    const local = tau - k++ * stagger
    if (local <= 0) return { from: set[start], to: set[start], phase: 1 }
    const elapsed = local / flip, done = Math.floor(elapsed)
    if (done >= steps) return { from: ch, to: ch, phase: 1 }
    return { from: set[(start + done) % set.length], to: set[(start + done + 1) % set.length], phase: elapsed - done }
  })
}

export interface SplitFlapOptions {
  /** Seconds per flap. */
  flip?: number
  /** Start delay between columns, seconds. */
  stagger?: number
}

/**
 * Split-flap: each changed character steps forward through its drum (digits or letters), one flap
 * per `flip` seconds, columns starting `stagger` apart — the Vestaboard/Solari "wave".
 * Returns the string to show and whether any flap is still moving.
 */
export function splitFlapText(prev: string, next: string, tau: number, o: SplitFlapOptions = {}): { text: string; moving: boolean } {
  const { flip = .06, stagger = .04 } = o
  const from = prev.padStart(next.length).slice(-next.length)
  let text = '', moving = false
  for (let i = 0; i < next.length; i++) {
    const ch = next[i], set = charsetFor(ch), a = set.indexOf(from[i])
    if (from[i] === ch || !set) { text += ch; continue }
    const start = a < 0 ? 0 : a, target = set.indexOf(ch)
    const steps = (target - start + set.length) % set.length
    const done = Math.floor(Math.max(0, tau - i * stagger) / flip)
    if (done >= steps) { text += ch; continue }
    moving = true
    text += set[(start + done) % set.length]
  }
  return { text, moving }
}
