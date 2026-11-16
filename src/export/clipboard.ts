/**
 * Clipboard, download and share helpers for the widget page (docs/SHARE-PLAN.md §5). Every write runs
 * **inside the click**: Safari rejects `clipboard.write` after an `await`, so binary items are handed over as
 * a `Promise<Blob>` (Chrome accepts the same). Text goes through the site's one helper, `src/lib/copyText.ts`
 * (#353). Each helper resolves to how it ended, so the caller can say so.
 */
import { canCopy, copyText, inTime, type Text } from '../lib/copyText'

export { canCopy, copyText, type Text }
export type Outcome = 'copied' | 'downloaded' | 'shared' | 'cancelled' | 'failed'

export function download(blob: Blob, name: string) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob)
  a.href = url; a.download = name; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

const blobOf = (text: Text, type: string) => Promise.resolve(text).then(t => new Blob([t], { type }))

/** A PNG on the clipboard where `ClipboardItem` works, else (or if the write is refused) downloaded as `name`. */
export async function copyPNG(png: Promise<Blob>, name: string): Promise<Outcome> {
  if (canCopy('image/png')) {
    try { await inTime(navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]), png); return 'copied' } catch { /* refused: fall back */ }
  }
  try { download(await png, name); return 'downloaded' } catch { return 'failed' }
}

/** SVG markup as text (pastes as vectors into design tools), plus `image/svg+xml` where the browser takes it. */
export async function copySVG(svg: Text, name: string): Promise<Outcome> {
  if (canCopy('image/svg+xml')) {
    try {
      await inTime(navigator.clipboard.write([new ClipboardItem({ 'text/plain': blobOf(svg, 'text/plain'), 'image/svg+xml': blobOf(svg, 'image/svg+xml') })]), svg)
      return 'copied'
    } catch { /* fall through to text */ }
  }
  if ((await copyText(svg)) === 'copied') return 'copied'
  try { download(await blobOf(svg, 'image/svg+xml'), name); return 'downloaded' } catch { return 'failed' }
}

/** The Web Share sheet is there (phones, Safari, Chrome desktop 128+; not Firefox desktop). */
export const canShare = (): boolean => typeof navigator.share === 'function'

/** Share the card: with its PNG where files can be shared, else the link alone. The URL also goes in `text` (some targets drop `url` with files). */
export async function shareCard(o: { title: string; url: string; png?: Promise<Blob>; file: string }): Promise<Outcome> {
  const tryShare = async (data: ShareData): Promise<Outcome | undefined> => {
    try { await navigator.share(data); return 'shared' } catch (e) { return (e as DOMException).name === 'AbortError' ? 'cancelled' : undefined }
  }
  if (o.png) {
    try {
      const files = [new File([await o.png], o.file, { type: 'image/png' })]
      if (navigator.canShare?.({ files })) { const r = await tryShare({ title: o.title, text: `${o.title} ${o.url}`, url: o.url, files }); if (r) return r }
    } catch { /* no PNG: share the link */ }
  }
  return (await tryShare({ title: o.title, url: o.url })) ?? 'failed'
}
