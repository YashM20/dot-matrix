/**
 * Board ⇄ widget page as a same-document view transition (docs/living-matter/X-advanced.md #18): the card's frame
 * flies between its place on the board and the widget page's stage. A transition animates raster snapshots, and a
 * scaled snapshot would blur the dot grid, so the flying frame carries no dots (`.vt-fly` hides its canvas in both
 * snapshots); the dots are drawn by the real canvas at their own pitch once the frame has landed. The rest of the page
 * cross-fades unscaled.
 *
 * Instant (exactly today's swap) without `document.startViewTransition`, in a hidden tab, or under reduced motion
 * (the OS setting or the ⌘K override, which wraps `matchMedia`). The update runs inside the transition callback
 * through `flush` (React's `flushSync`), and the new snapshot waits up to ~450 ms (28 polls) for the card to mount
 * (the widget page and the board are lazy); if it doesn't, the page cross-fades.
 */
const mark = (el: HTMLElement | null | undefined, on: boolean) => { if (el) { el.style.viewTransitionName = on ? 'dm-card' : ''; el.classList.toggle('vt-fly', on) } }

/**
 * Run `update` (the board ⇄ widget swap for card `slug`) as a view transition, or at once when one isn't possible.
 * `flush` commits the update synchronously (React: `flushSync`); `scroll` brings the landed card into view first.
 */
export function cardTransition(slug: string, update: () => void, flush: (fn: () => void) => void, scroll?: boolean): void {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } }
  if (!doc.startViewTransition || doc.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return update()
  const find = (not?: Element) => [...doc.querySelectorAll<HTMLElement>(`[data-card-id="${CSS.escape(slug)}"]`)].find(e => e !== not && e.isConnected)
  const from = find()
  let to: HTMLElement | undefined
  mark(from, true)
  const done = () => mark(to, false)
  doc.startViewTransition(async () => {
    mark(from, false)
    flush(update)
    for (let i = 0; i < 28 && !(to = find(from)); i++) await new Promise(r => setTimeout(r, 16))
    if (scroll) to?.scrollIntoView({ block: 'center' })
    mark(to, true)
  }).finished.then(done, done)
}
