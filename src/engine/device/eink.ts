/**
 * E-ink panel simulator: what a 1-bit electrophoretic panel shows at time t, given the frame it is
 * asked to show at each refresh. Pure in t (any call order gives the same answer): refresh k happens
 * at k / refresh seconds; every `fullEvery`-th is a full refresh, the rest are partial.
 *
 * - **Partial refresh** (`partialS`): changed pixels drive towards the new state; a pixel that was ink
 *   and is now paper keeps `ghost` of its ink, which only fades by `ghostDecay` per later partial.
 *   Ghosts pile up — the previous digits bleed through — until the next full refresh.
 * - **Full refresh** (`fullS`): the familiar flash — the inverted image, solid ink, blank paper, then the
 *   new image — and every ghost is cleared.
 *
 * Cost per call is bounded by `fullEvery` frames (memoised by refresh index).
 */
import type { EinkPhysics } from './profile'
import type { DeviceFrame } from './toDevice'

export interface EinkView {
  /** Ink darkness per pixel, 0 = paper, 1 = full ink (what the card draws). */
  ink: Float32Array
  /** Refresh index the panel is on, and what it is doing right now. */
  k: number
  phase: 'idle' | 'partial' | 'full'
  /** 0..1 through the current refresh. */
  progress: number
}
export interface EinkSim { at(t: number): EinkView; physics: EinkPhysics; refresh: number }

const smooth = (x: number) => { const s = Math.max(0, Math.min(1, x)); return s * s * (3 - 2 * s) }

/**
 * `frameAt(k)` = the frame the host sends at refresh k (k / refresh seconds). Device `out` = 1 means
 * a lit pixel in the card; on paper that is ink.
 */
export function createEinkSim(frameAt: (k: number) => DeviceFrame, physics: EinkPhysics, refresh = 1, memo = 24): EinkSim {
  const frames = new Map<number, DeviceFrame>()
  const frame = (k: number) => {
    let f = frames.get(k)
    if (!f) {
      f = frameAt(k); frames.set(k, f)
      if (frames.size > memo) frames.delete(frames.keys().next().value!)
    }
    return f
  }
  /** Settled ink + ghost after refresh k completes (ghost-only buffer is what partials leave behind). */
  const done = new Map<number, { ink: Float32Array; ghost: Float32Array }>()
  const settled = (k: number): { ink: Float32Array; ghost: Float32Array } => {
    let s = done.get(k)
    if (!s) { s = settle(k); done.set(k, s); if (done.size > 4) done.delete(done.keys().next().value!) }
    return s
  }
  const settle = (k: number): { ink: Float32Array; ghost: Float32Array } => {
    const kf = Math.floor(k / physics.fullEvery) * physics.fullEvery
    const base = frame(kf).out, n = base.length
    const ink = Float32Array.from(base), ghost = new Float32Array(n)
    for (let j = kf + 1; j <= k; j++) {
      const next = frame(j).out
      for (let i = 0; i < n; i++) {
        const g = ghost[i] * physics.ghostDecay
        ghost[i] = ink[i] > .5 && next[i] < .5 ? Math.max(g, physics.ghost) : next[i] > .5 ? 0 : g
        ink[i] = next[i]
      }
    }
    return { ink, ghost }
  }
  const at = (t: number): EinkView => {
    const k = Math.floor(t * refresh + 1e-9), tau = t - k / refresh, full = ((k % physics.fullEvery) + physics.fullEvery) % physics.fullEvery === 0
    const dur = full ? physics.fullS : physics.partialS, progress = Math.min(1, tau / dur)
    const now = settled(k), n = now.ink.length, ink = new Float32Array(n)
    if (progress >= 1) {
      for (let i = 0; i < n; i++) ink[i] = Math.max(now.ink[i], now.ghost[i])
      return { ink, k, phase: 'idle', progress: 1 }
    }
    if (full) {
      // inverted image → solid ink → blank paper → new image (each a quarter of the refresh)
      const q = progress * 4, img = now.ink
      for (let i = 0; i < n; i++) ink[i] = q < 1 ? 1 - img[i] : q < 2 ? 1 : q < 3 ? 0 : img[i] * smooth(q - 3)
      return { ink, k, phase: 'full', progress }
    }
    // partial: from what was on screen after k-1 towards k; changed pixels move, a cleared pixel lands on its ghost
    const prev = settled(k - 1), s = smooth(progress)
    for (let i = 0; i < n; i++) {
      const a = Math.max(prev.ink[i], prev.ghost[i]), b = Math.max(now.ink[i], now.ghost[i])
      ink[i] = a + (b - a) * s
    }
    return { ink, k, phase: 'partial', progress }
  }
  return { at, physics, refresh }
}
