/**
 * Board · Heartbeat — an agent presence vocabulary: one animated tile per state (thinking, tool
 * running, awaiting approval, error, done) and one `hb-agent` card whose `data.state` picks the
 * state through a segmented control. Every state is the same "organism" (a smooth metaball blob on
 * a 3-cell lattice) behaving differently. Red (`active`) is spent only on awaiting approval.
 */
import type { Field, Tone } from '../../engine/types'
import { clamp, hash01, smoothstep } from '../../engine/math'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle } as const
type Pt = [number, number]
const TAU = Math.PI * 2

// ── ORGANISM ── lattice-3 stage: 48×28 lattice cells = 144×84 card cells, rows 12..96.
const STAGE = { k: 3, row: 12, w: 48, h: 28, cx: 72, cy: 54 }
const ASP = (STAGE.w * STAGE.k) / (STAGE.h * STAGE.k)
const stage = T.lattice(STAGE.k, 0, STAGE.row)
const onStage = (f: Field) => stage.at(stage.place(f, 0, 0, STAGE.w, STAGE.h))

interface Ball { x: number; y: number; r: number }
/** Sum of r²/d² metaballs → soft body with a brighter core. `dx` shifts the sample (glitch). */
const blob = (balls: Ball[], edge = [.9, 1.5], core = .4) => (x: number, y: number): number => {
  let f = 0
  for (const b of balls) f += (b.r * b.r) / ((x - b.x) ** 2 + (y - b.y) ** 2 + 1e-4)
  return smoothstep(edge[0], edge[1], f) * (1 - core + core * smoothstep(1.4, 5, f))
}
const field = (fn: (x: number, y: number) => number): Field => (u, v) => clamp(fn((u - .5) * ASP, v - .5))
const orbit = (t: number, n: number, rad: number, speed: number, r: number, wob = .02): Ball[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + t * speed
    return { x: Math.cos(a) * rad * ASP * .5 + Math.sin(t * 1.3 + i * 2) * wob, y: Math.sin(a) * rad + Math.cos(t * 1.1 + i * 3) * wob, r }
  })
/** Slow breathing: radius scale 0.88..1.12 over about 5 s. */
const breath = (t: number, depth = .12) => 1 + depth * Math.sin(t * 1.25)

const names = ['THINKING', 'RUNNING TOOL', 'NEEDS APPROVAL', 'ERROR', 'DONE']
const name = (s: number, tone: Tone = 'value') => layer(T.big(names[s], STAGE.cx, 99, { lattice: 1.3, align: 'center' }), tone)

// ── scenes ── each returns the layers of the stage for time `t`.
const thinking = (t: number) => {
  const b = breath(t)
  return [layer(onStage(field(blob([{ x: 0, y: 0, r: .23 * b }, ...orbit(t, 3, .15, .45, .13 * b, .03)]))), 'value')]
}

const RUN = { n: 8, rad: 34, speed: 2.2 }
const toolRunning = (t: number) => {
  const head = t * RUN.speed, sites = (k: number): Pt[] => {
    const a = head - (k * TAU) / RUN.n * 1
    return [[STAGE.cx + Math.cos(a) * RUN.rad, STAGE.cy + Math.sin(a) * RUN.rad]]
  }
  const sweep = field((x, y) => {
    const d = Math.hypot(x / ASP * 1.7, y) // aspect-corrected radius
    const behind = (((head - Math.atan2(y, x)) % TAU) + TAU) % TAU / TAU
    return Math.pow(1 - behind, 3) * smoothstep(.34, .3, d) * smoothstep(.06, .1, d) * .8
  })
  return [
    layer(onStage(sweep), 'mid'),
    layer(onStage(field(blob([{ x: 0, y: 0, r: .075 * breath(t * 2, .08) }]))), 'value'),
    layer(T.dotRing(STAGE.cx, STAGE.cy, RUN.rad, { spacing: 4.2, size: 1.2 }), 'faint'),
    layer(T.dots(sites(0), 3.6), 'value'),
    layer(T.dots(sites(1), 3), 'value'),
    layer(T.dots(sites(2), 2.6), 'mid'),
    layer(T.dots(sites(3), 2.2), 'mid'),
    layer(T.dots([4, 5, 6, 7].flatMap(sites), 1.8), 'idle'),
  ]
}

const awaiting = (t: number) => {
  const p = .5 + .5 * Math.sin(t * 3.4), q = Math.round(p * 4) / 4, b = 1 + .22 * q
  return [
    layer(onStage(field(blob([{ x: 0, y: 0, r: .21 * b }, ...orbit(t, 3, .1, .6, .12 * b, .02)]))), 'active'),
    layer(T.dotRing(STAGE.cx, STAGE.cy, 34 + 3 * q, { spacing: 4.4, size: 1.2 }), q > .5 ? 'activeDim' : 'faint'),
  ]
}

