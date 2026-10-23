import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ControlPatch } from '../engine'
import { handMode } from '../vision/handPointer'

/** Data key of the HAND-mode toggle a card may declare (e.g. `mirror-conduct`). */
export const HAND_KEY = 'hand'
/** `data.handState` codes: 0 off, 1 asking for the camera, 2 tracking, 3 no camera. */
const STATE = { idle: 0, starting: 1, live: 2, denied: 3, error: 3 } as const
const NONE: Record<string, number> = {}

export interface HandFeed {
  /** Merged into the card's `data`: `hand` (0/1), `handState`, `handSeen` (a hand is tracked). Empty unless enabled. */
  data: Record<string, number>
  /** Route `hand` edits to the page-wide HAND mode (camera + virtual pointer); returns the rest of the patch. */
  intercept(patch: ControlPatch): ControlPatch
}

/**
 * HAND mode for a card with a `hand` control: the toggle drives the page-wide tracker (`handMode`) instead of
 * card state, and the card reads the real mode back, so it stays right after Esc / STOP or a remount.
 */
export function useHandMode(enabled: boolean): HandFeed {
  const s = useSyncExternalStore(handMode.subscribe, handMode.get, handMode.get)
  const data = useMemo(() => (enabled ? { [HAND_KEY]: s.on ? 1 : 0, handState: s.on ? STATE[s.status] : 0, handSeen: s.present ? 1 : 0 } : NONE), [enabled, s.on, s.status, s.present])
  const intercept = useCallback((patch: ControlPatch): ControlPatch => {
    if (!enabled || !(HAND_KEY in patch)) return patch
    const { [HAND_KEY]: v, ...rest } = patch
    handMode.set(v >= .5)
    return rest
  }, [enabled])
  return { data, intercept }
}
