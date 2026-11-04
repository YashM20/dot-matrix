/**
 * What the dot shell's commands do. Each runs with a context: `print` (dropped once the command is aborted), `wait`
 * (rejects on Ctrl+C), the shared command API, and the screen width. Theme, accent, card size, motion, renderer and
 * skin run the palette's own actions (`paletteItems`), so the two can't drift. Every failure prints in the shell.
 */
import { describe } from '../../engine/describe'
import { boardManifest, loadBoard } from '../../widgets/manifest'
import { boardTime, probes, xrState } from '../xray/store'
import { fuzzy } from './fuzzy'
import { MODES, PLACES, VIEWS, placeFromName } from '../../site/views'
import { allBoards, paletteItems, type CommandApi } from './api'
import { commandWords, findCommand, helpFor, shellHelp, shellKnows } from './shellHelp'
import { nearest, type Sources } from './shellLine'
import { SHELL_KEYS } from '../../site/shortcuts'
import { flag } from '../../site/flags'

export type Kind = 'in' | 'out' | 'dim' | 'err'
export type Out = string | { kind: Kind; text: string }

export interface Ctx {
  api: CommandApi
  print(...lines: Out[]): void
  clear(): void
  close(): void
  /** Characters per row on the screen. */
  width: number
  signal: AbortSignal
  /** `p`, or a rejection as soon as the command is aborted. */
  wait<T>(p: Promise<T>): Promise<T>
  history(): readonly string[]
  clearHistory(): void
  /** Mute the toast mirror for a moment (the action's toast would repeat what the shell just printed). */
  quiet(): void
}

const err = (text: string): Out => ({ kind: 'err', text })
const dim = (text: string): Out => ({ kind: 'dim', text })
const maybe = (w?: string) => (w ? ` did you mean ${w}?` : '')

function measureFps(signal: AbortSignal, ms = 600): Promise<number> {
  return new Promise(res => {
    let n = 0; const t0 = performance.now()
    const step = (now: number) => { n++; if (now - t0 < ms && !signal.aborted) requestAnimationFrame(step); else res(Math.round((n * 1000) / (now - t0))) }
    requestAnimationFrame(step)
  })
}
const cardList = async () => [...new Map((await allBoards()).flatMap(b => b.items).map(p => [p.id, p])).values()]
/** Best card for a loose name (`queen`, `lv-queen`, `Level 07`). */
async function findCard(q: string, ctx: Ctx) {
  const all = await ctx.wait(cardList())
  const exact = all.find(p => p.id === q || p.name.toLowerCase() === q)
  if (exact) return exact
  let best: { p: (typeof all)[number]; s: number } | null = null
  for (const p of all) { const m = fuzzy(q, `${p.id} ${p.name}`); if (m && (!best || m.score > best.s)) best = { p, s: m.score } }
  return best?.p
}
const findBoard = (q: string) => boardManifest.find(b => b.id === q) ?? boardManifest.find(b => b.id.startsWith(q)) ?? boardManifest.find(b => b.title.toLowerCase().includes(q))
const placeWords = () => [...PLACES.map(p => p.toLowerCase()), 'make']

/** Completion's word sources (src/components/palette/shellLine.ts). */
export const sources: Sources = {
  boards: boardManifest.map(b => b.id),
  places: placeWords(),
  cards: async () => (await cardList()).map(p => p.id),
  palette: prefix => paletteItems().filter(i => i.id.startsWith(`a:${prefix}`)).map(i => i.id.slice(prefix.length + 2)),
}

/** Fold `s` into lines of at most `w` characters, at spaces where it can. */
export const wrapWords = (s: string, w: number): string[] => s.match(new RegExp(`.{1,${w}}(\\s|$)`, 'g'))?.map(x => x.trimEnd()) ?? [s]

