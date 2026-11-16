/**
 * The card runtime shared by the arcade board's games (#131): input, the clock, pausing, the attract loop, best
 * scores and the text overlays. A game itself is a pure sim (src/game/mini); this turns frame contexts into steps.
 *
 * - Attract: until the first press the card plays the autopilot, a pure function of `t` (looped), so goldens and
 *   snapshots are stable. The first press starts a game from a fresh seed; the press itself is not a move.
 * - Input: a `press` game reads pointer presses (`tDown`, timed to the step) and keyboard presses (the button
 *   control's `data[key]` going up while no pointer is down). A `side` game reads a wrapping knob whose value
 *   steps by one per tap on either half or per arrow key: +1 is the right, -1 the left.
 * - Clock: steps run at 60 Hz from the board clock. When `t` runs backwards or jumps (the card left the screen, the
 *   page was hidden) the game pauses until the next press. Under reduced motion there is no clock: a `side` game
 *   (turn-based) takes one step per move, a `press` game stays on its still title.
 * - State lives where the input is, so these cards refuse the sampling worker (as the physics board does).
 */
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Field, Layer, Tone } from '../../engine/types'
import { DT, type MiniGame, type MiniInput, type MiniState } from '../../game/mini/types'
import { TILE, layer, layoutFor, type WidgetContext } from '../types'
import { marching, rr } from './components'

export const T = layoutFor(TILE)
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
const mainThread = () => { if (IN_WORKER) throw new Error('arcade cards keep their game state on the main thread') }

// ── best scores on this device ──────────────────────────────────────────────────────────────────────────
const BEST_KEY = 'dot480:games', MAX_SCORE = 99999
let bests: Record<string, number> | undefined
function loadBests(): Record<string, number> {
  if (bests) return bests
  bests = {}
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(BEST_KEY) ?? 'null') as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw))
      for (const [k, v] of Object.entries(raw)) if (/^[a-z]{1,16}$/.test(k) && Number.isFinite(v)) bests[k] = Math.max(0, Math.min(MAX_SCORE, Math.round(v as number)))
  } catch { /* private mode, bad JSON */ }
  return bests
}
export const bestOf = (id: string) => loadBests()[id] ?? 0
/** Keep `score` if it beats the stored best; true when it does. */
function saveBest(id: string, score: number): boolean {
  const b = loadBests()
  if (score <= (b[id] ?? 0)) return false
  b[id] = Math.min(MAX_SCORE, score)
  try { globalThis.localStorage?.setItem(BEST_KEY, JSON.stringify(b)) } catch { /* storage full / disabled */ }
  return true
}

// ── the session ─────────────────────────────────────────────────────────────────────────────────────────
export type Mode = 'attract' | 'play' | 'paused' | 'over'
export interface View<S> {
  s: S
  mode: Mode
  best: number
  /** The game that just ended set a new best. */
  record: boolean
  /** No clock under reduced motion: a `press` game says so instead of starting. */
  still: boolean
}
export interface SessionOptions {
  /** Control key the game reads. */
  key: string
  kind: 'press' | 'side'
  /** Attract loop length (s) and seed. */
  loop: number
  seed: number
}
/** Knob range of a `side` game (it wraps, so only the step direction matters). */
export const SIDE_N = 8
/** A gap longer than this between frames (s) pauses the game. */
const MAX_GAP = .4, MAX_STEPS = 30, OVER_IDLE = 15

interface Pending { at: number; input: MiniInput }
export interface Session<S> { frame(ctx: WidgetContext): View<S>; reset(): void }

