import type { Field } from '../types'

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma))

const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export function amplitudeField(amplitudes: number[]): Field {
  const n = Math.max(1, amplitudes.length)
  return (u, v) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(u * n)))
    const amp = Math.max(0, Math.min(1, amplitudes[i]))
    const edge = .018
    return amp <= 0 ? 0 : v <= amp - edge ? 1 : v <= amp + edge ? 1 - smoothstep(amp - edge, amp + edge, v) : 0
  }
}
export function traceField(amplitudes: number[], thickness = .022): Field {
  const n = Math.max(1, amplitudes.length)
  return (u, v) => {
    const scaledX = u * (n - 1)
    const i0 = Math.floor(scaledX), i1 = Math.min(n - 1, i0 + 1), frac = scaledX - i0
    const amp = amplitudes[i0] * (1 - frac) + amplitudes[i1] * frac
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
