import type { GridConfig, Layer } from './types'

/** A pointer in card-cell space (multitouch: one entry per active pointer). */
export interface Pointer {
  id: number
  x: number; y: number
  inside: boolean; down: boolean
  /** Board-clock seconds of the last press / release. */
  tDown: number; tUp: number
  vx: number; vy: number
  pressure: number
}

/**
 * Everything a layer source may read for one frame. Plain data — no framework types — so the
 * same presets run in the app, in `pnpm snap`, in a worker or on a device.
 * Only `t` and `data` are guaranteed today; the rest is filled in as the motion/interaction
 * phases land (see docs/MASTER-PLAN.md §3.2).
 */
export interface FrameContext<D = Record<string, number>> {
  /** Board-clock seconds, quantized to the card's frame rate (0 for static renders). */
  t: number
  /** Editable numbers, seeded from the preset's `defaults`. */
  data: D
  dt?: number
  frame?: number
  grid?: GridConfig
  pointers?: Pointer[]
  focus?: string
  state?: string
  reducedMotion?: boolean
  seed?: number
}

/** A card: frame context in, layers out. */
export type LayerSource<D = Record<string, number>> = (ctx: FrameContext<D>) => Layer[]
