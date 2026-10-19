import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  /** Commit a finished stroke; `cols` is the column count the deltas' `idx` was encoded with. */
  onStroke: (s: Stroke, cols: number) => void
}

const BG = '#070809'
const GRID_LINE = 'rgba(255,255,255,0.04)'
const DOT_ON = '#F2F3F5'
const RED = '#FF3B30'
const MAX_CSS_W = 640
const DPR_CAP = 3
/** Hard cap on the backing store edge so huge grids on high-DPR screens stay within canvas limits. */
const MAX_BACKING = 4096

const readDpr = () => Math.min(DPR_CAP, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))

/** devicePixelRatio, capped, re-read when the window moves between screens or zooms. */
function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(readDpr)
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    const onChange = () => setDpr(readDpr())
    mq.addEventListener('change', onChange)
    window.addEventListener('resize', onChange)
    return () => { mq.removeEventListener('change', onChange); window.removeEventListener('resize', onChange) }
  }, [dpr])
  return dpr
}

export function DrawCanvas({ matrix, cols, rows, pitch, brush, eraseMode, refUrl, overlay, refOpacity, onStroke }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDown = useRef(false)
  const lastCell = useRef<[number, number] | null>(null)
  const pending = useRef<[number, number][]>([])
  const strokeDeltas = useRef<Map<number, { prev: number; next: number }>>(new Map())
  const raf = useRef<number | null>(null)
  const activeErase = useRef(false)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const [cssW, setCssW] = useState(0)
  const dpr = useDevicePixelRatio()

  // Logical drawing space: one unit = one px at pitch scale. All drawing and pointer math stays in it.
  const W = cols * pitch, H = rows * pitch

  // Track the displayed CSS width so the backing store matches what is on screen × DPR.
  useLayoutEffect(() => {
    const c = canvasRef.current
    if (!c) return
    setCssW(c.clientWidth)
    const ro = new ResizeObserver(([e]) => setCssW(e.contentRect.width))
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  const displayW = cssW > 0 ? cssW : Math.min(W, MAX_CSS_W)
  const scale = Math.min((displayW * dpr) / W, MAX_BACKING / Math.max(W, H))
  const backingW = Math.max(1, Math.round(W * scale)), backingH = Math.max(1, Math.round(H * scale))

  const dotR = Math.max(1, (pitch - Math.max(1, pitch * 0.15) * 2) * 0.5)

  const drawDot = (ctx: CanvasRenderingContext2D, c: number, r: number) => {
    ctx.fillStyle = DOT_ON; ctx.beginPath(); ctx.arc(c * pitch + pitch / 2, r * pitch + pitch / 2, dotR, 0, Math.PI * 2); ctx.fill()
  }
  const clearCell = (ctx: CanvasRenderingContext2D, c: number, r: number) => {
    ctx.fillStyle = BG; ctx.fillRect(c * pitch, r * pitch, pitch, pitch)
    ctx.strokeStyle = GRID_LINE; ctx.lineWidth = 0.5; ctx.strokeRect(c * pitch, r * pitch, pitch, pitch)
  }

  const drawGrid = () => {
    const c = canvasRef.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    if (c.width !== backingW) c.width = backingW
    if (c.height !== backingH) c.height = backingH
    ctx.setTransform(backingW / W, 0, 0, backingH / H, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = GRID_LINE; ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let x = 0; x <= W; x += pitch) { ctx.moveTo(x, 0); ctx.lineTo(x, H) }
    for (let y = 0; y <= H; y += pitch) { ctx.moveTo(0, y); ctx.lineTo(W, y) }
    ctx.stroke()
    for (let r = 0; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) if (matrix[r]?.[c2] > 0) drawDot(ctx, c2, r)
    // Re-apply any in-flight (uncommitted) stroke so a backing-store resize mid-stroke doesn't hide it.
    for (const [idx, { next }] of strokeDeltas.current) {
      const r = Math.floor(idx / cols), c2 = idx % cols
      if (next > 0) drawDot(ctx, c2, r); else clearCell(ctx, c2, r)
    }
    if (hoverPos && !isDown.current) {
      ctx.strokeStyle = RED; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(hoverPos.x, hoverPos.y, brush * pitch * 0.5, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }
  }
  const drawGridRef = useRef(drawGrid)
  useLayoutEffect(() => { drawGridRef.current = drawGrid })
  useLayoutEffect(() => { drawGridRef.current() }, [matrix, cols, rows, pitch, hoverPos, brush, backingW, backingH])

  const paintCell = useCallback((col: number, row: number, val: number) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    for (let dy = -brush + 1; dy < brush; dy++) for (let dx = -brush + 1; dx < brush; dx++) {
      if (Math.hypot(dx, dy) > brush - 0.5) continue
      const c2 = col + dx, r2 = row + dy
      if (c2 < 0 || c2 >= cols || r2 < 0 || r2 >= rows) continue
      const idx = r2 * cols + c2, prev = matrix[r2][c2], next = val
      const existing = strokeDeltas.current.get(idx)
      if ((existing ? existing.next : prev) === next) continue
      if (!existing) strokeDeltas.current.set(idx, { prev, next })
      else existing.next = next
      if (next > 0) {
        ctx.fillStyle = DOT_ON; ctx.beginPath(); ctx.arc(c2 * pitch + pitch / 2, r2 * pitch + pitch / 2, dotR, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.fillStyle = BG; ctx.fillRect(c2 * pitch, r2 * pitch, pitch, pitch)
        ctx.strokeStyle = GRID_LINE; ctx.lineWidth = 0.5; ctx.strokeRect(c2 * pitch, r2 * pitch, pitch, pitch)
      }
    }
  }, [matrix, cols, rows, pitch, brush, dotR])

  // Drain the queue one cell per frame; `flush` is re-read through the ref so the callback can re-arm itself.
  const flushRef = useRef<() => void>(() => {})
  const flush = () => {
    if (pending.current.length === 0) { raf.current = null; return }
    const curr = pending.current.shift()!
    const prev = lastCell.current, val = activeErase.current ? 0 : 1
    const pts = prev ? bresenhamLine(prev[0], prev[1], curr[0], curr[1]) : [curr]
    for (const [c, r] of pts) paintCell(c, r, val)
    lastCell.current = curr
    raf.current = requestAnimationFrame(() => flushRef.current())
  }
  useEffect(() => { flushRef.current = flush })
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current) }, [])

  const queueCell = useCallback((col: number, row: number) => {
    pending.current.push([col, row])
    if (raf.current == null) raf.current = requestAnimationFrame(() => flushRef.current())
  }, [])

  /** Client coords → logical drawing coords (content box, so independent of border, CSS size and backing-store DPR). */
  const toLogical = (e: React.PointerEvent) => {
    const c = canvasRef.current!, rect = c.getBoundingClientRect()
    const w = c.clientWidth || rect.width, h = c.clientHeight || rect.height
    return { x: ((e.clientX - rect.left - c.clientLeft) * W) / w, y: ((e.clientY - rect.top - c.clientTop) * H) / h }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toLogical(e)
    activeErase.current = (e.button === 2 || (e.buttons & 2) !== 0) ? true : eraseMode
    isDown.current = true; lastCell.current = null; strokeDeltas.current.clear(); pending.current = []; setHoverPos(null)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    e.preventDefault(); queueCell(Math.floor(x / pitch), Math.floor(y / pitch))
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = toLogical(e)
    if (isDown.current) queueCell(Math.floor(x / pitch), Math.floor(y / pitch)); else setHoverPos({ x, y })
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
    const stroke: Stroke = []
    for (const [idx, { prev, next }] of strokeDeltas.current) if (prev !== next) stroke.push({ idx, prev, next })
    strokeDeltas.current.clear()
    if (stroke.length > 0) onStroke(stroke, cols)
    lastCell.current = null; pending.current = []
    const el = e.currentTarget as Element
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    setHoverPos(toLogical(e))
  }

  const onPointerLeave = () => setHoverPos(null)

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: MAX_CSS_W, aspectRatio: `${W}/${H}` }}>
      {overlay && refUrl && (
        <img src={refUrl} alt="reference overlay" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: refOpacity / 100, pointerEvents: 'none', borderRadius: 12 }} />
      )}
      <canvas
        ref={canvasRef}
        width={backingW}
        height={backingH}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={e => e.preventDefault()}
        style={{
          display: 'block', width: '100%', maxWidth: MAX_CSS_W, aspectRatio: `${W}/${H}`,
          touchAction: 'none', cursor: eraseMode ? 'cell' : 'crosshair',
          borderRadius: 12, background: BG, border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.02), inset 0 0 40px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  )
}
