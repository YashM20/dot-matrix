/**
 * Links into MAKE (#142, #143): a `?make=code&p=…` program and a `?make&d=…` frame or document link. Each is decoded
 * and checked, then waits for the visitor: the prompt says what the link holds, and nothing is added (or autosaved)
 * until they press KEEP. A link this document opened already (a reload, Back) only re-selects, so there is nothing
 * to ask. A kept program goes into the remix gallery once it has drawn one frame within the user-program budget.
 * Styles: `.ed-confirm` in editor.css.
 */
import { useEffect, useRef, useState } from 'react'
import { decodeShare } from '../../lib/share'
import type { Mode } from '../../site/views'
import { loadGallery, recordProgram } from '../dwitter/gallery'
import { decodeLink, LINK_PARAM } from './link'
import { getEditor, whenDrawn, type PendingImport } from './store'

/** A link waiting for KEEP or DISMISS. */
export interface LinkPrompt { id: number; summary: string; keep(): void; dismiss(): void }

/** `?make=code&p=…` / `?make&d=…` already handled this page load (a re-render or re-entry must not ask twice). */
let handledP = '', handledD = '', nextId = 0
const newId = () => ++nextId
const param = (k: string) => new URLSearchParams(location.search).get(k)

/** Decode the page's links and hold each until the visitor keeps it. Returns the prompt to show (the oldest first). */
export function useLinkImports(mode: Mode, onError: (why: string) => void): LinkPrompt | undefined {
  const [queue, setQueue] = useState<LinkPrompt[]>([])
  const ask = <T,>(pending: PendingImport<T>, kept: (r: T) => void) => {
    if (pending.already) { kept(pending.confirm()); return }
    const id = newId(), done = () => setQueue(q => q.filter(x => x.id !== id))
    const prompt: LinkPrompt = {
      id, summary: pending.summary,
      keep: () => { done(); kept(pending.confirm()) },
      dismiss: () => { done(); getEditor().setNote('The link was not opened. Reload the page to see it again.') },
    }
    setQueue(q => [...q, prompt])
  }

  // a program (`?make=code&p=…`): only on the CODE entry, like before
  useEffect(() => {
    const p = mode === 'CODE' ? param('p') : null
    if (!p || p === handledP) return
    handledP = p
    decodeShare(p).then(prog => ask(getEditor().stageProgram(prog), id => {
      onError('')
      whenDrawn(id, () => recordProgram(loadGallery(), prog)) // into the gallery once it drew within budget
    }), (e: Error) => onError(`Could not open this link: ${e.message}`))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // a frame or document link (`?make&d=…`, E5)
  useEffect(() => {
    const d = param(LINK_PARAM)
    if (!d || d === handledD) return
    handledD = d
    decodeLink(d).then(link => ask(getEditor().stageLink(link), r => {
      if (typeof r === 'string') { onError(`Could not open this link: ${r}`); return }
      onError('')
      const n = link.frames.length
      getEditor().setNote(`${link.kind === 'frame' ? 'frame' : `${n} frame${n === 1 ? '' : 's'}`} from a link: ${link.name}${link.parent ? ` · remix of #${link.parent}` : ''}`)
    }), (e: Error) => onError(`Could not open this link: ${e.message}`))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return queue[0]
}

/**
 * The question over the canvas: a non-modal `<dialog open>` (the canvas stays usable). KEEP has focus; Esc dismisses.
 * The editor's own keys leave it alone.
 */
export function ImportPrompt({ prompt }: { prompt: LinkPrompt }) {
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => { keep.current?.focus({ preventScroll: true }) }, [prompt.id])
  return (
    <dialog open className="ed-confirm" role="alertdialog" aria-labelledby="ed-confirm-t" aria-describedby="ed-confirm-d"
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); prompt.dismiss() } }}>
      <b id="ed-confirm-t">OPEN THIS LINK?</b>
      <p id="ed-confirm-d">{prompt.summary}.</p>
      <p className="ed-hint">A link can hold any frame or program. It stays out of this browser's saved document until you keep it.</p>
      <div className="ed-confirm-btns">
        <button ref={keep} type="button" className="ed-confirm-keep" onClick={prompt.keep}>KEEP</button>
        <button type="button" onClick={prompt.dismiss}>DISMISS</button>
      </div>
    </dialog>
  )
}
