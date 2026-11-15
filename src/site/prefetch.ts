/**
 * Prefetch on intent (#346): a board's or the card page's chunk starts loading once the visitor shows they are about
 * to open it, so the bytes arrive under the exit dissolve instead of after it. A hover waits `DWELL_MS`, so a pointer
 * sweeping across the tab row evaluates no board module mid-animation; focus and a press start at once (iOS Safari
 * focuses no button on a tap). Every prefetch is quiet (`prefetching` in ./stale-deploy.ts): a chunk that fails here
 * reloads nothing, and the open that needs it fetches again. First-load code, kept tiny.
 */
import { prefetching } from './stale-deploy'

/** How long a hover rests on a target before its chunk loads. */
export const DWELL_MS = 60
let timer: ReturnType<typeof setTimeout> | undefined
const cancel = () => { clearTimeout(timer); timer = undefined }

/** Handlers to spread on anything that opens a chunk: hover after the dwell, focus and press at once. */
export function intent(load: () => void) {
  return {
    onPointerEnter: () => { cancel(); timer = setTimeout(() => { timer = undefined; load() }, DWELL_MS) },
    onPointerLeave: cancel,
    onFocus: load,
    onPointerDown: load,
  }
}

let cardPage = false
/** The card page's chunk (WidgetPage), once. */
export function prefetchCardPage() {
  if (cardPage) return
  prefetching(() => import('../components/widget/WidgetPage')).then(() => { cardPage = true }, () => {})
}

/** A link to a card's page (`widgetPath`), wherever its markup lives. */
const cardLink = (t: EventTarget | null) => (t instanceof Element ? t.closest('a[href*="/widget/"]') : null)
/**
 * Card page links prefetch the card page: one listener on the document, so a card's OPEN works the same whatever
 * markup it has. Returns the cleanup, for an effect.
 */
export function watchCardLinks(): () => void {
  const on = intent(prefetchCardPage)
  // enter and leave of the link itself, not of its children (`pointerover` and `pointerout` bubble)
  const crossed = (e: PointerEvent) => { const a = cardLink(e.target); return !!a && !(e.relatedTarget instanceof Node && a.contains(e.relatedTarget)) }
  const over = (e: PointerEvent) => { if (crossed(e)) on.onPointerEnter() }
  const out = (e: PointerEvent) => { if (crossed(e)) on.onPointerLeave() }
  const now = (e: Event) => { if (cardLink(e.target)) prefetchCardPage() }
  const ons: [string, EventListener][] = [['pointerover', over as EventListener], ['pointerout', out as EventListener], ['focusin', now], ['pointerdown', now]]
  for (const [t, f] of ons) document.addEventListener(t, f, { passive: true })
  return () => { for (const [t, f] of ons) document.removeEventListener(t, f) }
}
