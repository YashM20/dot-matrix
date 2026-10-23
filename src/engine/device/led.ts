/**
 * LED matrix emulator (Glyph Matrix): drive values are PWM duty (linear light); what the eye sees is
 * that light through the panel gamma, plus a halo — a share of each LED's light lands on its
 * neighbours through the diffuser (the PSF / bloom), and an unlit LED's lens still shows faintly.
 * Pure function of one frame.
 */
import type { LedPhysics } from './profile'
import type { DeviceFrame } from './toDevice'

export interface LedView {
  /** Perceived brightness of each LED itself, 0..1 (0 = off; masked pixels -1). */
  lit: Float32Array
  /** Perceived halo light reaching each LED position from its neighbours, 0..1. */
  halo: Float32Array
}

export function ledGlow(f: DeviceFrame, physics: LedPhysics, gamma = f.profile.tones.gamma ?? 2.2): LedView {
  const { cols, rows, out, mask } = f, n = cols * rows
  const lit = new Float32Array(n), halo = new Float32Array(n)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c
    if (!mask[i]) { lit[i] = -1; continue }
    let s = 0
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const rr = r + dr, cc = c + dc
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
      s += out[rr * cols + cc] * (dr && dc ? .7 : 1)
    }
    lit[i] = out[i] > 0 ? out[i] ** (1 / gamma) : 0
    halo[i] = Math.min(1, Math.max(physics.offGlow, (s * physics.bloom) ** (1 / gamma)))
  }
  return { lit, halo }
}
