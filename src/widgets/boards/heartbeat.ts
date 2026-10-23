/**
 * Board · Heartbeat — an agent presence vocabulary. One organism (a lobed metaball cluster on a
 * 3-cell lattice) behaves differently per agent state; the states are a closed, tokenized set
 * (`HEARTBEAT` / `heartbeatState`) so an agent only writes `data.state`, never draws. One tile per
 * state plus `hb-agent`, whose segmented control switches state and springs between parameter sets.
 * Red (`active`) is spent once on the board: the awaiting-approval organism's pulse.
 */
import type { Field, Layer, Tone } from '../../engine/types'
import { clamp, hash01, smoothstep } from '../../engine/math'
import { TAU, TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import { OUTLINE, stadium } from './components'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: { ...tileStyle, cornerRoundness: 0 } } as const
type Pt = [number, number]

// ── TOKENS ── the closed presence vocabulary: state → motion parameters (cells, seconds, 0..1).
export interface HeartbeatParams {
  /** Core ball radius, cells. */ core: number
  /** Satellite lobe radius, cells. */ lobe: number
  /** Lobe distance from the core, cells. */ spread: number
  /** Lobe rotation, rad/s. */ drift: number
  /** Breathing rate (Hz) and depth (radius scale). */ breathHz: number; breath: number
  /** Slow whole-body wander, cells. */ wander: number
  /** Lub-dub heartbeat rate (Hz) and depth (radius scale). */ beatHz: number; beat: number
  /** Orbit ring + scanning comet visibility, and seconds per revolution. */ orbit: number; orbitPeriod: number
  /** Row-offset stutter strength. */ glitch: number
  /** Condensed into a check mark. */ check: number
  /** 1 = the pulse is the board's accent (`active`); only one state may set it. */ accent: number
}
export type HeartbeatState = 'thinking' | 'tool-running' | 'awaiting-approval' | 'error' | 'done'
const base: HeartbeatParams = { core: 14, lobe: 9, spread: 12, drift: .2, breathHz: .2, breath: .08, wander: 0, beatHz: 0, beat: 0, orbit: 0, orbitPeriod: 8, glitch: 0, check: 0, accent: 0 }
export const HEARTBEAT: Readonly<Record<HeartbeatState, Readonly<HeartbeatParams>>> = {
  thinking: { ...base, core: 14, lobe: 11, spread: 18, drift: .18, breathHz: .2, breath: .1, wander: 3 },
  'tool-running': { ...base, core: 13, lobe: 7, spread: 8, drift: .9, breathHz: .7, breath: .04, orbit: 1 },
  'awaiting-approval': { ...base, core: 15, lobe: 8, spread: 9, drift: .3, breathHz: 0, breath: 0, beatHz: .85, beat: .18, accent: 1 },
  error: { ...base, core: 14, lobe: 9, spread: 11, drift: .06, breathHz: .3, breath: .03, glitch: 1 },
  done: { ...base, core: 13, lobe: 7, spread: 8, drift: .12, breathHz: .25, breath: .04, check: 1 },
}
export const HEARTBEAT_STATES = Object.keys(HEARTBEAT) as HeartbeatState[]
/** Motion parameters for a presence state (unknown names fall back to `thinking`). */
export const heartbeatState = (name: string): Readonly<HeartbeatParams> => HEARTBEAT[name as HeartbeatState] ?? HEARTBEAT.thinking
/** Parameters part-way between two states (`f` 0..1) — what a sprung `data.state` draws mid-transition. */
export const blendStates = (a: HeartbeatParams, b: HeartbeatParams, f: number): HeartbeatParams => {
  const out = { ...a }
  for (const k of Object.keys(a) as (keyof HeartbeatParams)[]) out[k] = a[k] + (b[k] - a[k]) * f
  return out
}

