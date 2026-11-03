/**
 * Kinetic type, part 2: effects that move the word's pixels (#129). Each is a pure function of the word and
 * t: one loop of `period` seconds that starts and ends on the settled word, so t = 0 (the reduced-motion
 * frame, the goldens' first frame) and the wrap both show the word exactly. Positions are rounded to whole
 * lattice cells every frame, so a moving pixel is always one dot of the grid.
 *
 *   melt     the columns drip into a pool under the word, the middle letter first (it is the hot one), and
 *            the pool sets back into letters from left to right
 *   wave     a travelling sine bends the word column by column, swelling in and out over the loop
 *   magnet   a magnet crosses the word and pulls the pixels near it; a pointer can hold it instead
 *   shatter  the pixels blow out from the middle, hang as dust, and fly home letter by letter
 *
 * Deterministic: hashes and `dsin` only (scripts/kinetic.ts runs the determinism lint on this folder).
 */
import { hash01 } from '../math'
import { dsin, TAU } from '../noise/trig'
import { clamp01, loopT, settled, smooth, wordPixels, wordWidth, type Cell, type Frame, type Px } from './word'

/** The letter nearest the middle that is not a space (melt's hot letter). */
function middleLetter(word: string): number {
  const mid = (word.length - 1) / 2
  let best = 0, gap = Infinity
  for (let i = 0; i < word.length; i++) if (word[i] !== ' ' && Math.abs(i - mid) < gap) { gap = Math.abs(i - mid); best = i }
  return best
}

// ── melt ───────────────────────────────────────────────────────────────────
export const MELT = { period: 7, hold: .6, spread: .16, jitter: .35, lead: .05, fall: 1.6, pool: 3.9, sweep: .8, rise: 1.1, drop: 11, depth: 3 }
/** Pool rows below the cap line: the floor is `6 + drop`. */
export const meltFloor = () => 6 + MELT.drop
const pools = new Map<string, [number, number][]>()
/** Where each pixel rests in the pool: pixels in column order (lowest first) fill the pool's columns bottom up. */
function poolOf(word: string, px: readonly Px[]): [number, number][] {
  let pool = pools.get(word)
  if (pool) return pool
  const order = px.map((_, j) => j).sort((a, b) => px[a].x - px[b].x || px[b].y - px[a].y)
  const width = Math.ceil(px.length / MELT.depth), left = Math.round((wordWidth(word) - width) / 2), floor = meltFloor()
  pool = new Array(px.length)
  order.forEach((j, k) => { pool![j] = [left + Math.floor(k / MELT.depth), floor - (k % MELT.depth)] })
  if (pools.size > 16) pools.clear()
  pools.set(word, pool)
  return pool
}
export function meltFrame(word: string, t: number): Frame {
  t = loopT(t, MELT.period)
  const px = wordPixels(word), pool = poolOf(word, px), hot = middleLetter(word), w = Math.max(1, wordWidth(word) - 1)
  const cells: Cell[] = []
  px.forEach((p, j) => {
    const [tx, ty] = pool[j]
    let x = p.x, y = p.y, moving = false
    if (t < MELT.pool) {
      const start = MELT.hold + Math.abs(p.i - hot) * MELT.spread + hash01(p.x, 11) * MELT.jitter + (6 - p.y) * MELT.lead
      const a = clamp01((t - start) / MELT.fall)
      if (a > 0) {
        moving = true
        x = Math.round(p.x + (tx - p.x) * smooth(a)); y = Math.round(p.y + (ty - p.y) * a * a)
        // the wax trail: the two cells above a falling pixel, fading, while it is still on its way
        if (a < 1) for (let d = 1; d <= 2 && y - d >= p.y; d++) cells.push({ x, y: y - d, tone: 'mid', v: d === 1 ? .55 : .35 })
      }
    } else {
      const q = clamp01((t - MELT.pool - (p.x / w) * MELT.sweep) / MELT.rise), e = 1 - (1 - q) ** 3
      moving = q < 1
      x = Math.round(tx + (p.x - tx) * e); y = Math.round(ty + (p.y - ty) * e)
    }
    cells.push({ x, y, tone: moving && p.i === hot ? 'active' : 'value', v: 1 })
  })
  return { cells, marks: [] }
}

// ── wave ───────────────────────────────────────────────────────────────────
export const WAVE = { period: 6, cycle: 1.5, length: 26, amp: 3, from: .5, to: 5.5 }
/** Row offset of column `x` at loop time `t` (negative is up): whole rows, 0 outside the swell. */
export function waveOffset(x: number, t: number): number {
  if (t <= WAVE.from || t >= WAVE.to) return 0
  const s = dsin((Math.PI * (t - WAVE.from)) / (WAVE.to - WAVE.from)), amp = WAVE.amp * s * s
  return Math.round(-amp * dsin(TAU * (t / WAVE.cycle - x / WAVE.length))) || 0
}
export function waveFrame(word: string, t: number): Frame {
  t = loopT(t, WAVE.period)
  // the red letter rides the highest crest (its centre column at least two rows up)
  let crest = -1, top = -1
  for (let i = 0; i < word.length; i++) {
    if (word[i] === ' ') continue
    const dy = waveOffset(i * 6 + 2, t)
    if (dy <= -2 && dy < top) { top = dy; crest = i }
  }
  return { cells: wordPixels(word).map((p): Cell => ({ x: p.x, y: p.y + waveOffset(p.x, t), tone: p.i === crest ? 'active' : 'value', v: 1 })), marks: [] }
}

