/**
 * Board ⇄ widget page as a same-document view transition (docs/living-matter/X-advanced.md #18): the card's frame
 * flies between its place on the board and the widget page's stage. A transition animates raster snapshots, and a
 * scaled snapshot would blur the dot grid, so the flying frame carries no dots (`.vt-fly` hides its canvas in both
 * snapshots); the dots are drawn by the real canvas at their own pitch once the frame has landed. The rest of the page
 * cross-fades unscaled.
 *
 * Instant (exactly today's swap) without `document.startViewTransition`, in a hidden tab, or under reduced motion
 * (the OS setting or the ⌘K override, which wraps `matchMedia`). The update runs inside the transition callback
 * through `flush` (React's `flushSync`), and the new snapshot waits up to WAIT_MS for the card to mount (the widget
 * page and the board are lazy); if it doesn't, the page cross-fades.
 */
type VT = { finished: Promise<void> }
const NAME = 'dm-card', FLY = 'vt-fly', WAIT_MS = 450

/** Is a card transition possible right now (API present, tab visible, motion allowed)? */
export function cardTransitions(): boolean {
  const doc = document as Document & { startViewTransition?: unknown }
  return typeof doc.startViewTransition === 'function' && document.visibilityState !== 'hidden' && !matchMedia('(prefers-reduced-motion: reduce)').matches
}

const mark = (el: HTMLElement | null, on: boolean) => { if (!el) return; el.style.viewTransitionName = on ? NAME : ''; el.classList.toggle(FLY, on) }
const find = (sel: string, not: Element | null) => [...document.querySelectorAll<HTMLElement>(sel)].find(e => e !== not && e.isConnected) ?? null

/**
 * Run `update` (the board ⇄ widget swap for card `slug`) as a view transition, or at once when one isn't possible.
 * `flush` commits the update synchronously (React: `flushSync`); `scroll` brings the landed card into view first.
 */
export function cardTransition(slug: string, update: () => void, flush: (fn: () => void) => void, scroll = false): void {
  if (!cardTransitions()) { update(); return }
  const doc = document as Document & { startViewTransition: (cb: () => Promise<void>) => VT }
  const sel = `[data-card-id="${CSS.escape(slug)}"]`, from = find(sel, null)
  let to: HTMLElement | null = null
  mark(from, true)
  const vt = doc.startViewTransition(async () => {
    mark(from, false)
    flush(update)
    const t0 = performance.now()
    while (!(to = find(sel, from)) && performance.now() - t0 < WAIT_MS) await new Promise(r => setTimeout(r, 16))
    if (to && scroll) to.scrollIntoView({ block: 'center' })
    mark(to, true)
  })
  const done = () => mark(to, false)
  vt.finished.then(done, done)
}
