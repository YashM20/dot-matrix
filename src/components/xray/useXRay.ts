/**
 * The one hook `DotWidget` calls for X-ray. While X-ray is off and nothing is soloed / muted it hands the
 * card's own `layers` function back untouched (same identity: same worker path, same frames) and no
 * renderer override, so an un-X-rayed card renders exactly as before.
 */
import { useCallback, useId, useMemo, useRef } from 'react'
import type { Layer } from '../../engine'
import type { WidgetContext } from '../../widgets/types'
import { isXRay, useXR } from './store'

const NONE: readonly number[] = []

export interface XRayHook {
  key: string
  on: boolean
  layers: ((ctx: WidgetContext) => Layer[]) | undefined
  /** Indexes hidden by solo / mute (of the full layer list). */
  skip: (i: number) => boolean
  renderer: 'svg' | 'canvas' | undefined
  onMode: (mode: string) => void
  mode: () => string
}

export function useXRay(layers: ((ctx: WidgetContext) => Layer[]) | undefined): XRayHook {
  const key = useId()
  const on = useXR(s => isXRay(s, key))
  const solo = useXR(s => s.solo[key])
  const muted = useXR(s => s.muted[key] ?? NONE)
  const override = useXR(s => s.renderer)
  const modeRef = useRef('svg')
  const onMode = useCallback((m: string) => { modeRef.current = m }, [])
  const mode = useCallback(() => modeRef.current, [])
  const skip = useMemo(() => (solo !== undefined ? (i: number) => i !== solo : muted.length ? (i: number) => muted.includes(i) : () => false), [solo, muted])
  const filtered = useMemo(() => {
    if (!layers || (solo === undefined && !muted.length)) return layers
    return (ctx: WidgetContext) => layers(ctx).filter((_, i) => !skip(i))
  }, [layers, solo, muted, skip])
  return { key, on, layers: filtered, skip, renderer: override === 'auto' ? undefined : override, onMode, mode }
}
