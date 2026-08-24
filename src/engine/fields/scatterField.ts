import type { Field } from '../types'
import { mulberry32 } from '../sampler/jitter'

export function poissonDiscPoints(width: number, height: number, minDistance: number, seed: number): [number, number][] {
  const random = mulberry32(seed)
  const cellSize = minDistance / Math.SQRT2
  const gw = Math.max(1, Math.ceil(width / cellSize)), gh = Math.max(1, Math.ceil(height / cellSize))
  const grid: (number | undefined)[] = new Array(gw * gh).fill(undefined)
  const points: [number, number][] = []
  const active: number[] = []
  const emit = (x: number, y: number) => { points.push([x, y]); grid[Math.min(gh - 1, Math.floor(y / cellSize)) * gw + Math.min(gw - 1, Math.floor(x / cellSize))] = points.length - 1; active.push(points.length - 1) }
  emit(random() * width, random() * height)
  while (active.length) {
    const ai = Math.floor(random() * active.length)
    const px = points[active[ai]][0], py = points[active[ai]][1]
    let found = false
    for (let k = 0; k < 30; k++) {
      const ang = random() * Math.PI * 2, dist = minDistance * (1 + random())
      const x = px + Math.cos(ang) * dist, y = py + Math.sin(ang) * dist
      if (x < 0 || x >= width || y < 0 || y >= height) continue
      let ok = true
      const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize)
      for (let gy = Math.max(0, cy - 2); gy <= Math.min(gh - 1, cy + 2) && ok; gy++) for (let gx = Math.max(0, cx - 2); gx <= Math.min(gw - 1, cx + 2) && ok; gx++) {
        const gi = grid[gy * gw + gx]
        if (gi !== undefined && Math.hypot(points[gi][0] - x, points[gi][1] - y) < minDistance) ok = false
      }
      if (ok) { emit(x, y); found = true; break }
    }
    if (!found) active.splice(ai, 1)
  }
  return points
}

export function scatterField(points: [number, number][], dotRadius: number, width?: number, height?: number): Field {
  let maxX = width ?? 1e-6, maxY = height ?? 1e-6
  if (width === undefined || height === undefined) for (const [px, py] of points) { if (px > maxX) maxX = px; if (py > maxY) maxY = py }
  const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  return (u, v) => {
    const x = u * maxX, y = v * maxY
    let best = Infinity
    for (const [px, py] of points) { const dx = px - x, dy = py - y, d = dx * dx + dy * dy; if (d < best) best = d }
    const dist = Math.sqrt(best)
    return dist <= dotRadius ? 1 : dist >= dotRadius * 2 ? 0 : 1 - smoothstep(dotRadius, dotRadius * 2, dist)
  }
}