// ── magnet ─────────────────────────────────────────────────────────────────
export const MAGNET = { period: 6, enter: .6, cross: 4.4, reach: 9, pull: 6, margin: 13, swing: 5 }
/** The magnet's own path at loop time `t`, in word coordinates: in from the left, a swing through the word, out right. */
export function magnetPath(word: string, t: number): [number, number] {
  const s = smooth((loopT(t, MAGNET.period) - MAGNET.enter) / MAGNET.cross), W = wordWidth(word)
  return [-MAGNET.margin + (W + 2 * MAGNET.margin) * s, 3 - MAGNET.swing * dsin(TAU * s)]
}
/** Pixels within `reach` drift toward the magnet (`at`, else its path), never onto it; the field's edge is a faint ring. */
export function magnetFrame(word: string, t: number, at?: [number, number]): Frame {
  const [mx, my] = at ?? magnetPath(word, t), R = MAGNET.reach
  const cells = wordPixels(word).map((p): Cell => {
    const dx = mx - p.x, dy = my - p.y, d = Math.sqrt(dx * dx + dy * dy)
    let x = p.x, y = p.y
    if (d > 1e-9 && d < R) {
      const k = 1 - d / R, a = Math.min(MAGNET.pull * k * k, d - 1)
      if (a > 0) { x = Math.round(p.x + (dx / d) * a); y = Math.round(p.y + (dy / d) * a) }
    }
    return { x, y, tone: 'value', v: 1 }
  })
  const marks: Cell[] = [], cx = Math.round(mx), cy = Math.round(my), seen = new Set<number>()
  const n = Math.round(TAU * R)
  for (let s = 0; s < n; s++) {
    const a = (s / n) * TAU, x = Math.round(mx + R * dsin(a + Math.PI / 2)), y = Math.round(my + R * dsin(a)), key = (x + 512) * 1024 + (y + 512)
    if (!seen.has(key)) { seen.add(key); marks.push({ x, y, tone: 'faint', v: .55 }) }
  }
  marks.push({ x: cx, y: cy, tone: 'active', v: 1 })
  return { cells, marks }
}

// ── shatter ────────────────────────────────────────────────────────────────
export const SHATTER = { period: 7, blast: .8, wave: .008, fly: .9, back: 3, stagger: .25, home: .55, near: 5, far: 13, sag: 4 }
const scatters = new Map<string, [number, number][]>()
/** Where each pixel is blown to: out from the word's middle, a hashed distance and a little sag. */
function scatterOf(word: string, px: readonly Px[]): [number, number][] {
  let s = scatters.get(word)
  if (s) return s
  const cx = (wordWidth(word) - 1) / 2, cy = 3
  s = px.map(p => {
    let dx = p.x - cx + (hash01(p.x, p.y, 31) - .5) * 3, dy = p.y - cy + (hash01(p.x, p.y, 37) - .5) * 3
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= d; dy /= d
    const r = SHATTER.near + hash01(p.x, p.y, 21) * (SHATTER.far - SHATTER.near)
    return [p.x + dx * r, p.y + dy * r * .8 + hash01(p.x, p.y, 23) * SHATTER.sag] as [number, number]
  })
  if (scatters.size > 16) scatters.clear()
  scatters.set(word, s)
  return s
}
/** Letters fly home in reading order (spaces skipped): the rank of letter `i`. */
const rankOf = (word: string, i: number) => { let r = 0; for (let k = 0; k < i; k++) if (word[k] !== ' ') r++; return r }
export function shatterFrame(word: string, t: number): Frame {
  t = loopT(t, SHATTER.period)
  if (t < SHATTER.blast) return settled(word)
  const px = wordPixels(word), to = scatterOf(word, px), cx = (wordWidth(word) - 1) / 2
  return {
    cells: px.map((p, j): Cell => {
      const [sx, sy] = to[j]
      const e = clamp01((t - SHATTER.blast - Math.abs(p.x - cx) * SHATTER.wave) / SHATTER.fly), out = 1 - (1 - e) * (1 - e)
      const q = smooth((t - SHATTER.back - rankOf(word, p.i) * SHATTER.stagger) / SHATTER.home)
      const fx = p.x + (sx - p.x) * out, fy = p.y + (sy - p.y) * out
      const x = Math.round(fx + (p.x - fx) * q), y = Math.round(fy + (p.y - fy) * q)
      // flying home is the red; dust that has stopped dims to mid
      return { x, y, tone: q > 0 && q < 1 ? 'active' : e >= 1 && q <= 0 ? 'mid' : 'value', v: 1 }
    }),
    marks: [],
  }
}