export function session<S extends MiniState>(game: MiniGame<S>, o: SessionOptions): Session<S> {
  let mode: Mode = 'attract', s: S | undefined, lastT = 0, acc = 0, games = 0, record = false, overAt = 0
  let held = false, lastDown = -Infinity, lastSide: number | undefined, pending: Pending[] = [], demo: S | undefined
  const attractAt = (t: number): S => {
    const target = Math.floor((((t % o.loop) + o.loop) % o.loop) / DT + 1e-6)
    if (!demo || demo.frame > target) demo = game.create(o.seed)
    while (demo.frame < target) game.step(demo, game.bot(demo))
    return demo
  }
  /** This frame's inputs, each with the board-clock time it happened (keyboard: the frame's time). */
  const read = (ctx: WidgetContext): Pending[] => {
    const out: Pending[] = [], ps = ctx.pointers ?? []
    if (o.kind === 'side') {
      const v = Math.round(ctx.data[o.key] ?? 0)
      if (lastSide !== undefined && v !== lastSide) {
        const d = (((v - lastSide) % SIDE_N) + SIDE_N) % SIDE_N
        out.push({ at: ctx.t, input: d <= SIDE_N / 2 ? 1 : -1 })
      }
      lastSide = v
      return out
    }
    let newest = lastDown
    for (const p of ps) if (p.tDown > lastDown && p.tDown > 0) { out.push({ at: p.tDown, input: 1 }); if (p.tDown > newest) newest = p.tDown }
    const recent = ps.some(p => p.down || ctx.t - p.tDown < .35)
    const on = (ctx.data[o.key] ?? 0) >= .5
    if (on && !held && !recent) out.push({ at: ctx.t, input: 1 })
    held = on; lastDown = newest
    return out.sort((a, b) => a.at - b.at)
  }
  const start = (t: number) => { s = game.create(o.seed + 7919 * ++games); mode = 'play'; lastT = t; acc = 0; record = false; pending = [] }
  const view = (st: S, m: Mode, still = false): View<S> => ({ s: st, mode: m, best: bestOf(game.id), record, still })

  return {
    reset() { mode = 'attract'; s = undefined; demo = undefined; games = 0; held = false; lastDown = -Infinity; lastSide = undefined; pending = [] },
    frame(ctx) {
      mainThread()
      const t = ctx.t, reduced = !!ctx.reducedMotion, ins = read(ctx), turnBased = o.kind === 'side'
      if (mode === 'attract') {
        if (!ins.length) return view(attractAt(t), 'attract')
        if (reduced && !turnBased) return view(attractAt(t), 'attract', true)
        start(t)
        return view(s!, 'play')
      }
      const g = s!
      if (mode === 'over') {
        if (ins.length && (reduced || t - overAt > .5)) { start(t); return view(s!, 'play') }
        if (!reduced && t - overAt > OVER_IDLE) { mode = 'attract'; return view(attractAt(t), 'attract') }
        return view(g, 'over')
      }
      if (mode === 'paused') {
        if (ins.length && !(reduced && !turnBased)) { mode = 'play'; lastT = t; acc = 0 }
        return view(g, mode)
      }
      // play
      if (reduced) {
        // no clock: a turn-based game moves once per input
        if (turnBased) for (const i of ins) game.step(g, i.input)
      } else {
        const gap = t - lastT
        if (gap < 0 || gap > MAX_GAP) { mode = 'paused'; lastT = t; pending = []; return view(g, 'paused') }
        const t0 = lastT
        lastT = t; acc += gap; pending.push(...ins)
        const n = Math.min(MAX_STEPS, Math.floor(acc / DT + 1e-6))
        acc = n === MAX_STEPS ? 0 : acc - n * DT
        for (let k = 1; k <= n && !g.over; k++) {
          // an input belongs to the first step at or after the moment it happened
          const i = pending.length && (pending[0].at <= t0 + k * DT || k === n) ? pending.shift()!.input : 0
          game.step(g, i)
        }
      }
      if (g.over) { mode = 'over'; overAt = t; record = saveBest(game.id, g.score) }
      return view(g, mode)
    },
  }
}

// ── drawing helpers ─────────────────────────────────────────────────────────────────────────────────────
/** The play area under the label row, and the focus ring that marches round it (DESIGN.md › Interaction). */
export const PLAY_BOX: [number, number, number, number] = [0, 12, 144, 132]
export const focusRing = (ctx: WidgetContext, key: string): Layer[] => (ctx.focus === key ? [marching(rr(3, 14, 137, 127, 6), ctx.t, 0)] : [])
/** Score (or best) top right, in the label row. */
export const corner = (str: string): Layer => layer(T.text(str, 143, 0, { align: 'right' }), 'idle')

