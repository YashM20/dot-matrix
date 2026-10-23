/**
 * `@dot480/react`: `<DotCard>` and `useDotField` on top of `@dot480/core`.
 * `<DotCard>` is a thin host for the framework-free card runtime (`@dot480/core/card`), so a card
 * looks and moves the same in React, in `<dot-card>` and in the playground.
 */
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { dot480, sampleField, sampleLayers, type DotInstance, type DotStyle, type Field, type FrameContext, type GridConfig, type Layer, type ThemeTokens } from '@dot480/core'
import { mountCard, type CardHandle, type CardOptions, type RendererChoice } from '@dot480/core/card'
import { presetById, type CardPreset } from '@dot480/core/presets'
import { presetFromSpec, type DotSpec } from '@dot480/core/spec'

export type { CardPreset, DotSpec, RendererChoice }

export interface DotCardProps {
  /** A library preset id (`"timer"`, `"ui-knob"`, …) or a preset object. */
  preset?: string | CardPreset
  /** A JSON card spec (IR layers on a grid); used when `preset` is not given. */
  spec?: DotSpec
  /** Merged over the preset's defaults. */
  data?: Record<string, number>
  theme?: ThemeTokens
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

/** Resolve `preset` / `spec` to a preset object (memoised per id / spec object). */
export function usePreset(preset?: string | CardPreset, spec?: DotSpec): CardPreset | undefined {
  return useMemo(() => {
    if (typeof preset === 'string') return presetById(preset)
    if (preset) return preset
    return spec ? presetFromSpec(spec) : undefined
  }, [preset, spec])
}

export function DotCard({ preset, spec, data, theme, renderer, pitch, animated, reducedMotion, enter, onInput, className, style }: DotCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<CardHandle | null>(null)
  const resolved = usePreset(preset, spec)
  const onInputRef = useRef(onInput)
  useEffect(() => { onInputRef.current = onInput })
  const dataKey = JSON.stringify(data ?? {})
  useEffect(() => {
    const host = ref.current
    if (!host || !resolved) return
    const h = mountCard(host, { preset: resolved, data, theme, renderer, pitch, animated, reducedMotion, enter, onInput: (p, d) => onInputRef.current?.(p, d) })
    handle.current = h
    return () => { h.destroy(); handle.current = null }
  }, [resolved]) // eslint-disable-line react-hooks/exhaustive-deps -- the rest is pushed through update()
  useEffect(() => {
    handle.current?.update({ data: JSON.parse(dataKey) as Record<string, number>, theme, renderer, pitch, animated, reducedMotion })
  }, [dataKey, theme, renderer, pitch, animated, reducedMotion])
  if (!resolved) return null
  return <div ref={ref} className={className} style={{ position: 'relative', ...style }} />
}

/**
 * Sample a field or a layer stack onto a grid (memoised on the inputs that change the picture).
 * Render the dots yourself, e.g. with `renderSVG(dots, cols * pitch, rows * pitch)`.
 */
export type DotSource = { field: Field } | { layers: (ctx: FrameContext) => Layer[] }
export function useDotField(
  source: DotSource,
  grid: GridConfig,
  style: DotStyle,
  { theme = dot480, t = 0, data }: { theme?: ThemeTokens; t?: number; data?: Record<string, number> } = {},
): DotInstance[] {
  const dataKey = JSON.stringify(data ?? {}), styleKey = JSON.stringify(style), gridKey = `${grid.cols}x${grid.rows}@${grid.pitch ?? ''}`
  const fn = 'field' in source ? source.field : source.layers, isField = 'field' in source
  return useMemo(() => {
    const d = JSON.parse(dataKey) as Record<string, number>
    try {
      return isField
        ? sampleField(fn as Field, grid, style, theme)
        : sampleLayers((fn as (ctx: FrameContext) => Layer[])({ t, data: d, grid }), grid, style, theme)
    } catch { return [] }
  }, [fn, isField, gridKey, styleKey, theme, t, dataKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
