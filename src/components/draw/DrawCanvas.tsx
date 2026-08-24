import { useCallback, useEffect, useRef, useState } from 'react'
import type { DrawMatrix } from '../../lib/drawGrid'
import { bresenhamLine } from '../../lib/bresenham'
import type { Stroke } from '../../hooks/useDrawBoard'

interface Props {
  matrix: DrawMatrix
  cols: number
  rows: number
  pitch: number
  brush: number
  eraseMode: boolean
  refUrl: string | null
  overlay: boolean
  refOpacity: number
  onMatrixChange: (m: DrawMatrix) => void
  pushStroke: (s: Stroke) => void
}

const BG = '#070809'
const GRID_LINE = 'rgba(255,255,255,0.04)'
const DOT_ON = '#F2F3F5'
const RED = '#FF3B30'

export function DrawCanvas({ matrix, cols, rows, pitch, brush, eraseMode, refUrl, overlay, refOpacity, onMatrixChange, pushStroke }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDown = useRef(false)
  const lastCell = useRef<[number, number] | null>(null)
  const pending = useRef<[number, number][]>([])
  const strokeDeltas = useRef<Map<number, { prev: number; next: number }>>(new Map())
  const raf = useRef<number | null>(null)
  const activeErase = useRef(false)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

  const W = cols * pitch, H = rows * pitch

  const drawGrid = useCallback(() => {
    const c = canvasRef.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = GRID_LINE; ctx.lineWidth = 0.5
    for (let x = 0; x <= W; x += pitch) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y <= H; y += pitch) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
    const pad = Math.max(1, pitch * 0.15), dotR = Math.max(1, (pitch - pad * 2) * 0.5)
    for (let r = 0; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) if (matrix[r][c2] > 0) {
      ctx.fillStyle = DOT_ON
      ctx.beginPath(); ctx.arc(c2 * pitch + pitch / 2, r * pitch + pitch / 2, dotR, 0, Math.PI * 2); ctx.fill()
    }
    if (hoverPos && !isDown.current) {
      ctx.strokeStyle = RED; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(hoverPos.x, hoverPos.y, brush * pitch * 0.5, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }
  }, [matrix, cols, rows, pitch, W, H, hoverPos, brush])

  useEffect(() => { drawGrid() }, [drawGrid])

  const paintCell = useCallback((col: number, row: number, val: number) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pad = Math.max(1, pitch * 0.15), dotR = Math.max(1, (pitch - pad * 2) * 0.5)
    for (let dy = -brush + 1; dy < brush; dy++) for (let dx = -brush + 1; dx < brush; dx++) {
      if (Math.hypot(dx, dy) > brush - 0.5) continue
      const c2 = col + dx, r2 = row + dy
      if (c2 < 0 || c2 >= cols || r2 < 0 || r2 >= rows) continue
      const idx = r2 * cols + c2, prev = matrix[r2][c2], next = val
      if (prev === next) continue
      if (!strokeDeltas.current.has(idx)) strokeDeltas.current.set(idx, { prev, next })
      else strokeDeltas.current.get(idx)!.next = next
      if (next > 0) {
        ctx.fillStyle = DOT_ON; ctx.beginPath(); ctx.arc(c2 * pitch + pitch / 2, r2 * pitch + pitch / 2, dotR, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.fillStyle = BG; ctx.fillRect(c2 * pitch, r2 * pitch, pitch, pitch)
        ctx.strokeStyle = GRID_LINE; ctx.lineWidth = 0.5; ctx.strokeRect(c2 * pitch, r2 * pitch, pitch, pitch)
      }
    }
  }, [matrix, cols, rows, pitch, brush])

  const flushPending = useCallback(() => {
    if (pending.current.length === 0) { raf.current = null; return }
    const curr = pending.current.shift()!
    const prev = lastCell.current, val = activeErase.current ? 0 : 1
    const pts = prev ? bresenhamLine(prev[0], prev[1], curr[0], curr[1]) : [curr]
    for (const [c, r] of pts) paintCell(c, r, val)
    lastCell.current = curr
    raf.current = requestAnimationFrame(flushPending)
  }, [paintCell])

  const queueCell = useCallback((col: number, row: number) => {
    pending.current.push([col, row])
    if (raf.current == null) raf.current = requestAnimationFrame(flushPending)
  }, [flushPending])

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = W / rect.width, sy = H / rect.height
    const col = Math.floor(((e.clientX - rect.left) * sx) / pitch)
    const row = Math.floor(((e.clientY - rect.top) * sy) / pitch)
    activeErase.current = (e.button === 2 || (e.buttons & 2) !== 0) ? true : eraseMode
    isDown.current = true; lastCell.current = null; strokeDeltas.current.clear(); pending.current = []; setHoverPos(null)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    e.preventDefault(); queueCell(col, row)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = W / rect.width, sy = H / rect.height
    const x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy
    const col = Math.floor(x / pitch), row = Math.floor(y / pitch)
    if (isDown.current) queueCell(col, row); else setHoverPos({ x, y })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDown.current) return
    isDown.current = false
    if (raf.current != null) { cancelAnimationFrame(raf.current); raf.current = null }
    const val = activeErase.current ? 0 : 1
    while (pending.current.length > 0) {
      const [c, r] = pending.current.shift()!
      const prev = lastCell.current
      const pts = prev ? bresenhamLine(prev[0], prev[1], c, r) : [[c, r] as [number, number]]
      for (const [cc, rr] of pts) paintCell(cc, rr, val)
      lastCell.current = [c, r]
    }
    if (strokeDeltas.current.size > 0) {
      const next = matrix.map(row => row.slice())
      const stroke: Stroke = []
      for (const [idx, { prev, next: nx }] of strokeDeltas.current) {
        const r = Math.floor(idx / cols), c = idx % cols
        next[r][c] = nx; stroke.push({ idx, prev, next: nx })
      }
      strokeDeltas.current.clear(); onMatrixChange(next); pushStroke(stroke)
    }
    lastCell.current = null; pending.current = []
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = W / rect.width, sy = H / rect.height
    setHoverPos({ x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy })
  }

  const onPointerLeave = () => setHoverPos(null)

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 640, aspectRatio: `${W}/${H}` }}>
      {overlay && refUrl && (
        <img src={refUrl} alt="reference overlay" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: refOpacity / 100, pointerEvents: 'none', borderRadius: 12 }} />
      )}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={e => e.preventDefault()}
        style={{
          display: 'block', width: '100%', maxWidth: 640, aspectRatio: `${W}/${H}`,
          touchAction: 'none', cursor: eraseMode ? 'cell' : 'crosshair',
          borderRadius: 12, background: BG, border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.02), inset 0 0 40px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  )
}
