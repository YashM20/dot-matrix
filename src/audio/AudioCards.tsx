import type { ReactNode } from 'react'
import type { ControlPatch } from '../engine/interaction/controls'
import type { WidgetPreset } from '../widgets/types'
import { useAudio } from './useAudio'

/**
 * The Instrument / Scope boards' cards with sound wired in (`useAudio`). Its own chunk, loaded by `Board`
 * only on those two boards, so the audio engine stays out of every other board's first load.
 */
export function AudioCards({ boardId, shared, onShared, titleId, children }: {
  boardId: string
  shared: ControlPatch
  onShared: (patch: ControlPatch) => void
  titleId: string
  children: (map: (p: WidgetPreset) => WidgetPreset) => ReactNode
}) {
  return <>{children(useAudio(boardId, shared, onShared, titleId))}</>
}
