/**
 * Studio time: the timeline (enter → hold → change → exit tracks, previewed with the engine's
 * buffer-level masks and eases), state-machine firing, and data bindings. React-free.
 *
 *   0 ─ enter ─┤ … ├─ change (state A → B) ─┤ … ├─ exit ─ length
 */
import { ease, maskByName, revealDots, transitionDots } from '../../engine/motion'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import type { Pointer } from '../../engine/context'
import { themeTones, type ClipSource } from '../../export'
import type { DotInstance, ThemeTokens } from '../../engine/types'
import { CONTRIB_FIXTURE_NOW, contribFixture, mapContribs, mapWeather, WEATHER_FIXTURE } from '../../data'
import type { Binding, CompiledCard, MachineEdge, Motion, SourceId, StudioCard } from './doc'

export type Track = 'enter' | 'change' | 'exit'
export interface TrackSpan { track: Track; t0: number; t1: number; motion: Motion }
/** Where each track sits on the timeline, seconds. */
export function trackSpans(card: StudioCard): TrackSpan[] {
  const { enter, change, exit } = card.transitions, L = card.timeline.length
  const c0 = Math.min(Math.max(0, card.timeline.changeAt), L)
  return [
    { track: 'enter', t0: 0, t1: Math.min(L, enter.ms / 1000), motion: enter },
    { track: 'change', t0: c0, t1: Math.min(L, c0 + change.ms / 1000), motion: change },
    { track: 'exit', t0: Math.max(0, L - exit.ms / 1000), t1: L, motion: exit },
  ]
}
/** The two states the change track goes between: the first machine edge, else states 0 → 1 (or 0 → 0). */
export function changePair(card: StudioCard): [string, string] {
  const e = card.machine[0]
  if (e) return [e.from, e.to]
  return [card.states[0]?.name ?? '', (card.states[1] ?? card.states[0])?.name ?? '']
}
export const stateData = (card: StudioCard, name: string): Record<string, number> => ({ ...card.data, ...(card.states.find(s => s.name === name)?.data ?? {}) })

export interface FrameInput {
  card: StudioCard
  compiled: CompiledCard
  theme: ThemeTokens
  /** Pointer in card cells (or undefined). */
  pointer?: { x: number; y: number; down: boolean }
  /** Values from bindings, merged over the state data. */
  bound?: Record<string, number>
}
const pitch = (c: StudioCard) => c.grid.pitch ?? 4
export function sampleCard(inp: FrameInput, t: number, data: Record<string, number>): DotInstance[] {
  const { card, compiled, theme, pointer } = inp
  const pointers: Pointer[] | undefined = pointer && [{ id: 0, x: pointer.x, y: pointer.y, inside: true, down: pointer.down, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: pointer.down ? .5 : 0 }]
  return sampleLayers(compiled.layers({ t, data: { ...data, ...inp.bound }, pointers }), { ...card.grid, pitch: pitch(card) }, card.style, theme)
}
const geometry = (c: StudioCard) => ({ cols: c.grid.cols, rows: c.grid.rows, pitch: pitch(c) })

/** The timeline frame at `t`: which track is active (if any) and its eased progress. */
export function timelinePhase(card: StudioCard, t: number): { track?: Track; p: number; afterChange: boolean } {
  const spans = trackSpans(card), [enter, change, exit] = spans
  const afterChange = t >= change.t0
  for (const s of [exit, enter, change]) {
    if (t >= s.t0 && t <= s.t1 && s.t1 > s.t0) return { track: s.track, p: ease[s.motion.ease]((t - s.t0) / (s.t1 - s.t0)), afterChange }
  }
  return { p: 1, afterChange }
}
export function timelineFrame(inp: FrameInput, t: number): DotInstance[] {
  const { card } = inp, [a, b] = changePair(card), g = geometry(card)
  const ph = timelinePhase(card, t), spans = trackSpans(card)
  const dataA = stateData(card, a), dataB = stateData(card, b)
  if (ph.track === 'change') {
    const m = spans[1].motion
    return transitionDots(sampleCard(inp, t, dataA), sampleCard(inp, t, dataB), { ...g, p: ph.p, mask: maskByName(m.mask), edge: .05 })
  }
  const dots = sampleCard(inp, t, ph.afterChange ? dataB : dataA)
  if (ph.track === 'enter') return revealDots(dots, { ...g, p: ph.p, mask: maskByName(spans[0].motion.mask), edge: .06 })
  if (ph.track === 'exit') return revealDots(dots, { ...g, p: ph.p, mask: maskByName(spans[2].motion.mask), edge: .06, exit: true })
  return dots
}

