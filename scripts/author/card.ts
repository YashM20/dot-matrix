/**
 * Authoring card input → a `WidgetPreset` the headless instruments can render and score.
 *
 * TODO(spec v1): `src/spec` (card spec v1) is being written in parallel. Until it lands, an authored
 * card is one Field IR program + grid/lattice/tone params (plus an optional accent program) — switch
 * `CardInput` to the spec v1 document and `irCard` to its loader when it does.
 */
import { describe } from '../../src/engine/describe'
import { irProgram } from '../../src/engine/ir'
import type { Field, Layer, Tone } from '../../src/engine/types'
import { TILE, tileStyle, widgetById, type WidgetPreset } from '../../src/widgets'

export const TONES = ['auto', 'active', 'activeDim', 'value', 'idle', 'mid', 'faint'] as const satisfies readonly Tone[]

/** One authored card: a Field IR program drawn on a lattice of the card grid. */
export interface IRCard {
  /** Field IR (`dot`) source for the main layer (u, v, t, data.*, pointer.*). */
  ir: string
  /** Card grid; default TILE (144×144 at 2.25 px). */
  grid?: { cols: number; rows: number; pitch?: number }
  /** Lattice factor of the main layer (dots `lattice`× the card pitch apart and bigger); default 1. */
  lattice?: number
  /** Tone of the main layer; default 'auto' (grey band by value). */
  tone?: Tone
  /** Optional accent program: lit in `active` (the board's one red) where its value ≥ `accentCut`. */
  accent?: string
  /** Threshold for the accent program; default 0.5. */
  accentCut?: number
  /** Contrast about 0.5 applied to the main field: v' = (v − .5)·gain + .5 + level; default 1. */
  gain?: number
  /** Brightness offset added after `gain`; default 0. */
  level?: number
  /** Time scale fed to the program as `t`; default 1. */
  speed?: number
  /** `data.*` inputs. */
  data?: Record<string, number>
  name?: string
}
/** Card reference accepted by the tools: a preset id, or an authored IR card. */
export type CardRef = { id: string } | IRCard
export type Resolved = { key: string; preset: WidgetPreset; card?: Required<Omit<IRCard, 'accent' | 'name' | 'data'>> & Pick<IRCard, 'accent' | 'name' | 'data'> }

const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0)

/** Defaults filled in and values bounded, so equal cards normalise (and hash) equally. */
export function normalize(c: IRCard): NonNullable<Resolved['card']> {
  const g = c.grid ?? TILE
  if (!(g.cols >= 8 && g.cols <= 256 && g.rows >= 8 && g.rows <= 256)) throw new Error(`grid ${g.cols}×${g.rows} out of range (8…256)`)
  const k = c.lattice ?? 1
  if (!(k >= .5 && k <= 8)) throw new Error(`lattice ${k} out of range (0.5…8)`)
  return {
    ir: c.ir, grid: { cols: Math.round(g.cols), rows: Math.round(g.rows), ...(g.pitch !== undefined && { pitch: g.pitch }) }, lattice: k,
    tone: c.tone ?? 'auto', accentCut: c.accentCut ?? .5, gain: c.gain ?? 1, level: c.level ?? 0, speed: c.speed ?? 1,
    ...(c.accent !== undefined && { accent: c.accent }), ...(c.name !== undefined && { name: c.name }), ...(c.data !== undefined && { data: c.data }),
  }
}

const fnv1a = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }
/** Stable identity of an authored card (key order fixed by `normalize`). */
export const cardKey = (c: IRCard) => `ir:${fnv1a(JSON.stringify(normalize(c)))}`

/** IR card → preset: one main layer (+ accent layer) through the normal Layer pipeline. */
export function irCard(input: IRCard): WidgetPreset {
  const c = normalize(input), main = irProgram(c.ir, { mode: 'function' }), acc = c.accent ? irProgram(c.accent, { mode: 'function' }) : undefined
  const lat = c.lattice === 1 ? {} : { lattice: c.lattice }
  const key = cardKey(c)
  return {
    id: key, name: c.name ?? key, group: 'composite', grid: c.grid, style: tileStyle,
    animated: main.info.t || !!acc?.info.t, defaults: { ...c.data },
    layers: ctx => {
      const env = { t: ctx.t * c.speed, data: ctx.data }, f = main(env)
      const shaped: Field = (u, v) => clamp01((f(u, v) - .5) * c.gain + .5 + c.level)
      const out: Layer[] = [{ field: shaped, tone: c.tone, ...lat }]
      if (acc) { const a = acc(env); out.push({ field: (u, v) => (a(u, v) >= c.accentCut ? 1 : 0), tone: 'active', ...lat }) }
      return out
    },
  }
}

export function resolveCard(ref: CardRef): Resolved {
  if ('id' in ref) {
    const preset = widgetById(ref.id)
    if (!preset) throw new Error(`unknown card "${ref.id}"`)
    return { key: ref.id, preset }
  }
  const card = normalize(ref)
  return { key: cardKey(card), preset: irCard(card), card }
}

export const describeText = (p: WidgetPreset, t = 0) => describe(p, { t }).summary
