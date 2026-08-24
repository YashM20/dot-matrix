import { useEffect, useMemo, useRef } from 'react'
import { renderCanvas } from '../engine/renderer/canvasRenderer'
import { renderSVG } from '../engine/renderer/svgRenderer'
import type { DotInstance, DotStyle, Field, GridConfig, ThemeTokens } from '../engine'
import { dot480 } from '../engine'
import { useDotField } from '../hooks/useDotField'

export interface DotCanvasProps {
  field: Field
  grid: GridConfig
  style: DotStyle
  theme?: ThemeTokens
  paint?: (dots: DotInstance[], theme: ThemeTokens) => void
  animated?: boolean
  renderer?: 'svg' | 'canvas'
  className?: string
}

export function DotCanvas({ field, grid, style, theme = dot480, paint, animated, renderer, className }: DotCanvasProps) {
  const sampled = useDotField(field, grid, style, theme)
  const dots = useMemo(() => {
    if (!paint) return sampled
    const painted = sampled.map(dot => ({ ...dot }))
    paint(painted, theme)
    return painted
  }, [sampled, paint, theme])

  const pitch = grid.pitch ?? theme.gridPx
  const width = grid.cols * pitch
  const height = grid.rows * pitch
  const visibleCount = dots.filter(d => d.opacity > 0 && d.r > 0).length
  const mode = renderer ?? (animated || visibleCount > 2000 ? 'canvas' : 'svg')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (mode !== 'canvas') return
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, width, height)
    renderCanvas(context, dots)
  }, [mode, dots, width, height])

  if (mode === 'canvas') {
    return <canvas ref={canvasRef} width={width} height={height} className={className} style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: `${width} / ${height}` }} aria-hidden="true" />
  }
  const svg = renderSVG(dots, width, height)
  return <div className={`dot-svg ${className ?? ''}`} style={{ aspectRatio: `${width} / ${height}`, width: '100%', height: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} aria-hidden="true" />
}
