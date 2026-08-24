export type DrawMatrix = number[][]

export function createMatrix(cols: number, rows: number, fill = 0): DrawMatrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill))
}

export function cloneMatrix(m: DrawMatrix): DrawMatrix {
  return m.map(row => row.slice())
}

export function resampleMatrix(src: DrawMatrix, dstCols: number, dstRows: number): DrawMatrix {
  const sRows = src.length, sCols = src[0]?.length ?? 0
  if (sRows === 0 || sCols === 0) return createMatrix(dstCols, dstRows)
  const dst: DrawMatrix = createMatrix(dstCols, dstRows)
  for (let r = 0; r < dstRows; r++) {
    const sr = Math.min(sRows - 1, Math.floor((r / dstRows) * sRows))
    for (let c = 0; c < dstCols; c++) {
      const sc = Math.min(sCols - 1, Math.floor((c / dstCols) * sCols))
      dst[r][c] = src[sr][sc]
    }
  }
  return dst
}

export function matrixToField(matrix: DrawMatrix) {
  // thin wrapper — caller does () => gridField(matrix)
  return matrix
}

export function dimsFromSize(width: number, height: number, pitch: number) {
  return {
    cols: Math.max(4, Math.round(width / pitch)),
    rows: Math.max(4, Math.round(height / pitch)),
  }
}