// ── ORGANISM ── metaballs evaluated per lattice-3 dot, in card cells.
interface Stage { row: number; h: number; cx: number; cy: number; scale: number }
const K = 3, COLS = Math.floor(TILE.cols / K)
const stageAt = (row: number, h: number, scale: number): Stage => ({ row, h, cx: (TILE.cols - 1) / 2, cy: row + (K * (h - 1)) / 2 + 1, scale })
const CHECK: Pt[] = [[-25, 2], [-9, 18], [26, -17]]
const segDist = (x: number, y: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))
  return Math.hypot(x - ax - t * dx, y - ay - t * dy)
}
/** Lub-dub envelope for beat phase `ph` in [0,1). */
const lubDub = (ph: number) => Math.max(Math.exp(-(((ph - .04) / .07) ** 2)), .55 * Math.exp(-(((ph - .27) / .07) ** 2)))
interface Ball { x: number; y: number; r: number }
const balls = (p: HeartbeatParams, t: number, s: Stage): Ball[] => {
  const beat = p.beatHz ? lubDub((t * p.beatHz) % 1) : 0
  const k = s.scale * (1 + p.breath * Math.sin(t * TAU * p.breathHz) + p.beat * beat) * (1 - .7 * p.check)
  const cx = s.cx + p.wander * Math.sin(t * .23), cy = s.cy + p.wander * .7 * Math.sin(t * .17 + 1)
  const out: Ball[] = [{ x: cx, y: cy, r: p.core * k }]
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + t * p.drift + .45 * Math.sin(t * .37 + i * 1.9)
    const d = p.spread * k * (1 + .3 * Math.sin(t * .5 + i * 2.1)), r = p.lobe * k * (.85 + .25 * Math.sin(t * .43 + i * 1.3))
    out.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r })
  }
  // tool running: a lobe leans toward the scanning comet (attention)
  if (p.orbit > 0) { const a = (t / p.orbitPeriod) * TAU - Math.PI / 2; out.push({ x: cx + Math.cos(a) * p.core * k, y: cy + Math.sin(a) * p.core * k, r: p.lobe * 1.1 * k * p.orbit }) }
  return out
}
/** Organism density at card cell (x,y): metaball sum, cross-faded into a check-mark stroke by `p.check`. */
const density = (bs: Ball[], p: HeartbeatParams, s: Stage, x: number, y: number) => {
  let f = 0
  if (p.check < 1) for (const b of bs) f += (b.r * b.r) / ((x - b.x) ** 2 + (y - b.y) ** 2 + 1e-3)
  if (p.check <= 0) return f
  const lx = (x - s.cx) / s.scale, ly = (y - s.cy) / s.scale, d = Math.min(segDist(lx, ly, CHECK[0], CHECK[1]), segDist(lx, ly, CHECK[1], CHECK[2]))
  return f * (1 - p.check) + p.check * (4.6 / (d + .4)) ** 2
}
/** The organism as a lattice-3 layer: soft edge, mid body, highlight up-left (void → mid → highlight). */
const organism = (p: HeartbeatParams, t: number, s: Stage, tone: Tone): Layer => {
  // glitch: bursts of whole-lattice-cell row offsets at 12 steps/s, the body freezing mid-burst
  const burst = p.glitch > 0 && (t % 1.5) < .5 ? p.glitch : 0, step = Math.floor(t * 12)
  const bs = balls(p, burst ? Math.floor(t * 4) / 4 : t, s), e = .14 * (1 - p.check) + .06 * p.check
  const blackout = burst > .5 && hash01(step, 41) > .86, reach = (p.core + p.spread) * s.scale
  // highlight sits up-left; while a tool runs it turns to face the comet (the organism watches it)
  const gaze = (t / p.orbitPeriod) * TAU - Math.PI / 2, o = clamp(p.orbit)
  const lightX = -.3 * (1 - o) + .4 * o * Math.cos(gaze), lightY = -.3 * (1 - o) + .4 * o * Math.sin(gaze)
  const pulse = p.beatHz ? lubDub((t * p.beatHz) % 1) * Math.min(1, p.beat / .1) : 0
  const f: Field = (u, v) => {
    const c = u * COLS - .5, r = v * s.h - .5
    let x = K * c + 1
    const y = s.row + K * r + 1
    if (burst) {
      if (blackout) return 0
      const band = Math.floor((r + 1000) / 3)
      if (hash01(band, step, 7) > 1 - .16 * burst) return 0
      if (hash01(band, step, 3) < .45 * burst) x -= K * Math.round((hash01(band, step, 5) - .5) * 8)
    }
    const S = density(bs, p, s, x, y), body = smoothstep(1 - e, 1 + e, S)
    if (!body) return 0
    // key light from the upper left: the lit side of the dense interior is highlight, the rest mid
    const lx = bs[0].x + lightX * reach - x, ly = bs[0].y + lightY * reach - y
    const lit = smoothstep(1.1, 2.2, S) * (p.check + (1 - p.check) * Math.exp(-(lx * lx + ly * ly) / (2 * (.5 * reach) ** 2)))
    return body * (.48 + .25 * pulse + (.52 - .25 * pulse) * lit)
  }
  return layer(T.lattice(K, 0, s.row).at(T.lattice(K, 0, s.row).place(f, 0, 0, COLS, s.h)), tone)
}
/** Ring of sites around the organism with a comet sweeping it (orbit), or a ripple after each beat. */
const halo = (p: HeartbeatParams, t: number, s: Stage): Layer[] => {
  const out: Layer[] = []
  if (p.orbit > .05) {
    const R = 44 * s.scale, n = Math.round((TAU * R) / 4.4), head = Math.floor((t / p.orbitPeriod) * n)
    const site = (i: number): Pt => { const a = (((i % n) + n) % n) / n * TAU - Math.PI / 2; return [s.cx + R * Math.cos(a), s.cy + R * Math.sin(a)] }
    const tail = [3.8, 3.2, 2.8, 2.5, 2.2, 2, 1.8, 1.6, 1.5, 1.4].map((size, i) => ({ size, tone: (i < 2 ? 'value' : i < 5 ? 'mid' : 'idle') as Tone }))
    const v = () => p.orbit
    out.push(layer({ ...T.dots(Array.from({ length: n - tail.length }, (_, i) => site(head + 1 + i)), 1.4), field: v }, 'faint'))
    tail.forEach((d, i) => out.push(layer({ ...T.dots([site(head - i)], d.size), field: v }, d.tone)))
  }
  if (p.beat > .02 && p.beatHz) {
    const ph = (t * p.beatHz) % 1, R = Math.round((34 + 22 * smoothstep(0, .8, ph)) * s.scale / 2) * 2, n = Math.round((TAU * R) / 4.6)
    const fade = (1 - smoothstep(.1, .85, ph)) * Math.min(1, p.beat / .1)
    if (fade > .1) out.push(layer({ ...T.dotRing(s.cx, s.cy, R, { spacing: (TAU * R) / n, size: 1.3 }), field: () => fade }, 'idle'))
  }
  return out
}