/** Run one line. Unknown commands, missing arguments and failures all print here, with a suggestion if one is close. */
export async function exec(raw: string, ctx: Ctx): Promise<void> {
  const [word = '', ...rest] = raw.trim().split(/\s+/), arg = rest.join(' ').toLowerCase()
  if (!word) return
  const c = findCommand(word), { api, print } = ctx
  // a flagged command with its flag off (`xray` while X-ray is off) is unknown, like a typo
  // (and gets no suggestion: there is nothing to point at)
  if (!c) return print(err(`${word}: command not found.${(shellKnows(word) && maybe(nearest(word, commandWords()))) || ' type help'}`))
  if (c.palette) {
    const words = sources.palette(c.palette)
    const pick = words.includes(arg) ? arg : c.name === 'skin' && arg === 'none' ? 'oled' : undefined
    if (!pick) return print(err(`${c.name}: ${arg ? `no ${c.name} "${arg}".${maybe(nearest(arg, words))} ` : ''}one of ${words.join(', ')}`))
    const item = paletteItems().find(i => i.id === `a:${c.palette}${pick}`)!
    ctx.quiet(); item.run(api)
    return print(item.text.toLowerCase())
  }
  switch (c.name) {
    case 'help': {
      if (arg === 'keys') return print(...SHELL_KEYS.map(k => `  ${k.keys.padEnd(12)}${k.does}`))
      if (arg) {
        const h = findCommand(arg)
        return h && !h.hidden ? print(...helpFor(h)) : print(err(`help: no command "${arg}".${maybe(nearest(arg, commandWords()))}`))
      }
      const pad = Math.min(26, Math.max(...shellHelp().map(([u]) => u.length)) + 2)
      print(...shellHelp().map(([u, d]) => `  ${`${u}  `.padEnd(pad)}${d}`))
      return print(dim('help <command> for usage and examples · help keys for the keys · tab completes'))
    }
    case 'clear': return ctx.clear()
    case 'exit': return ctx.close()
    case 'history': {
      if (arg === 'clear') { ctx.clearHistory(); return print('history cleared') }
      const h = ctx.history()
      return print(...(h.length ? [...h].reverse().map((l, i) => `  ${String(i + 1).padStart(3)}  ${l}`) : [dim('no history yet')]))
    }
    case 'ls': {
      if (arg) {
        const m = findBoard(arg)
        if (!m) return print(err(`ls: no board "${arg}".${maybe(nearest(arg, sources.boards))}`))
        const b = await ctx.wait(loadBoard(m.id))
        return print(`${b.id}: ${b.title}`, ...b.items.map(p => `  ${p.id.padEnd(22)}${p.name}${p.animated ? ' ·' : ''}`))
      }
      const ids = boardManifest.map(b => (b.id === api.board ? `*${b.id}` : ` ${b.id}`)), per = Math.max(1, Math.floor(ctx.width / 15))
      for (let i = 0; i < ids.length; i += per) print(ids.slice(i, i + per).map(s => s.padEnd(15)).join('').trimEnd())
      return print(dim(`${boardManifest.length} boards · ls <board> lists its cards · views: ${[...VIEWS, ...MODES].join(' ').toLowerCase()}`))
    }
    case 'open': {
      if (!arg) return print(err(`${word}: where to? a board, a view or a card. try ls`))
      const place = placeFromName(arg) // a view or a MAKE mode, by its old tab name too (studio, dots, log…)
      if (place) { api.openTab(arg); return print(`→ ${VIEWS.includes(place as never) ? place : `MAKE · ${place}`}`) }
      const b = findBoard(arg)
      if (b) { api.openBoard(b.id); return print(`→ ${b.id.toUpperCase()}`) }
      const card = await findCard(arg, ctx)
      if (card) { void api.focusCard(card.id); return print(`→ ${card.name}`) }
      return print(err(`${word}: nothing called "${arg}".${maybe(nearest(arg, [...sources.boards, ...sources.places]))}`))
    }
    case 'describe': case 'remix': case 'studio': case 'link': {
      if (c.name === 'link' && !arg) return print(`copied ${api.copyLink()}`)
      const card = arg ? await findCard(arg, ctx) : undefined
      if (!card) return print(err(`${word}: ${arg ? `no card "${arg}"` : 'which card?'} e.g. ${c.examples?.[0] ?? `${c.name} queen`}`))
      if (c.name === 'describe') return print(...wrapWords(describe(card, {}).summary, ctx.width))
      if (c.name === 'link') return print(`copied ${api.copyLink(card.id)}`)
      if (c.name === 'remix') { void api.remix(card.id); return print(`→ MAKE · CODE with ${card.id}`) }
      void api.studio(card.id); return print(`→ MAKE · COMPOSE with ${card.id}`)
    }
    case 'xray': {
      if (arg && arg !== 'on' && arg !== 'off') return print(err('xray: on or off, or nothing to toggle'))
      const on = arg === 'on' ? true : arg === 'off' ? false : !(xrState().global || xrState().on.size > 0)
      api.toggleXray(on)
      return print(`x-ray ${on ? 'on: hover any dot to see why it is that size' : 'off'}`)
    }
    case 'fps': {
      if (arg === 'hud') { api.toggleFps(); return print('fps meter toggled') }
      if (arg) return print(err(`fps: only fps or fps hud.${maybe(nearest(arg, ['hud']))}`))
      print(dim('measuring… ctrl+c stops'))
      const fps = await ctx.wait(measureFps(ctx.signal))
      print(`page ${fps} fps · clock ${xrState().frozen ? 'frozen' : 'running'} at t ${boardTime().toFixed(2)}s`)
      // the per-card list comes from the X-ray overlays: with X-ray off there is none to list
      if (!flag('xray')) return print(dim('fps hud: the meter'))
      const cards = [...probes.values()]
      if (!cards.length) return print(dim('xray on for per-card fps and dot counts (fps hud: meter)'))
      return print(...cards.slice(0, 8).map(p => `  ${p.preset.id.padEnd(20)}${(p.animated ? `${p.stats.fps}/${p.fps} fps` : 'static').padEnd(14)}${String(p.stats.dots).padStart(6)} dots  ${p.mode()}${p.worker() ? '+worker' : ''}`))
    }
    case 't': {
      if (!arg) return print(`t = ${boardTime().toFixed(2)}s (${xrState().frozen ? 'frozen' : 'running'})`)
      if (arg === 'resume' || arg === 'play') { api.resume(); return print('clock running') }
      const s = Number(arg.replace(/s$/, ''))
      if (!Number.isFinite(s) || s < 0 || s > 1e6) return print(err('t: seconds, e.g. t 12.5, or t resume'))
      api.scrub(s)
      return print(`clock frozen at t = ${s.toFixed(2)}s · space or play resumes`)
    }
    case 'play': api.resume(); return print('clock running')
    case 'boss': api.boss(); return ctx.close()
    case 'whoami': return print('a visitor, sampled at 144×144')
    case 'sudo': return print(err('permission denied: dots answer only to fields'))
  }
}
