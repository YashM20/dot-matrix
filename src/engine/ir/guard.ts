/**
 * Runtime guard for untrusted Field IR: programs a visitor typed or opened from a link. The static cost cap
 * (`IR_LIMITS.cost`) bounds one dot; this bounds a frame. Guarded fields share a time budget per frame, and the
 * program whose field runs past it is paused: from then on its fields read 0 at no cost, until its key changes
 * (new source, lattice or grid) or it is resumed. The rest of that frame reads 0 too, so one frame costs at
 * most the budget plus one clock interval. Registered card presets are trusted and never go through here.
 *
 *   const g = irGuard()
 *   g.begin()                                  // a frame starts (the clock starts at the first guarded dot)
 *   layer.field = g.field(key, program.info.cost, program(env))
 *   … sample …
 *   g.settle()                                 // programs that ran in budget are 'ok' from now on
 */
import type { Field } from '../types'

/** Time budget per frame for user programs, ms. A frame of a legal program that needs more is paused. */
export const IR_FRAME_MS = 50
/** Steps (`IR_COST`) between clock reads: the clock is read about once per this many steps, at least once per dot. */
export const IR_CHECK_STEPS = 4096

/** `new`: not drawn yet; `ok`: drew a frame within budget; `paused`: ran out of time and is held. */
export type GuardState = 'new' | 'ok' | 'paused'
export interface IRGuard {
  readonly ms: number
  /** A frame starts: settle the last one and reset the clock (it starts at the frame's first guarded dot). */
  begin(): void
  /** The frame is done: programs that ran in it and did not run out of time become `ok`. */
  settle(): void
  /** A field of program `key` (static cost `cost` steps per dot) that counts against this frame's budget. */
  field(key: string, cost: number, f: Field): Field
  state(key: string): GuardState
  /** Clear a pause, so the program gets another try. */
  resume(key: string): void
  /**
   * A frame of program `key` ran somewhere else (the sandbox worker, `sandbox/remote.ts`): `ok` marks a new program
   * drawn, `paused` holds it like a frame that ran out of time here. Watchers hear it only when the state changes.
   */
  report(key: string, state: 'ok' | 'paused'): void
  /** Called (after the frame, not inside it) when a program becomes `ok` or `paused`. Returns an unsubscribe. */
  watch(fn: (key: string, state: GuardState) => void): () => void
}

export function irGuard(ms = IR_FRAME_MS, now: () => number = () => performance.now()): IRGuard {
  const states = new Map<string, GuardState>(), ran = new Set<string>(), fns = new Set<(key: string, state: GuardState) => void>()
  let deadline = 0, started = false, tripped = false, frame = 0
  const emit = (key: string, s: GuardState) => {
    states.set(key, s)
    const tell = () => { for (const fn of fns) fn(key, s) }
    if (typeof queueMicrotask === 'function') queueMicrotask(tell); else tell()
  }
  const settle = () => {
    if (!tripped) for (const key of ran) if (!states.has(key)) emit(key, 'ok')
    ran.clear(); started = false; tripped = false; frame++
  }
  return {
    ms,
    begin: settle,
    settle,
    field(key, cost, f) {
      const every = Math.max(1, Math.floor(IR_CHECK_STEPS / Math.max(1, cost)))
      let n = 0, seen = -1
      const g: Field = (u, v, du, dv) => {
        if (tripped || states.get(key) === 'paused') return 0
        if (seen !== frame) { seen = frame; ran.add(key) }
        if (!started) { started = true; deadline = now() + ms }
        else if (++n >= every) {
          n = 0
          if (now() > deadline) { tripped = true; emit(key, 'paused'); return 0 }
        }
        return f(u, v, du, dv)
      }
      // keep the metadata (bounds, footprint, the IR source tag for spec export)
      return Object.assign(g, f)
    },
    state: key => states.get(key) ?? 'new',
    resume: key => { if (states.get(key) === 'paused') states.delete(key) },
    report(key, s) { if (s === 'paused' ? states.get(key) !== 'paused' : !states.has(key)) emit(key, s) },
    watch: fn => { fns.add(fn); return () => { fns.delete(fn) } },
  }
}
