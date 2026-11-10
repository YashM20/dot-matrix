/**
 * First draws, one card per task, near the screen only (#312). A grid card (one with an entrance: the boards, BROWSE)
 * asks here once its entrance delay has run out, and samples its first frame only when this queue says so:
 *
 * - only while the card is within `NEAR` of the viewport (a card further down the page waits until a scroll brings it
 *   near, so a phone's first load samples the two or three cards it shows instead of the whole board);
 * - one card at a time: the next card is let go in a new task after the last one has drawn (`done`), so a board's
 *   first paint is many short tasks instead of a few long ones (Total Blocking Time);
 * - cards on screen before cards in the margin, then in the order they asked (the entrance's diagonal stagger).
 *
 * The card's pixels never change: only when its first frame is sampled. Framework-free; `observe` and `post` are
 * swappable so `scripts/verify/first-draw.ts` drives it in Node.
 */

/** How far beyond the viewport a card counts as near: half a screen on every side. */
export const NEAR = '50%'
/** A granted card that never reports back (it threw, or unmounted mid-render) frees its turn after this many ms. */
export const STUCK_MS = 250

export interface Sight {
  /** Within `NEAR` of the viewport. */
  near: boolean
  /** On the screen itself. */
  seen: boolean
}
export interface DrawQueueOptions {
  /** Watch `el`; `report` gets its sight now and on every change. Returns a stop function. Default: one shared IntersectionObserver. */
  observe?: (el: Element, report: (s: Sight) => void) => () => void
  /** Run `fn` in a later task. Default: a MessageChannel post (not clamped like a nested setTimeout). */
  post?: (fn: () => void) => void
  /** A timer for the stuck-card fallback. */
  later?: (fn: () => void, ms: number) => () => void
}
export interface DrawQueue {
  /** Ask for a first draw of the card at `el`; `grant` is called once, when it is the card's turn. Returns a cancel. */
  request(el: Element, grant: () => void): () => void
  /** The granted card has drawn: the next one goes in a new task. */
  done(el: Element): void
  /** Cards granted so far (a check reads it). */
  readonly granted: number
}

interface Ask { el: Element; grant: () => void; seq: number; sight: Sight | null; stop: () => void }

export function createDrawQueue(opts: DrawQueueOptions = {}): DrawQueue {
  const observe = opts.observe ?? sharedObserver()
  const post = opts.post ?? channelPost()
  const later = opts.later ?? ((fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id) })
  const asks = new Map<Element, Ask>()
  let seq = 0, granted = 0, busy: Element | null = null, unstick: (() => void) | null = null, posted = false

  const free = () => { busy = null; unstick?.(); unstick = null; schedule() }
  function schedule() { if (!posted && !busy) { posted = true; post(pump) } }
  function pump() {
    posted = false
    if (busy) return
    let best: Ask | null = null
    for (const a of asks.values()) {
      if (!a.sight?.near) continue
      if (!best || (a.sight.seen && !best.sight!.seen) || (a.sight.seen === best.sight!.seen && a.seq < best.seq)) best = a
    }
    if (!best) return
    asks.delete(best.el); best.stop()
    busy = best.el; granted++
    unstick = later(() => { if (busy === best!.el) free() }, STUCK_MS)
    best.grant()
  }
  return {
    request(el, grant) {
      const ask: Ask = { el, grant, seq: seq++, sight: null, stop: () => {} }
      asks.set(el, ask)
      ask.stop = observe(el, s => { ask.sight = s; if (s.near) schedule() })
      return () => {
        if (asks.get(el) === ask) { asks.delete(el); ask.stop() }
        if (busy === el) free()
      }
    },
    done(el) { if (busy === el) free() },
    get granted() { return granted },
  }
}

/** One IntersectionObserver for every waiting card; without one, every card counts as seen. */
function sharedObserver(): NonNullable<DrawQueueOptions['observe']> {
  if (typeof IntersectionObserver === 'undefined') return (_el, report) => { report({ near: true, seen: true }); return () => {} }
  const reports = new Map<Element, (s: Sight) => void>()
  let io: IntersectionObserver | null = null
  const make = () => new IntersectionObserver(entries => {
    const h = window.innerHeight, w = window.innerWidth
    for (const e of entries) {
      const r = e.boundingClientRect
      reports.get(e.target)?.({ near: e.isIntersecting, seen: e.isIntersecting && r.bottom > 0 && r.top < h && r.right > 0 && r.left < w })
    }
  }, { rootMargin: NEAR })
  return (el, report) => {
    io ??= make()
    reports.set(el, report); io.observe(el)
    return () => { reports.delete(el); io?.unobserve(el) }
  }
}

function channelPost(): NonNullable<DrawQueueOptions['post']> {
  if (typeof MessageChannel === 'undefined') return fn => { setTimeout(fn, 0) }
  const ch = new MessageChannel(), queue: (() => void)[] = []
  ch.port1.onmessage = () => queue.shift()?.()
  return fn => { queue.push(fn); ch.port2.postMessage(0) }
}

let shared: DrawQueue | undefined
/** The page's queue (lazily created; browser only). */
export const firstDraws = (): DrawQueue => (shared ??= createDrawQueue())
