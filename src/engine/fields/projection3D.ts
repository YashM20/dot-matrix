import type { Field } from '../types'

export function perspectiveProjection(worldX: number, worldY: number, worldZ: number, focalLength: number): [number, number] {
  const scale = focalLength / (focalLength + Math.max(0, worldZ))
  return [worldX * scale, worldY * scale]
}

export function corridorField(depth: number, focalLength: number): Field {
  return (u, v) => {
    const x = u - .5, y = v - .5
    let best = 0
    for (let k = 1; k <= depth; k++) {
      const s = focalLength / (focalLength + k)
      const half = .48 * s
      const thickness = 0.012 * s
      const dx = Math.abs(x), dy = Math.abs(y)
      const edgeX = dy <= half ? Math.max(0, 1 - Math.abs(dx - half) / thickness) : 0
      const edgeY = dx <= half ? Math.max(0, 1 - Math.abs(dy - half) / thickness) : 0
      best = Math.max(best, Math.max(edgeX, edgeY) * s)
    }
    return best
  }
}
