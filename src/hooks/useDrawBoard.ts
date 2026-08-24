import { useCallback, useState } from 'react'
import { createMatrix, resampleMatrix, type DrawMatrix } from '../lib/drawGrid'

export type CellDelta = { idx: number; prev: number; next: number }
export type Stroke = CellDelta[]

export function useDrawBoard(initialCols = 80, initialRows = 80, initialPitch = 4) {
  const [cols, setCols] = useState(initialCols)
  const [rows, setRows] = useState(initialRows)
  const [pitch, setPitch] = useState(initialPitch)
  const [width, setWidth] = useState(initialCols * initialPitch)
  const [height, setHeight] = useState(initialRows * initialPitch)
  const [brush, setBrush] = useState(1)
  const [eraseMode, setEraseMode] = useState(false)
  const [matrix, setMatrix] = useState<DrawMatrix>(() => createMatrix(initialCols, initialRows))
  const [past, setPast] = useState<Stroke[]>([])
  const [future, setFuture] = useState<Stroke[]>([])
  const [refUrl, setRefUrl] = useState<string | null>(null)
  const [refOpacity, setRefOpacity] = useState(35)
  const [overlay, setOverlay] = useState(false)

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  const pushStroke = useCallback((stroke: Stroke) => {
    if (stroke.length === 0) return
    setPast(p => [...p, stroke].slice(-100))
    setFuture([])
  }, [])

  const applyDeltas = useCallback((deltas: CellDelta[], toPrev: boolean, m: DrawMatrix) => {
    const next = m.map(r => r.slice())
    for (const d of deltas) {
      const r = Math.floor(d.idx / cols), c = d.idx % cols
      if (r >= 0 && r < next.length && c >= 0 && c < next[0].length) next[r][c] = toPrev ? d.prev : d.next
    }
    return next
  }, [cols])

  const undo = useCallback(() => {
    setPast(p => {
      if (p.length === 0) return p
      const last = p[p.length - 1]
      setMatrix(m => applyDeltas(last, true, m))
      setFuture(f => [...f, last])
      return p.slice(0, -1)
    })
  }, [applyDeltas])

  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f
      const last = f[f.length - 1]
      setMatrix(m => applyDeltas(last, false, m))
      setPast(p => [...p, last].slice(-100))
      return f.slice(0, -1)
    })
  }, [applyDeltas])

  const clear = useCallback(() => {
    const stroke: Stroke = []
    matrix.forEach((row, r) => row.forEach((v, c) => {
      if (v !== 0) stroke.push({ idx: r * cols + c, prev: v, next: 0 })
    }))
    if (stroke.length === 0) return
    pushStroke(stroke)
    setMatrix(createMatrix(cols, rows))
  }, [matrix, cols, rows, pushStroke])

  const resize = useCallback((w: number, h: number, p: number) => {
    const nc = Math.max(4, Math.round(w / p)), nr = Math.max(4, Math.round(h / p))
    setMatrix(m => resampleMatrix(m, nc, nr))
    setCols(nc); setRows(nr); setPitch(p); setWidth(w); setHeight(h)
  }, [])

  const loadMatrix = useCallback((data: DrawMatrix, p: number) => {
    const r = data.length, c = data[0]?.length ?? 0
    setCols(c); setRows(r); setPitch(p); setWidth(c * p); setHeight(r * p)
    setMatrix(data.map(row => row.slice()))
    setPast([]); setFuture([])
  }, [])

  const setRefFromFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    setRefUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
  }, [])

  return {
    cols, rows, pitch, width, height, brush, eraseMode, matrix, past, future, canUndo, canRedo, refUrl, refOpacity, overlay,
    setBrush, setEraseMode, setMatrix, pushStroke, undo, redo, clear, resize, loadMatrix, setRefFromFile, setRefOpacity, setOverlay,
  }
}
