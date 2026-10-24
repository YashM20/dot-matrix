/**
 * Physics worlds: a fixed-dt simulation that is a pure function of t until someone touches it.
 *
 * A world has two runs over the same flat `Float32Array` state (everything persistent lives in it; solvers
 * keep only scratch outside, so a replay from a checkpoint is exact):
 * - **pristine**: no input, a `SimField` (`src/engine/sim`) with checkpoints and a `lead` / `period` loop, so
 *   goldens, films and t = 3600 s cost and look the same. An optional `seam` pulls the last seconds of the loop
 *   onto the loop start, so the wrap is invisible even for chaotic states (fluids, cloth).
 * - **live**: the first frame with input (a pointer that moves or is down, tilted gravity, a kick) copies the
 *   pristine state and steps it forward with the input, at the same fixed dt. A slow frame never takes a bigger
 *   step: at most `maxLiveSteps` per frame, the rest of the time is dropped. Autopilot schedules keep reading
 *   the loop-folded step, so a live world keeps its rhythm. After `idle` seconds without input it `heal`s: each
 *   step blends onto the pristine state at the same step, and once there the world is pristine again.
 *   Time going backwards (remount, scrub) or a non-finite value drops back to pristine at once.
 *
 * Input is handed over per frame in the world's own units (the card maps card cells to world units); the runner
 * interpolates each pointer across the steps of a frame and derives its velocity from the motion, so strokes
 * are smooth at 12 fps and a still mouse has zero velocity. Framework-free; no allocation per step.
 *
 * GPU note: a world only sees `step(state, n, input)`. A GPU backend can keep the state in buffers and read it
 * back for checkpoints; the runner's contract (fixed dt, folded n, blend) does not change.
 */
import { createSim, simAtStep, simLoop, simStep, simView, type Sim } from '../sim'

/** A pointer as the step sees it: position and velocity in world units (per second). */
export interface StepPointer {
  id: number
  x: number; y: number
  vx: number; vy: number
  down: boolean
  /** Went down on this step / came up on this step. */
  pressed: boolean; released: boolean
}
export interface StepInput {
  pointers: StepPointer[]
  /** Gravity direction × strength in g (default [0, 1] = down, 1 g). */
  gx: number; gy: number
  /** A one-shot impulse (keyboard / button), true on the first step after it was triggered. */
  kick: boolean
  /** Live steps since the world was touched (0 on the first live step; -1 in the pristine run). */
  live: number
  /** Seconds since the last frame with input (Infinity in the pristine run): autopilots wait while a hand is busy. */
  quiet: number
}
/** One frame of input, in world units. Pointers that are absent are treated as gone. */
export interface FrameInput {
  pointers?: { id: number; x: number; y: number; down: boolean }[]
  gx?: number; gy?: number
  kick?: boolean
}

export interface WorldSpec {
  /** Floats of state. */
  size: number
  /** Fixed step, seconds. */
  dt: number
  /** Fill the seeded initial state (a zeroed array is passed in). */
  init: (state: Float32Array) => void
  /**
   * Advance one step in place. `n` is the loop-folded step index (schedules read it); `input` is the
   * pristine default (no pointers, default gravity) in the pristine run.
   */
  step: (state: Float32Array, n: number, input: StepInput) => void
  /** Blend `a` toward `b` by `k` in place (default: lerp every float). Keep discrete parts (indices, modes) out of it. */
  blend?: (a: Float32Array, b: Float32Array, k: number) => void
  lead?: number
  period?: number
  every?: number
  maxSteps?: number
  maxCheckpoints?: number
  /** Seconds at the end of the loop pulled onto the loop start (default 0: a hard wrap). */
  seam?: number
  /** Default gravity in the pristine run (default [0, 1]). */
  gravity?: [number, number]
  /** Seconds without input before a live world heals back (default 3; Infinity = stays live). */
  idle?: number
  /** Seconds the heal takes (default 1.5). */
  heal?: number
  /** Most steps one live frame takes (default 8). */
  maxLiveSteps?: number
}

