/**
 * Copy a link: the one path every copy-link action takes (#353): the card row (mounted or not), the command layer
 * (⌘K, the card strip, the X-ray inspector, TOOLS › SHARE without a share sheet), the widget page's LINK and SHORT,
 * and the shell. It builds the link as the site shares it, copies it with the clipboard timeout, sends one
 * `link_copied` event when it worked, says how it went, and resolves to the outcome and the link.
 *
 * The feedback is the site's toast (a polite live region, so screen readers hear it): "link copied", or "copy failed"
 * with the link itself, so the visitor can still take it by hand. The shell prints instead (`toast: false`).
 */
import { copyText, type Copied } from '../lib/copyText'
import { track } from '../site/analytics'
import { withPondDay } from '../site/pondMemory'
import { withTheme } from '../site/theme/share'
import { toast } from './xray/store'

/** `url` as the site shares it: absolute, with the visitor's theme when they opted in (THEME › share links), and a
 * pond link's day (`pond`: the link shows the pond board or a pond card). */
export const shareLink = (url: string, pond = false): string => withPondDay(withTheme(new URL(url, location.href).href), pond)

export interface CopyLinkOpts {
  /** The card the link opens (its id); a pond card's link carries the day. */
  card?: string
  /** Or the view it opens (the event's `view`). */
  view?: string
  /** The link shows the pond (default: a `pond-` card). */
  pond?: boolean
  /** The toast on success (default "link copied"). */
  said?: string
  /** False: no toast (the shell prints the outcome itself). */
  toast?: boolean
}
export interface LinkCopy { outcome: Copied; url: string }

/** Copy `url` as a shared link. Call it inside the click: the write starts before the first `await`. */
export async function copyLink(url: string, o: CopyLinkOpts = {}): Promise<LinkCopy> {
  const link = shareLink(url, o.pond ?? !!o.card?.startsWith('pond-'))
  const outcome = await copyText(link)
  if (outcome === 'copied') track('link_copied', o.card ? { card: o.card } : { view: o.view ?? 'page' })
  if (o.toast !== false) toast(outcome === 'copied' ? (o.said ?? 'link copied') : `copy failed: ${link}`)
  return { outcome, url: link }
}
