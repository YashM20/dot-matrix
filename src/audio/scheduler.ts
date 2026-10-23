/**
 * Lookahead step scheduler (Chris Wilson, "A Tale of Two Clocks"): a coarse timer wakes every
 * `interval` s and schedules every sixteenth that falls inside the next `ahead` s on the precise
 * audio clock. Tempo comes from `bpm()` at each step, so a tempo change lands on the next step.
 * Framework-free and clock-injected (`now()` = AudioContext.currentTime in the app, a fake in tests).
 */
export interface StepEvent { step: number; time: number; dur: number }
export interface SchedulerOptions {
  now: () => number
  bpm: () => number
  /** Schedule one sixteenth: `step` counts from 0 since start, `time` is on the audio clock. */
  onStep: (e: StepEvent) => void
  /** Seconds scheduled ahead of `now` (default .1). */
  ahead?: number
  /** Wake-up period in s (default .025). */
  interval?: number
  /** Timer factory (default: a Blob worker, so background tabs keep time; else setInterval). */
  timer?: (cb: () => void, ms: number) => () => void
}

export const sixteenth = (bpm: number) => 15 / Math.max(1, bpm)

/** A worker-driven ticker: background tabs throttle setInterval to 1 Hz, workers are not throttled. */
export function workerTimer(cb: () => void, ms: number): () => void {
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    try {
      const url = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${ms})`], { type: 'text/javascript' }))
      const w = new Worker(url)
      w.onmessage = cb
      return () => { w.terminate(); URL.revokeObjectURL(url) }
    } catch { /* CSP or no blob workers: fall through */ }
  }
  const h = setInterval(cb, ms)
  return () => clearInterval(h)
}

export class Scheduler {
  private o: Required<Omit<SchedulerOptions, 'timer'>> & Pick<SchedulerOptions, 'timer'>
  private nextTime = 0
  private step = 0
  private off: (() => void) | null = null
  /** Recently scheduled steps (for the visual playhead), oldest first, trimmed to ~2 s. */
  readonly queue: StepEvent[] = []

  constructor(o: SchedulerOptions) { this.o = { ahead: .1, interval: .025, ...o } }

  get running() { return this.off !== null }

  /** Start at audio time `at` (default: a hair after now) with step 0. */
  start(at = this.o.now() + .05) {
    this.stop()
    this.nextTime = at; this.step = 0; this.queue.length = 0
    this.tick()
    this.off = (this.o.timer ?? workerTimer)(() => this.tick(), this.o.interval * 1000)
  }

  stop() { this.off?.(); this.off = null }

  /** Schedule everything due inside the lookahead window. Public so tests can drive it. */
  tick() {
    const horizon = this.o.now() + this.o.ahead
    while (this.nextTime < horizon) {
      const dur = sixteenth(this.o.bpm()), e = { step: this.step, time: this.nextTime, dur }
      this.o.onStep(e)
      this.queue.push(e)
      this.nextTime += dur; this.step++
    }
    const old = this.o.now() - 2
    while (this.queue.length > 2 && this.queue[1].time < old) this.queue.shift()
  }

  /** Playhead in steps (fractional) for audio time `t` (pass `now − latency` for what is heard). */
  position(t: number): number {
    const q = this.queue
    for (let i = q.length - 1; i >= 0; i--) if (q[i].time <= t) return q[i].step + Math.min(1, (t - q[i].time) / q[i].dur)
    return 0
  }
}
