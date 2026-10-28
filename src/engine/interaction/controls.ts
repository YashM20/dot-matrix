/**
 * Input layer (P2): turns pointer / touch / keyboard input into `data[control.key]` changes.
 * Pure functions over the `Control` contract (see `context.ts`), all in card-cell coordinates
 * (a dot site at `[x, y]` has its centre at cell `x, y`; a box `[col, row, w, h]` spans
 * `col..col+w` × `row..row+h`). Framework-free: the app (or a device) owns the events.
 */
import type { Control } from '../context'
import { clamp } from '../math'

export interface CellPoint { x: number; y: number }
/** The subset of a DOMRect `toLocal` needs. */
export interface RectLike { left: number; top: number; width: number; height: number }
/** A patch of data values (`{ [key]: value }`); `xy` patches carry two keys. */
export type ControlPatch = Record<string, number>

/** Extra hit margin around every control, in card cells. */
export const HIT_PAD = 2
const TAU = Math.PI * 2

/** Client (CSS px) coordinates → card cells, for an element that shows the whole `grid`. */
export function toLocal(clientX: number, clientY: number, rect: RectLike, grid: { cols: number; rows: number }): CellPoint {
  return {
    x: (clientX - rect.left) / (rect.width || 1) * grid.cols - .5,
    y: (clientY - rect.top) / (rect.height || 1) * grid.rows - .5,
  }
}

const isRound = (c: Control) => c.kind === 'knob' || c.kind === 'crank'
/** Is (x, y) on the control? Box hit, knobs and cranks use the box's inscribed circle; `pad` grows both. */
export function hitControl(c: Control, x: number, y: number, pad = 0): boolean {
  const [col, row, w, h] = c.box
  if (isRound(c)) return Math.hypot(x - (col + w / 2), y - (row + h / 2)) <= Math.min(w, h) / 2 + pad
  return x >= col - pad && x <= col + w + pad && y >= row - pad && y <= row + h + pad
}

/** The control under (x, y), or null. Exact hits win over padded ones; later controls sit on top. */
export function pick(controls: readonly Control[] | undefined, x: number, y: number, pad = HIT_PAD): string | null {
  if (!controls) return null
  for (let i = controls.length - 1; i >= 0; i--) if (hitControl(controls[i], x, y)) return controls[i].key
  if (pad > 0) for (let i = controls.length - 1; i >= 0; i--) if (hitControl(controls[i], x, y, pad)) return controls[i].key
  return null
}

export interface ControlRange {
  min: number; max: number
  /** Detent size; 0 = continuous. */
  step: number
  /** Keyboard step (arrows): `step`, else 1/100 of the range (cranks: 1/24 turn). */
  keyStep: number
}
/**
 * Effective range of a control. Defaults: 0..1 continuous; `segmented` 0..options-1 in steps of 1;
 * `stepper` steps of 1/10 of its range; `crank` is unbounded unless `min` / `max` are given.
 */
export function controlRange(c: Control): ControlRange {
  if (c.kind === 'segmented') return { min: 0, max: Math.max(0, (c.options ?? 2) - 1), step: 1, keyStep: 1 }
  const crank = c.kind === 'crank'
  const min = c.min ?? (crank ? -Infinity : 0), max = c.max ?? (crank ? Infinity : 1)
  const finite = Number.isFinite(min) && Number.isFinite(max)
  const step = c.step ?? (c.kind === 'stepper' ? (finite ? (max - min) / 10 : 1) : 0)
  const keyStep = step || (crank ? (c.perTurn ?? 1) / 24 : finite ? (max - min) / 100 : 1)
  return { min, max, step, keyStep }
}

const tidy = (v: number) => Math.round(v * 1e9) / 1e9
/** Quantize to `step` (from `min`, or 0 when unbounded), then clamp, or wrap for `wrap` cranks. */
export function settle(c: Control, v: number): number {
  const { min, max, step } = controlRange(c)
  if (step > 0) { const base = Number.isFinite(min) ? min : 0; v = base + Math.round((v - base) / step) * step }
  if (c.wrap && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    const span = max - min
    v = min + (((v - min) % span) + span) % span
    return tidy(v)
  }
  return tidy(clamp(v, min, max))
}

/** Drag bookkeeping from press to release (`beginDrag`); cranks update `angle` / `raw` in place. */
export interface DragStart {
  /** Pointer at press, card cells. */
  x: number; y: number
  /** `data[key]` (and `data[keyY]` for xy) at press. */
  value: number; valueY: number
  /** Crank: pointer angle at the last move (radians, screen space: clockwise is positive). */
  angle: number
  /** Crank: running, unquantized value (clamped, so reversing at a stop responds at once). */
  raw: number
}

