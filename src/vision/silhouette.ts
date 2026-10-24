/**
 * Silhouette and motion from a stream of luma rasters (the camera card's own, on the card grid): a
 * per-cell background model (running mean, learnt fast where the scene is empty and very slowly under a
 * subject) gives the foreground; frame differencing feeds a decaying motion-history image. No colour,
 * no ML: whatever differs from the room you started in becomes the shadow.
 *
 * Output values are soft (0..1) so the shadow card can feather the edge.
 */
export interface Silhouette {
  /** Foreground, 0..1 per cell. */
  readonly fg: Float32Array
  /** Motion history, 0..1 per cell (1 = moved this frame, decays). */
  readonly motion: Float32Array
  /** Fraction of cells that moved this frame. */
  readonly energy: number
  /** Feed one luma frame (0..1 per cell, same length every time). */
  push(luma: ArrayLike<number>): void
  reset(): void
}

export function createSilhouette(n: number, { threshold = .09, soft = .05, decay = .86 } = {}): Silhouette {
  const bg = new Float32Array(n), prev = new Float32Array(n), fg = new Float32Array(n), motion = new Float32Array(n)
  let primed = false, energy = 0
  return {
    fg, motion,
    get energy() { return energy },
    push(l) {
      let moved = 0
      for (let i = 0; i < n; i++) {
        const v = l[i]
        if (!primed) { bg[i] = v; prev[i] = v }
        const d = Math.abs(v - bg[i]), f = d <= threshold ? 0 : d >= threshold + soft ? 1 : (d - threshold) / soft
        fg[i] = f
        if (Math.abs(v - prev[i]) > .06) { motion[i] = 1; moved++ } else motion[i] *= decay
        bg[i] += (v - bg[i]) * (f > .5 ? .002 : .04)
        prev[i] = v
      }
      primed = true; energy = moved / n
    },
    reset() { primed = false; motion.fill(0); fg.fill(0); energy = 0 },
  }
}
