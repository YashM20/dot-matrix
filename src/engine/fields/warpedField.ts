import type { Field } from '../types'

const TAU = Math.PI * 2

export const warpDomain = (field: Field, warp: (u: number, v: number) => [number, number]): Field => (u, v) => { const [uu, vv] = warp(u, v); return field(Math.max(0, Math.min(1, uu)), Math.max(0, Math.min(1, vv))) }

export const sinWarp = (field: Field, freq = 8, amp = 0.06): Field => warpDomain(field, (u, v) => [u + Math.sin(v * freq) * amp, v + Math.cos(u * freq) * amp])

export const radialWarp = (field: Field, strength = 0.15): Field => warpDomain(field, (u, v) => { const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), nr = r + Math.sin(ang * 5) * strength * r; return [0.5 + Math.cos(ang) * nr, 0.5 + Math.sin(ang) * nr] })

export function modulatedRingField(cx: number, cy: number, rInner: number, rOuter: number, thetaStart: number, sweep: number, modFreq = 6, modAmp = 0.28): Field {
  return (u, v) => {
    const r = Math.hypot(u - cx, v - cy), theta = Math.atan2(v - cy, u - cx)
    const ang = ((theta - thetaStart + TAU) % TAU)
    if (ang > sweep) return 0
    const mod = 1 + Math.sin(theta * modFreq) * modAmp
    const inner = rInner * mod, outer = rOuter * mod
    const edge = 0.012
    const radial = Math.max(0, Math.min(1, (r - inner) / edge)) * Math.max(0, 1 - Math.max(0, Math.min(1, (r - (outer - edge)) / edge)))
    const clamped = Math.max(0, Math.min(1, radial))
    return clamped
  }
}

export function spiralField(cx: number, cy: number, turns = 2.2, tightness = 18): Field {
  const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  return (u, v) => {
    const dx = u - cx, dy = v - cy, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx)
    const spiral = (ang + TAU) % TAU / TAU * turns * TAU
    const dist = Math.abs(r * tightness - spiral)
    return dist <= 0.06 ? 1 : dist >= 0.22 ? 0 : 1 - smoothstep(0.06, 0.22, dist)
  }
}

export function waveField(freqX = 12, freqY = 0, phase = 0): Field {
  return (_u, v) => 0.5 + 0.5 * Math.sin(v * freqX + phase + Math.sin(_u * freqY) * 2)
}

export function checkerField(cols: number, rows: number): Field {
  return (u, v) => ((Math.floor(u * cols) + Math.floor(v * rows)) % 2 === 0 ? 1 : 0.22)
}

export function truchetField(scale = 8): Field {
  return (u, v) => {
    const cu = Math.floor(u * scale), cv = Math.floor(v * scale)
    const uu = u * scale - cu, vv = v * scale - cv
    const diag = (cu + cv) % 2 === 0
    const d = diag ? Math.abs(uu - vv) : Math.abs(uu + vv - 1)
    return d < 0.14 ? 1 : d < 0.18 ? 0.5 : 0.12
  }
}

export function gradientField(angle = 0): Field {
  const ca = Math.cos(angle), sa = Math.sin(angle)
  return (u, v) => Math.max(0, Math.min(1, (u * ca + v * sa) * 0.7 + 0.15))
}

export function concentricWaveField(cx: number, cy: number, freq = 18, phase = 0): Field {
  return (u, v) => 0.5 + 0.5 * Math.sin(Math.hypot(u - cx, v - cy) * freq - phase)
}

export function domainRepeat(field: Field, repeatX: number, repeatY: number): Field {
  return (u, v) => field((u * repeatX) % 1, (v * repeatY) % 1)
}
