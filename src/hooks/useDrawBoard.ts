import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  clampCells, clampPitch, clampPx, createMatrix, cropPadMatrix, normalizeMatrix, resampleMatrix, type DrawMatrix,
} from '../lib/drawGrid'

export type CellDelta = { idx: number; prev: number; next: number }
export type Stroke = CellDelta[]

/** Everything that defines the drawing. Width/height in px are derived (cols × pitch). */
interface Doc { cols: number; rows: number; pitch: number; matrix: DrawMatrix }

/**
 * History entries.
 * - `cells`: per-cell deltas, indexed with the column count they were recorded at.
 * - `snapshot`: full before/after doc for size changes, so undo restores size and content together.
 */
type Entry =
  | { kind: 'cells'; cols: number; deltas: CellDelta[] }
  | { kind: 'snapshot'; before: Doc; after: Doc; tag?: 'pitch' }

interface State { doc: Doc; past: Entry[]; future: Entry[] }

type Action =
  | { type: 'stroke'; cols: number; deltas: CellDelta[] }
  | { type: 'replace'; matrix: DrawMatrix }
  | { type: 'clear' }
  | { type: 'resize'; width: number; height: number }
  | { type: 'pitch'; pitch: number }
  | { type: 'load'; matrix: DrawMatrix; pitch: number }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 100

function applyCells(doc: Doc, entry: Extract<Entry, { kind: 'cells' }>, toPrev: boolean): Doc {
  // Snapshots restore size in order, so the doc is always back at the recorded column count here.
  if (entry.cols !== doc.cols) return doc
  const matrix = doc.matrix.map(r => r.slice())
  for (const d of entry.deltas) {
    const r = Math.floor(d.idx / entry.cols), c = d.idx % entry.cols
    if (r >= 0 && r < doc.rows && c >= 0 && c < doc.cols) matrix[r][c] = toPrev ? d.prev : d.next
  }
  return { ...doc, matrix }
}

function push(state: State, doc: Doc, entry: Entry): State {
  return { doc, past: [...state.past, entry].slice(-HISTORY_LIMIT), future: [] }
}

function snapshot(state: State, after: Doc, tag?: 'pitch'): State {
  const before = state.doc
  if (after.cols === before.cols && after.rows === before.rows && after.pitch === before.pitch && after.matrix === before.matrix) return state
  return push(state, after, { kind: 'snapshot', before, after, tag })
}

function reducer(state: State, a: Action): State {
  const { doc } = state
  switch (a.type) {
    case 'stroke': {
      if (a.deltas.length === 0 || a.cols !== doc.cols) return state
      const entry = { kind: 'cells' as const, cols: doc.cols, deltas: a.deltas }
      return push(state, applyCells(doc, entry, false), entry)
    }
    case 'replace': {
      const m = cropPadMatrix(a.matrix, doc.cols, doc.rows)
      const deltas: CellDelta[] = []
      for (let r = 0; r < doc.rows; r++) for (let c = 0; c < doc.cols; c++) {
        const prev = doc.matrix[r][c], next = m[r][c]
        if (prev !== next) deltas.push({ idx: r * doc.cols + c, prev, next })
      }
      if (deltas.length === 0) return state
      return push(state, { ...doc, matrix: m }, { kind: 'cells', cols: doc.cols, deltas })
    }
    case 'clear': {
      const deltas: CellDelta[] = []
      doc.matrix.forEach((row, r) => row.forEach((v, c) => { if (v !== 0) deltas.push({ idx: r * doc.cols + c, prev: v, next: 0 }) }))
      if (deltas.length === 0) return state
      return push(state, { ...doc, matrix: createMatrix(doc.cols, doc.rows) }, { kind: 'cells', cols: doc.cols, deltas })
    }
    case 'resize': {
      // W/H: crop when shrinking, pad (keep the overlap) when growing.
      const cols = clampCells(clampPx(a.width) / doc.pitch), rows = clampCells(clampPx(a.height) / doc.pitch)
      if (cols === doc.cols && rows === doc.rows) return state
      return snapshot(state, { ...doc, cols, rows, matrix: cropPadMatrix(doc.matrix, cols, rows) })
    }
    case 'pitch': {
      // Pitch keeps the pixel size and resamples the picture. Consecutive pitch changes (slider drag)
      // coalesce into one entry computed from the original doc, so scrubbing is lossless and one undo step.
      const pitch = clampPitch(a.pitch)
      const last = state.past[state.past.length - 1]
      const coalesce = last?.kind === 'snapshot' && last.tag === 'pitch' && last.after === doc
      const base = coalesce ? last.before : doc
      const base2: State = coalesce ? { ...state, doc: base, past: state.past.slice(0, -1) } : state
      const cols = clampCells((base.cols * base.pitch) / pitch), rows = clampCells((base.rows * base.pitch) / pitch)
      if (pitch === base.pitch) return coalesce ? { ...base2, future: [] } : state
      const matrix = cols === base.cols && rows === base.rows ? base.matrix : resampleMatrix(base.matrix, cols, rows)
      return snapshot(base2, { cols, rows, pitch, matrix }, 'pitch')
    }
    case 'load':
      return snapshot(state, { cols: a.matrix[0].length, rows: a.matrix.length, pitch: clampPitch(a.pitch), matrix: a.matrix })
    case 'undo': {
      const last = state.past[state.past.length - 1]
      if (!last) return state
      const prev = last.kind === 'snapshot' ? last.before : applyCells(doc, last, true)
      return { doc: prev, past: state.past.slice(0, -1), future: [...state.future, last] }
    }
    case 'redo': {
      const last = state.future[state.future.length - 1]
      if (!last) return state
      const next = last.kind === 'snapshot' ? last.after : applyCells(doc, last, false)
      return { doc: next, past: [...state.past, last].slice(-HISTORY_LIMIT), future: state.future.slice(0, -1) }
    }
  }
}

