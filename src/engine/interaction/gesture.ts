/**
 * Touch gesture policy (docs/UX-PLAN.md › Touch policy): scroll first. A touch on a card is only a
 * *candidate* until it proves it is meant for the card: a still tap, a horizontal drag on a drag
 * control, or a press-and-hold. A vertical swipe is left to the page. Pure functions in CSS px and
 * ms, framework-free; the app (`useControlInput`) owns the events, timers and pointer capture.
 */
import type { Control } from '../context'

/** Thresholds of the policy. */
export const TOUCH = {
  /** Movement (CSS px) a finger may make and still be a tap / a hold. */
  slop: 10,
  /** A tap control shows its press (and a button goes down) after this still time (ms), the native press delay. */
  pressDelay: 110,
  /** Holding a drag control still this long (ms) grabs it: any direction, and the card stays engaged. */
  hold: 300,
  /** A tap on a toggle / option / stepper / drag control must lift within this time (ms); buttons have no limit. */
  tapMs: 700,
  /** How long a lifted tap keeps its control pressed (ms), so the press reads. */
  tapPress: 90,
  /** An engaged card lets go after this long without a touch (ms). */
  idle: 8000,
  /** Horizontal motion must beat vertical by this ratio to claim a drag (else it is a scroll). */
  axisRatio: 1.2,
} as const

/**
 * What a touch on a control means:
 * - `tap`: button, toggle, segmented, stepper. Acts on lift (buttons press after `pressDelay`); any move is a scroll.
 * - `drag`: slider, knob, crank, xy, and controls flagged `gesture: 'surface'` (a whole card you push around).
 *   A horizontal drag claims it at once, a hold claims it in any direction, a still tap sets it.
 */
export type TouchIntent = 'tap' | 'drag'
export function touchIntent(c: Control): TouchIntent {
  if (c.gesture === 'surface') return 'drag'
  return c.kind === 'button' || c.kind === 'toggle' || c.kind === 'segmented' || c.kind === 'stepper' ? 'tap' : 'drag'
}

/** Does using this control on touch need a vertical drag, i.e. a hold first? (Horizontal sliders and knobs don't.) */
export function needsHold(c: Control): boolean {
  if (touchIntent(c) !== 'drag') return false
  return c.gesture === 'surface' || c.kind === 'xy' || c.kind === 'crank' || (c.kind === 'slider' && c.orientation === 'vertical')
}

/**
 * A candidate touch moved by (dx, dy) CSS px from where it landed: still `pending`, `claim` it for the
 * card (a horizontal drag on a drag control), or `scroll` (it is the page's: drop it).
 */
export function classifyMove(intent: TouchIntent | 'none', dx: number, dy: number): 'pending' | 'claim' | 'scroll' {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (Math.hypot(ax, ay) <= TOUCH.slop) return 'pending'
  if (intent === 'drag' && ax > TOUCH.slop && ax >= ay * TOUCH.axisRatio) return 'claim'
  return 'scroll'
}

/** A candidate touch lifted after `ms` with a total travel of `dist` CSS px: is it a real tap? */
export function isTap(c: Control | undefined, dist: number, ms: number): boolean {
  if (dist > TOUCH.slop) return false
  return c?.kind === 'button' || ms <= TOUCH.tapMs
}
