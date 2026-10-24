import type { WidgetPreset } from './types'
import { henryBoard } from './boards/henry'
import { deerflow12Board } from './boards/deerflow12'
import { mosaicBoard } from './boards/mosaic'
import { henry3Board } from './boards/henry3'
import { metroBoard } from './boards/metro'
import { rideBoard } from './boards/ride'
import { audioBoard } from './boards/audio'
import { componentsBoard } from './boards/components'
import { departuresBoard } from './boards/departures'
import { instrumentBoard, instrumentShared } from './boards/instrument'
import { irBoard } from './boards/ir'
import { cinemaBoard } from './boards/cinema'
import { lightBoard } from './boards/light'
import { levelsBoard } from './boards/levels'
import { heartbeatBoard } from './boards/heartbeat'
import { simBoard } from './boards/sim'
import { lockBoard } from './boards/glyph'
import { liveBoard, liveSources } from './boards/live'
import type { Source } from '../data/source'
import { mirrorBoard } from './boards/mirror'
import { gpuBoard } from './boards/gpu'
import { surfacesBoard, surfacesSources } from './boards/surfaces'

export interface BoardDef {
  id: string; title: string; columns: number; items: WidgetPreset[]
  /**
   * Opt-in board-level data: these keys live in one store on the board (seeded from the first card
   * default that defines each), are merged into every card's `data`, and control edits to them are
   * written back to the store, so one card's controls can drive another card. Cards stay pure in ctx.
   */
  shared?: string[]
  /** Live data (`src/data`): subscribed while the board is mounted; each card gets the keys its defaults declare. */
  sources?: readonly Source[]
}
/** Every reference board in public/images, in the order they appear there. */
export const boards: BoardDef[] = [
  { id: 'henry', title: 'DOT / 480 — OLED MICRO INTERFACE SYSTEM', columns: 3, items: henryBoard },
  { id: 'deerflow12', title: 'DEERFLOW AIoT DASHBOARD — 12', columns: 3, items: deerflow12Board },
  { id: 'mosaic', title: 'DEERFLOW MOSAIC — AIoT COMMAND CENTER', columns: 3, items: mosaicBoard },
  { id: 'henry3', title: 'HENRY LI — 14A / 247W', columns: 3, items: henry3Board },
  { id: 'metro', title: 'METRO / OXYGEN / QUIET', columns: 3, items: metroBoard },
  { id: 'ride', title: 'RIDE / HENRY / SYSTEM', columns: 3, items: rideBoard },
  { id: 'audio', title: 'AUDIO / MIDI / INTERPRETER', columns: 3, items: audioBoard },
  { id: 'departures', title: 'DEPARTURES — LIVE TRANSIT BOARD', columns: 3, items: departuresBoard },
  { id: 'instrument', title: 'INSTRUMENT — DOT/480 DEVICE', columns: 3, items: instrumentBoard, shared: instrumentShared },
  { id: 'ir', title: 'FIELD IR — DOT PROGRAMS', columns: 3, items: irBoard },
  { id: 'cinema', title: 'CINEMA — THE AFTERLIGHT CYCLE', columns: 3, items: cinemaBoard },
  { id: 'light', title: 'LIGHT — RASTER LIGHT STACK', columns: 3, items: lightBoard },
  { id: 'levels', title: 'LEVELS — HIVE, NINE WORLDS', columns: 3, items: levelsBoard },
  { id: 'heartbeat', title: 'HEARTBEAT — AGENT PRESENCE', columns: 3, items: heartbeatBoard },
  { id: 'sim', title: 'SIM — LIVING FIELDS', columns: 3, items: simBoard },
  { id: 'lock', title: 'LOCK — LOCK SCREEN EXPERIENCES', columns: 2, items: lockBoard },
  { id: 'live', title: 'LIVE — WEATHER, NOW PLAYING, CONTRIBUTIONS', columns: 3, items: liveBoard, sources: liveSources },
  { id: 'mirror', title: 'MIRROR — LIVE HALFTONE', columns: 3, items: mirrorBoard },
  { id: 'gpu', title: 'GPU — HALF A MILLION DOTS', columns: 2, items: gpuBoard },
  { id: 'surfaces', title: 'SURFACES — ONE FIELD, FIVE SURFACES', columns: 5, items: surfacesBoard, sources: surfacesSources },
  { id: 'components', title: 'DOT / 480 — PRIMITIVE COMPONENTS', columns: 5, items: componentsBoard },
]
export const boardIds = boards.map(b => b.id)
/** Old board ids that still resolve (deep links, bookmarks): `?board=glyph` opens the lock board. */
export const boardAliases: Readonly<Record<string, string>> = { glyph: 'lock' }
export const boardById = (id: string): BoardDef | undefined => boards.find(b => b.id === (boardAliases[id] ?? id))

export const widgetPresets: WidgetPreset[] = boards.flatMap(b => b.items)
export const widgetById = (id: string): WidgetPreset | undefined => widgetPresets.find(p => p.id === id) ?? (id.startsWith('glyph-') ? widgetById(`lock-${id.slice(6)}`) : undefined)

export * from './types'
