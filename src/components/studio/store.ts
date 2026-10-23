/**
 * Studio state: the document history (undo / redo), the selection, and the preview's time / mode.
 * The preview canvas reads time through `useStudio.getState()` in its own rAF loop, so playing never
 * re-renders the panels faster than the playhead's ~15 Hz.
 */
import { create } from 'zustand'
import { commit, compileCard, historyOf, irLayer, loadLocal, newCard, normalizeZ, redo, saveLocal, textLayer, undo, type CompiledCard, type History, type ProgramCache, type StudioCard, type StudioLayer } from './doc'
import type { Firing } from './playback'

export function starterCard(): StudioCard {
  const c = newCard('starter')
  c.layers = normalizeZ([
    irLayer('// rings\nlet d = length(u - .5, v - .5);\n.5 + .5 * sin(d * 40 - t * 3 - data.level * 6)', { name: 'rings', tone: 'mid', lattice: 2 }),
    textLayer('STUDIO', { name: 'title', params: { col: 72, row: 64, align: 'center' }, lattice: 2, tone: 'value' }),
  ])
  c.data = { level: .3 }
  c.states = [{ name: 'idle', data: { level: .3 } }, { name: 'busy', data: { level: .9 } }]
  c.machine = [{ from: 'idle', to: 'busy', on: 'press', mask: 'radial', ease: 'emphasized', ms: 480 }, { from: 'busy', to: 'idle', on: 'release', mask: 'bayer', ease: 'decelerate', ms: 360 }]
  c.bindings = [{ key: 'level', kind: 'slider', min: 0, max: 1, step: .01 }]
  return c
}

export type PreviewMode = 'timeline' | 'live'
export interface StudioStore {
  h: History
  selected?: string
  mode: PreviewMode
  t: number
  playing: boolean
  /** Current state-machine state (live mode). */
  state: string
  firing?: Firing
  /** Last save / load / import message. */
  note: string
  edit(fn: (c: StudioCard) => StudioCard, tag?: string): void
  editLayer(id: string, fn: (l: StudioLayer) => StudioLayer, tag?: string): void
  replace(card: StudioCard, note?: string): void
  undo(): void
  redo(): void
  select(id?: string): void
  setT(t: number): void
  setPlaying(p: boolean): void
  setMode(m: PreviewMode): void
  fire(edgeIndex: number): void
  /** Fire the first edge leaving the current state on `event` (`press` / `release` from the preview). */
  fireEvent(event: string): boolean
  settle(): void
  setNote(n: string): void
}

const first = loadLocal() ?? starterCard()
export const useStudio = create<StudioStore>((set, get) => ({
  h: historyOf(first),
  selected: first.layers[first.layers.length - 1]?.id,
  mode: 'timeline', t: 1, playing: false, state: first.states[0].name, note: '',
  edit: (fn, tag) => set(s => ({ h: commit(s.h, fn(s.h.present), tag) })),
  editLayer: (id, fn, tag) => get().edit(c => ({ ...c, layers: c.layers.map(l => (l.id === id ? fn(l) : l)) }), tag ?? `layer:${id}`),
  replace: (card, note = '') => set(s => ({ h: commit(s.h, card), selected: card.layers[card.layers.length - 1]?.id, state: card.states[0]?.name ?? '', firing: undefined, note })),
  undo: () => set(s => ({ h: undo(s.h) })),
  redo: () => set(s => ({ h: redo(s.h) })),
  select: selected => set({ selected }),
  setT: t => set({ t, mode: 'timeline' }),
  setPlaying: playing => set({ playing }),
  setMode: mode => set({ mode }),
  fire: i => {
    const e = get().h.present.machine[i]
    if (!e) return
    const from = e.from === '*' ? get().state : e.from
    set({ mode: 'live', state: e.to, firing: { edge: { ...e, from }, start: performance.now() } })
  },
  fireEvent: event => {
    const { h, state } = get(), i = h.present.machine.findIndex(e => (e.from === state || e.from === '*') && e.on === event)
    if (i < 0) return false
    get().fire(i)
    return true
  },
  settle: () => set({ firing: undefined }),
  setNote: note => set({ note }),
}))

// autosave the current document (debounced)
let saveTimer = 0
useStudio.subscribe((s, prev) => {
  if (s.h.present === prev.h.present) return
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => saveLocal(useStudio.getState().h.present), 400)
})

// one compile per document version; IR programs are memoised by source, last good kept per layer
const good: ProgramCache = new Map()
const compiledMemo = new WeakMap<StudioCard, CompiledCard>()
export function compiledOf(card: StudioCard): CompiledCard {
  let c = compiledMemo.get(card)
  if (!c) compiledMemo.set(card, (c = compileCard(card, good)))
  return c
}
export const useCard = () => useStudio(s => s.h.present)
