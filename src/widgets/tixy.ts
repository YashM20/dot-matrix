/**
 * `tixy(program)`: a typed `(t, i, x, y) => number | boolean` program drawn as card layers on a 16×16 lattice
 * (issue #53). x and y run 0..15, i = y * 16 + x, t is the card clock in seconds. The value is coerced like
 * tixy (true → 1, false / NaN → 0) and clamped to [-1, 1]; max(v, 0) draws in the default tone and max(-v, 0)
 * in the accent tone, both quantized to `{grid.quantizeSteps}`. Programs are compiled TS functions: nothing
 * here evaluates a string, and the site CSP has no unsafe-eval.
 *
 * A stateful program gets a per-card `state` (a Float32Array, one float per lattice cell unless `channels` says
 * more) stepped at a fixed `dt` by the engine's SimField (`src/engine/sim`), like the pond's World: the state at t
 * is a pure function of (init, step index), so goldens start from the known step-0 state and any t replays.
 *
 * Not in the engine barrel: import it by path. Checks: `npx tsx scripts/tixy.ts`.
 */
import type { GridConfig, Layer } from '../engine/types'
import { quantize } from '../engine/sampler/quantize'
import { createSim, simView, type Sim } from '../engine/sim/sim'
import { TILE, type WidgetContext } from './types'

/** Lattice side: 16 × 16 dots. */
export const TIXY_N = 16
export type TixyValue = number | boolean
/** A tixy program. `s` is the card's state at time t (stateful programs only). */
export type TixyProgram = (t: number, i: number, x: number, y: number, s: Float32Array) => TixyValue

/** Per-card state for a stateful program, stepped at a fixed `dt` (see `SimSpec` in src/engine/sim). */
export interface TixyState {
  /** Fixed step, seconds. */
  dt: number
  /** Floats per lattice cell (default 1). */
  channels?: number
  /** Fill the known initial state (a zeroed array of 256 × channels floats). */
  init?: (s: Float32Array) => void
  /** One step: read `src`, write every float of `dst`; `n` is the index of the step being taken. */
  step: (src: Float32Array, dst: Float32Array, n: number) => void
  /** Loop length in seconds (the state resets each period); default no loop. */
  period?: number
}

export interface TixyOptions {
  /** Card grid the lattice sits on (default TILE). */
  grid?: GridConfig
  /** Card cells per lattice dot (default 8: 128 cells on a TILE card). */
  pitch?: number
  /** Top-left card cell of the lattice (default: centred below the 10-row TILE label). */
  origin?: [number, number]
  /** Quantization steps for the dot values (default 5, `{grid.quantizeSteps}`). */
  steps?: number
  state?: TixyState
}

/** Tixy coercion: true → 1, false / NaN / non-numbers → 0, then clamped to [-1, 1]. */
export function tixyValue(v: TixyValue): number {
  const x = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : 0
  return x !== x ? 0 : x > 1 ? 1 : x < -1 ? -1 : x
}

const NONE = new Float32Array(0)
/** All 256 coerced values of `program` at time `t`, in index order (out[i], i = y * 16 + x). */
export function tixyFrame(program: TixyProgram, t: number, out = new Float32Array(TIXY_N * TIXY_N), state: Float32Array = NONE): Float32Array {
  for (let y = 0, i = 0; y < TIXY_N; y++) for (let x = 0; x < TIXY_N; x++, i++) out[i] = tixyValue(program(t, i, x, y, state))
  return out
}

/** The card's state sim for a `TixyState` (one per `tixy()` call, so one per card). */
function stateSim(s: TixyState): Sim {
  return createSim({
    w: TIXY_N, h: TIXY_N, channels: s.channels ?? 1, dt: s.dt, period: s.period,
    init: g => s.init?.(g), step: (src, dst, _w, _h, n) => s.step(src, dst, n),
  })
}

/**
 * The card layers of a tixy program: `tixy(program)(ctx)` → [positive layer (default tone), negative layer
 * (accent)]. Each call evaluates the program once per lattice cell; both layers read that one frame.
 */
export function tixy(program: TixyProgram, opts: TixyOptions = {}): (ctx: WidgetContext) => Layer[] {
  const { grid = TILE, pitch = 8, steps = 5 } = opts
  const span = TIXY_N * pitch
  const origin: [number, number] = opts.origin ?? [Math.floor((grid.cols - span) / 2), 10 + Math.max(0, Math.floor((grid.rows - 10 - span) / 2))]
  const sub = { cols: Math.max(1, Math.floor((grid.cols - origin[0]) / pitch)), rows: Math.max(1, Math.floor((grid.rows - origin[1]) / pitch)) }
  const sim = opts.state ? stateSim(opts.state) : undefined
  return ctx => {
    // a fresh frame per call: layers kept from an earlier call (thumbnails, exports) still read their own t
    const frame = tixyFrame(program, ctx.t, undefined, sim ? simView(sim, ctx.t) : NONE)
    /** The lattice cell's value for u/v over the lattice sub-grid, 0 outside the 16 × 16 square. */
    const cellOf = (u: number, v: number) => {
      const x = Math.round(u * (sub.cols - 1)), y = Math.round(v * (sub.rows - 1))
      return x < 0 || y < 0 || x >= TIXY_N || y >= TIXY_N ? 0 : frame[y * TIXY_N + x]
    }
    return [
      { field: (u, v) => quantize(Math.max(cellOf(u, v), 0), steps), tone: 'value', lattice: pitch, origin },
      { field: (u, v) => quantize(Math.max(-cellOf(u, v), 0), steps), tone: 'active', lattice: pitch, origin },
    ]
  }
}