const error = (t: number) => {
  const tt = Math.floor(t * 9), burst = hash01(Math.floor(t * 2.2), 5) > .4 ? 1 : .12
  const base = blob([{ x: 0, y: 0, r: .22 }, { x: .12, y: .04, r: .12 }, { x: -.16, y: -.03, r: .1 }])
  const slip = (seed: number, amp: number): Field => (u, v) => {
    const band = Math.floor(v * 16), dx = (hash01(band, tt, seed) - .5) * amp * burst
    const drop = hash01(band, tt, seed + 9) > 1 - .12 * burst ? .3 : 1
    return clamp(base((u - .5) * ASP + dx, v - .5) * drop)
  }
  return [
    layer(onStage(slip(1, .44)), 'mid'),
    layer(onStage(field((x, y) => base(x, y) * (hash01(Math.floor((y + .5) * 16), tt, 3) > .93 * (burst > .5 ? .6 : 1) ? .35 : 1))), 'value'),
  ]
}

const DONE = { period: 7, checkAt: 1.6, checkLen: 1.1 }
const CHECK: Pt[] = [[-19, 1], [-6, 14], [21, -15]]
const checkDots = (n: number): Pt[] => {
  const pts: Pt[] = []
  for (let k = 0; k < CHECK.length - 1; k++) {
    const [x0, y0] = CHECK[k], [x1, y1] = CHECK[k + 1], m = Math.round(Math.hypot(x1 - x0, y1 - y0) / 3.4)
    for (let i = k ? 1 : 0; i <= m; i++) pts.push([STAGE.cx + x0 + ((x1 - x0) * i) / m, STAGE.cy + y0 + ((y1 - y0) * i) / m])
  }
  return pts.slice(0, Math.ceil(pts.length * n))
}
const done = (t: number) => {
  const ph = t % DONE.period, settle = smoothstep(0, 1.6, ph), p = clamp((ph - DONE.checkAt) / DONE.checkLen)
  const wob = 1 - settle, b = [{ x: 0, y: 0, r: .22 }, ...orbit(t, 3, .14 * wob, .9, .1 * wob, .04 * wob)]
  return [
    layer(onStage(field(blob(b, [.9, 1.4], .15 * (1 - p)))), p > 0 ? 'mid' : 'value'),
    layer(T.dots(checkDots(p), 3.8), 'value'),
  ]
}

const scenes = [thinking, toolRunning, awaiting, error, done]
const make = (id: string, label: string, s: number): WidgetPreset => ({
  id, name: label, label: `HB  ${label}`, ...tile, animated: true,
  layers: (ctx: WidgetContext) => [...scenes[s](ctx.t), name(s, s === 2 ? 'active' : 'value')],
})
export const hbThinking = make('hb-thinking', 'THINKING', 0)
export const hbToolRunning = make('hb-tool-running', 'TOOL RUNNING', 1)
export const hbAwaiting = make('hb-awaiting-approval', 'AWAITING', 2)
export const hbError = make('hb-error', 'ERROR', 3)
export const hbDone = make('hb-done', 'DONE', 4)

// ── AGENT ── `data.state` 0..4 picks the scene; a five-stop segmented control switches it.
const SEG = { x: 8, w: 128, y: 121, labels: ['THK', 'RUN', 'ASK', 'ERR', 'OK'] }
const segX = (i: number) => SEG.x + 12 + (i * (SEG.w - 24)) / 4
const hbAgent: WidgetPreset = {
  id: 'hb-agent', name: 'AGENT', label: 'HB  AGENT', ...tile, animated: true,
  defaults: { state: 0 },
  controls: [{ key: 'state', kind: 'segmented', options: 5, optionLabels: ['Thinking', 'Running tool', 'Awaiting approval', 'Error', 'Done'], box: [SEG.x, SEG.y - 12, SEG.w, 28], label: 'Agent state' }],
  layers: ctx => {
    const s = Math.round(clamp(Number.isFinite(ctx.data.state) ? ctx.data.state : 0, 0, 4))
    const idx = [0, 1, 2, 3, 4]
    return [
      ...scenes[s](ctx.t), name(s, 'value'),
      layer(T.dotLine(segX(0), SEG.y, segX(4), SEG.y, { spacing: 3.2, size: 1.1 }), 'faint'),
      layer(T.dots(idx.filter(i => i !== s).map((i): Pt => [segX(i), SEG.y]), 3), 'mid'),
      layer(T.dots([[segX(s), SEG.y]], 11), 'value'),
      ...idx.map(i => layer(T.big(SEG.labels[i], segX(i), SEG.y + 9, { lattice: 1.3, align: 'center' }), i === s ? 'value' : 'mid')),
    ]
  },
}

export const heartbeatBoard = [hbThinking, hbToolRunning, hbAwaiting, hbError, hbDone, hbAgent]
