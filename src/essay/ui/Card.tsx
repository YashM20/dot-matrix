import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ControlPatch, ThemeTokens } from '../../engine'
import { dot480 } from '../../engine/theme/tokens'
import { DotCanvas } from '../../components/DotCanvas'
import { withChrome, type WidgetPreset } from '../../widgets/types'

/** Minute counter on the wall clock (clock cards flip exactly on :00). */
function useMinuteTick(on: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    let timer = 0
    const arm = () => { timer = window.setTimeout(() => { setTick(t => t + 1); arm() }, 60_000 - (Date.now() % 60_000)) }
    arm()
    return () => clearTimeout(timer)
  }, [on])
  return tick
}

/**
 * One real preset as a card, the way the app's boards render it (DotWidget without the preset
 * registry, so the essay only pulls in the boards it embeds): chrome, controls with local data,
 * optional board-shared keys, the minute tick for clock cards.
 */
export function Card({ preset, data, theme = dot480, shared, sharedKeys, onShared, onData, className }: {
  preset: WidgetPreset
  data?: ControlPatch
  theme?: ThemeTokens
  shared?: ControlPatch
  sharedKeys?: readonly string[]
  onShared?: (patch: ControlPatch) => void
  /** Called with the card's merged data after each control edit (figures read the card's state). */
  onData?: (data: ControlPatch) => void
  className?: string
}) {
  const [local, setLocal] = useState<ControlPatch>({})
  const layers = useMemo(() => withChrome(preset), [preset])
  const tick = useMinuteTick(!!preset.clock)
  const merged = { ...preset.defaults, ...data, ...shared, ...local }
  const keys = sharedKeys?.join(',') ?? ''
  const onInput = useCallback((patch: ControlPatch) => {
    const mine: ControlPatch = {}, board: ControlPatch = {}, set = new Set(keys ? keys.split(',') : [])
    for (const k in patch) (set.has(k) && onShared ? board : mine)[k] = patch[k]
    if (Object.keys(mine).length) setLocal(prev => ({ ...prev, ...mine }))
    if (Object.keys(board).length) onShared!(board)
  }, [keys, onShared])
  useEffect(() => { onData?.(local) }, [local, onData])
  const interactive = !!preset.controls?.length
  return (
    <div className={`dot-card${preset.bleed ? ' dot-card--bleed' : ''}${className ? ` ${className}` : ''}`} role={interactive ? 'group' : 'img'} aria-label={preset.name} data-card={preset.id}>
      <div className="dot-card-body">
        <DotCanvas layers={layers} data={merged} grid={preset.grid} style={preset.style} theme={theme} animated={preset.animated} tick={preset.clock ? tick : undefined} burst={preset.burst}
          springKeys={preset.springKeys} controls={interactive ? preset.controls : undefined} onInput={interactive ? onInput : undefined} />
      </div>
    </div>
  )
}
