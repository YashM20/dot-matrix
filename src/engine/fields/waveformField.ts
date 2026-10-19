import type { Field } from '../types'
import { hash01 } from '../math'

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma))

const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export interface AmplitudeOptions {
  /** `bottom` grows bars up from v=1; `center` mirrors them around v=0.5. */
  baseline?: 'bottom' | 'center'
  /** Fraction of each bar slot left empty (0 = solid block, 0.5 = 1:1 bar/gap). */
  gap?: number
}
/** Bar chart as a field. v=0 is the top row, so a bar of amplitude a fills v ∈ [1-a, 1]. */
export function amplitudeField(amplitudes: number[], opts: AmplitudeOptions = {}): Field {
  const n = Math.max(1, amplitudes.length), { baseline = 'bottom', gap = 0 } = opts
  return (u, v) => {
    const slot = u * n, i = Math.min(n - 1, Math.max(0, Math.floor(slot)))
    if (gap > 0 && slot - i > 1 - gap) return 0
    const amp = Math.max(0, Math.min(1, amplitudes[i] ?? 0))
    const edge = .018
    const d = baseline === 'center' ? Math.abs(v - .5) * 2 : 1 - v
    return amp <= 0 ? 0 : d <= amp - edge ? 1 : d <= amp + edge ? 1 - smoothstep(amp - edge, amp + edge, d) : 0
  }
}
export function traceField(amplitudes: number[], thickness = .022): Field {
  const n = Math.max(1, amplitudes.length)
  return (u, v) => {
    const scaledX = u * (n - 1)
    const i0 = Math.floor(scaledX), i1 = Math.min(n - 1, i0 + 1), frac = scaledX - i0
    const amp = (amplitudes[i0] ?? 0) * (1 - frac) + (amplitudes[i1] ?? 0) * frac
    const dist = Math.abs(v - (1 - amp))
    return dist <= thickness / 2 ? 1 : dist >= thickness ? 0 : 1 - smoothstep(thickness / 2, thickness, dist)
  }
}
export function mirroredTraceField(amplitudes: number[], thickness = .018): Field {
  const base = traceField(amplitudes, thickness)
  return (u, v) => Math.max(base(u, v), base(u, 1 - v))
}

export function sumOfSinesAmplitudes(n: number, t: number): number[] {
  const f1 = 2.1, f2 = 5.7, phi = 1.3
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const x = i / Math.max(1, n - 1)
    const v = Math.sin(t * f1 + x * 6.5) + 0.4 * Math.sin(t * f2 + x * 3.1 + phi)
    out.push(Math.max(.05, 0.5 + 0.28 * v))
  }
  return out
}

/** Speech-like envelope: a few loud bursts over a quiet floor, deterministic per `seed`, drifting with `t`. */
export function speechAmplitudes(n: number, t = 0, seed = 1): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const x = i / Math.max(1, n - 1)
    const burst = Math.max(0, Math.sin(x * 9.3 + seed * 1.7 + t) * Math.sin(x * 2.9 - seed * 0.6 + t * 0.4))
    const hash = hash01(i + 1, seed)
    out.push(Math.max(0.08, Math.min(1, 0.12 + burst * 0.9 * (0.55 + hash * 0.45))))
  }
  return out
}

export function ecgAmplitudes(n: number, t: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const x = ((i / Math.max(1, n - 1) + t) % 1 + 1) % 1
    const beat = .14 * gauss(x, .16, .03) - .09 * gauss(x, .26, .008) + gauss(x, .29, .009) - .24 * gauss(x, .33, .01) + .32 * gauss(x, .48, .045)
    out.push(Math.max(.04, .18 + beat))
  }
  return out
}

export function amplitudesFromAnalyser(analyser: AnalyserNode): number[] {
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  return Array.from(data, value => value / 255)
}
