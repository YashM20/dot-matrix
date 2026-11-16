/**
 * HOPLINE, a one-button runner. A runner rides one of two rails while the track scrolls past, faster every
 * second. Each press hops to the other rail. A break in your rail drops you, a post on it stops you, a spark on it
 * is five points. Hops are quick but not instant, so a hop that lands on a break still drops you.
 * The track is generated ahead from the seed, hazards never side by side, with room between them for a hop.
 * Distances are in cells of the card's 4× lattice; the runner sits at column `HOP_RX` of the 36-column view.
 */
import { nextRandom } from '../rng'
import { DT, type MiniGame, type MiniInput, type MiniState } from './types'

export const HOP_RX = 6, HOP_RW = 2, HOP_FRAMES = 8, HOP_VIEW = 36
/** Track pieces: a break in the rail, a post on it, a spark above it. */
export const BREAK = 0, POST = 1, SPARK = 2
export interface Piece { x: number; rail: number; kind: number; w: number; got: number }
export interface Hopline extends MiniState {
  /** Distance run (lattice cells) and speed (cells per second). */
  x: number
  speed: number
  /** The rail the runner is on (0 upper, 1 lower), or landing on while `hop` > 0. */
  rail: number
  /** Frames left in the hop under way. */
  hop: number
  sparks: number
  /** How the run ended: -1 still running, else BREAK or POST. */
  crash: number
  pieces: Piece[]
  /** World x where the last generated hazard ends, and its rail. */
  genX: number
}

const speedAt = (seconds: number) => Math.min(24, 10 + .3 * seconds)
/** The runner's world span [a, b) at whole-cell scroll. */
export const runnerSpan = (s: Hopline): [number, number] => { const a = Math.floor(s.x) + HOP_RX; return [a, a + HOP_RW] }

function generate(s: Hopline): void {
  while (s.genX < s.x + HOP_VIEW + 12) {
    const gap = Math.ceil(s.speed * HOP_FRAMES * DT) + HOP_RW + 3 + Math.floor(nextRandom(s) * 6)
    const rail = nextRandom(s) < .5 ? 0 : 1, kind = nextRandom(s) < .55 ? BREAK : POST, w = kind === BREAK ? 2 + Math.floor(nextRandom(s) * 3) : 1
    const at = s.genX + gap
    // a spark on the other rail just before the hazard: the safe line pays
    if (nextRandom(s) < .45) s.pieces.push({ x: at - 3, rail: 1 - rail, kind: SPARK, w: 1, got: 0 })
    s.pieces.push({ x: at, rail, kind, w, got: 0 })
    s.genX = at + w
  }
  // drop what has scrolled off the left edge
  const left = Math.floor(s.x) - 2
  if (s.pieces.length && s.pieces[0].x + s.pieces[0].w < left) s.pieces = s.pieces.filter(p => p.x + p.w >= left)
}

export const hopline: MiniGame<Hopline> = {
  id: 'hopline',
  create(seed) {
    const s: Hopline = { frame: 0, score: 0, over: false, rng: seed >>> 0, x: 0, speed: speedAt(0), rail: 1, hop: 0, sparks: 0, crash: -1, pieces: [], genX: 22 }
    generate(s)
    return s
  },
  step(s, input) {
    if (s.over) { s.frame++; return }
    if (s.hop > 0) s.hop--
    else if (input === 1) { s.rail = 1 - s.rail; s.hop = HOP_FRAMES }
    s.speed = speedAt(s.frame * DT)
    s.x += s.speed * DT
    generate(s)
    if (s.hop === 0) {
      const [a, b] = runnerSpan(s), mid = a + HOP_RW / 2 - .5
      for (const p of s.pieces) {
        if (p.rail !== s.rail || p.x >= b || p.x + p.w <= a) continue
        if (p.kind === SPARK) { if (!p.got) { p.got = 1; s.sparks++ } }
        else if (p.kind === POST || (mid >= p.x && mid < p.x + p.w)) { s.over = true; s.crash = p.kind; break }
      }
    }
    s.score = Math.floor(s.x / 4) + 5 * s.sparks
    s.frame++
  },
  bot(s): MiniInput {
    if (s.hop > 0 || s.over) return 0
    const [a, b] = runnerSpan(s), lead = Math.ceil(s.speed * (HOP_FRAMES + 2) * DT) + 1
    const danger = (rail: number, from: number, to: number) => s.pieces.some(p => p.rail === rail && p.kind !== SPARK && p.x < to && p.x + p.w > from)
    return danger(s.rail, a, b + lead) && !danger(1 - s.rail, a, b + lead + 2) ? 1 : 0
  },
}
