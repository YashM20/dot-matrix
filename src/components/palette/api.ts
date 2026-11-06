/**
 * What the palette and the dot shell can do: one command API shared by both (built in `CommandLayer`
 * from the App's tab / board state), plus the palette's item list.
 */
import { SKINS as SKIN_INFO, SKIN_NAMES } from '../../engine/display/names'
import { boardIds, boardLabel, boardManifest, loadBoard, type BoardDef } from '../../widgets/manifest'
import { MODE_LINES, PLACES, isMode, placeOpen } from '../../site/views'
import type { RendererOverride } from '../xray/store'
import type { MotionSetting } from './reducedMotion'
import { ACCENTS, type AccentId } from '../../site/theme/names'
import { getTheme, setContrast } from '../../site/theme/theme'
import { dropUrlParams, switchTheme } from '../../site/theme/moment'
import { setPondMemory } from '../../site/pondMemory'
import { CARD_SIZE_LABELS, CARD_SIZE_LINES, CARD_SIZES, setCardSize } from '../../site/cards'
import { POSTS, postPath } from '../../blog/posts'
import { flag } from '../../site/flags'
import { assign } from '../../site/safe-url'
import { analyticsState, setAnalytics } from '../../site/analytics/consent'
import { toast } from '../xray/store'

/** The display skins, from the engine's list (so the palette, shell and header can't drift apart). */
export const SKINS = SKIN_NAMES

export interface CommandApi {
  /** The place: EXPLORE, ABOUT or a MAKE mode. */
  tab: string
  board: string
  /** A view or MAKE mode by any name, old tab names too (`src/site/views.ts`). */
  openTab(tab: string): void
  openBoard(id: string): void
  /** Open the board holding `cardId`, scroll to the card and flash it. */
  focusCard(cardId: string, opts?: { xray?: boolean }): void | Promise<void>
  remix(cardId: string, data?: Record<string, number>): void | Promise<void>
  /** Open the card in MAKE · COMPOSE as a layer stack (`importPreset`). */
  studio(cardId: string): void | Promise<void>
  /** Copies the link and returns it. */
  copyLink(cardId?: string): string
  toggleXray(force?: boolean): void
  freeze(): void
  resume(): void
  scrub(t: number): void
  setRenderer(r: RendererOverride): void
  setWorker(on: boolean): void
  setReducedMotion(s: MotionSetting): void
  setSkin(name: string): void
  toggleFps(force?: boolean): void
  openShell(): void
  boss(): void
}

export interface PaletteItem {
  id: string
  group: 'Action' | 'Board' | 'Card' | 'View'
  text: string
  keywords?: string
  hint?: string
  /** Rank bonus over an equal fuzzy score (boards before the cards on them). */
  boost?: number
  run(api: CommandApi): void
}

// what each place used to be called, and what people may type for it
const PLACE_WORDS: Record<(typeof PLACES)[number], string> = {
  EXPLORE: 'boards gallery home', BROWSE: 'all cards every card grid filter tags search catalog list', TUNE: 'make workspace playground preset style', COMPOSE: 'make studio layers timeline',
  CODE: 'make dots repl dwitter ir program', DRAW: 'make paint', ABOUT: 'log changelog essay shortcuts help keys',
}

/** Every board, loading the chunks not loaded yet (the palette's card search, the shell). */
export const allBoards = (): Promise<BoardDef[]> => Promise.all(boardIds.map(loadBoard))
/** The board a card lives on (first one, board order). */
export const boardOfCard = async (cardId: string) => (await allBoards()).find(b => b.items.some(p => p.id === cardId))