export type WorldMode = 'pristine' | 'live' | 'heal'
export interface World {
  readonly spec: WorldSpec
  readonly sim: Sim
  mode: WorldMode
  /** The live state (valid while mode ≠ pristine). */
  live: Float32Array
  /** Loop-folded step of the live state, and the board time it stands for. */
  liveN: number; liveT: number
  /** Board time of the last frame with input. */
  lastInput: number
  /** Heal steps still to go. */
  healLeft: number
  /** Live steps since touched (cost accounting, `StepInput.live`). */
  liveSteps: number
  /** Total live steps dropped because frames were too slow (never a bigger dt). */
  dropped: number
  /** Times the world fell back to pristine because a value went non-finite. */
  resets: number
  /** Last frame's pointers (for interpolation and edges) and kick state. */
  prev: Map<number, { x: number; y: number; down: boolean }>
  prevKick: boolean
  /** Reused per-step pointer records. */
  pool: StepPointer[]
  input: StepInput
}

const lerpAll = (a: Float32Array, b: Float32Array, k: number) => { for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * k }
const finite = (s: Float32Array) => { for (let i = 0; i < s.length; i++) if (s[i] - s[i] !== 0) return false; return true }

export function createWorld(spec: WorldSpec): World {
  const blend = spec.blend ?? lerpAll, [gx, gy] = spec.gravity ?? [0, 1]
  const pristineInput: StepInput = { pointers: [], gx, gy, kick: false, live: -1, quiet: Infinity }
  let sim: Sim
  const seamSteps = Math.max(0, Math.round((spec.seam ?? 0) / spec.dt))
  sim = createSim({
    w: spec.size, h: 1, dt: spec.dt, every: spec.every ?? 30, lead: spec.lead, period: spec.period,
    maxSteps: spec.maxSteps ?? 2400, maxCheckpoints: spec.maxCheckpoints ?? 48,
    init: g => spec.init(g),
    step: (src, dst, _w, _h, n) => {
      dst.set(src)
      spec.step(dst, n, pristineInput)
      if (!seamSteps) return
      // the loop's last `seam` steps close the remaining gap to the loop start linearly (1/(rem+1) per step)
      const [start, len] = simLoop(sim)
      if (len === Infinity) return
      const rem = start + len - (n + 1)
      if (rem < 1 || rem > seamSteps) return
      const s0 = sim.checkpoints.get(start)
      if (s0) blend(dst, s0, 1 / (rem + 1))
    },
  })
  return {
    spec, sim, mode: 'pristine', live: new Float32Array(spec.size), liveN: 0, liveT: 0, lastInput: -Infinity, healLeft: 0,
    liveSteps: 0, dropped: 0, resets: 0, prev: new Map(), prevKick: false, pool: [],
    input: { pointers: [], gx, gy, kick: false, live: 0, quiet: 0 },
  }
}

/** Loop-folded step index (identity for an unlooped world). */
export function worldFold(w: World, n: number): number {
  const [start, len] = simLoop(w.sim)
  return len === Infinity || n < start ? n : start + (((n - start) % len) + len) % len
}

/** Back to the pristine run (drops the live state). */
export function worldReset(w: World): void {
  w.mode = 'pristine'; w.healLeft = 0; w.liveSteps = 0; w.prev.clear(); w.prevKick = false; w.lastInput = -Infinity
}

/** Does this frame carry input that changes the world? (A still pointer that is not down does not.) */
function engaged(w: World, f: FrameInput | undefined): boolean {
  if (!f) return false
  const [gx, gy] = w.spec.gravity ?? [0, 1]
  if (f.gx !== undefined && Math.abs(f.gx - gx) > .02) return true
  if (f.gy !== undefined && Math.abs(f.gy - gy) > .02) return true
  if (f.kick && !w.prevKick) return true
  for (const p of f.pointers ?? []) {
    if (p.down) return true
    const q = w.prev.get(p.id)
    if (q && (Math.abs(p.x - q.x) > 1e-3 || Math.abs(p.y - q.y) > 1e-3)) return true
  }
  return false
}
function remember(w: World, f: FrameInput | undefined) {
  w.prev.clear()
  for (const p of f?.pointers ?? []) w.prev.set(p.id, { x: p.x, y: p.y, down: p.down })
  w.prevKick = !!f?.kick
}

/**
 * The world's state at board time `t` with this frame's input. The array is owned by the world: read it
 * this frame, do not keep it. With no input ever, this is `simView` of the pristine run (pure in t).
 */
