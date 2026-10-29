import type { Field } from '../types'
import { mulberry32 } from '../sampler/jitter'

/** The 5×5 neighbourhood of a grid cell, nearest cells first. */
const SCAN_X = Int8Array.of(0, -1, 1, 0, 0, -1, 1, -1, 1, -2, 2, 0, 0, -2, -2, 2, 2, -1, 1, -1, 1, -2, 2, -2, 2)
const SCAN_Y = Int8Array.of(0, 0, 0, -1, 1, -1, -1, 1, 1, 0, 0, -2, 2, -1, 1, -1, 1, -2, -2, 2, 2, -2, -2, 2, 2)

export function poissonDiscPoints(width: number, height: number, minDistance: number, seed: number): [number, number][] {
  const random = mulberry32(seed)
  const cellSize = minDistance / Math.SQRT2
  const gw = Math.max(1, Math.ceil(width / cellSize)), gh = Math.max(1, Math.ceil(height / cellSize))
  // the grid holds point indices (−1 = empty); coordinates also live in flat arrays for the hot distance test
  const grid = new Int32Array(gw * gh).fill(-1)
  const points: [number, number][] = [], xs: number[] = [], ys: number[] = []
  const active: number[] = []
  const emit = (x: number, y: number) => { points.push([x, y]); xs.push(x); ys.push(y); grid[Math.min(gh - 1, Math.floor(y / cellSize)) * gw + Math.min(gw - 1, Math.floor(x / cellSize))] = points.length - 1; active.push(points.length - 1) }
  // "closer than minDistance" by the squared distance, falling back to Math.hypot within 1e-12 of the edge, so every
  // decision (and the point set) is exactly the one the hypot test made
  const d2 = minDistance * minDistance, near = d2 * (1 - 1e-12), far = d2 * (1 + 1e-12)
  emit(random() * width, random() * height)
  while (active.length) {
    const ai = Math.floor(random() * active.length)
    const px = xs[active[ai]], py = ys[active[ai]]
    let found = false
    for (let k = 0; k < 30; k++) {
      const ang = random() * Math.PI * 2, dist = minDistance * (1 + random())
      const x = px + Math.cos(ang) * dist, y = py + Math.sin(ang) * dist
      if (x < 0 || x >= width || y < 0 || y >= height) continue
      let ok = true
      const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize)
      // the 5×5 cells round the candidate, nearest first (a rejection usually comes from the inner 3×3)
      for (let s = 0; s < 25; s++) {
        const gx = cx + SCAN_X[s], gy = cy + SCAN_Y[s]
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue
        const gi = grid[gy * gw + gx]
        if (gi < 0) continue
        const dx = xs[gi] - x, dy = ys[gi] - y, q = dx * dx + dy * dy
        if (q < near || (q <= far && Math.hypot(dx, dy) < minDistance)) { ok = false; break }
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
