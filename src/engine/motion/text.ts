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
