/** Game buttons as one bitmask per sim step: what the deterministic sim reads (and what a replay records). */
export const BTN = {
  left: 1, right: 2, up: 4, down: 8,
  /** Fire / jump / confirm. */
  a: 16,
  /** Strafe modifier (corridor), slow focus (boss), back (entry). */
  b: 32,
  start: 64,
  strafeL: 128, strafeR: 256,
} as const
export type ButtonName = keyof typeof BTN
/** One sim step of input: held buttons, plus mouse / right-stick look in 1/1000 rad (corridor only). */
export interface StepInput { b: number; look?: number }
