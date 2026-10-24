/**
 * What the palette and the dot shell can do: one command API shared by both (built in `CommandLayer`
 * from the App's tab / board state), plus the palette's item list.
 */
import { boardIds, boardManifest, loadBoard, type BoardDef } from '../../widgets/manifest'
import type { RendererOverride } from '../xray/store'
import type { MotionSetting } from './reducedMotion'

export const TABS = ['BOARDS', 'GALLERY', 'WORKSPACE', 'STUDIO', 'LOG', 'DOTS', 'DRAW'] as const
export const SKINS = ['crt', 'lcd', 'e-ink', 'led', 'vfd', 'none'] as const

export interface CommandApi {
  tab: string
  board: string
  openTab(tab: string): void
  openBoard(id: string): void
  /** Open the board holding `cardId`, scroll to the card and flash it. */
  focusCard(cardId: string, opts?: { xray?: boolean }): void | Promise<void>
  remix(cardId: string, data?: Record<string, number>): void | Promise<void>
  /** Open the card in STUDIO as a layer stack (`importPreset`). */
  studio(cardId: string): void | Promise<void>
  copyLink(cardId?: string): void
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

/** Every board, loading the chunks not loaded yet (the palette's card search, the shell). */
export const allBoards = (): Promise<BoardDef[]> => Promise.all(boardIds.map(loadBoard))
/** The board a card lives on (first one, board order). */
export const boardOfCard = async (cardId: string) => (await allBoards()).find(b => b.items.some(p => p.id === cardId))

/** Palette items: actions, views and boards (from the manifest) at once; cards once `boards` have loaded. */
export function paletteItems(hoveredCard?: string, boards: BoardDef[] = []): PaletteItem[] {
  const items: PaletteItem[] = []
  const act = (id: string, text: string, run: PaletteItem['run'], hint?: string, keywords?: string) => items.push({ id: `a:${id}`, group: 'Action', text, run, hint, keywords, boost: 20 })
  act('xray', 'Toggle X-ray on every card', a => a.toggleXray(), '⇧X', 'xray inspect debug grid field layers')
  act('time', 'Time machine: freeze and scrub the board', a => a.freeze(), 'T', 'pause clock scrub time')
  act('resume', 'Time machine: resume the clock', a => a.resume(), 'SPACE', 'play unpause')
  if (hoveredCard) act('remix-hover', `Open ${hoveredCard} in DOTS (remix)`, a => a.remix(hoveredCard), '', 'remix dots ir program')
  if (hoveredCard) act('studio-hover', `Open ${hoveredCard} in STUDIO`, a => a.studio(hoveredCard), '', 'remix studio edit layers')
  act('remix', 'Open DOTS (Field IR REPL)', a => a.openTab('DOTS'), '', 'dwitter repl ir program')
  act('link', 'Copy deep link to this view', a => a.copyLink(), '', 'share url clipboard')
  if (hoveredCard) act('link-card', `Copy deep link to ${hoveredCard}`, a => a.copyLink(hoveredCard), '', 'share url clipboard card')
  act('shell', 'Open the dot shell', a => a.openShell(), '`', 'terminal console cli')
  act('fps', 'Toggle the fps meter', a => a.toggleFps(), '', 'performance frames')
  for (const m of ['on', 'off', 'system'] as const) act(`rm-${m}`, `Reduced motion: ${m}`, a => a.setReducedMotion(m), '', 'motion animation accessibility a11y')
  for (const r of ['auto', 'svg', 'canvas', 'webgl'] as const) act(`r-${r}`, `Renderer: ${r}`, a => a.setRenderer(r), '', 'renderer svg canvas webgl')
  act('worker-off', 'Renderer: main-thread sampling (no worker, reloads)', a => a.setWorker(false), '', 'worker thread')
  act('worker-on', 'Renderer: worker sampling (reloads)', a => a.setWorker(true), '', 'worker thread')
  for (const s of SKINS) act(`skin-${s}`, `Skin: ${s}`, a => a.setSkin(s), 'soon', 'display skin theme crt lcd')
  for (const t of TABS) items.push({ id: `v:${t}`, group: 'View', text: `Go to ${t}`, run: a => a.openTab(t), keywords: t.toLowerCase(), boost: 30 })
  for (const m of boardManifest) {
    const b = boards.find(x => x.id === m.id)
    items.push({ id: `b:${m.id}`, group: 'Board', text: `${m.id.toUpperCase()} — ${m.title}`, keywords: b?.items.map(p => p.name).join(' '), hint: b ? `${b.items.length} cards` : undefined, boost: 40, run: a => a.openBoard(m.id) })
  }
  const seen = new Set<string>()
  for (const b of boards) for (const p of b.items) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    items.push({ id: `c:${p.id}`, group: 'Card', text: `${p.name} · ${p.id}`, keywords: `${b.id} ${p.group}`, hint: b.id.toUpperCase(), run: a => a.focusCard(p.id) })
  }
  return items
}