export function worldAt(w: World, t: number, frame?: FrameInput): Float32Array {
  const touch = engaged(w, frame)
  if (w.mode === 'pristine') {
    if (!touch) { remember(w, frame); return simView(w.sim, t) }
    w.live.set(simAtStep(w.sim, simStep(w.sim, t)))
    w.liveN = simStep(w.sim, t); w.liveT = t; w.mode = 'live'; w.liveSteps = 0
    // the touching frame's pointers become the interpolation start, so the first step sees their motion
  }
  if (t < w.liveT - .25 || !Number.isFinite(t)) { worldReset(w); return simView(w.sim, t) }
  const { dt } = w.spec, maxLive = w.spec.maxLiveSteps ?? 8
  let steps = Math.floor((t - w.liveT) / dt + 1e-9)
  if (steps > maxLive) { w.dropped += steps - maxLive; w.liveT = t - maxLive * dt; steps = maxLive }
  if (touch) { w.lastInput = t; if (w.mode === 'heal') { w.mode = 'live'; w.healLeft = 0 } }
  if (steps > 0) {
    const input = w.input, ps = frame?.pointers ?? [], span = steps * dt
    input.gx = frame?.gx ?? (w.spec.gravity ?? [0, 1])[0]; input.gy = frame?.gy ?? (w.spec.gravity ?? [0, 1])[1]
    input.pointers.length = 0
    for (let k = 0; k < ps.length; k++) input.pointers.push(w.pool[k] ??= { id: 0, x: 0, y: 0, vx: 0, vy: 0, down: false, pressed: false, released: false })
    for (let s = 0; s < steps; s++) {
      const a = (s + 1) / steps
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k], q = w.prev.get(p.id) ?? p, r = input.pointers[k]
        r.id = p.id; r.x = q.x + (p.x - q.x) * a; r.y = q.y + (p.y - q.y) * a
        r.vx = (p.x - q.x) / span; r.vy = (p.y - q.y) / span; r.down = p.down
        r.pressed = s === 0 && p.down && !(w.prev.get(p.id)?.down ?? false)
        r.released = s === 0 && !p.down && (w.prev.get(p.id)?.down ?? false)
      }
      input.kick = s === 0 && !!frame?.kick && !w.prevKick
      input.live = w.liveSteps++; input.quiet = Math.max(0, t - w.lastInput - (steps - 1 - s) * dt)
      w.spec.step(w.live, w.liveN, input)
      w.liveN = worldFold(w, w.liveN + 1)
      if (w.mode === 'heal') {
        const target = simAtStep(w.sim, w.liveN);
        (w.spec.blend ?? lerpAll)(w.live, target, 1 / Math.max(1, w.healLeft))
        if (--w.healLeft <= 0) { worldReset(w); return simView(w.sim, t) }
      }
    }
    w.liveT += steps * dt
    remember(w, frame)
  } else if (touch) {
    // same quantized t (a pointer event between ticks): keep the old pointer as the interpolation start
    for (const p of frame?.pointers ?? []) if (!w.prev.has(p.id)) w.prev.set(p.id, { x: p.x, y: p.y, down: false })
  }
  if (!finite(w.live)) { w.resets++; worldReset(w); return simView(w.sim, t) }
  const idle = w.spec.idle ?? 3
  if (w.mode === 'live' && t - w.lastInput > idle) { w.mode = 'heal'; w.healLeft = Math.max(1, Math.round((w.spec.heal ?? 1.5) / dt)) }
  return w.live
}

/** The loop-folded step the last `worldAt(w, t)` showed (schedules drawn outside the state, e.g. a falling drop). */
export const worldStep = (w: World, t: number): number => (w.mode === 'pristine' ? simStep(w.sim, t) : w.liveN)

/** Numeric id for a pointer; the camera hand (`'hand'`) gets a fixed id that touch/mouse ids never use. */
export const pointerNum = (id: number | 'hand'): number => (id === 'hand' ? -1 : id)

/** Pointer records from a frame context (released touches dropped), mapped into world units. */
export function framePointers(pointers: readonly { id: number | 'hand'; x: number; y: number; down: boolean; up?: boolean }[] | undefined, map: (x: number, y: number) => [number, number]): FrameInput['pointers'] {
  if (!pointers?.length) return undefined
  const out: NonNullable<FrameInput['pointers']> = []
  for (const p of pointers) { if (p.up) continue; const [x, y] = map(p.x, p.y); out.push({ id: pointerNum(p.id), x, y, down: p.down }) }
  return out
}