/** Data key of the vertical axis of an `xy` control. */
export const keyYOf = (c: Control) => c.keyY ?? `${c.key}Y`
const centre = (c: Control): CellPoint => ({ x: c.box[0] + c.box[2] / 2, y: c.box[1] + c.box[3] / 2 })
const read = (c: Control, data: Record<string, number>, key: string) => {
  const v = data[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const { min } = controlRange(c)
  return Number.isFinite(min) ? min : 0
}

/** Start a drag (press) at (x, y) with the current data. */
export function beginDrag(c: Control, x: number, y: number, data: Record<string, number>): DragStart {
  const value = read(c, data, c.key), m = centre(c)
  return { x, y, value, valueY: c.kind === 'xy' ? read(c, data, keyYOf(c)) : 0, angle: Math.atan2(y - m.y, x - m.x), raw: value }
}

/**
 * New value(s) for a pointer at `pointer` during the drag that began at `start`:
 * - slider: position along its axis (a tap jumps there); vertical sliders grow upwards;
 * - knob: drag delta, right / up increases, the full range over twice the knob's size;
 * - crank: atan2 accumulation, `perTurn` (default 1) per clockwise revolution, unbounded unless
 *   min / max are set (`wrap` wraps instead of clamping);
 * - xy: both axes (`key` left→right, `keyY` bottom→top);
 * - stepper: tap zones, the left (or bottom) half steps down, the other half steps up;
 * - segmented: the option under the pointer;
 * - toggle: flips the value it had at press; button: `max` while held (see `releaseValue`).
 * Every value is quantized to `step` and clamped to [min, max].
 */
export function dragValue(c: Control, start: DragStart, pointer: CellPoint): ControlPatch {
  const { min, max, step } = controlRange(c), [col, row, w, h] = c.box
  const span = Number.isFinite(max - min) ? max - min : 1
  const vertical = c.orientation === 'vertical'
  switch (c.kind) {
    case 'slider': {
      const f = vertical ? (row + h - pointer.y) / (h || 1) : (pointer.x - col) / (w || 1)
      return { [c.key]: settle(c, min + clamp(f) * span) }
    }
    case 'knob': {
      if (c.dial) {
        const m = centre(c), dx = pointer.x - m.x, dy = pointer.y - m.y
        // at the axle the angle is meaningless: keep the value
        if (Math.hypot(dx, dy) < Math.min(w, h) * .06) return { [c.key]: settle(c, start.value) }
        const sweep = Math.max(1e-9, Math.min(TAU, c.dial.sweep)), rel = (((Math.atan2(dx, -dy) - c.dial.start) % TAU) + TAU) % TAU
        const f = rel <= sweep ? rel / sweep : rel - sweep < TAU - rel ? 1 : 0
        return { [c.key]: settle(c, min + f * span) }
      }
      const travel = (pointer.x - start.x) - (pointer.y - start.y)
      return { [c.key]: settle(c, start.value + travel / (2 * Math.max(w, h, 1)) * span) }
    }
    case 'crank': {
      const m = centre(c), a = Math.atan2(pointer.y - m.y, pointer.x - m.x)
      // ignore the jitter right at the axle, where the angle is meaningless
      if (Math.hypot(pointer.x - m.x, pointer.y - m.y) < Math.min(w, h) * .06) return { [c.key]: settle(c, start.raw) }
      let d = a - start.angle
      if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU
      start.angle = a
      start.raw += d / TAU * (c.perTurn ?? 1)
      if (!c.wrap) start.raw = clamp(start.raw, min, max)
      return { [c.key]: settle(c, start.raw) }
    }
    case 'xy': {
      const fx = clamp((pointer.x - col) / (w || 1)), fy = clamp((row + h - pointer.y) / (h || 1))
      return { [c.key]: settle(c, min + fx * span), [keyYOf(c)]: settle(c, min + fy * span) }
    }
    case 'stepper': {
      const up = vertical ? start.y < row + h / 2 : start.x >= col + w / 2
      return { [c.key]: settle(c, start.value + (up ? 1 : -1) * (step || span / 10)) }
    }
    case 'segmented': {
      const n = Math.max(1, c.options ?? 2), f = vertical ? (pointer.y - row) / (h || 1) : (pointer.x - col) / (w || 1)
      return { [c.key]: clamp(Math.floor(clamp(f) * n), 0, n - 1) }
    }
    case 'toggle': return { [c.key]: start.value >= (min + max) / 2 ? min : max }
    case 'button': return { [c.key]: max }
  }
}

/** Value after the pointer is released: buttons spring back to `min`; everything else keeps its value (null). */
export function releaseValue(c: Control): ControlPatch | null {
  return c.kind === 'button' ? { [c.key]: controlRange(c).min } : null
}

/**
 * New value for a key press on a focused control, or null when the key does nothing (so the
 * caller can let it through, e.g. to move focus). `value` is the current value (for an `xy`
 * pad, of the axis being edited: both axes share one range).
 * - ranges (slider, knob, crank, stepper, xy): arrows ±keyStep (right / up increase),
 *   PageUp / PageDown ±10 % of the range (10 key steps when unbounded), Home / End → min / max;
 * - segmented: arrows move to the previous / next option (wrapping), Home / End first / last;
 * - toggle: Space / Enter flip; button: Space / Enter → max (the caller releases it).
 */
export function keyValue(c: Control, value: number, key: string): number | null {
  const { min, max, keyStep } = controlRange(c)
  if (c.kind === 'toggle') return key === ' ' || key === 'Enter' ? (value >= (min + max) / 2 ? min : max) : null
  if (c.kind === 'button') return key === ' ' || key === 'Enter' ? max : null
  if (c.kind === 'segmented') {
    const n = max + 1, i = Math.round(clamp(value, min, max))
    if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % n
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + n) % n
    if (key === 'Home') return 0
    if (key === 'End') return max
    return null
  }
  const finite = Number.isFinite(max - min)
  const page = finite ? Math.max(keyStep, (max - min) / 10) : keyStep * 10
  let next: number
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': next = value + keyStep; break
    case 'ArrowLeft': case 'ArrowDown': next = value - keyStep; break
    case 'PageUp': next = value + page; break
    case 'PageDown': next = value - page; break
    case 'Home': if (!Number.isFinite(min)) return null; next = min; break
    case 'End': if (!Number.isFinite(max)) return null; next = max; break
    default: return null
  }
  return settle(c, next)
}
