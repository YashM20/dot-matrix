/**
 * The site's one text-to-clipboard helper (#353): the card row, the command layer, the widget page, the blog and the
 * editor all copy through it. DOM-only and dependency-free, so first-load code can use it.
 *
 * The write starts **inside the click**: Safari rejects a clipboard write after an `await`, so text that is still being
 * built (a lazy export) goes over as a `ClipboardItem` promise. A write left pending (an unfocused page, a permission
 * prompt nobody answers) counts as failed after `ms`, so the caller can always say how it ended
 * (docs/EDITOR-PLAN.md §8.4). The clock starts once the text is ready, so a slow export isn't cut short.
 */
export type Copied = 'copied' | 'failed'
/** Text now, or text still being built (a lazy export). */
export type Text = string | Promise<string>

type ClipboardItemCtor = typeof ClipboardItem & { supports?: (type: string) => boolean }
const Item = (): ClipboardItemCtor | undefined => (typeof ClipboardItem === 'function' ? ClipboardItem as ClipboardItemCtor : undefined)
/** `ClipboardItem` can carry `type` (PNG always; SVG on Chrome 124+ only; `supports()` itself is recent). */
export const canCopy = (type: string): boolean => {
  const I = Item()
  if (!I || !globalThis.navigator?.clipboard?.write) return false
  return typeof I.supports === 'function' ? I.supports(type) : type === 'image/png' || type === 'text/plain'
}

async function write(text: Text): Promise<Copied> {
  const c = globalThis.navigator?.clipboard
  if (!c) return 'failed'
  if (typeof text !== 'string' && canCopy('text/plain')) {
    try { await c.write([new ClipboardItem({ 'text/plain': text.then(t => new Blob([t], { type: 'text/plain' })) })]); return 'copied' } catch { /* refused: try plain text */ }
  }
  // a string is written at once, still inside the click
  try { await c.writeText(typeof text === 'string' ? text : await text); return 'copied' } catch { return 'failed' }
}

/** `write`, or a rejection once it hasn't settled `ms` after `ready` (what is being written) resolved. For every
 * clipboard write on the site, so a write that never settles still ends. */
export function inTime<T>(write: Promise<T>, ready: unknown = undefined, ms = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = Promise.resolve(ready).then(() => new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('clipboard: no answer')), ms) }))
  return Promise.race([write, late]).finally(() => clearTimeout(timer))
}

/** Copy `text`; 'failed' when the page may not, or when the write hasn't settled `ms` after the text was ready. */
export async function copyText(text: Text, ms = 1500): Promise<Copied> {
  try { return await inTime(write(text), text, ms) } catch { return 'failed' }
}
