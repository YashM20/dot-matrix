/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass whose cutoff rises with speed, so a
 * resting hand is steady (low cutoff, no jitter) and a fast one keeps up (high cutoff, little lag).
 * Units: values in whatever space you feed (here normalised frame coords), time in seconds.
 */
export interface OneEuroOptions {
  /** Cutoff at rest, Hz: lower = steadier but laggier when slow. */
  minCutoff?: number
  /** Cutoff gain per unit/s of speed: higher = less lag when fast. */
  beta?: number
  /** Cutoff of the derivative estimate, Hz. */
  dCutoff?: number
}

const alpha = (cutoff: number, dt: number) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt) }

export class OneEuro {
  private x = NaN; private dx = 0; private t = NaN
  private readonly minCutoff: number; private readonly beta: number; private readonly dCutoff: number
  constructor({ minCutoff = 1.2, beta = 1.5, dCutoff = 1 }: OneEuroOptions = {}) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff }
  /** Filter sample `x` taken at `t` seconds. */
  filter(x: number, t: number): number {
    if (this.x !== this.x) { this.x = x; this.t = t; this.dx = 0; return x }
    const dt = t - this.t
    if (!(dt > 0)) return this.x
    this.t = t
    const dx = (x - this.x) / dt
    this.dx += alpha(this.dCutoff, dt) * (dx - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x += alpha(cutoff, dt) * (x - this.x)
    return this.x
  }
  /** Forget the history (track lost): the next sample passes through unfiltered. */
  reset(): void { this.x = NaN; this.dx = 0; this.t = NaN }
}
