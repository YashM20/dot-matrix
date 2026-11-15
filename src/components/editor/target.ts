import type { StudioCard, StudioLayer } from '../studio/doc'
import { editCard, editLayer, frameById, layerOf } from './doc'
import { getEditor, useEditor } from './store'

/** The inspector's selection: its frame, layer and edit helpers (one undo step per `tag`). */
export function useTarget() {
  const doc = useEditor(s => s.h.present), sel = useEditor(s => s.sel)
  const f = frameById(doc, sel.frame), l = layerOf(doc, sel)
  const { edit } = getEditor()
  const card = (fn: (c: StudioCard) => StudioCard, tag?: string) => f && edit(d => editCard(d, f.id, fn), tag)
  const layer = (fn: (l: StudioLayer) => StudioLayer, tag?: string) => f && l && edit(d => editLayer(d, { frame: f.id, layer: l.id }, fn), tag ?? `layer:${l.id}`)
  return { doc, sel, f, l, card, layer }
}
