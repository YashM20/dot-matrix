export type DrawMatrix = number[][]

/** Sane bounds for the Draw canvas. Pixel bounds match the W/H inputs; cell bounds keep the preview sampler cheap. */
export const DRAW_LIMITS = {
  minPx: 80,
  maxPx: 1280,
  minCells: 4,
  maxCells: 320,
  minPitch: 2,
  maxPitch: 8,
} as const

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))

export function clampPitch(p: number): number {
  return Number.isFinite(p) ? clampInt(p, DRAW_LIMITS.minPitch, DRAW_LIMITS.maxPitch) : DRAW_LIMITS.minPitch
}

export function clampPx(px: number): number {
  return Number.isFinite(px) ? clampInt(px, DRAW_LIMITS.minPx, DRAW_LIMITS.maxPx) : DRAW_LIMITS.minPx
}

export function clampCells(n: number): number {
  return Number.isFinite(n) ? clampInt(n, DRAW_LIMITS.minCells, DRAW_LIMITS.maxCells) : DRAW_LIMITS.minCells
}

export function createMatrix(cols: number, rows: number, fill = 0): DrawMatrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill))
}

export function cloneMatrix(m: DrawMatrix): DrawMatrix {
  return m.map(row => row.slice())
}

/** Nearest-neighbour rescale — keeps the picture's composition when the cell resolution changes (pitch). */
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

/** Copy the overlapping top-left region into a new size: growing pads with 0, shrinking crops. */
export function cropPadMatrix(src: DrawMatrix, dstCols: number, dstRows: number): DrawMatrix {
  const dst = createMatrix(dstCols, dstRows)
  const rows = Math.min(dstRows, src.length)
  for (let r = 0; r < rows; r++) {
    const row = src[r], n = Math.min(dstCols, row.length)
    for (let c = 0; c < n; c++) dst[r][c] = row[c]
  }
  return dst
}

/**
 * Coerce untrusted data (e.g. loaded JSON) into a rectangular, clamped matrix within DRAW_LIMITS.
 * Returns null when the input is not a 2-D array.
 */
export function normalizeMatrix(data: unknown): DrawMatrix | null {
  if (!Array.isArray(data) || data.length === 0 || !data.every(Array.isArray)) return null
  const rowsIn = data as unknown[][]
  const rows = clampCells(rowsIn.length)
  const cols = clampCells(Math.max(...rowsIn.map(r => r.length)))
  const out = createMatrix(cols, rows)
  for (let r = 0; r < Math.min(rows, rowsIn.length); r++) {
    const row = rowsIn[r]
    for (let c = 0; c < Math.min(cols, row.length); c++) {
      const v = Number(row[c])
      out[r][c] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
    }
  }
  return out
}

export function matrixToField(matrix: DrawMatrix) {
  // thin wrapper — caller does () => gridField(matrix)
  return matrix
}

/** Cell counts for a pixel size at a pitch, clamped to DRAW_LIMITS. */
export function dimsFromSize(width: number, height: number, pitch: number) {
  const p = clampPitch(pitch)
  return {
    cols: clampCells(clampPx(width) / p),
    rows: clampCells(clampPx(height) / p),
  }
}
