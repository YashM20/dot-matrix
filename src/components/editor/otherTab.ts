/**
 * Two tabs on MAKE (docs/STATE-MACHINES.md B6-3): each tab autosaves its whole document to one localStorage key, so the
 * last tab to save wins. This tab hears the other tab's save (the `storage` event on `EDITOR_KEY`) and says so, with
 * two ways on: RELOAD opens the other tab's version, KEEP MINE goes on editing (this tab's next autosave wins).
 * Nothing is locked and nothing is merged.
 */
import { create } from 'zustand'
import { historyOf } from '../studio/doc'
import { docFromJSON, docToJSON, EDITOR_KEY } from './doc'
import { saveable, useEditor } from './store'

interface OtherTab {
  /** The document another tab just saved (JSON, as stored), until RELOAD or KEEP MINE. */
  incoming: string | null
}
export const useOtherTab = create<OtherTab>(() => ({ incoming: null }))

/** Another tab wrote `json` to the autosave key. A save of what this tab would save anyway (an echo) is no news. */
export function otherTabSaved(json: string | null): void {
  if (json === null) return
  if (json === docToJSON(saveable(useEditor.getState().h.present))) { useOtherTab.setState({ incoming: null }); return }
  useOtherTab.setState({ incoming: json })
}

/** RELOAD: this tab takes the other tab's version (a fresh undo history, like a page reload). False if it doesn't open. */
export function reloadOtherTab(): boolean {
  const json = useOtherTab.getState().incoming
  useOtherTab.setState({ incoming: null })
  if (json === null) return false
  let doc
  try { doc = docFromJSON(json) } catch (e) {
    useEditor.getState().setNote(`The other tab's version did not open (${String((e as Error)?.message ?? e).slice(0, 120)}). This tab keeps its own.`)
    return false
  }
  useEditor.setState({ h: historyOf(doc), sel: {}, menu: undefined })
  return true
}

/** KEEP MINE: go on editing; this tab's next autosave replaces the other tab's version. */
export function keepMine(): void { useOtherTab.setState({ incoming: null }) }

/** Listen for the other tab's saves on `target` (the window); returns the unsubscribe. */
export function watchOtherTab(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): () => void {
  const on = (e: Event) => { const s = e as StorageEvent; if (s.key === EDITOR_KEY) otherTabSaved(s.newValue) }
  target.addEventListener('storage', on)
  return () => target.removeEventListener('storage', on)
}
