/**
 * The dot shell's help table and its flagged commands, kept apart from the shell (a dot-matrix screen) so a Node
 * check can read them (scripts/verify/flags.ts). A command whose feature flag is off is unknown to the shell: it
 * answers "command not found" and help leaves it out.
 */
import { flag, type FlagId } from '../../site/flags'

const FLAGGED = new Map<string, FlagId>([['xray', 'xray'], ['x-ray', 'xray'], ['remix', 'make'], ['studio', 'make'], ['edit', 'make']])

/** False for a command whose flag is off (`xray` while X-ray is off). */
export const shellKnows = (cmd: string): boolean => { const f = FLAGGED.get(cmd.toLowerCase()); return !f || flag(f) }

/** The help rows, `[command, what it does]`, for the flags as they are now. */
export function shellHelp(): [string, string][] {
  const xray = flag('xray'), make = flag('make')
  return [
    ['help', 'this list'], ['ls [board]', 'boards, or the cards on one'], ['open <board|view|card>', 'go there (alias: load)'],
    ...(xray ? [['xray [on|off]', 'x-ray every card'] as [string, string]] : []),
    ['fps', xray ? 'measure frames, list x-ray cards' : 'measure frames'], ['t [seconds]', 'freeze the clock at t; t alone prints it'],
    ['play', 'resume the clock'], ['describe <card>', 'what a card says about itself'],
    ...(make ? [['remix <card>', 'open a card in MAKE · CODE'], ['studio <card>', 'open a card in MAKE · COMPOSE']] as [string, string][] : []),
    ['skin <name>', 'display skin (soon)'], ['clear · exit', ''],
  ]
}
