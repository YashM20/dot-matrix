/**
 * First-draw queue checks (#312, src/components/firstDraw.ts) for `pnpm verify`: on a phone-sized fake page, one grid
 * card samples its first frame per task, cards on screen go before cards in the margin, cards far down the page wait
 * for a scroll, and a card that never reports back or unmounts frees its turn. The page is fake (rectangles, a task
 * queue and a timer list), so it runs in Node. On its own: `npx tsx scripts/verify/first-draw.ts`.
 */
import { createDrawQueue, STUCK_MS, type Sight } from '../../src/components/firstDraw'
import { checker, type Assert } from '../lib/check'

/** A phone: an 823 px viewport, cards 400 px apart from y = 300, near = half a screen beyond it. */
const VIEW = 823, NEAR_PX = VIEW / 2
function fakePage() {
  const tasks: (() => void)[] = [], timers: { at: number; fn: () => void }[] = []
  const reports = new Map<Element, (s: Sight) => void>(), tops = new Map<Element, number>()
  let scroll = 0, now = 0
  const sight = (el: Element): Sight => {
    const top = tops.get(el)! - scroll, bottom = top + 360
    return { near: bottom > -NEAR_PX && top < VIEW + NEAR_PX, seen: bottom > 0 && top < VIEW }
  }
  const q = createDrawQueue({
    observe: (el, report) => { reports.set(el, report); report(sight(el)); return () => reports.delete(el) },
    post: fn => { tasks.push(fn) },
    later: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1) } },
  })
  const card = (i: number) => { const el = { id: i } as unknown as Element; tops.set(el, 300 + i * 400); return el }
  return {
    q, card,
    /** Run one task; returns how many cards it granted. */
    task(granted: number[]) { const before = granted.length; tasks.shift()?.(); return granted.length - before },
    get pending() { return tasks.length },
    scrollTo(y: number) { scroll = y; for (const [el, report] of reports) report(sight(el)) },
    advance(ms: number) { now += ms; for (const t of timers.filter(t => t.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn() } },
  }
}

export function firstDrawChecks(assert: Assert) {
  // a 12-card board on a phone: every card asks at once (the entrance delays all ran out), each draws when granted
  {
    const page = fakePage(), granted: number[] = [], els = Array.from({ length: 12 }, (_, i) => page.card(i))
    els.forEach((el, i) => page.q.request(el, () => granted.push(i)))
    let most = 0, tasks = 0
    while (page.pending && tasks < 100) {
      tasks++
      most = Math.max(most, page.task(granted))
      // the granted card draws in its own task, then reports back
      if (granted.length) page.q.done(els[granted[granted.length - 1]])
    }
    assert('first draw: at most one grid card samples its first frame per task', most === 1, `most ${most} in ${tasks} tasks`)
    // y 300..700 on screen, 700..1100 and 1100..1500 near (bottom edge 823 + 411), the rest wait
    assert('first draw: on a phone only the cards within half a screen of the viewport draw (3 of 12)', granted.join() === '0,1,2', granted.join())
    page.scrollTo(2000)
    while (page.pending && tasks < 200) { tasks++; page.task(granted); page.q.done(els[granted[granted.length - 1]]) }
    assert('first draw: a scroll brings the next cards near and they draw', granted.length > 3 && granted.slice(3).every(i => i >= 3 && i <= 7), granted.join())
  }
  // a card in the margin asked first, a card on screen second: the one on screen goes first
  {
    const page = fakePage(), granted: number[] = [], margin = page.card(2), seen = page.card(0)
    page.q.request(margin, () => granted.push(2)); page.q.request(seen, () => granted.push(0))
    page.task(granted); page.q.done(seen); page.task(granted)
    assert('first draw: a card on screen draws before an earlier card in the margin', granted.join() === '0,2', granted.join())
  }
  // a granted card that never reports back frees its turn after STUCK_MS; one that unmounts while granted frees it at once
  {
    const page = fakePage(), granted: number[] = [], a = page.card(0), b = page.card(1), c = page.card(2)
    page.q.request(a, () => granted.push(0)); const cancelB = page.q.request(b, () => granted.push(1)); page.q.request(c, () => granted.push(2))
    page.task(granted); page.task(granted)
    const held = granted.join() === '0'
    page.advance(STUCK_MS); page.task(granted)
    const freed = granted.join() === '0,1'
    cancelB(); page.task(granted)
    assert('first draw: a stuck card holds the queue only STUCK_MS, and a card that unmounts while granted frees it', held && freed && granted.join() === '0,1,2', granted.join())
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/first-draw.ts')) {
  const { assert, done } = checker('first draw')
  firstDrawChecks(assert)
  done('first draw: all checks passed')
}
