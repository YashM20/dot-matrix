/**
 * Master clock: one requestAnimationFrame loop shared by every animated card, instead of one
 * loop (and one React state update) per card.
 *
 * - Time only advances while the clock has active subscribers and the page is visible, and it
 *   never resets — a card scrolled back into view continues where the board is, so cards stay
 *   phase-synced.
 * - Each subscriber runs at its own frame rate: it is called only when `floor(T · fps)` changes,
 *   with `t = frame / fps`, so a 12 fps card sees exactly the same `t` values in the app, in
 *   `pnpm snap` and in tests.
 * - `invalidate(sub)` forces a draw on the next animation frame regardless of the subscriber's
 *   fps (input feedback must not wait for the next 12 fps tick).
 *
 * - Turn-taking (`STAGGER`): while more than STAGGER.min board cards run at ≥ STAGGER.fps, they take turns. By board
 *   order they split into two interleaved groups, and a card in group g draws only on frames where
 *   (frame + g) is even (or when it has missed one), so it redraws at half its rate and a frame redraws half
 *   the cards. Each draw still uses the current `t`, so any one frame shows what the card shows at that
 *   moment. A card opts in with `order` and can opt out frame by frame with `staggerable()` (the visitor is
 *   using it). An invalidated subscriber always draws.
 *
 * Framework-free: works with any `requestAnimationFrame`-like scheduler and time source.
 */
export interface ClockSubscriber {
  fps: number
  /** Called with card-quantized time; `frame` is that subscriber's frame index. */
  onFrame(t: number, frame: number): void
  /** The card's position on its board: it may take turns with the other board cards (see `STAGGER`). */
  order?: number
  /** False while the card must draw every frame (the visitor is using it). Read each animation frame. */
  staggerable?(): boolean
}
/**
 * Turn-taking: kicks in above `min` eligible board cards (so a small board never staggers), and only for cards of at
 * least `fps` (a 30 fps card drops to 15, a 12 fps card is left alone).
 */
export const STAGGER = { min: 6, fps: 24 } as const
const eligible = (sub: ClockSubscriber) => sub.order !== undefined && sub.fps >= STAGGER.fps && (sub.staggerable?.() ?? true)
export interface ClockOptions {
  now?: () => number
  raf?: (cb: (time: number) => void) => number
  caf?: (id: number) => void
}
export interface MasterClock {
  subscribe(sub: ClockSubscriber): () => void
  /** Draw this subscriber on the next animation frame even if its frame index did not change. */
  invalidate(sub: ClockSubscriber): void
  /** Board seconds elapsed while running. */
  time(): number
  /** Stop advancing time (e.g. page hidden); subscribers keep their last frame. */
  pause(): void
  resume(): void
  /**
   * Jump board time to `T` seconds (the time machine scrubber). Every subscriber redraws at the new
   * time on the next animation frame, also while paused, so a frozen board can be scrubbed.
   */
  seek(T: number): void
  /** True between `pause()` and `resume()`. */
  isPaused(): boolean
}

/** Card-quantized time for board time `T` at `fps`. */
export const quantizeTime = (T: number, fps: number): { t: number; frame: number } => {
  const frame = Math.floor(T * fps + 1e-9)
  return { t: frame / fps, frame }
}

export function createMasterClock(opts: ClockOptions = {}): MasterClock {
  const now = opts.now ?? (() => performance.now())
  const raf = opts.raf ?? (cb => requestAnimationFrame(cb))
  const caf = opts.caf ?? (id => cancelAnimationFrame(id))
  const subs = new Map<ClockSubscriber, { frame: number; dirty: boolean; drawn: number; group: number }>()
  const turns: ClockSubscriber[] = []
  let elapsed = 0, last = 0, handle = 0, running = false, paused = false

  const T = () => elapsed + (running ? (now() - last) / 1000 : 0)
  function frame(time: number) {
    // the cards taking turns this frame, in board order: even and odd ranks are the two groups (−1: draws every frame)
    turns.length = 0
    for (const [sub, state] of subs) { state.group = -1; if (eligible(sub)) turns.push(sub) }
    if (turns.length > STAGGER.min) { turns.sort((a, b) => a.order! - b.order!); turns.forEach((sub, i) => { subs.get(sub)!.group = i & 1 }) }
    for (const [sub, state] of subs) {
      const { t, frame } = quantizeTime(time, sub.fps)
      if (frame === state.frame && !state.dirty) continue
      const wait = !state.dirty && state.group >= 0 && (frame + state.group) % 2 !== 0 && frame - state.drawn < 2
      state.frame = frame
      if (wait) continue
      state.dirty = false; state.drawn = frame
      sub.onFrame(t, frame)
    }
  }
  function tick() {
    handle = 0
    if (!running) return
    frame(T())
    handle = raf(tick)
  }
  // a seek while stopped draws one frame at the new time (no loop)
  function once() { handle = 0; if (!running) frame(T()) }
  function start() {
    if (running || paused || !subs.size) return
    if (handle) caf(handle) // a pending seek frame: the loop draws it
    running = true; last = now(); handle = raf(tick)
  }
  function stop() {
    if (!running) return
    elapsed = T(); running = false
    if (handle) caf(handle); handle = 0
  }
  return {
    subscribe(sub) {
      subs.set(sub, { frame: -1, dirty: true, drawn: -1, group: -1 })
      start()
      return () => { subs.delete(sub); if (!subs.size) stop() }
    },
    invalidate(sub) { const s = subs.get(sub); if (s) s.dirty = true },
    time: T,
    pause() { paused = true; stop() },
    resume() { paused = false; start() },
    seek(t) {
      elapsed = Number.isFinite(t) ? Math.max(0, t) : elapsed; last = now()
      for (const state of subs.values()) state.dirty = true
      if (!running && !handle) handle = raf(once)
    },
    isPaused: () => paused,
  }
}

let shared: MasterClock | undefined
/** The app-wide clock (lazily created; browser only). */
export function sharedClock(): MasterClock {
  if (!shared) {
    shared = createMasterClock()
    if (typeof document !== 'undefined') {
      const sync = () => (document.visibilityState === 'hidden' ? shared!.pause() : shared!.resume())
      document.addEventListener('visibilitychange', sync)
      sync()
    }
  }
  return shared
}
