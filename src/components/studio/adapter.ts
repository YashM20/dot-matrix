/**
 * Studio document ↔ card specs. The Studio keeps its own JSON document (`doc.ts`); specs are adapters
 * on top, so the card spec v1 (`src/spec/`, in progress) plugs in here as one more `CardAdapter`
 * without touching the editor. Today: the JSON spec v0 that `@dot480/core` reads (`presetFromSpec`),
 * IR layers only (text / sites / reference layers have no v0 form and are reported as dropped).
 */
import type { Control } from '../../engine/context'
import type { DotStyle, GridConfig, Tone } from '../../engine/types'
import { exportPreset, loadSpec, type CardSpec, type TransitionSpec } from '../../spec'
import type { WidgetPreset } from '../../widgets'
import { cardPreset, compileCard, irLayer, newCard, newId, stackOrder, textLayer, type Motion, type StudioCard, type StudioLayer } from './doc'

export interface CardAdapter<S> {
  id: string
  /** Document → spec, plus the names of layers the spec cannot carry. */
  toSpec(card: StudioCard): { spec: S; dropped: string[] }
  fromSpec(spec: S): StudioCard
}

/** Structural copy of `packages/core/src/spec.ts` `DotSpec` (v0); kept local so the app does not import packages/. */
export interface DotSpecV0 {
  id?: string; name?: string; grid: GridConfig; style?: Partial<DotStyle>
  layers: { ir: string; tone?: Tone; lattice?: number }[]
  defaults?: Record<string, number>; controls?: Control[]; animated?: boolean
}

export const specV0: CardAdapter<DotSpecV0> = {
  id: 'dot-spec-v0',
  toSpec(card) {
    const dropped: string[] = [], layers: DotSpecV0['layers'] = []
    for (const l of stackOrder(card.layers)) {
      if (!l.visible) continue
      if (l.kind !== 'ir' || l.blend !== 'normal') { dropped.push(l.name); continue }
      layers.push({ ir: l.src, tone: l.tone === 'preset' ? 'auto' : l.tone, ...(l.lattice > 1 && { lattice: l.lattice }) })
    }
    return { spec: { id: card.id, name: card.name, grid: { ...card.grid }, style: { ...card.style }, layers, defaults: { ...card.data }, ...(card.controls.length && { controls: card.controls }), animated: card.animated }, dropped }
  },
  fromSpec(spec) {
    const card = newCard(spec.name ?? 'spec')
    card.grid = { ...spec.grid }
    card.style = { ...card.style, ...spec.style }
    card.layers = spec.layers.map((l, i) => irLayer(l.ir, { name: `layer ${i + 1}`, tone: l.tone ?? 'auto', lattice: l.lattice ?? 1, z: i }))
    card.data = { ...spec.defaults }
    card.controls = spec.controls ?? []
    card.animated = spec.animated ?? true
    return card
  },
}

/**
 * Card spec v1 (`src/spec`). Out: the card as a preset through `exportPreset` (IR / text / sites / generator
 * layers kept as such, anything else baked to a raster layer), plus states, initial state and transitions.
 * In: IR and plain text layers become editable Studio layers; every other spec layer stays a `spec` layer.
 */
const slugId = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'card'
const KEYOK = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
export const specV1: CardAdapter<CardSpec> = {
  id: 'card-spec-v1',
  toSpec(card) {
    const r = exportPreset(cardPreset(card, compileCard(card)), { t: 0 })
    const spec: CardSpec = { ...r.spec, id: slugId(card.name), name: card.name || 'card' }
    const states = card.states.filter(st => KEYOK.test(st.name))
    if (states.length) { spec.states = Object.fromEntries(states.map(st => [st.name, { data: { ...st.data } }])); spec.initial = states[0].name }
    const tr = (m: Motion) => ({ mask: m.mask, ease: m.ease, duration: m.ms })
    spec.transitions = { enter: tr(card.transitions.enter), change: tr(card.transitions.change), exit: tr(card.transitions.exit) }
    return { spec, dropped: r.baked.map(b => `layer ${b.index} baked: ${b.reason}`) }
  },
  fromSpec(input) {
    const res = loadSpec(input)
    if (!res.ok) throw new Error(`card spec: ${res.errors.slice(0, 3).map(e => `${e.path}: ${e.message}`).join('; ')}`)
    const spec = res.spec, card = newCard(spec.name)
    card.grid = { ...spec.grid }
    card.style = { ...card.style, ...spec.style }
    card.data = { ...spec.data }
    card.controls = spec.controls ? structuredClone(spec.controls) : []
    card.layers = spec.layers.map((l, i): StudioLayer => {
      const z = i, name = `${l.kind} ${i + 1}`
      if (l.kind === 'ir' && !l.toneStops && !l.bounds && !l.origin) return irLayer(l.src, { name, z, tone: l.tone ?? 'auto', lattice: l.lattice ?? 1 })
      if (l.kind === 'text' && l.text !== undefined && !l.bind && !l.lattice && !l.origin && !Array.isArray(l.scale))
        return textLayer(l.text, { name, z, tone: l.tone ?? 'value', params: { col: l.at[0], row: l.at[1], align: l.align ?? 'left', scale: l.scale ?? 1, smooth: !!l.smooth } })
      return { id: newId(), name, kind: 'spec', spec: l, tone: 'preset', z, blend: 'normal', visible: true }
    })
    if (spec.states && Object.keys(spec.states).length) {
      const names = Object.keys(spec.states), first = spec.initial && names.includes(spec.initial) ? spec.initial : names[0]
      card.states = [first, ...names.filter(n => n !== first)].map(n => ({ name: n, data: { ...spec.states![n].data } }))
    }
    const t = spec.transitions, mo = (x: TransitionSpec | false | undefined, d: Motion): Motion => (x ? { mask: x.mask, ease: x.ease ?? d.ease, ms: x.duration ?? d.ms } : d)
    card.transitions = { enter: mo(t?.enter, card.transitions.enter), change: mo(t?.change, card.transitions.change), exit: mo(t?.exit, card.transitions.exit) }
    card.animated = spec.layers.some(l => l.kind === 'ir' && /t/.test(l.src))
    return card
  },
}
/** Is this parsed JSON a card spec (v1, or a migratable older version) rather than a Studio document? */
export const looksLikeSpec = (x: unknown) => !!x && typeof x === 'object' && (x as { kind?: string }).kind !== 'dot480.studio' && Array.isArray((x as { layers?: unknown }).layers) && !!(x as { grid?: unknown }).grid

/** A preset as an editable spec v1 stack (its IR / text layers become editable; the rest stay spec layers). */
export const presetAsSpecCard = (p: WidgetPreset): StudioCard => {
  const card = specV1.fromSpec(exportPreset(p, { t: 0 }).spec)
  card.name = `${p.name.toLowerCase()} (spec)`; card.animated = !!p.animated
  return card
}

export const ADAPTERS: CardAdapter<unknown>[] = [specV1 as CardAdapter<unknown>, specV0 as CardAdapter<unknown>]
