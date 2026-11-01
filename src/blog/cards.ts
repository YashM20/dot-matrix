/**
 * The live cards the blog embeds (figures and index thumbnails), by preset id. Each board module is imported on its own (the same chunks the
 * boards use), so a post fetches only the boards its figures show. The manifest and the catalog stay out of this
 * entry on purpose: importing them here would split them out of the site's first load into a shared chunk.
 * A card id the table doesn't know renders as a missing-card note (`LiveCard.tsx`).
 */
import type { Source } from '../data/source'
import type { WidgetPreset } from '../widgets/types'
import { registerPresets } from '../widgets/registry'

interface Loaded { items: readonly WidgetPreset[]; sources?: readonly Source[] }
const BOARDS: Record<string, () => Promise<Loaded>> = {
  henry: () => import('../widgets/boards/henry').then(m => ({ items: m.henryBoard })),
  deerflow12: () => import('../widgets/boards/deerflow12').then(m => ({ items: m.deerflow12Board })),
  audio: () => import('../widgets/boards/audio').then(m => ({ items: m.audioBoard })),
  departures: () => import('../widgets/boards/departures').then(m => ({ items: m.departuresBoard })),
  ir: () => import('../widgets/boards/ir').then(m => ({ items: m.irBoard })),
  pond: () => import('../widgets/boards/pond/index').then(m => ({ items: m.pondBoard, sources: m.pondSources })),
  light: () => import('../widgets/boards/light').then(m => ({ items: m.lightBoard })),
  squares: () => import('../widgets/boards/squares').then(m => ({ items: m.squaresBoard })),
  materials: () => import('../widgets/boards/materials').then(m => ({ items: m.materialsBoard, sources: m.materialsSources })),
}
/** Card id → its board (the rows of src/widgets/catalog.ts the posts use). */
const CARD_BOARD: Record<string, keyof typeof BOARDS> = {
  'home-clock': 'henry', timer: 'henry', weather: 'henry', 'device-overview': 'deerflow12', 'audio-levels': 'audio', 'level-03': 'audio', departures: 'departures',
  'ir-ripple': 'ir', 'ir-plasma': 'ir', 'ir-dial': 'ir',
  'pond-koi': 'pond', 'pond-jelly': 'pond', 'pond-marble': 'pond', 'light-matte': 'light', 'sq-tetris': 'squares', 'mat-marble': 'materials',
}

export interface PostCard { preset: WidgetPreset; sources?: readonly Source[] }
const boards = new Map<string, Promise<Loaded>>()

/** The card and its board's live sources; undefined for an id the table doesn't know. */
export async function loadCard(id: string): Promise<PostCard | undefined> {
  const board = CARD_BOARD[id]
  if (!board) return undefined
  let p = boards.get(board)
  if (!p) {
    p = BOARDS[board]().then(b => { registerPresets(b.items); return b })
    p.catch(() => boards.delete(board)) // a failed fetch (offline, new deploy) retries next time
    boards.set(board, p)
  }
  const b = await p, preset = b.items.find(i => i.id === id)
  return preset && { preset, sources: b.sources }
}
