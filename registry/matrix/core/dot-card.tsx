'use client'
/**
 * MATRIX card host for React: a thin wrapper over the framework-free card runtime (`lib/matrix/widgets/mount`).
 * The runtime samples the preset's fields onto its dot grid and draws SVG (static, under 2000 dots) or Canvas
 * (animated or dense), handles pointer and keyboard controls, and honours reduced motion. The card is padded by
 * `--matrix-card-pad` (default 16px; none for edge-to-edge photo cards) and fills the width you give it.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { dot480, mountCard, type CardHandle, type CardOptions, type RendererChoice, type ThemeTokens, type WidgetPreset } from '@/lib/matrix/widgets/mount'

export type { RendererChoice, ThemeTokens, WidgetPreset }

export interface MatrixDotCardProps {
  preset: WidgetPreset
  /** Merged over the preset's defaults. */
  data?: Record<string, number>
  /** Dot colours. Default: the MATRIX dark theme with its one red accent. */
  theme?: ThemeTokens
  /** `auto` follows the runtime rule: SVG for static cards under 2000 dots, Canvas otherwise. */
  renderer?: RendererChoice
  /** Dot pitch in px (default: the preset's own). */
  pitch?: number
  animated?: boolean
  /** Override the `prefers-reduced-motion` query. */
  reducedMotion?: boolean
  enter?: CardOptions['enter']
  onInput?: CardOptions['onInput']
  className?: string
  style?: CSSProperties
}

export function MatrixDotCard({ preset, data, theme, renderer, pitch, animated, reducedMotion, enter, onInput, className, style }: MatrixDotCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<CardHandle | null>(null)
  const onInputRef = useRef(onInput)
  useEffect(() => { onInputRef.current = onInput })
  const dataKey = JSON.stringify(data ?? {})
  useEffect(() => {
    const host = ref.current
    if (!host) return
    const h = mountCard(host, { preset, data, theme, renderer, pitch, animated, reducedMotion, enter, onInput: (p, d) => onInputRef.current?.(p, d) })
    handle.current = h
    return () => { h.destroy(); handle.current = null }
  }, [preset]) // eslint-disable-line react-hooks/exhaustive-deps -- the rest goes through update()
  useEffect(() => {
    handle.current?.update({ data: JSON.parse(dataKey) as Record<string, number>, theme, renderer, pitch, animated, reducedMotion })
  }, [dataKey, theme, renderer, pitch, animated, reducedMotion])
  const t = theme ?? dot480
  return (
    <div
      ref={ref}
      className={className ? `matrix-card ${className}` : 'matrix-card'}
      style={{
        position: 'relative', boxSizing: 'border-box', background: t.bg, borderRadius: t.cornerRadiusCard, overflow: 'hidden',
        padding: preset.bleed ? 0 : 'var(--matrix-card-pad, 16px)', ...style,
      }}
    />
  )
}