export function useDrawBoard(initialCols = 80, initialRows = 80, initialPitch = 4) {
  const [state, dispatch] = useReducer(reducer, null, (): State => {
    const cols = clampCells(initialCols), rows = clampCells(initialRows)
    return { doc: { cols, rows, pitch: clampPitch(initialPitch), matrix: createMatrix(cols, rows) }, past: [], future: [] }
  })
  const [brush, setBrush] = useState(1)
  const [eraseMode, setEraseMode] = useState(false)
  const [refUrl, setRefUrl] = useState<string | null>(null)
  const [refOpacity, setRefOpacity] = useState(35)
  const [overlay, setOverlay] = useState(false)

  const { cols, rows, pitch, matrix } = state.doc

  /** Apply a stroke recorded against a `cols`-wide matrix and record it for undo. */
  const commitStroke = useCallback((stroke: Stroke, strokeCols: number) => dispatch({ type: 'stroke', cols: strokeCols, deltas: stroke }), [])
  /** Replace the whole drawing (e.g. auto-trace) as one undoable step. */
  const replaceMatrix = useCallback((m: DrawMatrix) => dispatch({ type: 'replace', matrix: m }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  /** Resize the canvas in px (clamped); undoable. */
  const resize = useCallback((width: number, height: number) => dispatch({ type: 'resize', width, height }), [])
  const setPitch = useCallback((p: number) => dispatch({ type: 'pitch', pitch: p }), [])
  /** Load untrusted matrix data (e.g. JSON); undoable. Returns false if the data is not a 2-D array. */
  const loadMatrix = useCallback((data: unknown, p: number) => {
    const m = normalizeMatrix(data)
    if (!m) return false
    dispatch({ type: 'load', matrix: m, pitch: p })
    return true
  }, [])

  // Object URL lifecycle: revoke the previous one on change and the current one on unmount.
  const refUrlRef = useRef<string | null>(null)
  const setRefFromFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const prev = refUrlRef.current
    refUrlRef.current = url
    setRefUrl(url)
    if (prev) URL.revokeObjectURL(prev)
  }, [])
  useEffect(() => () => {
    if (refUrlRef.current) URL.revokeObjectURL(refUrlRef.current)
    refUrlRef.current = null
  }, [])

  return {
    cols, rows, pitch, width: cols * pitch, height: rows * pitch, brush, eraseMode, matrix,
    canUndo: state.past.length > 0, canRedo: state.future.length > 0, refUrl, refOpacity, overlay,
    setBrush, setEraseMode, commitStroke, replaceMatrix, undo, redo, clear, resize, setPitch, loadMatrix,
    setRefFromFile, setRefOpacity, setOverlay,
  }
}
