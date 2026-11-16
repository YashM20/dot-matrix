/**
 * Mini games (#131): three small original games that live on cards (the `arcade` board). Each one is a
 * deterministic sim stepped at a fixed 60 Hz. Its whole state is plain data with the PRNG state inside (`rng`,
 * src/game/rng.ts), so a seed plus the list of per-step inputs replays a game exactly (scripts/arcade.ts).
 * No DOM, no clock, no framework: the card runtime (src/widgets/boards/arcade-kit.ts) feeds them.
 */
export const DT = 1 / 60

/** Per-step input: 0 nothing, 1 a press (POISE: the right pan), -1 the left pan (POISE only). */
export type MiniInput = -1 | 0 | 1

export interface MiniState {
  /** Steps since the game began. */
  frame: number
  score: number
  over: boolean
  /** mulberry32 state (`nextRandom`). */
  rng: number
}

export interface MiniGame<S extends MiniState> {
  id: string
  create(seed: number): S
  step(s: S, input: MiniInput): void
  /** The autopilot's input for the next step: the attract loop and the checks play with it. */
  bot(s: S): MiniInput
}

/** FNV-1a 32 of the state's JSON: the checks compare replays by it. */
export function stateHash(s: object): string {
  const str = JSON.stringify(s)
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Play `inputs` (one per step) into a fresh game from `seed`. */
export function replay<S extends MiniState>(g: MiniGame<S>, seed: number, inputs: readonly MiniInput[]): S {
  const s = g.create(seed)
  for (const i of inputs) g.step(s, i)
  return s
}

/** Let the autopilot play from `seed` for up to `steps` steps (stops at game over); returns the state and its inputs. */
export function autoplay<S extends MiniState>(g: MiniGame<S>, seed: number, steps: number): { state: S; inputs: MiniInput[] } {
  const s = g.create(seed), inputs: MiniInput[] = []
  for (let i = 0; i < steps && !s.over; i++) { const inp = g.bot(s); inputs.push(inp); g.step(s, inp) }
  return { state: s, inputs }
}
