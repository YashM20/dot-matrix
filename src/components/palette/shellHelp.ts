/**
 * The dot shell's command table: every command's name, aliases, usage, what it does and examples, in one place.
 * `help`, `help <cmd>`, Tab completion and did-you-mean all read it, and ABOUT shows its rows next to the keys
 * (`src/site/shortcuts.ts`). Plain data with no DOM, so a Node check can read it (scripts/verify/flags.ts). A
 * command whose feature flag is off is unknown to the shell: it answers "command not found" and help leaves it out.
 */
import { flag, type FlagId } from '../../site/flags'

/** What Tab completes for a command's first argument. */
export type ArgKind = 'command' | 'board' | 'card' | 'place'

export interface ShellCommand {
  name: string
  aliases?: readonly string[]
  /** The arguments, after the name: `<card>`, `[on|off]`. */
  usage?: string
  does: string
  examples?: readonly string[]
  /** Completion for the first argument, from the site's boards, views and cards. */
  arg?: ArgKind
  /** Fixed words the first argument takes (completed, and offered when a word is wrong). */
  words?: readonly string[]
  /** Runs the palette's own action `a:<palette><arg>` (src/components/palette/api.ts), so the two never drift. */
  palette?: string
  flag?: FlagId
  /** Easter eggs: they run, but help, completion and did-you-mean leave them out. */
  hidden?: boolean
}

export const COMMANDS: readonly ShellCommand[] = [
  { name: 'help', usage: '[command|keys]', does: 'this list; help <command> for one in full; help keys for the keys', arg: 'command', words: ['keys'], examples: ['help open', 'help keys'] },
  { name: 'ls', usage: '[board]', does: 'boards, or the cards on one', arg: 'board', examples: ['ls', 'ls levels'] },
  { name: 'open', aliases: ['load', 'cd'], usage: '<board|view|card>', does: 'go to a board, a view or a card', arg: 'place', examples: ['open metro', 'open code', 'open queen'] },
  { name: 'describe', aliases: ['cat'], usage: '<card>', does: 'what a card says about itself', arg: 'card', examples: ['describe queen'] },
  { name: 'remix', usage: '<card>', does: 'open a card in MAKE · CODE', arg: 'card', flag: 'make', examples: ['remix rings'] },
  { name: 'studio', aliases: ['edit'], usage: '<card>', does: 'open a card in MAKE · COMPOSE', arg: 'card', flag: 'make', examples: ['studio queen'] },
  { name: 'link', aliases: ['share'], usage: '[card]', does: 'copy a link to this view, or to one card', arg: 'card', examples: ['link', 'link queen'] },
  { name: 'xray', aliases: ['x-ray'], usage: '[on|off]', does: 'x-ray every card', words: ['on', 'off'], flag: 'xray', examples: ['xray', 'xray off'] },
  { name: 'fps', usage: '[hud]', does: 'measure frames; fps hud toggles the meter', words: ['hud'], examples: ['fps', 'fps hud'] },
  { name: 't', aliases: ['time'], usage: '[seconds|resume]', does: 'freeze the clock at t; t alone prints it', words: ['resume'], examples: ['t 12.5', 't resume'] },
  { name: 'play', aliases: ['resume'], does: 'resume the clock' },
  { name: 'theme', usage: '<system|light|dark>', does: 'the colour scheme', palette: 'theme-', examples: ['theme light'] },
  { name: 'accent', usage: '<name|next>', does: 'the one accent colour', palette: 'accent-', examples: ['accent amber', 'accent next'] },
  { name: 'contrast', usage: '<more|system>', does: 'stronger text and lines, or follow the system', palette: 'contrast-', examples: ['contrast more'] },
  { name: 'cards', aliases: ['size'], usage: '<large|medium|compact>', does: 'the card size on the boards', palette: 'cards-', examples: ['cards compact'] },
  { name: 'skin', usage: '<name>', does: 'the display skin', palette: 'skin-', examples: ['skin crt', 'skin oled'] },
  { name: 'motion', usage: '<on|off|system>', does: 'reduced motion', palette: 'rm-', examples: ['motion on'] },
  { name: 'renderer', usage: '<auto|svg|canvas|webgl>', does: 'force a renderer for every card', palette: 'r-', examples: ['renderer webgl', 'renderer auto'] },
  { name: 'worker', usage: '<on|off>', does: 'sample cards in a worker or on the main thread (reloads)', palette: 'worker-', examples: ['worker off'] },
  { name: 'pond', usage: '<on|off>', does: 'pond memory: your koi age with your visits; off forgets them', palette: 'pond-memory-', examples: ['pond on'] },
  { name: 'history', usage: '[clear]', does: 'the commands you ran in this tab', words: ['clear'], examples: ['history', 'history clear'] },
  { name: 'clear', aliases: ['cls'], does: 'clear the screen (ctrl+l)' },
  { name: 'exit', aliases: ['quit'], does: 'close the shell (esc)' },
  { name: 'boss', aliases: ['konami', 'queen'], does: 'the boss fight', hidden: true },
  { name: 'whoami', does: 'who you are', hidden: true },
  { name: 'sudo', does: 'more power', hidden: true },
]

const named = (c: ShellCommand, w: string) => c.name === w || !!c.aliases?.includes(w)
const on = (c: ShellCommand) => !c.flag || flag(c.flag)

/** The command for a typed word, any case; undefined when unknown or its flag is off. */
export const findCommand = (word: string): ShellCommand | undefined => {
  const w = word.toLowerCase()
  return COMMANDS.find(c => named(c, w) && on(c))
}

/** False for a command whose flag is off (`xray` while X-ray is off). */
export const shellKnows = (cmd: string): boolean => { const c = COMMANDS.find(x => named(x, cmd.toLowerCase())); return !c || on(c) }

/** Commands help, completion and did-you-mean may name, for the flags as they are now. */
export const visibleCommands = (): ShellCommand[] => COMMANDS.filter(c => on(c) && !c.hidden)

/** Every name and alias the shell would suggest. */
export const commandWords = (): string[] => visibleCommands().flatMap(c => [c.name, ...(c.aliases ?? [])])

/** The help rows, `[usage, what it does]`, for the flags as they are now. */
export function shellHelp(): [string, string][] {
  return visibleCommands().map(c => [c.usage ? `${c.name} ${c.usage}` : c.name, c.does])
}

/** `help <cmd>`: the usage, what it does, its aliases and examples. */
export function helpFor(c: ShellCommand): string[] {
  return [
    `usage: ${c.usage ? `${c.name} ${c.usage}` : c.name}`,
    `  ${c.does}`,
    ...(c.aliases?.length ? [`  aliases: ${c.aliases.join(', ')}`] : []),
    ...(c.examples?.length ? ['  examples:', ...c.examples.map(e => `    ${e}`)] : []),
  ]
}