// ── CARDS ── eyebrow names the state; a small status line says what the agent is doing.
const STAGE = stageAt(12, 36, 1)
const FOOT = 136
const clock = (t: number) => { const s = Math.floor(t) % 600; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const STATUS: Record<HeartbeatState, [string, (t: number) => string]> = {
  thinking: ['PLANNING NEXT STEP', clock],
  'tool-running': ['PNPM TEST', clock],
  'awaiting-approval': ['EDIT 3 FILES?', () => 'Y/N'],
  error: ['EXIT CODE 1', () => 'RETRY'],
  done: ['12 FILES CHANGED', () => '0:42'],
}
const statusLine = (st: HeartbeatState, t: number, row: number): Layer[] => [
  layer(T.text(STATUS[st][0], 0, row), 'mid'),
  layer(T.text(STATUS[st][1](t), TILE.cols - 1, row, { align: 'right' }), 'value'),
]
const scene = (p: HeartbeatParams, t: number, s: Stage, accent: boolean) => [...halo(p, t, s), organism(p, t, s, accent && p.accent > .5 ? 'active' : 'value')]
/** Done tile: blob → condense (1.4 s, decelerating) → hold the check → relax back, on a 7 s loop (t = 0 opens on the held check). */
/** Done tile: blob → condense (1.4 s, decelerating) → hold the check → relax back, on a 7 s loop. */
const doneCheck = (t: number) => {
  const ph = (t + 4) % 7
  return ph < 1 ? 0 : ph < 2.4 ? 1 - (1 - (ph - 1) / 1.4) ** 3 : ph < 5.6 ? 1 : 1 - smoothstep(5.6, 7, ph)
}
const make = (id: string, index: number, label: string, st: HeartbeatState): WidgetPreset => ({
  id, name: label, label: `0${index}  ${label}`, ...tile, animated: true,
  layers: (ctx: WidgetContext) => {
    const p = st === 'done' ? { ...HEARTBEAT.done, check: doneCheck(ctx.t) } : HEARTBEAT[st]
    return [...scene(p, ctx.t, STAGE, true), ...statusLine(st, ctx.t, FOOT)]
  },
})
export const hbThinking = make('hb-thinking', 1, 'THINKING', 'thinking')
export const hbToolRunning = make('hb-tool-running', 2, 'TOOL RUNNING', 'tool-running')
export const hbAwaiting = make('hb-awaiting-approval', 3, 'AWAITING APPROVAL', 'awaiting-approval')
export const hbError = make('hb-error', 4, 'ERROR', 'error')
export const hbDone = make('hb-done', 5, 'DONE', 'done')

// ── AGENT ── `data.state` 0..4 (sprung) picks the parameters; the knob glides between stops.
const AGENT = stageAt(12, 28, .78)
const SEG = { x: 6, y: 106, w: 132, h: 18, knob: 13, labels: ['THK', 'RUN', 'ASK', 'ERR', 'OK'] }
const segX = (i: number) => SEG.x + SEG.h / 2 + (i * (SEG.w - SEG.h)) / 4
const track = (d: number, spacing: number) => stadium(SEG.x - d, SEG.y - d, SEG.w + 2 * d, SEG.h + 2 * d, spacing)
const hbAgent: WidgetPreset = {
  id: 'hb-agent', name: 'AGENT', label: '06  AGENT', ...tile, animated: true,
  defaults: { state: 0 },
  springKeys: ['state'],
  controls: [{ key: 'state', kind: 'segmented', options: 5, optionLabels: ['Thinking', 'Running tool', 'Awaiting approval', 'Error', 'Done'], box: [SEG.x, SEG.y - 4, SEG.w, SEG.h + 18], label: 'Agent state' }],
  layers: ctx => {
    const s = clamp(Number.isFinite(ctx.data.state) ? ctx.data.state : 0, 0, 4), i0 = Math.min(3, Math.floor(s)), sel = Math.round(s)
    const p = blendStates(HEARTBEAT[HEARTBEAT_STATES[i0]], HEARTBEAT[HEARTBEAT_STATES[i0 + 1]], s - i0)
    const hover = ctx.hover === 'state', pressed = ctx.pressed === 'state', focus = ctx.focus === 'state'
    const cy = SEG.y + SEG.h / 2, mark = Math.floor(ctx.t * 10)
    return [
      // red-free: the agent card's pulse stays in `value`, so the board spends red once
      ...scene(p, ctx.t, AGENT, false), ...statusLine(HEARTBEAT_STATES[sel], ctx.t, 94),
      layer(T.dots(track(0, OUTLINE.spacing), OUTLINE.size), 'mid'),
      layer(T.dots([0, 1, 2, 3, 4].filter(i => Math.abs(i - s) > .5).map((i): Pt => [segX(i), cy]), 3), 'mid'),
      layer({ ...T.dots([[SEG.x + SEG.h / 2 + (s * (SEG.w - SEG.h)) / 4, cy]], SEG.knob), field: () => (pressed ? .75 : 1) }, 'value'),
      ...SEG.labels.map((l, i) => layer(T.text(l, segX(i), SEG.y + SEG.h + 6, { align: 'center' }), i === sel ? 'value' : 'idle')),
      ...(hover ? [layer({ ...T.dots(track(2.6, OUTLINE.spacing), OUTLINE.size), field: () => .5 }, 'value')] : []),
      // focus: the track's own sites march (no extra outline: the status line and labels sit close)
      ...(focus ? [layer(T.dots(track(0, OUTLINE.spacing).filter((_, i) => (((i - mark) % 5) + 5) % 5 < 2), OUTLINE.size), 'value')] : []),
    ]
  },
}

export const heartbeatBoard = [hbThinking, hbToolRunning, hbAwaiting, hbError, hbDone, hbAgent]