/** Palette items: actions, views and boards (from the manifest) at once; cards once `boards` have loaded. */
export function paletteItems(hoveredCard?: string, boards: BoardDef[] = []): PaletteItem[] {
  const items: PaletteItem[] = []
  const act = (id: string, text: string, run: PaletteItem['run'], hint?: string, keywords?: string) => items.push({ id: `a:${id}`, group: 'Action', text, run, hint, keywords, boost: 20 })
  if (flag('xray')) act('xray', 'Toggle X-ray on every card', a => a.toggleXray(), '⇧X', 'xray inspect debug grid field layers')
  act('time', 'Time machine: freeze and scrub the board', a => a.freeze(), 'T', 'pause clock scrub time')
  act('resume', 'Time machine: resume the clock', a => a.resume(), 'SPACE', 'play unpause')
  if (hoveredCard && flag('make')) act('remix-hover', `Open ${hoveredCard} in MAKE · CODE (remix)`, a => a.remix(hoveredCard), '', 'remix dots ir program')
  if (hoveredCard && flag('make')) act('studio-hover', `Open ${hoveredCard} in MAKE · COMPOSE`, a => a.studio(hoveredCard), '', 'remix studio edit layers')
  act('link', 'Copy deep link to this view', a => a.copyLink(), '', 'share url clipboard')
  if (hoveredCard) act('link-card', `Copy deep link to ${hoveredCard}`, a => a.copyLink(hoveredCard), '', 'share url clipboard card')
  act('shell', 'Open the dot shell', a => a.openShell(), '`', 'terminal console cli')
  act('fps', 'Toggle the fps meter', a => a.toggleFps(), '', 'performance frames')
  for (const m of ['on', 'off', 'system'] as const) act(`rm-${m}`, `Reduced motion: ${m}`, a => a.setReducedMotion(m), '', 'motion animation accessibility a11y')
  for (const r of ['auto', 'svg', 'canvas', 'webgl'] as const) act(`r-${r}`, `Renderer: ${r}`, a => a.setRenderer(r), '', 'renderer svg canvas webgl')
  act('worker-off', 'Renderer: main-thread sampling (no worker, reloads)', a => a.setWorker(false), '', 'worker thread')
  act('worker-on', 'Renderer: worker sampling (reloads)', a => a.setWorker(true), '', 'worker thread')
  for (const s of SKINS) act(`skin-${s}`, `Display skin — ${SKIN_INFO[s].title}`, a => a.setSkin(s), '', `display skin theme ${s}`)
  // the site theme (scheme × accent, src/site/theme): the THEME popover's choices as commands, with its wipe
  // (from the middle of the screen, where the palette was)
  const SCHEME_WORDS = { system: 'auto os follow', light: 'paper day white', dark: 'night black' } as const
  for (const s of ['system', 'light', 'dark'] as const) act(`theme-${s}`, `Theme: ${s}${s === 'system' ? ' (follow the OS light / dark)' : ''}`, () => switchTheme({ scheme: s }), '', `theme scheme mode colour color ${SCHEME_WORDS[s]}`)
  for (const c of ACCENTS) act(`accent-${c}`, `Accent: ${c}`, () => switchTheme({ accent: c }), '', `accent theme colour color hue ${c}`)
  act('contrast-more', 'Contrast: more (stronger text and lines)', () => { dropUrlParams(['contrast']); setContrast('more') }, '', 'contrast more high accessibility legible readable')
  act('contrast-system', 'Contrast: follow the system', () => { dropUrlParams(['contrast']); setContrast('system') }, '', 'contrast normal default system os accessibility')
  // the ageing pond's memory (X1 #5): opt-in, a ~60-byte record of visits in this browser; off deletes it
  act('pond-memory-on', 'Pond memory: on (your koi age with your visits)', () => setPondMemory(true), '', 'pond koi age ageing visits storage remember memory')
  act('pond-memory-off', 'Pond memory: off (deletes the record)', () => setPondMemory(false), '', 'pond koi age ageing visits storage forget memory privacy')
  // analytics (#151): opt-in, anonymous; off deletes what PostHog stored here
  if (analyticsState() !== 'unavailable') {
    act('analytics-on', 'Analytics: on (anonymous page views, through PostHog)', () => toast(setAnalytics(true)), '', 'analytics posthog tracking consent privacy stats')
    act('analytics-off', 'Analytics: off (nothing is sent)', () => toast(setAnalytics(false)), '', 'analytics posthog tracking consent privacy opt out')
  }
  act('accent-next', 'Accent: next', () => switchTheme({ accent: ACCENTS[(ACCENTS.indexOf(getTheme().accent as AccentId) + 1) % ACCENTS.length] }), '', 'accent theme colour color hue next cycle')
  // CARD SIZE (src/site/cards.ts): the popover's and TOOLS' LARGE / MEDIUM / COMPACT
  for (const s of CARD_SIZES) act(`cards-${CARD_SIZE_LABELS[s].toLowerCase()}`, `Card size: ${CARD_SIZE_LABELS[s].toLowerCase()} (${CARD_SIZE_LINES[s]})`, () => setCardSize(s), '', `card size cards columns row grid bigger smaller zoom density ${CARD_SIZE_LABELS[s].toLowerCase()}`)
  for (const p of PLACES.filter(placeOpen)) items.push({ id: `v:${p}`, group: 'View', text: isMode(p) ? `Go to MAKE · ${p}: ${MODE_LINES[p]}` : `Go to ${p}`, run: a => a.openTab(p), keywords: `${p.toLowerCase()} ${PLACE_WORDS[p]}`, boost: 30 })
  // the blog is its own page (blog.html, src/blog): the index, then each post
  items.push({ id: 'v:blog', group: 'View', text: 'Blog', hint: `${POSTS.length} posts`, run: () => assign(postPath()), keywords: 'blog posts essay guides tutorials articles read learn how it works', boost: 30 })
  for (const p of POSTS) items.push({ id: `v:blog-${p.slug}`, group: 'View', text: `Blog: ${p.title}`, run: () => assign(postPath(p.slug)), keywords: `blog post ${p.kind === 'essay' ? 'essay ditherpunk how it works' : 'tutorial guide'} ${p.dek}`, boost: 25 })
  for (const m of boardManifest) {
    const b = boards.find(x => x.id === m.id)
    items.push({ id: `b:${m.id}`, group: 'Board', text: `${boardLabel(m.id)} · ${m.title}`, keywords: `${m.id} ${b?.items.map(p => p.name).join(' ') ?? ''}`, hint: b ? `${b.items.length} cards` : undefined, boost: 40, run: a => a.openBoard(m.id) })
  }
  const seen = new Set<string>()
  for (const b of boards) for (const p of b.items) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    items.push({ id: `c:${p.id}`, group: 'Card', text: `${p.name} · ${p.id}`, keywords: `${b.id} ${p.group}`, hint: b.id.toUpperCase(), run: a => a.focusCard(p.id) })
  }
  return items
}
