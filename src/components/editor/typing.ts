/**
 * Text typed in place on the canvas (docs/EDITOR-PLAN.md E3). One hidden input, always mounted (so a
 * tap can focus it inside its own handler and the phone keyboard opens), feeds the selected text layer;
 * the frame redraws through `textAt` / `T.big` as you type, so the letters on the canvas are always dots.
 * A typing session is one gesture (`begin` / `live` / `end`): Enter, a tap elsewhere or a blur commit it
 * as one undo step, Esc cancels it. A layer left empty goes; a layer the Text tool made just now and
 * left empty leaves no trace at all.
 */
import { editLayer, frameById, layerOf, pitchOf, removeLayer } from './doc'
import { editableText, textGeo, textOf, withText } from './direct'
import { validSel } from './select'
import { useEditor } from './store'

let input: HTMLInputElement | null = null
let onCaret: (() => void) | undefined
let session: { frame: string; layer: string; created: boolean } | undefined
const st = () => useEditor.getState()

/** The always-mounted input, and how to tell its view that the caret moved. */
export const bindTypingInput = (el: HTMLInputElement | null, caret?: () => void) => { input = el; onCaret = caret }
export const isTyping = () => !!session

/**
 * Start typing into text layer `layer` of `frame`: focuses the input (call it from the tap / click /
 * key handler itself), selects all of the text (or puts the caret at `caret`). `begun`: the caller already
 * began the gesture (the Text tool adds the layer in it, so adding and typing undo together).
 */
export function startTyping(frame: string, layer: string, o: { begun?: boolean; created?: boolean; caret?: number } = {}): boolean {
  const s = st(), f = frameById(s.h.present, frame), l = layerOf(s.h.present, { frame, layer })
  if (!f || !l || !editableText(l) || f.locked || f.locks?.includes(l.id)) { if (o.begun) s.cancel(); return false }
  if (session) commitTyping()
  if (!o.begun) s.begin()
  session = { frame, layer, created: !!o.created }
  if (input) {
    input.value = textOf(l)
    input.focus({ preventScroll: true })
    if (o.caret === undefined) input.select(); else input.setSelectionRange(o.caret, o.caret)
  }
  s.select({ frame, layer }); s.setTyping({ frame, layer })
  keepInView(frame, layer)
  return true
}
/** The input changed: the layer takes the new text (upper case, ≤ 64). */
export function typeText(value: string) {
  const ses = session
  if (!ses) return
  st().live(d => editLayer(d, ses, l => withText(l, value)))
}
export function placeCaret(i: number) { if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(i, i); onCaret?.() } }
/** Finish typing: one undo step (none if nothing changed). An emptied layer is removed. */
export function commitTyping() {
  const ses = session
  if (!ses) return
  session = undefined
  const s = st(), l = layerOf(s.h.present, ses)
  if (l && editableText(l) && !textOf(l).trim()) {
    if (ses.created) s.cancel()
    else { s.live(d => removeLayer(d, ses)); s.end() }
    s.select(validSel(st().h.present, { frame: ses.frame }))
  } else s.end()
  s.setTyping(undefined)
  if (input && document.activeElement === input) input.blur()
}
/** Esc: the text goes back to what it was (a layer the Text tool just made goes too). */
export function cancelTyping() {
  const ses = session
  if (!ses) return
  session = undefined
  const s = st()
  s.cancel(); s.setTyping(undefined)
  s.select(validSel(st().h.present, ses))
  if (input && document.activeElement === input) input.blur()
}

/** Phone: the keyboard takes the lower half, so the text being typed moves up into the top third. */
function keepInView(frame: string, layer: string) {
  if (typeof matchMedia !== 'function' || !matchMedia('(max-width: 640px)').matches) return
  const s = st(), f = frameById(s.h.present, frame), l = layerOf(s.h.present, { frame, layer }), g = l && textGeo(l)
  if (!f || !g) return
  const y = (f.y + g.top * pitchOf(f.card)) * s.cam.z + s.cam.y, want = s.vp.h * .22
  if (y > s.vp.h * .38 || y < 0) s.setCam({ ...s.cam, y: s.cam.y + want - y })
}
