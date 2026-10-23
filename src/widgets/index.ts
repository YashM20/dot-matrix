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
import { instrumentBoard } from './boards/instrument'
import { levelsBoard } from './boards/levels'

export interface BoardDef { id: string; title: string; columns: number; items: WidgetPreset[] }
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
  { id: 'instrument', title: 'INSTRUMENT — DOT/480 DEVICE', columns: 3, items: instrumentBoard },
  { id: 'levels', title: 'LEVELS — HIVE, NINE WORLDS', columns: 3, items: levelsBoard },
  { id: 'components', title: 'DOT / 480 — PRIMITIVE COMPONENTS', columns: 5, items: componentsBoard },
]
export const boardIds = boards.map(b => b.id)
export const boardById = (id: string): BoardDef | undefined => boards.find(b => b.id === id)

export const widgetPresets: WidgetPreset[] = boards.flatMap(b => b.items)
export const widgetById = (id: string): WidgetPreset | undefined => widgetPresets.find(p => p.id === id)

export * from './types'