/** A state-machine transition in flight (fired from the state view). */
export interface Firing { edge: MachineEdge; start: number }
export function firingFrame(inp: FrameInput, t: number, f: Firing, now: number): { dots: DotInstance[]; done: boolean } {
  const lin = f.edge.ms > 0 ? (now - f.start) / f.edge.ms : 1
  const to = sampleCard(inp, t, stateData(inp.card, f.edge.to))
  if (lin >= 1) return { dots: to, done: true }
  const from = sampleCard(inp, t, stateData(inp.card, f.edge.from))
  return { dots: transitionDots(from, to, { ...geometry(inp.card), p: ease[f.edge.ease](Math.max(0, lin)), mask: maskByName(f.edge.mask), edge: .05 }), done: false }
}
/** Machine edges leaving `state` (an edge with from `*` leaves every state). */
export const edgesFrom = (card: StudioCard, state: string) => card.machine.filter(e => e.from === state || e.from === '*')

// ── bindings ───────────────────────────────────────────────────────────────
export const SOURCES: { id: SourceId; label: string }[] = [
  { id: 'lfo', label: 'LFO sin(t)' },
  { id: 'clock.sec', label: 'CLOCK SECONDS' },
  { id: 'clock.min', label: 'CLOCK MINUTES' },
  { id: 'pointer.x', label: 'POINTER X' },
  { id: 'pointer.y', label: 'POINTER Y' },
  { id: 'weather.temp', label: 'WEATHER TEMP (FIXTURE)' },
  { id: 'github.today', label: 'GITHUB TODAY (FIXTURE)' },
]
let fixtures: { temp: number; today: number; best: number } | undefined
const fixture = () => fixtures ??= (() => {
  const w = mapWeather(WEATHER_FIXTURE, 'studio'), g = mapContribs(contribFixture(), CONTRIB_FIXTURE_NOW)
  return { temp: w.wxTemp, today: g.ghToday, best: Math.max(1, g.ghBest) }
})()
/** A source's 0..1 reading at time t (wall clock `now`, ms) and pointer (card u/v). */
export function sourceValue(id: SourceId, t: number, now: number, pointer?: { u: number; v: number }): number {
  switch (id) {
    case 'lfo': return .5 + .5 * Math.sin(t * Math.PI)
    case 'clock.sec': return (now / 1000 % 60) / 60
    case 'clock.min': return (now / 60000 % 60) / 60
    case 'pointer.x': return pointer ? Math.max(0, Math.min(1, pointer.u)) : 0
    case 'pointer.y': return pointer ? Math.max(0, Math.min(1, pointer.v)) : 0
    case 'weather.temp': return Math.max(0, Math.min(1, (fixture().temp + 10) / 50))
    case 'github.today': return Math.min(1, fixture().today / fixture().best)
  }
}
/** Values of every `source` binding, mapped onto its min..max. Slider bindings live in the data defaults. */
export function boundValues(bindings: Binding[], t: number, now: number, pointer?: { u: number; v: number }): Record<string, number> | undefined {
  let out: Record<string, number> | undefined
  for (const b of bindings) if (b.kind === 'source' && b.source) (out ??= {})[b.key] = b.min + (b.max - b.min) * sourceValue(b.source, t, now, pointer)
  return out
}

/** The timeline as a clip source: frame(t) is exactly what the preview shows at t (enter / change / exit included). */
export function timelineSource(card: StudioCard, compiled: CompiledCard, theme: ThemeTokens): ClipSource {
  const pitch = card.grid.pitch ?? 4
  return { width: card.grid.cols * pitch, height: card.grid.rows * pitch, background: theme.surface, tones: themeTones(theme), frame: t => timelineFrame({ card, compiled, theme, bound: boundValues(card.bindings, t, Date.now()) }, t) }
}
