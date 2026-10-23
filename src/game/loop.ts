/**
 * Fixed-step game loop: the sim advances in whole 1/60 s steps from an accumulator, the screen is
 * drawn once per display frame (any refresh rate). A long stall (tab in the background) is clamped,
 * never replayed as a burst of steps.
 */
export interface LoopHooks {
  step(): void
  draw(): void
  /** While true, no steps run (the screen still draws, e.g. a PAUSED frame). */
  paused(): boolean
}
export const STEP_MS = 1000 / 60
const MAX_STEPS = 5

export function startLoop(h: LoopHooks): () => void {
  let raf = 0, last = performance.now(), acc = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(250, now - last)
    last = now
    if (h.paused()) acc = 0
    else {
      acc += dt
      let n = 0
      while (acc >= STEP_MS && n < MAX_STEPS) { h.step(); acc -= STEP_MS; n++ }
      if (n === MAX_STEPS) acc = 0
    }
    h.draw()
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}
