/**
 * Board manifest: ids, titles and columns of every board, each with a lazy `load()` of its module.
 * The app imports only this file up front, so each board is its own chunk, fetched when it is opened
 * (or when its tab is hovered: `prefetchBoard`). `./index.ts` is the eager registry built from the same
 * list for scripts, the playground and the worker.
 *
 * Adding a board: one entry here, plus its contents in `./index.ts` (`tsc` fails if the two disagree).
 */
import type { Source } from '../data/source'
import type { WidgetPreset } from './types'
import { registerPresets } from './registry'

/** What a board module supplies; title and columns live in the manifest so tabs and meta need no chunk. */
export interface BoardContents {
  items: WidgetPreset[]
  /**
   * Opt-in board-level data: these keys live in one store on the board (seeded from the first card
   * default that defines each), are merged into every card's `data`, and control edits to them are
   * written back to the store, so one card's controls can drive another card. Cards stay pure in ctx.
   */
  shared?: string[]
  /** Live data (`src/data`): subscribed while the board is mounted; each card gets the keys its defaults declare. */
  sources?: readonly Source[]
}
export interface BoardMeta { id: string; title: string; columns: number }
export interface BoardDef extends BoardMeta, BoardContents {}

/** Every reference board in public/images, in the order they appear there. */
export const boardManifest = [
  { id: 'henry', title: 'DOT / 480 — OLED MICRO INTERFACE SYSTEM', columns: 3, load: () => import('./boards/henry').then(m => ({ items: m.henryBoard })) },
  { id: 'deerflow12', title: 'DEERFLOW AIoT DASHBOARD — 12', columns: 3, load: () => import('./boards/deerflow12').then(m => ({ items: m.deerflow12Board })) },
  { id: 'mosaic', title: 'DEERFLOW MOSAIC — AIoT COMMAND CENTER', columns: 3, load: () => import('./boards/mosaic').then(m => ({ items: m.mosaicBoard })) },
  { id: 'henry3', title: 'HENRY LI — 14A / 247W', columns: 3, load: () => import('./boards/henry3').then(m => ({ items: m.henry3Board })) },
  { id: 'metro', title: 'METRO / OXYGEN / QUIET', columns: 3, load: () => import('./boards/metro').then(m => ({ items: m.metroBoard })) },
  { id: 'ride', title: 'RIDE / HENRY / SYSTEM', columns: 3, load: () => import('./boards/ride').then(m => ({ items: m.rideBoard })) },
  { id: 'audio', title: 'AUDIO / MIDI / INTERPRETER', columns: 3, load: () => import('./boards/audio').then(m => ({ items: m.audioBoard })) },
  { id: 'departures', title: 'DEPARTURES — LIVE TRANSIT BOARD', columns: 3, load: () => import('./boards/departures').then(m => ({ items: m.departuresBoard })) },
  { id: 'instrument', title: 'INSTRUMENT — DOT/480 DEVICE', columns: 3, load: () => import('./boards/instrument').then(m => ({ items: m.instrumentBoard, shared: m.instrumentShared })) },
  { id: 'ir', title: 'FIELD IR — DOT PROGRAMS', columns: 3, load: () => import('./boards/ir').then(m => ({ items: m.irBoard })) },
  { id: 'cinema', title: 'CINEMA — THE AFTERLIGHT CYCLE', columns: 3, load: () => import('./boards/cinema').then(m => ({ items: m.cinemaBoard })) },
  { id: 'light', title: 'LIGHT — RASTER LIGHT STACK', columns: 3, load: () => import('./boards/light').then(m => ({ items: m.lightBoard })) },
  { id: 'levels', title: 'LEVELS — HIVE, NINE WORLDS', columns: 3, load: () => import('./boards/levels').then(m => ({ items: m.levelsBoard })) },
  { id: 'heartbeat', title: 'HEARTBEAT — AGENT PRESENCE', columns: 3, load: () => import('./boards/heartbeat').then(m => ({ items: m.heartbeatBoard })) },
  { id: 'sim', title: 'SIM — LIVING FIELDS', columns: 3, load: () => import('./boards/sim').then(m => ({ items: m.simBoard })) },
  { id: 'glyph', title: 'GLYPH — LOCK EXPERIENCES', columns: 2, load: () => import('./boards/glyph').then(m => ({ items: m.glyphBoard })) },
  { id: 'live', title: 'LIVE — WEATHER, NOW PLAYING, CONTRIBUTIONS', columns: 3, load: () => import('./boards/live').then(m => ({ items: m.liveBoard, sources: m.liveSources })) },
  { id: 'mirror', title: 'MIRROR — LIVE HALFTONE', columns: 3, load: () => import('./boards/mirror').then(m => ({ items: m.mirrorBoard })) },
  { id: 'gpu', title: 'GPU — HALF A MILLION DOTS', columns: 2, load: () => import('./boards/gpu').then(m => ({ items: m.gpuBoard })) },
  { id: 'surfaces', title: 'SURFACES — ONE FIELD, FIVE SURFACES', columns: 5, load: () => import('./boards/surfaces').then(m => ({ items: m.surfacesBoard, sources: m.surfacesSources })) },
  { id: 'components', title: 'DOT / 480 — PRIMITIVE COMPONENTS', columns: 5, load: () => import('./boards/components').then(m => ({ items: m.componentsBoard })) },
  { id: 'type', title: 'TYPE — VARIABLE DOT TYPE', columns: 3, load: () => import('./boards/type').then(m => ({ items: m.typeBoard })) },
  { id: 'physics', title: 'PHYSICS — DOTS YOU CAN TOUCH', columns: 3, load: () => import('./boards/physics').then(m => ({ items: m.physicsBoard })) },
  { id: 'scope', title: 'SCOPE — THE INSTRUMENT, SEEN', columns: 3, load: () => import('./boards/scope').then(m => ({ items: m.scopeBoard, shared: m.scopeShared })) },
] as const satisfies readonly (BoardMeta & { load: () => Promise<BoardContents> })[]

export type BoardId = typeof boardManifest[number]['id']
export const boardIds: string[] = boardManifest.map(b => b.id)
export const boardMeta = (id: string): BoardMeta | undefined => boardManifest.find(b => b.id === id)

const loaded = new Map<string, Promise<BoardDef>>()
/**
 * The board's definition, loading its chunk on first call (an unknown id loads the first board).
 * Returns the same promise for the same id, so React's `use()` can suspend on it.
 */
export function loadBoard(id: string): Promise<BoardDef> {
  const entry = boardManifest.find(b => b.id === id) ?? boardManifest[0]
  let p = loaded.get(entry.id)
  if (!p) {
    const { load, ...meta } = entry
    p = load().then((contents: BoardContents) => { registerPresets(contents.items); return { ...meta, ...contents } })
    // a failed chunk fetch (offline, new deploy) must not stick: the next open retries
    p.catch(() => loaded.delete(entry.id))
    loaded.set(entry.id, p)
  }
  return p
}
/** Start fetching a board's chunk (tab hover / focus); errors surface when it is opened. */
export const prefetchBoard = (id: string) => { loadBoard(id).catch(() => {}) }
/** A preset by id from any board, loading every board chunk if needed (gallery, `?card=`). */
export async function findPreset(id: string): Promise<WidgetPreset | undefined> {
  const all = await Promise.all(boardManifest.map(b => loadBoard(b.id)))
  for (const b of all) { const p = b.items.find(i => i.id === id); if (p) return p }
}
