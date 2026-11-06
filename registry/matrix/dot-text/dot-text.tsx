'use client'
/**
 * Dot-matrix text: the engine's bitmap font through `textAt`, so every glyph pixel lands on one dot of the grid.
 * The grid is sized to the text; `pitch` sets the dot spacing in px.
 */
import { useMemo } from 'react'
import { MatrixDotCard, type MatrixDotCardProps } from '@/components/matrix/dot-card'
import { textAt, textSize } from '@/lib/matrix/engine/layout'
import { baseStyle, type Field, type Layer, type Tone, type WidgetPreset } from '@/lib/matrix/widgets/mount'

export interface MatrixDotTextProps extends Omit<MatrixDotCardProps, 'preset' | 'data' | 'animated'> {
  text: string
  /** `bold` doubles each glyph (two-dot strokes, 10×14). Default: the 5×7 font. */
  weight?: 'regular' | 'bold'
  /** `value` (default) is the light text tone; `active` is the board's one accent. */
  tone?: Extract<Tone, 'value' | 'active' | 'idle' | 'mid'>
  /** Empty cells around the text. Default 1. */
  pad?: number
  /** Draw the unlit dots behind the glyphs. Default true. */
  unlit?: boolean
}

const UNLIT: Field = () => 0.2

export function MatrixDotText({ text, weight = 'regular', tone = 'value', pad = 1, unlit = true, pitch = 4, ...card }: MatrixDotTextProps) {
  const preset = useMemo<WidgetPreset>(() => {
    const smooth = weight === 'bold', [w, h] = textSize(text, { smooth })
    const grid = { cols: w + 2 * pad, rows: h + 2 * pad, pitch }
    const glyphs = textAt(grid, text, pad, pad, { smooth })
    const layers: Layer[] = unlit ? [{ field: UNLIT, tone: 'faint' }, { field: glyphs, tone }] : [{ field: glyphs, tone }]
    return { id: 'matrix-dot-text', name: text, group: 'text', grid, style: baseStyle, layers: () => layers }
  }, [text, weight, tone, pad, unlit, pitch])
  return <MatrixDotCard preset={preset} pitch={pitch} enter={false} {...card} />
}
