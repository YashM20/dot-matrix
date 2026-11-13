/**
 * Two tabs on MAKE (docs/STATE-MACHINES.md B6-3), without a browser: this process is tab A (the real editor store),
 * tab B is a document it saves to the autosave key, heard through a `storage` event on a stand-in window. The checks:
 *  - B's save shows "Changed in another tab"; a save under another key, or an echo of what A would save, does not;
 *  - RELOAD opens B's version (a fresh undo history), and A saving it back is no news to A;
 *  - KEEP MINE keeps A's document and clears the note;
 *  - a version that doesn't open keeps A's document and says why.
 *
 *   npx tsx scripts/editor-tabs.ts     # also run by `pnpm verify` through `editorTabChecks()`
 */
import { pathToFileURL } from 'node:url'
import { docToJSON, EDITOR_KEY, type EditorDoc } from '../src/components/editor/doc'
import { saveable, useEditor } from '../src/components/editor/store'
import { keepMine, reloadOtherTab, useOtherTab, watchOtherTab } from '../src/components/editor/otherTab'
import type { Assert } from './lib/check'

/** What a browser dispatches in the other tabs when one tab writes localStorage. */
const storage = (key: string, newValue: string | null) => Object.assign(new Event('storage'), { key, newValue })
const renamed = (d: EditorDoc, name: string): EditorDoc => ({ ...d, frames: d.frames.map((f, i) => (i ? f : { ...f, card: { ...f.card, name } })) })

export function editorTabChecks(assert: Assert) {
  const win = new EventTarget(), off = watchOtherTab(win)
  const present = () => useEditor.getState().h.present, incoming = () => useOtherTab.getState().incoming
  try {
    const mine = present()
    assert('editor tabs: the editor starts with a document that has a frame (tab A)', mine.frames.length > 0)
    useEditor.getState().edit(d => renamed(d, 'mine')) // an undo step, so RELOAD's fresh history shows
    const a = present(), b = docToJSON(renamed(a, 'theirs'))

    win.dispatchEvent(storage('dot480.editor.clip', '{}'))
    assert('editor tabs: a save under another key is not about this document', incoming() === null)
    win.dispatchEvent(storage(EDITOR_KEY, docToJSON(saveable(a))))
    assert('editor tabs: another tab saving what this tab would save (an echo) shows nothing', incoming() === null)
    win.dispatchEvent(storage(EDITOR_KEY, null))
    assert('editor tabs: another tab clearing the key shows nothing (nothing to open)', incoming() === null)

    win.dispatchEvent(storage(EDITOR_KEY, b))
    assert('editor tabs: another tab saving a different document shows "Changed in another tab"', incoming() === b)
    assert('editor tabs: hearing it changes nothing yet (no lock, no merge)', present() === a)

    assert('editor tabs: RELOAD opens the other tab\'s version', reloadOtherTab() && docToJSON(present()) === b && incoming() === null, present().frames[0]?.card.name)
    assert('editor tabs: RELOAD starts a fresh undo history (like a page reload)', useEditor.getState().h.past.length === 0)
    win.dispatchEvent(storage(EDITOR_KEY, b))
    assert('editor tabs: after RELOAD, the same version saved again is no news (no ping-pong between tabs)', incoming() === null)

    const now = present(), c = docToJSON(renamed(now, 'third'))
    win.dispatchEvent(storage(EDITOR_KEY, c))
    keepMine()
    assert('editor tabs: KEEP MINE clears the note and keeps this tab\'s document', incoming() === null && present() === now)

    win.dispatchEvent(storage(EDITOR_KEY, '{"v":2,"frames":[{"id":1}]}'))
    const opened = reloadOtherTab(), note = useEditor.getState().note
    assert('editor tabs: a version that does not open keeps this tab\'s document and says why', !opened && present() === now && incoming() === null && /did not open/.test(note), note)
  } finally { off() }
  win.dispatchEvent(storage(EDITOR_KEY, docToJSON(renamed(present(), 'after'))))
  assert('editor tabs: once the editor is gone, nothing listens', incoming() === null)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { assert, done } = (await import('./lib/check')).checker('editor tabs')
  editorTabChecks(assert)
  done()
}
