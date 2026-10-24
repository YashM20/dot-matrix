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
import { glyphBoard } from './boards/glyph'
import { liveBoard, liveSources } from './boards/live'
import { mirrorBoard } from './boards/mirror'
import { gpuBoard } from './boards/gpu'
import { surfacesBoard, surfacesSources } from './boards/surfaces'
import { typeBoard } from './boards/type'
import { boardIds, boardManifest, type BoardContents, type BoardDef, type BoardId } from './manifest'
import { registerPresets } from './registry'

/**
 * Eager registry: every board with its cards, for scripts, the playground and the worker. The app shell
 * imports `./manifest` instead (one lazy chunk per board); titles/columns come from there.
 */
const contents = {
  henry: { items: henryBoard },
  deerflow12: { items: deerflow12Board },
  mosaic: { items: mosaicBoard },
  henry3: { items: henry3Board },
  metro: { items: metroBoard },
  ride: { items: rideBoard },
  audio: { items: audioBoard },
  departures: { items: departuresBoard },
  instrument: { items: instrumentBoard, shared: instrumentShared },
  ir: { items: irBoard },
  cinema: { items: cinemaBoard },
  light: { items: lightBoard },
  levels: { items: levelsBoard },
  heartbeat: { items: heartbeatBoard },
  sim: { items: simBoard },
  glyph: { items: glyphBoard },
  live: { items: liveBoard, sources: liveSources },
  mirror: { items: mirrorBoard },
  gpu: { items: gpuBoard },
  surfaces: { items: surfacesBoard, sources: surfacesSources },
  components: { items: componentsBoard },
  type: { items: typeBoard },
} satisfies Record<BoardId, BoardContents>
export const boards: BoardDef[] = boardManifest.map(({ id, title, columns }) => ({ id, title, columns, ...contents[id] }))
export { boardIds }
export const boardById = (id: string): BoardDef | undefined => boards.find(b => b.id === id)

export const widgetPresets: WidgetPreset[] = boards.flatMap(b => b.items)
export const widgetById = (id: string): WidgetPreset | undefined => widgetPresets.find(p => p.id === id)

registerPresets(widgetPresets)

export type { BoardContents, BoardDef, BoardMeta } from './manifest'
export * from './types'
