/**
 * Studio document ↔ card specs. The Studio keeps its own JSON document (`doc.ts`); specs are adapters
 * on top, so the card spec v1 (`src/spec/`, in progress) plugs in here as one more `CardAdapter`
 * without touching the editor. Today: the JSON spec v0 that `@dot480/core` reads (`presetFromSpec`),
 * IR layers only (text / sites / reference layers have no v0 form and are reported as dropped).
 */
import type { Control } from '../../engine/context'
import type { DotStyle, GridConfig, Tone } from '../../engine/types'
import { irLayer, newCard, stackOrder, type StudioCard } from './doc'

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

/** Adapters by id; spec v1 registers here when `src/spec/` lands (TODO(P6-A): `specV1`). */
export const ADAPTERS: CardAdapter<unknown>[] = [specV0 as CardAdapter<unknown>]