/** Card rows a layer's dot covers, so an overlay can clear a band of the field under its text. */
function rowsOf(l: Layer): (v: number) => [number, number] {
  const k = typeof l.lattice === 'number' ? l.lattice : Array.isArray(l.lattice) ? l.lattice[1] : 1, oy = l.origin?.[1] ?? 0
  const rows = latticeGrid(TILE, l.lattice ?? 1, l.origin ?? [0, 0]).rows
  return v => { const r = Math.round(v * (rows - 1)); return [oy + r * k, oy + (r + 1) * k] }
}
/** `layers` with nothing drawn in card rows [y0, y1], and every tone dropped to `faint`: the game behind a message. */
export function behind(layers: Layer[], y0: number, y1: number): Layer[] {
  return layers.map(l => {
    if (l.sites) return { ...l, tone: 'faint' as Tone, toneOf: undefined, sites: l.sites.filter(([, y]) => y < y0 - 2 || y > y1 + 2) }
    const span = rowsOf(l), f = l.field, field: Field = (u, v) => { const [a, b] = span(v); return b <= y0 || a >= y1 ? f(u, v) : 0 }
    // keep the window, so the sampler still scans only where the field can be lit
    if (f.bounds) field.bounds = f.bounds
    return { ...l, tone: 'faint' as Tone, toneOf: undefined, field }
  })
}
/** Centred lines from `row` down: the first at body size, the rest at label size. */
export function message(lines: string[], row: number, tones: Tone[] = ['value', 'idle', 'mid']): Layer[] {
  const out: Layer[] = []
  let y = row
  lines.forEach((s, i) => {
    if (!s) { y += 6; return }
    const k = i === 0 ? 1.3 : 1
    // label-size lines stay on the card grid (a bounded field); only the first line sits on a coarser lattice
    out.push(layer(k === 1 ? T.text(s, 72, y, { align: 'center' }) : T.big(s, 72, y, { lattice: k, align: 'center' }), tones[Math.min(i, tones.length - 1)]))
    y += Math.ceil(7 * k) + 4
  })
  return out
}
/** Overlay text for the modes that pause play: title, paused, game over. `end` names how the game ended. */
export function overlay<S extends MiniState>(v: View<S>, howTo: string[], end: string): string[] | undefined {
  if (v.mode === 'paused') return ['PAUSED', '', 'TAP TO GO ON']
  if (v.mode === 'over') return [end, '', `SCORE ${v.s.score}`, v.record ? 'NEW BEST' : `BEST ${v.best}`, '', 'TAP TO PLAY AGAIN']
  if (v.mode === 'attract') return v.still ? ['MOTION IS OFF', '', 'TURN IT ON TO PLAY'] : ['TAP TO PLAY', '', ...howTo]
  return undefined
}
/** The game's layers under its overlay (if any), with the focus ring and the corner score. */
export function frame<S extends MiniState>(ctx: WidgetContext, key: string, v: View<S>, game: Layer[], lines: string[] | undefined, band: [number, number]): Layer[] {
  const top = v.mode === 'attract' ? `BEST ${v.best}` : `${v.s.score}`
  if (!lines) return [...game, corner(top), ...focusRing(ctx, key)]
  // the attract loop keeps its tones and only clears the band; a pause or game over dims the board behind the words
  const back = v.mode === 'attract' ? game.map(l => cut(l, band[0], band[1])) : behind(game, band[0], band[1])
  return [...back, ...message(lines, band[0] + 3), corner(top), ...focusRing(ctx, key)]
}
/** One layer with nothing in card rows [y0, y1], its tone kept. */
function cut(l: Layer, y0: number, y1: number): Layer {
  const [b] = behind([l], y0, y1)
  return { ...b, tone: l.tone, toneOf: l.toneOf }
}
