import type { GridConfig, Layer } from './types'
import type { Raster } from './raster/raster'

/** A pointer in card-cell space (multitouch: one entry per active pointer). */
export interface Pointer {
  /** The host's pointer id; `'hand'` = the webcam hand tracker's virtual pointer (HAND mode). */
  id: number | 'hand'
  x: number; y: number
  inside: boolean; down: boolean
  /** Board-clock seconds of the last press / release. */
  tDown: number; tUp: number
  vx: number; vy: number
  pressure: number
  /** A released touch kept briefly so press ripples can finish: not `down`, not `inside`, never a hover target. */
  up?: boolean
}

/**
 * An interactive region of a card (P2 contract). Cards declare controls; the input layer turns
 * pointer, touch and keyboard input into `data[key]` changes and fills `hover` / `pressed` /
 * `focus` in the frame context, so the card stays a pure function of its context.
 * Values are always in [min, max] (defaults 0..1); `step` quantizes them (detents).
 */
export interface Control {
  /** Data key the control drives; also its id for hover / pressed / focus. */
  key: string
  kind: 'button' | 'toggle' | 'slider' | 'knob' | 'crank' | 'xy' | 'stepper' | 'segmented'
  /** Hit box in card cells: [col, row, width, height]. Knobs and cranks use its inscribed circle. */
  box: [number, number, number, number]
  min?: number; max?: number; step?: number
  /** Slider / stepper axis (default horizontal). */
  orientation?: 'horizontal' | 'vertical'
  /** `xy`: the data key for the vertical axis (`key` is the horizontal one). */
  keyY?: string
  /** `segmented`: option count (value = index). */
  options?: number
  /** `segmented`: accessible names of the options (default "1", "2", …). */
  optionLabels?: string[]
  /** `crank`: value change per clockwise revolution (default 1, i.e. the value counts turns). */
  perTurn?: number
  /** `crank`: wrap around inside [min, max) instead of stopping at the ends. */
  wrap?: boolean
  /**
   * Touch: `surface` = the box is a drag surface in every direction (physics toys you push around), not a
   * tap target. Grabbed like a drag control: a horizontal drag or a press-and-hold (`interaction/gesture.ts`).
   */
  gesture?: 'surface'
  /** Accessible name, e.g. "Volume". */
  label: string
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
  /** Control key with keyboard focus (P2). */
  focus?: string
  state?: string
  reducedMotion?: boolean
  seed?: number
  /** Control key under the primary pointer (P2). */
  hover?: string
  /** Control key currently pressed / being dragged (P2). */
  pressed?: string
  /** Seconds since the last tick, set only while a tick burst runs (e.g. a split-flap after the minute changes). */
  since?: number
  /**
   * Live media rasters supplied by the host for this frame (e.g. `camera`: mirrored, exposure-normalised
   * luma on the card grid). Absent in snapshots, goldens and before the user grants access: cards must
   * draw a deterministic stand-in then.
   */
  media?: Record<string, Raster | undefined>
}

/** A card: frame context in, layers out. */
export type LayerSource<D = Record<string, number>> = (ctx: FrameContext<D>) => Layer[]
