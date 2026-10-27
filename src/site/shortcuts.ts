/**
 * Every keyboard shortcut and URL parameter, in one list (ABOUT shows it; the U5 `?` sheet and the shell's
 * `help` are meant to read it too, docs/UX-PLAN.md §5.5). Keys live in `components/palette/CommandLayer.tsx`,
 * URL views in `./views.ts`. Lazy: only ABOUT imports it.
 */
export interface Shortcut { keys: string; does: string }

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: '⌘K / Ctrl-K', does: 'command palette: boards, cards, views, actions' },
  { keys: '`', does: 'dot shell (type help)' },
  { keys: 'X', does: 'X-ray the card under the pointer' },
  { keys: '⇧X', does: 'X-ray every card' },
  { keys: 'hold T', does: 'time machine: freeze the board, move the pointer to scrub' },
  { keys: '← →', does: 'while frozen: step a frame (⇧ for a second)' },
  { keys: 'Space', does: 'while frozen: resume the clock' },
  { keys: '↑↑↓↓←→←→BA', does: 'you know' },
]

export const URL_PARAMS: readonly Shortcut[] = [
  { keys: '/<board>/', does: 'open a board (the first board is /)' },
  { keys: '?make=tune|compose|code|draw', does: 'open MAKE in a mode' },
  { keys: '?make=code&p=…', does: 'a shared field program' },
  { keys: '?about', does: 'this page' },
  { keys: '/widget/<id>/', does: 'one card on its own page (also /<short id>)' },
  { keys: '?skin=crt|vfd|led|eink|flipdisc|nixie', does: 'display skin' },
  { keys: '?worker=0', does: 'sample on the main thread' },
  { keys: '?clack=1', does: 'flip-disc clack sound' },
  { keys: '?tab=…, ?board=…', does: 'old links: still open the view they named' },
]
