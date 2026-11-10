/**
 * Every keyboard shortcut and URL parameter, in one list (ABOUT shows it, the dot shell's `help keys` reads
 * `SHELL_KEYS`; the U5 `?` sheet is meant to read it too, docs/UX-PLAN.md §5.5). Keys live in `components/palette/CommandLayer.tsx`,
 * URL views in `./views.ts`, release flags in `./flags.ts` (the X rows only show while the `xray` flag is on).
 * Lazy: only ABOUT and the dot shell import it.
 */
import { flag } from './flags'

export interface Shortcut { keys: string; does: string }

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: '⌘K / Ctrl-K', does: 'command palette: boards, cards, views, actions' },
  { keys: '`', does: 'dot shell (type help)' },
  ...(flag('xray') ? [{ keys: 'X', does: 'X-ray the card under the pointer' }, { keys: '⇧X', does: 'X-ray every card' }] : []),
  { keys: 'hold T', does: 'time machine: freeze the board, move the pointer to scrub' },
  { keys: '← →', does: 'while frozen: step a frame (⇧ for a second)' },
  { keys: 'Space', does: 'while frozen: resume the clock' },
  { keys: '↑↑↓↓←→←→BA', does: 'you know' },
]

/** Keys inside the dot shell (its footer and `help keys` read these; its commands are in `help`). */
export const SHELL_KEYS: readonly Shortcut[] = [
  { keys: 'Tab', does: 'complete a command, board, view, card or word' },
  { keys: '↑ ↓', does: 'history (kept for this tab); the line you were typing comes back' },
  { keys: 'Ctrl-C', does: 'cancel the line, or stop the running command (copies when text is selected)' },
  { keys: 'Ctrl-U', does: 'clear the line before the cursor' },
  { keys: 'Ctrl-L', does: 'clear the screen' },
  { keys: 'PgUp PgDn', does: 'scroll back through the output' },
  { keys: 'Esc', does: 'close the shell' },
]

export const URL_PARAMS: readonly Shortcut[] = [
  { keys: '/<board>/', does: 'open a board (the first board is /)' },
  { keys: '?make=tune|compose|code|draw', does: 'open MAKE in a mode' },
  { keys: '?make=code&p=…', does: 'a shared field program' },
  { keys: '/about/', does: 'this page' },
  { keys: '/widget/<id>/', does: 'one card on its own page (also /<short id>)' },
  { keys: '?skin=crt|vfd|led|eink|flipdisc|nixie|lcd|grout', does: 'display skin' },
  { keys: '?tab=…, ?board=…', does: 'old links: still open the view they named' },
]
