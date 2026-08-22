import type { Field } from '../types'

export function gridField(matrix: number[][]): Field {
  const rows = matrix.length, cols = matrix[0]?.length ?? 0
  return (u, v) => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(u * cols)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor(v * rows)))
    return Math.max(0, Math.min(1, matrix[r]?.[c] ?? 0))
  }
}
