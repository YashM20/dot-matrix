import type { Field } from '../types'

const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export function catmullRomField(points: [number, number][], tension = .5): Field {
  const samples: [number, number][] = []
  const n = points.length
  const tau = tension
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)]
    const m0x = tau * (p2[0] - p0[0]) * 0.5, m0y = tau * (p2[1] - p0[1]) * 0.5
    const m1x = tau * (p3[0] - p1[0]) * 0.5, m1y = tau * (p3[1] - p1[1]) * 0.5
    for (let s = 0; s < 12; s++) {
      const t = s / 12, t2 = t * t, t3 = t2 * t
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2
      samples.push([h00 * p1[0] + h10 * m0x + h01 * p2[0] + h11 * m1x, h00 * p1[1] + h10 * m0y + h01 * p2[1] + h11 * m1y])
    }
  }
  samples.push(points[n - 1])
  return (u, v) => {
    let best = Infinity
    for (let i = 0; i < samples.length; i++) {
      const dx = samples[i][0] - u, dy = samples[i][1] - v, d = dx * dx + dy * dy
      if (d < best) best = d
    }
    const dist = Math.sqrt(best)
    return dist <= .012 ? 1 : dist >= .034 ? 0 : 1 - smoothstep(.012, .034, dist)
  }
}
