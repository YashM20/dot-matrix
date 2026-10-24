/** Deterministic PRNG (mulberry32) whose whole state is one uint32, so it lives inside the game state. */
export function nextRandom(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
/** A stand-alone generator for building static content from a seed. */
export function rngFrom(seed: number): () => number {
  const s = { rng: seed >>> 0 }
  return () => nextRandom(s)
}
