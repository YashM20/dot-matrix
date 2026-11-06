/**
 * describe(): a pure text description of a card, so agents can *read* any board (MCP
 * `describe_board`, screen readers, logs). It calls the card's own `layers(ctx)` once and reads
 * metadata only — control values from `data`, strings from text fields (`Field.text`) — so it never
 * samples, renders or touches the DOM, and the same context always gives the same description.
 */
import type { Control, FrameContext } from './context'
import type { GridConfig, Layer } from './types'

/** What `describe` needs from a card (structurally a widget preset; the engine does not import widgets). */
export interface Describable {
  id: string
  name: string
  label?: string
  group?: string
  grid: GridConfig
  animated?: boolean
  /** Shows real data from a feed (not the red header dot, which is `live`). */
  liveData?: boolean
  clock?: boolean
  controls?: Control[]
  defaults?: Record<string, number>
  layers(ctx: FrameContext): Layer[]
}
export interface DescribableBoard { id: string; title: string; items: Describable[] }

export interface ControlDescription {
  key: string
  kind: Control['kind']
  label: string
  value: number
  /** `value` in words: the option name, on/off, a percentage of the range, … */
  valueText: string
  min: number; max: number
}
export interface CardDescription {
  id: string
  name: string
  /** `ctx.state`, else the first segmented / toggle control's value, else `animated` / `static`. */
  state: string
  /** Data the card was described with (defaults merged under `ctx.data`), keys sorted. */
  data: Record<string, number>
  controls: ControlDescription[]
  /** Strings drawn on the card, in layer order (duplicates removed). */
  text: string[]
  /** One paragraph for an agent or a log: id, group, state, text and controls. */
  summary: string
  /** The accessible name of the card's picture: its name, then the words drawn on it (no ids, no controls). */
  label: string
}
export interface BoardDescription { id: string; title: string; cards: CardDescription[]; summary: string }

const num = (x: number) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(3)))

/**
 * A control's value in words: the card's own `valueText` when it has one, else a percentage of the range, the option
 * name, on / off. `key` reads one axis of an xy pad (`aria-valuetext` per axis); without it an xy pad reads "x, y".
 */
export function controlValueText(c: Control, data: Record<string, number>, key?: string): string {
  const min = c.min ?? 0, max = c.max ?? (c.kind === 'segmented' ? Math.max(0, (c.options ?? 1) - 1) : 1), k = key ?? c.key
  const v = Number.isFinite(data[k]) ? data[k] : min
  if (c.valueText) {
    const said = (ak: string) => {
      try {
        const s = c.valueText!(Number.isFinite(data[ak]) ? data[ak] : min, data, ak)
        return typeof s === 'string' && s.trim() ? s.trim().slice(0, 120) : ''
      } catch { return '' } // a card that cannot word this value falls back to the default
    }
    const s = c.kind === 'xy' && key === undefined && c.keyY ? [said(c.key), said(c.keyY)].filter(Boolean).join(', ') : said(k)
    if (s) return s
  }
  switch (c.kind) {
    case 'segmented': { const i = Math.round(v); return c.optionLabels?.[i] ?? String(i + 1) }
    case 'toggle': return v >= .5 ? 'on' : 'off'
    case 'button': return v >= .5 ? 'pressed' : 'released'
    case 'xy': if (key === undefined) return `${num(v)}, ${num(Number.isFinite(data[c.keyY ?? '']) ? data[c.keyY!] : 0)}`
      return max > min ? `${Math.round(((v - min) / (max - min)) * 100)}%` : num(v)
    case 'stepper': case 'crank': return num(v)
    default: return max > min ? `${Math.round(((v - min) / (max - min)) * 100)}%` : num(v)
  }
}

/** Describe one card under `ctx` (missing fields default to t = 0 and the card's `defaults`). */
export function describe(preset: Describable, ctx: Partial<FrameContext> = {}): CardDescription {
  const merged = { ...preset.defaults, ...ctx.data }
  const data: Record<string, number> = {}
  for (const k of Object.keys(merged).sort()) data[k] = merged[k]
  const frame: FrameContext = { ...ctx, t: ctx.t ?? 0, data }
  const controls: ControlDescription[] = (preset.controls ?? []).map(c => ({
    key: c.key, kind: c.kind, label: c.label,
    value: Number.isFinite(data[c.key]) ? data[c.key] : (c.min ?? 0),
    valueText: controlValueText(c, data),
    min: c.min ?? 0, max: c.max ?? (c.kind === 'segmented' ? Math.max(0, (c.options ?? 1) - 1) : 1),
  }))
  const text: string[] = []
  let layers: Layer[] = []
  try { layers = preset.layers(frame) } catch { /* a card that cannot draw this context still gets a description */ }
  for (const l of layers) { const s = l.field.text?.trim(); if (s && !text.includes(s)) text.push(s) }
  // one toggle can stand for the card's state; with several (chips, a step sequencer) the first says nothing about it
  const toggles = controls.filter(c => c.kind === 'toggle')
  const pick = controls.find(c => c.kind === 'segmented') ?? (toggles.length === 1 ? toggles[0] : undefined)
  const state = ctx.state ?? (pick ? pick.valueText : preset.animated ? 'animated' : 'static')
  const parts = [`${preset.name} (${preset.id}${preset.group ? `, ${preset.group}` : ''}${preset.liveData ? ', live' : ''}): ${state}.`]
  if (text.length) parts.push(`Shows ${text.map(s => `"${s}"`).join(', ')}.`)
  if (controls.length) parts.push(`Controls: ${controls.map(c => `${c.label} = ${c.valueText} (${c.kind})`).join('; ')}.`)
  const ui = (['hover', 'pressed', 'focus'] as const).filter(k => ctx[k]).map(k => `${k} ${ctx[k]}`)
  if (ui.length) parts.push(`Input: ${ui.join(', ')}.`)
  return { id: preset.id, name: preset.name, state, data, controls, text, summary: parts.join(' '), label: spokenLabel(preset, text) }
}

/** Longest accessible name the site reads out; a card that prints a lot (a news list) stops at a whole string. */
const LABEL_MAX = 240
/** Name, then the drawn strings, minus the label row that only repeats the name. */
function spokenLabel(preset: Describable, text: string[]): string {
  const name = `${preset.name}${preset.liveData ? ' (live)' : ''}`, own = new Set([preset.name, preset.label ?? ''].map(s => s.replace(/\s+/g, ' ').trim().toUpperCase()))
  let out = name, first = true
  for (const s of text) {
    if (own.has(s.replace(/\s+/g, ' ').trim().toUpperCase())) continue
    const next = `${out}${first ? ': ' : ', '}${s}`
    if (next.length > LABEL_MAX) break
    out = next; first = false
  }
  return out
}

/** Describe every card on a board (cards listed once per id, board order). */
export function describeBoard(board: DescribableBoard, ctx: Partial<FrameContext> = {}): BoardDescription {
  const seen = new Set<string>(), cards: CardDescription[] = []
  for (const p of board.items) if (!seen.has(p.id)) { seen.add(p.id); cards.push(describe(p, ctx)) }
  return { id: board.id, title: board.title, cards, summary: `${board.title} (${board.id}): ${cards.length} cards — ${cards.map(c => `${c.name} ${c.state}`).join(', ')}.` }
}
